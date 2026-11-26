'use strict';

/**
 * Sisonke Travels payment gateway helpers — Stripe Checkout (+ mock when keys missing).
 */

const { appendFinancialAudit } = require('../../tams/services/rules');

function stripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).startsWith('sk_'));
}

function getStripe() {
  if (!stripeConfigured()) return null;
  // eslint-disable-next-line global-require
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });
}

function frontendOrigin() {
  return (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function makeMockSessionId() {
  return `mock_cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Apply a confirmed customer payment to booking + ledger (idempotent by gatewayEventId / reference).
 */
async function applyGatewayPayment(strapi, {
  bookingId,
  amount,
  currency = 'USD',
  method = 'Stripe Checkout',
  reference,
  gatewayProvider = 'stripe',
  gatewaySessionId,
  gatewayPaymentIntentId,
  gatewayEventId,
  receiptUrl,
  notes,
  customerId,
}) {
  const paid = parseFloat(amount);
  if (!bookingId || !paid || paid <= 0) {
    throw new Error('bookingId and positive amount required');
  }

  /* Idempotency: same webhook event or session already recorded */
  if (gatewayEventId) {
    const byEvent = await strapi.entityService.findMany('api::payment.payment', {
      filters: { gatewayEventId },
      limit: 1,
    });
    if (byEvent?.[0]) {
      return { payment: byEvent[0], booking: null, duplicate: true };
    }
  }
  if (gatewaySessionId) {
    const bySession = await strapi.entityService.findMany('api::payment.payment', {
      filters: { gatewaySessionId, status: 'confirmed' },
      limit: 1,
    });
    if (bySession?.[0]) {
      return { payment: bySession[0], booking: null, duplicate: true };
    }
  }

  const booking = await strapi.entityService.findOne('api::booking.booking', bookingId, {
    populate: ['customer', 'payments'],
  });
  if (!booking) throw new Error('Booking not found');

  const total = parseFloat(booking.totalCost) || 0;
  let amountPaid = parseFloat(booking.amountPaid) || 0;
  const remaining = Math.max(0, total - amountPaid);
  const applied = Math.min(paid, remaining > 0 ? remaining : paid);

  const payment = await strapi.entityService.create('api::payment.payment', {
    data: {
      amount: applied,
      currency: currency || booking.currency || 'USD',
      bookingAmount: applied,
      originalAmount: paid,
      originalCurrency: currency || 'USD',
      method,
      reference: reference || gatewayPaymentIntentId || gatewaySessionId || '',
      notes: notes || '',
      status: 'confirmed',
      paymentKind: 'customer',
      immutable: true,
      gatewayProvider,
      gatewaySessionId: gatewaySessionId || null,
      gatewayPaymentIntentId: gatewayPaymentIntentId || null,
      gatewayEventId: gatewayEventId || null,
      receiptUrl: receiptUrl || null,
      booking: booking.id,
      customer: customerId || booking.customer?.id || booking.customer || null,
      confirmedBy: `gateway:${gatewayProvider}`,
    },
  });

  amountPaid += applied;
  const balance = Math.max(0, total - amountPaid);
  let status = booking.status;
  let confirmedAt = booking.confirmedAt;

  if (status === 'pending') {
    status = 'confirmed';
    confirmedAt = confirmedAt || new Date();
  }
  if (balance <= 0) {
    status = status === 'checked_in' ? 'checked_in' : 'fully_paid';
  } else if (amountPaid > 0 && status !== 'checked_in') {
    status = 'partially_paid';
  }

  const audit = appendFinancialAudit(booking.financialAudit, {
    action: 'payment_customer',
    source: 'gateway',
    gatewayProvider,
    paymentId: payment.id,
    amount: applied,
    currency: currency || 'USD',
    reference: payment.reference,
    gatewaySessionId: gatewaySessionId || null,
    gatewayPaymentIntentId: gatewayPaymentIntentId || null,
    gatewayEventId: gatewayEventId || null,
    actor: `gateway:${gatewayProvider}`,
  });

  const updated = await strapi.entityService.update('api::booking.booking', booking.id, {
    data: {
      amountPaid,
      balance,
      status,
      confirmedAt,
      financialAudit: audit,
    },
    populate: { payments: { sort: ['createdAt:desc'] } },
  });

  return { payment, booking: updated, duplicate: false };
}

/**
 * Confirm a Dischub order that was stored as a pending payment. Idempotent.
 */
async function settleDischubPayment(strapi, {
  orderId,
  amount,
  currency,
  statusReason,
  sender,
}) {
  const rows = await strapi.entityService.findMany('api::payment.payment', {
    filters: { gatewaySessionId: String(orderId), gatewayProvider: 'dischub' },
    populate: { booking: true, customer: true },
    limit: 1,
  });
  const existing = rows?.[0];
  if (!existing) throw new Error('Dischub order not found on this booking');
  if (existing.status === 'confirmed') {
    const booking = existing.booking?.id
      ? await strapi.entityService.findOne('api::booking.booking', existing.booking.id)
      : null;
    return { payment: existing, booking, duplicate: true };
  }

  const bookingId = existing.booking?.id || existing.booking;
  const booking = await strapi.entityService.findOne('api::booking.booking', bookingId, {
    populate: ['customer'],
  });
  if (!booking) throw new Error('Booking not found');

  const paid = parseFloat(amount || existing.amount);
  const total = parseFloat(booking.totalCost) || 0;
  let amountPaid = parseFloat(booking.amountPaid) || 0;
  const remaining = Math.max(0, total - amountPaid);
  const applied = Math.min(paid, remaining > 0 ? remaining : paid);

  const payment = await strapi.entityService.update('api::payment.payment', existing.id, {
    data: {
      amount: applied,
      bookingAmount: applied,
      originalAmount: paid,
      originalCurrency: currency || existing.currency || 'USD',
      currency: booking.currency || currency || 'USD',
      status: 'confirmed',
      immutable: true,
      reference: String(orderId),
      notes: statusReason || existing.notes || '',
      confirmedBy: 'gateway:dischub',
      gatewayEventId: `dischub_${orderId}`,
      receiptUrl: `https://dischub.co.zw/api/make/payment/to/${orderId}`,
    },
  });

  amountPaid += applied;
  const balance = Math.max(0, total - amountPaid);
  let status = booking.status;
  let confirmedAt = booking.confirmedAt;
  if (status === 'pending') {
    status = 'confirmed';
    confirmedAt = confirmedAt || new Date();
  }
  if (balance <= 0) {
    status = status === 'checked_in' ? 'checked_in' : 'fully_paid';
  } else if (amountPaid > 0 && status !== 'checked_in') {
    status = 'partially_paid';
  }

  const audit = appendFinancialAudit(booking.financialAudit, {
    action: 'payment_customer',
    source: 'gateway',
    gatewayProvider: 'dischub',
    paymentId: payment.id,
    amount: applied,
    currency: currency || 'USD',
    reference: String(orderId),
    gatewaySessionId: String(orderId),
    gatewayEventId: `dischub_${orderId}`,
    sender: sender || null,
    actor: 'gateway:dischub',
  });

  const updated = await strapi.entityService.update('api::booking.booking', booking.id, {
    data: { amountPaid, balance, status, confirmedAt, financialAudit: audit },
    populate: { payments: { sort: ['createdAt:desc'] } },
  });

  return { payment, booking: updated, duplicate: false };
}

async function rejectDischubPayment(strapi, orderId, reason) {
  const rows = await strapi.entityService.findMany('api::payment.payment', {
    filters: { gatewaySessionId: String(orderId), gatewayProvider: 'dischub', status: 'pending' },
    limit: 1,
  });
  const existing = rows?.[0];
  if (!existing) return null;
  return strapi.entityService.update('api::payment.payment', existing.id, {
    data: {
      status: 'rejected',
      notes: reason || 'Dischub reported the payment as failed',
    },
  });
}

module.exports = {
  stripeConfigured,
  getStripe,
  frontendOrigin,
  makeMockSessionId,
  applyGatewayPayment,
  settleDischubPayment,
  rejectDischubPayment,
};

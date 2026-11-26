'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  stripeConfigured,
  getStripe,
  frontendOrigin,
  makeMockSessionId,
  applyGatewayPayment,
} = require('../services/gateway');

/** In-memory mock sessions when Stripe keys are absent (dev only). */
const mockSessions = new Map();

function unparsedBody(ctx) {
  const body = ctx.request.body;
  if (!body) return null;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  const sym = Object.getOwnPropertySymbols(body).find((s) => String(s).includes('unparsed'));
  if (sym && body[sym]) {
    return Buffer.isBuffer(body[sym]) ? body[sym] : Buffer.from(body[sym]);
  }
  /* Fallback — signature verify may fail without raw bytes */
  return Buffer.from(JSON.stringify(body));
}

module.exports = createCoreController('api::payment.payment', ({ strapi }) => ({

  /**
   * POST /api/payment/record
   * Manual / offline payment notice (pending consultant confirmation).
   */
  async recordPayment(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized('You must be logged in');

    const { bookingId, amount, method, reference, notes } = ctx.request.body || {};

    if (!bookingId) return ctx.badRequest('bookingId is required');
    if (!amount || parseFloat(amount) <= 0) return ctx.badRequest('amount must be positive');

    const booking = await strapi.entityService.findOne('api::booking.booking', bookingId, {
      populate: ['customer'],
    });

    if (!booking) return ctx.notFound('Booking not found');
    if (booking.customer?.id !== userId) return ctx.forbidden('This booking is not yours');
    if (booking.status === 'cancelled') return ctx.badRequest('Cannot pay a cancelled booking');
    if (booking.status === 'checked_in') {
      return ctx.badRequest('Booking already checked in — contact Sisonke Travels for adjustments');
    }

    const paid = parseFloat(amount);
    const currentBalance = parseFloat(booking.balance);
    if (!Number.isNaN(currentBalance) && paid > currentBalance + 0.01) {
      return ctx.badRequest(`Amount exceeds remaining balance of $${currentBalance}`);
    }

    const payment = await strapi.entityService.create('api::payment.payment', {
      data: {
        amount: paid,
        currency: booking.currency || 'USD',
        method: method || booking.paymentMethod || 'unspecified',
        reference: reference || '',
        notes: notes || '',
        status: 'pending',
        paymentKind: 'customer',
        gatewayProvider: 'none',
        booking: booking.id,
        customer: userId,
      },
    });

    return ctx.send({
      payment: {
        id: payment.id,
        amount: payment.amount,
        status: payment.status,
        reference: payment.reference,
        method: payment.method,
        createdAt: payment.createdAt,
      },
      booking: {
        id: booking.id,
        bookingRef: booking.bookingRef,
        amountPaid: booking.amountPaid,
        balance: booking.balance,
        status: booking.status,
      },
      note: 'Offline payment recorded as pending. Card payments use /api/payment/checkout (webhook-confirmed).',
    });
  },

  /**
   * POST /api/payment/checkout
   * Create Stripe Checkout Session (or mock session). Never trusts client success alone.
   */
  async createCheckout(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized('You must be logged in');

    const {
      bookingId,
      amount,
      currency,
      bookingRef: bodyRef,
    } = ctx.request.body || {};

    if (!bookingId && !bodyRef) return ctx.badRequest('bookingId or bookingRef required');
    if (!amount || parseFloat(amount) <= 0) return ctx.badRequest('amount must be positive');

    let booking;
    if (bookingId) {
      booking = await strapi.entityService.findOne('api::booking.booking', bookingId, {
        populate: ['customer'],
      });
    } else {
      const found = await strapi.entityService.findMany('api::booking.booking', {
        filters: { bookingRef: String(bodyRef).trim(), customer: { id: userId } },
        populate: ['customer'],
        limit: 1,
      });
      booking = found?.[0];
    }

    if (!booking) return ctx.notFound('Booking not found');
    if (booking.customer?.id !== userId) return ctx.forbidden('This booking is not yours');
    if (['cancelled', 'checked_in', 'completed'].includes(booking.status)) {
      return ctx.badRequest(`Cannot pay booking in status ${booking.status}`);
    }

    const payAmount = parseFloat(amount);
    const balance = parseFloat(booking.balance);
    if (!Number.isNaN(balance) && payAmount > balance + 0.01) {
      return ctx.badRequest(`Amount exceeds remaining balance of ${balance}`);
    }

    const cur = String(currency || booking.currency || 'USD').toLowerCase();
    const fe = frontendOrigin();
    const successUrl = `${fe}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${fe}/dashboard?payment=cancelled&bookingRef=${encodeURIComponent(booking.bookingRef)}`;

    /* ── Mock mode (no Stripe keys) ── */
    if (!stripeConfigured()) {
      const sessionId = makeMockSessionId();
      mockSessions.set(sessionId, {
        bookingId: booking.id,
        bookingRef: booking.bookingRef,
        amount: payAmount,
        currency: cur.toUpperCase(),
        userId,
        createdAt: Date.now(),
      });
      const mockUrl = `${fe}/dashboard?payment=mock&session_id=${encodeURIComponent(sessionId)}&bookingRef=${encodeURIComponent(booking.bookingRef)}`;
      strapi.log.info(`[payment] MOCK checkout ${sessionId} booking=${booking.bookingRef} ${cur.toUpperCase()} ${payAmount}`);
      return ctx.send({
        mode: 'mock',
        sessionId,
        url: mockUrl,
        bookingRef: booking.bookingRef,
        amount: payAmount,
        currency: cur.toUpperCase(),
        message: 'Stripe keys missing — mock checkout. Complete via return URL (calls mock-complete).',
      });
    }

    const stripe = getStripe();
    const unitAmount = Math.round(payAmount * 100);
    if (unitAmount < 50 && cur === 'usd') {
      return ctx.badRequest('Minimum card charge is $0.50 USD');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: ctx.state.user.email || undefined,
      client_reference_id: String(booking.id),
      metadata: {
        bookingId: String(booking.id),
        bookingRef: booking.bookingRef,
        userId: String(userId),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: cur,
            unit_amount: unitAmount,
            product_data: {
              name: `Sisonke Travels booking ${booking.bookingRef}`,
              description: booking.packageTitle || 'Travel booking payment',
            },
          },
        },
      ],
    });

    return ctx.send({
      mode: 'stripe',
      sessionId: session.id,
      url: session.url,
      bookingRef: booking.bookingRef,
      amount: payAmount,
      currency: cur.toUpperCase(),
    });
  },

  /**
   * POST /api/payment/webhook
   * Stripe webhook — signature verified. Idempotent apply to ledger.
   */
  async webhook(ctx) {
    const stripe = getStripe();
    if (!stripe) {
      return ctx.badRequest('Stripe not configured — use /api/payment/mock-complete in local mock mode');
    }

    const sig = ctx.request.headers['stripe-signature'];
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!whSecret) {
      strapi.log.error('[payment] STRIPE_WEBHOOK_SECRET missing');
      return ctx.internalServerError('Webhook secret not configured');
    }

    let event;
    try {
      const raw = unparsedBody(ctx);
      event = stripe.webhooks.constructEvent(raw, sig, whSecret);
    } catch (err) {
      strapi.log.warn('[payment] webhook signature failed:', err.message);
      return ctx.badRequest(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const bookingId = parseInt(session.metadata?.bookingId || session.client_reference_id, 10);
      const amountTotal = (session.amount_total || 0) / 100;
      const currency = (session.currency || 'usd').toUpperCase();

      try {
        const result = await applyGatewayPayment(strapi, {
          bookingId,
          amount: amountTotal,
          currency,
          method: 'Stripe Checkout',
          reference: session.payment_intent || session.id,
          gatewayProvider: 'stripe',
          gatewaySessionId: session.id,
          gatewayPaymentIntentId: typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id || null,
          gatewayEventId: event.id,
          receiptUrl: session.url || null,
          notes: `Stripe checkout.session.completed ${session.id}`,
          customerId: session.metadata?.userId ? parseInt(session.metadata.userId, 10) : null,
        });
        strapi.log.info(
          `[payment] webhook applied event=${event.id} booking=${bookingId} duplicate=${!!result.duplicate}`
        );
      } catch (e) {
        strapi.log.error('[payment] webhook apply failed:', e.message);
        return ctx.internalServerError(e.message);
      }
    }

    ctx.body = { received: true };
  },

  /**
   * POST /api/payment/mock-complete
   * Dev-only: finalize mock checkout (no Stripe keys). Authenticated owner.
   */
  async mockComplete(ctx) {
    if (stripeConfigured() && process.env.STRIPE_ALLOW_MOCK !== '1') {
      return ctx.badRequest('Mock complete disabled while Stripe is configured');
    }
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized('You must be logged in');

    const { sessionId } = ctx.request.body || {};
    if (!sessionId) return ctx.badRequest('sessionId required');

    const sess = mockSessions.get(sessionId);
    if (!sess) return ctx.notFound('Mock session not found or expired');
    if (sess.userId !== userId) return ctx.forbidden('Session does not belong to you');

    const result = await applyGatewayPayment(strapi, {
      bookingId: sess.bookingId,
      amount: sess.amount,
      currency: sess.currency,
      method: 'Mock Checkout',
      reference: sessionId,
      gatewayProvider: 'mock',
      gatewaySessionId: sessionId,
      gatewayPaymentIntentId: `mock_pi_${sessionId.slice(-10)}`,
      gatewayEventId: `evt_mock_${sessionId}`,
      notes: 'Local mock payment — structure mirrors Stripe webhook apply',
      customerId: userId,
    });

    mockSessions.delete(sessionId);

    return ctx.send({
      mode: 'mock',
      duplicate: !!result.duplicate,
      payment: result.payment && {
        id: result.payment.id,
        amount: result.payment.amount,
        status: result.payment.status,
        reference: result.payment.reference,
        method: result.payment.method,
        gatewayProvider: result.payment.gatewayProvider,
        gatewaySessionId: result.payment.gatewaySessionId,
        createdAt: result.payment.createdAt,
      },
      booking: result.booking && {
        id: result.booking.id,
        bookingRef: result.booking.bookingRef,
        amountPaid: result.booking.amountPaid,
        balance: result.booking.balance,
        status: result.booking.status,
      },
    });
  },

  /**
   * GET /api/payment/session/:sessionId
   * After return URL — fetch payment/receipt for dashboard (does not trust query alone).
   */
  async sessionStatus(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized('You must be logged in');

    const sessionId = ctx.params.sessionId;
    if (!sessionId) return ctx.badRequest('sessionId required');

    /* Local mock session not yet completed */
    if (String(sessionId).startsWith('mock_cs_')) {
      const pending = mockSessions.get(sessionId);
      if (pending) {
        return ctx.send({
          status: 'open',
          mode: 'mock',
          sessionId,
          bookingRef: pending.bookingRef,
          amount: pending.amount,
          currency: pending.currency,
        });
      }
    }

    const found = await strapi.entityService.findMany('api::payment.payment', {
      filters: { gatewaySessionId: sessionId },
      populate: { booking: true, customer: true },
      limit: 1,
    });
    const payment = found?.[0];
    if (payment) {
      if (payment.customer?.id && payment.customer.id !== userId) {
        return ctx.forbidden('Not your payment');
      }
      return ctx.send({
        status: payment.status === 'confirmed' ? 'paid' : payment.status,
        mode: payment.gatewayProvider || 'stripe',
        sessionId,
        payment: {
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          reference: payment.reference,
          method: payment.method,
          receiptUrl: payment.receiptUrl,
          gatewaySessionId: payment.gatewaySessionId,
          gatewayPaymentIntentId: payment.gatewayPaymentIntentId,
          createdAt: payment.createdAt,
        },
        booking: payment.booking && {
          id: payment.booking.id,
          bookingRef: payment.booking.bookingRef,
          amountPaid: payment.booking.amountPaid,
          balance: payment.booking.balance,
          status: payment.booking.status,
        },
      });
    }

    /* Stripe live: retrieve session (still do not credit without webhook/idempotent apply) */
    if (stripeConfigured() && String(sessionId).startsWith('cs_')) {
      try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const bookingId = parseInt(session.metadata?.bookingId || session.client_reference_id, 10);
        if (session.metadata?.userId && String(session.metadata.userId) !== String(userId)) {
          return ctx.forbidden('Not your session');
        }
        /* If paid but webhook lagged, apply once here with event id derived from session (idempotent) */
        if (session.payment_status === 'paid' && bookingId) {
          const result = await applyGatewayPayment(strapi, {
            bookingId,
            amount: (session.amount_total || 0) / 100,
            currency: (session.currency || 'usd').toUpperCase(),
            method: 'Stripe Checkout',
            reference: session.payment_intent || session.id,
            gatewayProvider: 'stripe',
            gatewaySessionId: session.id,
            gatewayPaymentIntentId: typeof session.payment_intent === 'string'
              ? session.payment_intent
              : null,
            gatewayEventId: `reconcile_${session.id}`,
            notes: 'Reconciled from session status (webhook lag fallback)',
            customerId: userId,
          });
          return ctx.send({
            status: 'paid',
            mode: 'stripe',
            sessionId,
            reconciled: !result.duplicate,
            payment: result.payment && {
              id: result.payment.id,
              amount: result.payment.amount,
              status: result.payment.status,
              reference: result.payment.reference,
              method: result.payment.method,
              gatewaySessionId: result.payment.gatewaySessionId,
            },
            booking: result.booking && {
              id: result.booking.id,
              bookingRef: result.booking.bookingRef,
              amountPaid: result.booking.amountPaid,
              balance: result.booking.balance,
              status: result.booking.status,
            },
          });
        }
        return ctx.send({
          status: session.payment_status || session.status,
          mode: 'stripe',
          sessionId,
          bookingRef: session.metadata?.bookingRef,
        });
      } catch (e) {
        return ctx.badRequest(e.message);
      }
    }

    return ctx.notFound('Session not found');
  },
}));

'use strict';

/**
 * TAMS business-rule helpers — FX, cancellation/refund, docs redaction, pax/PNR checks.
 */

/** Base rates: 1 UNIT → USD (approx; agency can override per payment) */
const FX_TO_USD = {
  USD: 1,
  ZAR: 0.055,
  EUR: 1.08,
  GBP: 1.27,
  BWP: 0.074,
  ZWL: 0.0031,
};

const DEFAULT_CANCEL_POLICY = {
  /* daysBeforeTravel inclusive lower bound → refundPercent of sellPrice */
  bands: [
    { minDays: 30, refundPercent: 100 },
    { minDays: 14, refundPercent: 50 },
    { minDays: 0, refundPercent: 0 },
  ],
  nonRefundableTypes: [], // e.g. ['insurance']
};

function getFxRate(fromCurrency, toCurrency = 'USD', overrideRate) {
  const from = String(fromCurrency || 'USD').toUpperCase();
  const to = String(toCurrency || 'USD').toUpperCase();
  if (overrideRate != null && !Number.isNaN(parseFloat(overrideRate))) {
    return parseFloat(overrideRate);
  }
  if (from === to) return 1;
  const fromUsd = FX_TO_USD[from];
  const toUsd = FX_TO_USD[to];
  if (fromUsd == null || toUsd == null) {
    const err = new Error(`Unsupported currency pair ${from}/${to}`);
    err.status = 400;
    throw err;
  }
  /* amount_to = amount_from * (from→USD) / (to→USD) */
  return fromUsd / toUsd;
}

function convertAmount(amount, fromCurrency, toCurrency, overrideRate) {
  const rate = getFxRate(fromCurrency, toCurrency, overrideRate);
  const converted = Math.round(parseFloat(amount) * rate * 100) / 100;
  return { rate, converted, fromCurrency: String(fromCurrency || 'USD').toUpperCase(), toCurrency: String(toCurrency || 'USD').toUpperCase() };
}

function listFxRates() {
  return { base: 'USD', ratesToUsd: { ...FX_TO_USD }, note: 'Static agency table — override per payment with exchangeRate' };
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function policyForReservation(reservation) {
  const details = reservation.details && typeof reservation.details === 'object' ? reservation.details : {};
  const custom = details.cancelPolicy || reservation.cancelPolicy || null;
  if (custom && Array.isArray(custom.bands)) return { ...DEFAULT_CANCEL_POLICY, ...custom };
  return DEFAULT_CANCEL_POLICY;
}

/**
 * Compute max refundable customer amount for a reservation under supplier-style bands.
 */
function refundableForReservation(reservation, travelDate) {
  const policy = policyForReservation(reservation);
  const type = reservation.type || 'other';
  if ((policy.nonRefundableTypes || []).includes(type)) {
    return { refundPercent: 0, refundable: 0, reason: `${type} is non-refundable under supplier policy` };
  }
  const sell = parseFloat(reservation.sellPrice) || 0;
  const days = daysUntil(travelDate || reservation.startDate);
  if (days == null) {
    return { refundPercent: 0, refundable: 0, reason: 'No travel date — cannot apply supplier bands' };
  }
  const bands = [...(policy.bands || [])].sort((a, b) => b.minDays - a.minDays);
  let refundPercent = 0;
  for (const band of bands) {
    if (days >= band.minDays) {
      refundPercent = band.refundPercent;
      break;
    }
  }
  const refundable = Math.round(sell * (refundPercent / 100) * 100) / 100;
  return {
    refundPercent,
    refundable,
    daysBeforeTravel: days,
    reason: `${refundPercent}% refundable at ${days} days before travel`,
  };
}

function computeBookingRefundCap(booking, reservationIds) {
  const reservations = booking.reservations || [];
  const selected = reservationIds?.length
    ? reservations.filter((r) => reservationIds.includes(r.id))
    : reservations;
  let cap = 0;
  const lines = [];
  for (const r of selected) {
    const calc = refundableForReservation(r, booking.checkIn);
    lines.push({ reservationId: r.id, type: r.type, ...calc });
    cap += calc.refundable;
  }
  const alreadyRefunded = (booking.payments || [])
    .filter((p) => p.paymentKind === 'refund' && p.status === 'confirmed')
    .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const amountPaid = parseFloat(booking.amountPaid) || 0;
  const maxByPaid = amountPaid;
  const maxAllowed = Math.min(cap, maxByPaid);
  return {
    supplierCap: Math.round(cap * 100) / 100,
    alreadyRefunded,
    maxAllowed: Math.round(maxAllowed * 100) / 100,
    lines,
  };
}

function maskPassport(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, v.length - 4))}${v.slice(-4)}`;
}

function redactCustomer(customer, { revealDocs = false } = {}) {
  if (!customer) return null;
  const c = { ...customer };
  if (c.passportNumber) {
    c.passportNumber = revealDocs ? c.passportNumber : maskPassport(c.passportNumber);
    c.passportRestricted = !revealDocs;
  }
  return c;
}

function redactPassengers(passengers, { revealDocs = false } = {}) {
  if (!Array.isArray(passengers)) return passengers || [];
  return passengers.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const out = { ...p };
    if (out.passportNumber) {
      out.passportNumber = revealDocs ? out.passportNumber : maskPassport(out.passportNumber);
      out.passportRestricted = !revealDocs;
    }
    if (out.documentNumber) {
      out.documentNumber = revealDocs ? out.documentNumber : maskPassport(out.documentNumber);
    }
    return out;
  });
}

/**
 * Multi-passenger validation — names required; count must match travellers; passport format if present.
 */
function validatePassengers(passengers, expectedCount) {
  if (!Array.isArray(passengers) || passengers.length === 0) {
    return 'passengers[] is required (one entry per traveller)';
  }
  if (expectedCount && passengers.length !== expectedCount) {
    return `Expected ${expectedCount} passengers, got ${passengers.length}`;
  }
  for (let i = 0; i < passengers.length; i++) {
    const p = passengers[i] || {};
    if (!p.name || String(p.name).trim().length < 2) {
      return `passengers[${i}].name is required`;
    }
    if (p.type && !['adult', 'child', 'infant'].includes(p.type)) {
      return `passengers[${i}].type must be adult|child|infant`;
    }
    if (p.passportNumber) {
      const pn = String(p.passportNumber).replace(/\s/g, '');
      if (!/^[A-Za-z0-9]{5,15}$/.test(pn)) {
        return `passengers[${i}].passportNumber format invalid`;
      }
    }
  }
  return null;
}

/**
 * Hard invariant: ticketed ⇒ distinct confirmationNo (PNR) and ticketOrVoucher.
 */
function assertPnrNotTicket({ status, confirmationNo, ticketOrVoucher }) {
  const st = status || 'ticketed';
  if (!['ticketed'].includes(st)) return null;
  if (!confirmationNo || !String(confirmationNo).trim()) {
    return 'ticketed status requires confirmationNo (PNR/locator)';
  }
  if (!ticketOrVoucher || !String(ticketOrVoucher).trim()) {
    return 'ticketed status requires ticketOrVoucher (e-ticket/voucher ref)';
  }
  if (String(confirmationNo).trim().toUpperCase() === String(ticketOrVoucher).trim().toUpperCase()) {
    return 'confirmationNo (PNR) must differ from ticketOrVoucher';
  }
  return null;
}

/**
 * Visa assistance purchased (reservation) must not imply visa issued (visa-case).
 */
function assertVisaSeparation(reservationPatch, booking) {
  if (!reservationPatch || reservationPatch.type !== 'visa') return null;
  if (['ticketed', 'confirmed'].includes(reservationPatch.status)) {
    /* OK — assistance purchased — but visaReady must come from visa-cases only */
    return { assistancePurchased: true, note: 'Visa reservation confirms assistance purchase only; update visa-case for issuance' };
  }
  if (reservationPatch.status === 'issued') {
    return { error: 'Use visa-case status for visa issuance — reservation cannot be status=issued' };
  }
  return null;
}

function appendFinancialAudit(existing, entry) {
  const log = Array.isArray(existing) ? [...existing] : [];
  log.push({
    id: `FIN-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    at: new Date().toISOString(),
    ...entry,
  });
  return log.slice(-500);
}

module.exports = {
  FX_TO_USD,
  DEFAULT_CANCEL_POLICY,
  getFxRate,
  convertAmount,
  listFxRates,
  refundableForReservation,
  computeBookingRefundCap,
  maskPassport,
  redactCustomer,
  redactPassengers,
  validatePassengers,
  assertPnrNotTicket,
  assertVisaSeparation,
  appendFinancialAudit,
  daysUntil,
};

'use strict';

/**
 * Dischub server client.
 * Non-redirect: EcoCash, InnBucks, O'mari, Zimswitch.
 * Redirect: hosted checkout (mode test | live).
 * API key and merchant email never leave this process.
 */

const https = require('https');

const CREATE_URL = 'https://dischub.co.zw/api/orders/create/';
const STATUS_URL = 'https://dischub.co.zw/api/payment/status/3/step/';
const REDIRECT_BASE = 'https://dischub.co.zw/api/make/payment/to/';
const ZIMSWITCH_BASE = 'https://dischub.co.zw/api/zimswitch/non/redirect/payment/to/';

const METHODS = ['ecocash', 'innbucks', 'omari', 'zimswitch', 'redirect'];

function cfg() {
  const mode = String(process.env.DISCHUB_MODE || 'test').toLowerCase() === 'live' ? 'live' : 'test';
  return {
    apiKey: String(process.env.DISCHUB_API_KEY || '').trim(),
    accountId: String(process.env.DISCHUB_ACCOUNT_ID || '').trim(),
    businessName: String(process.env.DISCHUB_BUSINESS_NAME || 'Eliways Solutions').slice(0, 100),
    recipient: String(process.env.DISCHUB_RECIPIENT_EMAIL || '').trim(),
    mode,
    callbackUrl: httpsOrEmpty(process.env.DISCHUB_CALLBACK_URL),
  };
}

function configured() {
  const c = cfg();
  return !!(c.apiKey && c.recipient);
}

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Accepted sender formats: +2637XXXXXXXX, 02637XXXXXXXX, 07XXXXXXXX. */
function normalizeSender(raw) {
  const d = digits(raw);
  if (/^2637\d{8}$/.test(d)) return `+${d}`;
  if (/^02637\d{8}$/.test(d)) return d;
  if (/^07\d{8}$/.test(d)) return d;
  if (/^7\d{8}$/.test(d)) return `0${d}`;
  throw httpError('Enter a Zimbabwe mobile number, for example 0771234567 or +263771234567');
}

function toEcocashNumber(raw) {
  const sender = normalizeSender(raw);
  if (sender.startsWith('0263')) return `+${sender.slice(1)}`;
  return sender;
}

/** O'mari requires 2637XXXXXXXX with no plus. */
function toOmariNumber(raw) {
  const d = digits(raw);
  let n = d;
  if (/^07\d{8}$/.test(d)) n = `263${d.slice(1)}`;
  else if (/^7\d{8}$/.test(d)) n = `263${d}`;
  else if (/^02637\d{8}$/.test(d)) n = d.slice(1);
  if (!/^2637\d{8}$/.test(n)) {
    throw httpError("O'mari number must look like 263771234567");
  }
  return n;
}

function assertAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0 || n >= 100000) {
    throw httpError('Amount must be greater than 0 and less than 100000');
  }
  return Math.round(n * 100) / 100;
}

function assertCurrency(currency) {
  const c = String(currency || 'USD').toUpperCase();
  if (c !== 'USD' && c !== 'ZWG') throw httpError('Currency must be USD or ZWG');
  return c;
}

function makeOrderId(bookingId) {
  const raw = `E${bookingId}x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30);
}

function httpsOrEmpty(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' ? u : '';
  } catch {
    return '';
  }
}

function methodLabel(method) {
  return {
    ecocash: 'EcoCash',
    innbucks: 'InnBucks',
    omari: "O'mari",
    zimswitch: 'Zimswitch',
    redirect: 'Dischub Checkout',
  }[method] || method;
}

function flowFromLabel(method) {
  const m = String(method || '').toLowerCase();
  if (m.includes('ecocash')) return 'ecocash';
  if (m.includes('innbuck')) return 'innbucks';
  if (m.includes('omari')) return 'omari';
  if (m.includes('zim')) return 'zimswitch';
  return 'redirect';
}

function postJson(url, body) {
  const { apiKey } = cfg();
  if (!apiKey) throw httpError('Dischub API key is not configured', 500);
  const payload = JSON.stringify(body);
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 25000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { status: 'error', message: text.slice(0, 180) || `Dischub HTTP ${res.statusCode}` };
        }
        resolve({ httpStatus: res.statusCode, data });
      });
    });
    req.on('timeout', () => {
      req.destroy(httpError('Dischub timed out', 504));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function publicConfig() {
  const c = cfg();
  return {
    configured: configured(),
    businessName: c.businessName,
    accountId: c.accountId || null,
    redirectMode: c.mode,
    currencies: ['USD', 'ZWG'],
    methods: [
      { id: 'ecocash', label: 'EcoCash', flow: 'prompt', liveOnly: true },
      { id: 'innbucks', label: 'InnBucks', flow: 'qr', liveOnly: true },
      { id: 'omari', label: "O'mari", flow: 'otp', liveOnly: true },
      { id: 'zimswitch', label: 'Zimswitch', flow: 'widget', liveOnly: true },
      { id: 'redirect', label: 'All methods on Dischub', flow: 'redirect', liveOnly: false, mode: c.mode },
    ],
  };
}

async function createOrder({
  method,
  orderId,
  amount,
  currency,
  sender,
  ecocashNumber,
  omariNumber,
  redirectUrl,
}) {
  const c = cfg();
  if (!c.recipient) throw httpError('Dischub merchant email is not configured', 500);
  if (!METHODS.includes(method)) throw httpError('Unsupported payment method');

  const payload = {
    order_id: String(orderId),
    sender: normalizeSender(sender),
    recipient: c.recipient,
    amount: assertAmount(amount),
    currency: assertCurrency(currency),
  };

  if (method === 'ecocash') {
    payload.recipient_name = c.businessName;
    payload.payment_method = 'ecocash';
    payload.payment_details = {
      ecocash_number: toEcocashNumber(ecocashNumber || sender),
    };
  } else if (method === 'innbucks') {
    payload.payment_method = 'innbucks';
  } else if (method === 'omari') {
    payload.payment_method = 'omari';
    payload.payment_details = {
      omari_number: toOmariNumber(omariNumber || sender),
    };
  } else if (method === 'zimswitch') {
    payload.payment_method = 'zimswitch';
    if (c.callbackUrl) payload.callback_url = c.callbackUrl;
  } else {
    payload.mode = c.mode;
    if (c.callbackUrl) payload.callback_url = c.callbackUrl;
    if (redirectUrl) payload.redirect_url = redirectUrl;
  }

  const { data } = await postJson(CREATE_URL, payload);
  const ok = data && (data.status === 'success' || Number(data.response_code) === 201);
  if (!ok) {
    throw httpError(data?.message || 'Dischub could not create the order');
  }

  if (method === 'omari') {
    const omariStatus = String(data.omari_status || '');
    if (/fail|error/i.test(omariStatus)) {
      throw httpError(omariStatus);
    }
  }

  const qrRaw = data.qrcode || data.qr_code || '';
  const qrcode = qrRaw
    ? (String(qrRaw).startsWith('data:') ? String(qrRaw) : `data:image/png;base64,${qrRaw}`)
    : '';

  return {
    provider: 'dischub',
    method,
    methodLabel: methodLabel(method),
    mode: method === 'redirect' ? c.mode : 'live',
    orderId: String(orderId),
    amount: payload.amount,
    currency: payload.currency,
    businessName: c.businessName,
    message: data.message || 'order created successfully',
    ecocashStatus: data.ecocash_status || null,
    innbucksStatus: data.innbucks_status || null,
    code: data.code || null,
    qrcode,
    omariStatus: data.omari_status || null,
    omariOtpReference: data.omari_otp_reference || null,
    zimswitchStatus: data.zimswitch_status || null,
    redirectUrl: method === 'redirect' ? `${REDIRECT_BASE}${encodeURIComponent(orderId)}` : null,
    widgetUrl: method === 'zimswitch' ? `${ZIMSWITCH_BASE}${encodeURIComponent(orderId)}` : null,
  };
}

async function fetchStatus({ orderId, method, omariOtp }) {
  const c = cfg();
  if (!c.recipient) throw httpError('Dischub merchant email is not configured', 500);
  const payload = {
    order_id: String(orderId),
    recipient: c.recipient,
  };
  if (method === 'omari' && omariOtp) {
    payload.payment_method = 'omari';
    payload.payment_details = { omari_otp: String(omariOtp).trim() };
  }
  const { data } = await postJson(STATUS_URL, payload);
  const status = String(data?.status || '').toLowerCase();
  if (status === 'error' || Number(data?.response_code) === 401) {
    const code = Number(data?.response_code) === 404 ? 404 : 400;
    throw httpError(data?.message || 'Could not read payment status', code);
  }
  if (!['success', 'pending', 'failed'].includes(status)) {
    throw httpError(data?.message || 'Unexpected payment status from Dischub');
  }
  return {
    orderId: data.order_id || String(orderId),
    status,
    statusReason: data.status_reason || data.omari_status || '',
    currency: data.currency,
    amount: data.amount,
    sender: data.sender,
    timestamp: data.timestamp || null,
    omariStatus: data.omari_status || null,
  };
}

module.exports = {
  METHODS,
  cfg,
  configured,
  publicConfig,
  normalizeSender,
  makeOrderId,
  createOrder,
  fetchStatus,
  methodLabel,
  flowFromLabel,
};

'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/payment/record',
      handler: 'payment.recordPayment',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/payment/checkout',
      handler: 'payment.createCheckout',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/payment/webhook',
      handler: 'payment.webhook',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/payment/mock-complete',
      handler: 'payment.mockComplete',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/payment/session/:sessionId',
      handler: 'payment.sessionStatus',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/payment/dischub/config',
      handler: 'payment.dischubConfig',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/payment/dischub/order',
      handler: 'payment.createDischub',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/payment/dischub/status',
      handler: 'payment.dischubStatus',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/payment/dischub/callback',
      handler: 'payment.dischubCallback',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};

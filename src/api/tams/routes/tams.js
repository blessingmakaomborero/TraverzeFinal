'use strict';

/**
 * TAMS workflow routes — auth:false for create enquiry + overview;
 * authenticated for customer actions; agent routes also auth-gated
 * (same JWT role for local demo; tighten with policies later).
 */
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/tams/overview',
      handler: 'tams.overview',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/tams/fx-rates',
      handler: 'tams.fxRates',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/tams/board',
      handler: 'tams.board',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/tams/my',
      handler: 'tams.myCases',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/enquiries',
      handler: 'tams.createEnquiry',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/tams/enquiries',
      handler: 'tams.listEnquiries',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/tams/enquiries/:id',
      handler: 'tams.getEnquiry',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/tams/enquiries/:id/profile',
      handler: 'tams.updateProfile',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/enquiries/:id/requirements',
      handler: 'tams.setRequirements',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/enquiries/:id/research',
      handler: 'tams.saveResearch',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/enquiries/:id/quotations',
      handler: 'tams.createQuotation',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/enquiries/:id/book',
      handler: 'tams.convertToBooking',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/quotations/:id/send',
      handler: 'tams.sendQuotation',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/quotations/:id/approve',
      handler: 'tams.approveQuotation',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/quotations/:id/reject',
      handler: 'tams.rejectQuotation',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/tams/bookings/:id',
      handler: 'tams.getBooking',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/bookings/:id/reservations',
      handler: 'tams.upsertReservation',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/bookings/:id/ticket',
      handler: 'tams.ticketReservations',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/bookings/:id/payments',
      handler: 'tams.recordTamsPayment',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/bookings/:id/visa',
      handler: 'tams.upsertVisa',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/bookings/:id/pre-departure',
      handler: 'tams.setPreDeparture',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/bookings/:id/incidents',
      handler: 'tams.createIncident',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/tams/incidents/:id',
      handler: 'tams.updateIncident',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/bookings/:id/feedback',
      handler: 'tams.submitFeedback',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/bookings/:id/close',
      handler: 'tams.closeBooking',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/tams/bookings/:id/cancel',
      handler: 'tams.cancelBooking',
      config: { policies: [], middlewares: [] },
    },
  ],
};

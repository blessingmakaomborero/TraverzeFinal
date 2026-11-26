'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/enquiries-about-flight/enquiries-about-flight',
      handler: 'custom.create',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/flight-enquiries',
      handler: 'custom.list',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/flight-enquiries/mine',
      handler: 'custom.mine',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/flight-enquiries/:id',
      handler: 'custom.getOne',
      config: { auth: false },
    },
    {
      method: 'PATCH',
      path: '/flight-enquiries/:id/status',
      handler: 'custom.setStatus',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/flight-enquiries/:id/assign',
      handler: 'custom.assign',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/flight-enquiries/:id/search-notes',
      handler: 'custom.searchNotes',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/flight-enquiries/:id/quotation',
      handler: 'custom.quotation',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/flight-enquiries/:id/contact-note',
      handler: 'custom.contactNote',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/flight-enquiries/:id/reply',
      handler: 'custom.reply',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/flight-enquiries/:id/accept',
      handler: 'custom.accept',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/flight-enquiries/:id/convert-to-booking',
      handler: 'custom.convertToBooking',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/flight-enquiries/:id/ticket',
      handler: 'custom.issueTicket',
      config: { auth: false },
    },
  ],
};

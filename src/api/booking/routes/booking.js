'use strict';

module.exports = {
  routes: [
    {
      method:  'POST',
      path:    '/booking/create',
      handler: 'booking.createBooking',
      config:  { auth: false, policies: [], middlewares: [] },
    },
    {
      method:  'GET',
      path:    '/booking/check-email',
      handler: 'booking.checkEmail',
      config:  { auth: false, policies: [], middlewares: [] },
    },
    {
      method:  'GET',
      path:    '/booking/my-bookings',
      handler: 'booking.myBookings',
      config:  { policies: [], middlewares: [] },
    },
    {
      method:  'GET',
      path:    '/booking/by-ref/:ref',
      handler: 'booking.findByRef',
      config:  { policies: [], middlewares: [] },
    },
    {
      method:  'POST',
      path:    '/booking/:id/confirm',
      handler: 'booking.confirmBooking',
      config:  { policies: [], middlewares: [] },
    },
    {
      method:  'POST',
      path:    '/booking/:id/check-in',
      handler: 'booking.checkIn',
      config:  { policies: [], middlewares: [] },
    },
  ],
};

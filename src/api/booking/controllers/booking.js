'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const crypto = require('crypto');

function serializeBooking(b) {
  if (!b) return null;
  return {
    id:              b.id,
    bookingRef:      b.bookingRef,
    bookingType:     b.bookingType || 'package',
    packageId:       b.packageId,
    packageTitle:    b.packageTitle,
    packageDuration: b.packageDuration,
    checkIn:         b.checkIn,
    checkOut:        b.checkOut,
    adults:          b.adults,
    children:        b.children,
    roomType:        b.roomType,
    totalCost:       b.totalCost,
    amountPaid:      b.amountPaid,
    balance:         b.balance,
    currency:        b.currency || 'USD',
    status:          b.status,
    paymentMethod:   b.paymentMethod,
    confirmedAt:     b.confirmedAt || null,
    checkedInAt:     b.checkedInAt || null,
    notes:           b.notes,
    payments:        b.payments || [],
    createdAt:       b.createdAt,
  };
}

function assertOwner(booking, userId) {
  return booking?.customer?.id === userId || booking?.customer === userId;
}

module.exports = createCoreController('api::booking.booking', ({ strapi }) => ({

  /**
   * POST /api/booking/create
   * Public — creates/reuses user, creates booking (pending), emails confirmation.
   */
  async createBooking(ctx) {
    const body = ctx.request.body || {};

    const {
      firstName, lastName, mobile,
      packageId, packageTitle, packageDuration,
      checkIn, checkOut, adults, children,
      roomType, totalCost, paymentMethod,
      notes, bookingRef: clientRef,
      bookingType,
    } = body;

    /* Optional JWT — logged-in customers skip account creation */
    let authUser = null;
    const authHeader = ctx.request.header.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const payload = await strapi.plugin('users-permissions').service('jwt').verify(token);
        if (payload?.id) {
          authUser = await strapi.db.query('plugin::users-permissions.user').findOne({
            where: { id: payload.id },
          });
        }
      } catch (e) {
        strapi.log.debug('booking create: JWT verify skipped —', e.message);
      }
    }

    const email = (authUser?.email || body.email || '').toLowerCase().trim();

    if (!email)        return ctx.badRequest('email is required');
    if (!packageTitle) return ctx.badRequest('packageTitle is required');
    if (!totalCost)    return ctx.badRequest('totalCost is required');

    const bookingRef = clientRef || `TRV-${Date.now().toString(36).toUpperCase()}`;
    const type = bookingType === 'service' ? 'service' : 'package';

    let user = authUser || await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { email },
    });

    let tempPassword = null;
    let isNewUser    = false;

    if (!user) {
      isNewUser = true;
      const chosenPassword = body.password && body.password.length >= 8
        ? body.password
        : crypto.randomBytes(8).toString('hex');

      const username = email.split('@')[0]
        + '_' + Math.random().toString(36).slice(2, 6);

      const role = await strapi.db.query('plugin::users-permissions.role')
        .findOne({ where: { type: 'authenticated' } });

      user = await strapi.entityService.create('plugin::users-permissions.user', {
        data: {
          username,
          email,
          password:  chosenPassword,
          provider:  'local',
          confirmed: true,
          blocked:   false,
          role:      role?.id ?? null,
        },
      });
      tempPassword = chosenPassword;
    }

    const cost = parseFloat(totalCost) || 0;
    const booking = await strapi.entityService.create('api::booking.booking', {
      data: {
        bookingRef,
        bookingType:     type,
        packageId:       packageId || '',
        packageTitle,
        packageDuration: packageDuration || '',
        checkIn:         checkIn   || null,
        checkOut:        checkOut  || null,
        adults:          parseInt(adults, 10)   || 1,
        children:        parseInt(children, 10) || 0,
        roomType:        roomType  || (type === 'service' ? 'n/a' : 'double'),
        totalCost:       cost,
        amountPaid:      0,
        balance:         cost,
        currency:        'USD',
        paymentMethod:   paymentMethod || '',
        status:          'pending',
        notes:           notes || '',
        customer:        user.id,
      },
    });

    if (type === 'package') {
      setImmediate(async () => {
        try {
          await strapi.entityService.create('api::holiday-packages-enquiry.holiday-packages-enquiry', {
            data: {
              FirstName:        firstName || '',
              LastName:         lastName  || '',
              Email:            email,
              PhoneNumber:      String(mobile || '').replace(/\D/g, '') || null,
              Message:          notes || `Booking Ref: ${bookingRef} | Room: ${roomType}`,
              DateOfTravel:     checkIn   || null,
              Enquired_Package: { bookingRef, packageTitle, packageId, totalCost: cost },
              publishedAt:      new Date(),
            },
          });
        } catch (e) {
          strapi.log.warn('Could not mirror to holiday-packages-enquiry:', e.message);
        }
      });
    }

    const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });

    setImmediate(async () => {
      try {
        const emailBody = isNewUser
          ? `Dear ${firstName || 'Traveller'},\n\nThank you for booking with Traverze Travel.\n\nBooking Reference: ${bookingRef}\nStatus: PENDING confirmation\n${type === 'service' ? 'Service' : 'Package'}: ${packageTitle}\nDuration: ${packageDuration || '—'}\nCheck-in: ${checkIn || '—'}\nCheck-out: ${checkOut || '—'}\nTotal: $${cost.toLocaleString()} USD\nPayment Method: ${paymentMethod || '—'}\n\nYour account:\nEmail: ${email}\nPassword: ${tempPassword}\n\nOpen your confirmation: http://localhost:3000/booking/confirmed/${bookingRef}\nDashboard: http://localhost:3000/dashboard\n\nTraverze Travel Team`
          : `Dear ${firstName || 'Traveller'},\n\nYour new booking is registered.\n\nBooking Reference: ${bookingRef}\nStatus: PENDING confirmation\n${type === 'service' ? 'Service' : 'Package'}: ${packageTitle}\nCheck-in: ${checkIn || '—'} → ${checkOut || '—'}\nTotal: $${cost.toLocaleString()} USD\n\nConfirmation: http://localhost:3000/booking/confirmed/${bookingRef}\nDashboard: http://localhost:3000/dashboard\n\nTraverze Travel Team`;

        await strapi.plugins['email'].services.email.send({
          to:      email,
          from:    'traverzerecruitments@gmail.com',
          subject: `Booking Received — ${bookingRef} | Traverze Travel`,
          text:    emailBody,
        });

        await strapi.plugins['email'].services.email.send({
          to:      'admin@traverzetravel.co.zw',
          from:    'traverzerecruitments@gmail.com',
          subject: `New Booking ${bookingRef} — ${packageTitle}`,
          text:    `New ${type} booking.\nRef: ${bookingRef}\nCustomer: ${firstName} ${lastName} <${email}>\nItem: ${packageTitle}\nDates: ${checkIn} → ${checkOut}\nTotal: $${cost} USD\nPayment: ${paymentMethod}\nNotes: ${notes}`,
        });
      } catch (emailErr) {
        strapi.log.warn('Booking email failed (non-blocking):', emailErr.message);
      }
    });

    return ctx.send({
      booking: serializeBooking(booking),
      confirmationUrl: `/booking/confirmed/${bookingRef}`,
      user: {
        id:           user.id,
        email:        user.email,
        username:     user.username,
        isNewUser,
        tempPassword: isNewUser ? tempPassword : null,
        jwt,
      },
      emailQueued: true,
    });
  },

  async checkEmail(ctx) {
    const email = ctx.query.email?.toString().toLowerCase().trim();
    if (!email) return ctx.send({ exists: false });

    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { email },
      select: ['id'],
    });

    return ctx.send({ exists: !!user });
  },

  async myBookings(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized('You must be logged in');

    const bookings = await strapi.entityService.findMany('api::booking.booking', {
      filters: { customer: { id: userId } },
      populate: { payments: { sort: ['createdAt:desc'] } },
      sort: ['createdAt:desc'],
    });

    return ctx.send({ bookings: (bookings || []).map(serializeBooking) });
  },

  /**
   * GET /api/booking/by-ref/:ref — owner only
   */
  async findByRef(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized('You must be logged in');

    const ref = ctx.params.ref?.toString().trim();
    if (!ref) return ctx.badRequest('booking ref required');

    const found = await strapi.entityService.findMany('api::booking.booking', {
      filters: { bookingRef: ref, customer: { id: userId } },
      populate: { payments: { sort: ['createdAt:desc'] }, customer: true },
      limit: 1,
    });

    const booking = Array.isArray(found) ? found[0] : found;
    if (!booking) return ctx.notFound('Booking not found');

    return ctx.send({ booking: serializeBooking(booking) });
  },

  /**
   * POST /api/booking/:id/confirm — pending → confirmed
   */
  async confirmBooking(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized('You must be logged in');

    const id = ctx.params.id;
    const booking = await strapi.entityService.findOne('api::booking.booking', id, {
      populate: ['customer', 'payments'],
    });

    if (!booking) return ctx.notFound('Booking not found');
    if (!assertOwner(booking, userId)) return ctx.forbidden('This booking is not yours');
    if (booking.status === 'cancelled') return ctx.badRequest('Cannot confirm a cancelled booking');

    if (['confirmed', 'partially_paid', 'fully_paid', 'checked_in', 'completed'].includes(booking.status)) {
      return ctx.send({
        booking: serializeBooking(booking),
        message: 'Booking already confirmed',
        alreadyConfirmed: true,
      });
    }

    if (booking.status !== 'pending') {
      return ctx.badRequest(`Cannot confirm from status ${booking.status}`);
    }

    const updated = await strapi.entityService.update('api::booking.booking', id, {
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
      },
      populate: { payments: { sort: ['createdAt:desc'] } },
    });

    setImmediate(async () => {
      try {
        const email = ctx.state.user.email;
        await strapi.plugins['email'].services.email.send({
          to: email,
          from: 'traverzerecruitments@gmail.com',
          subject: `Booking Confirmed — ${updated.bookingRef} | Traverze Travel`,
          text: `Dear traveller,\n\nYour booking ${updated.bookingRef} is now CONFIRMED.\n\n${updated.packageTitle}\nCheck-in: ${updated.checkIn || '—'}\nTotal: $${updated.totalCost} USD\nBalance: $${updated.balance} USD\n\nRecord payments and check in from your dashboard:\nhttp://localhost:3000/dashboard\n\nTraverze Travel Team`,
        });
      } catch (e) {
        strapi.log.warn('Confirm email failed:', e.message);
      }
    });

    return ctx.send({
      booking: serializeBooking(updated),
      message: 'Booking confirmed',
      emailQueued: true,
    });
  },

  /**
   * POST /api/booking/:id/check-in
   * Rules: owner; not cancelled; status confirmed/partially_paid/fully_paid;
   * at least one payment (amountPaid > 0); check-in window from day before checkIn through checkOut.
   */
  async checkIn(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized('You must be logged in');

    const id = ctx.params.id;
    const booking = await strapi.entityService.findOne('api::booking.booking', id, {
      populate: ['customer', 'payments'],
    });

    if (!booking) return ctx.notFound('Booking not found');
    if (!assertOwner(booking, userId)) return ctx.forbidden('This booking is not yours');
    if (booking.status === 'cancelled') return ctx.badRequest('Cannot check in a cancelled booking');
    if (booking.status === 'checked_in') {
      return ctx.send({ booking: serializeBooking(booking), message: 'Already checked in', alreadyCheckedIn: true });
    }

    const allowed = ['confirmed', 'partially_paid', 'fully_paid'];
    if (!allowed.includes(booking.status)) {
      return ctx.badRequest('Booking must be confirmed (and preferably paid) before check-in');
    }

    const paid = parseFloat(booking.amountPaid) || 0;
    if (paid <= 0) {
      return ctx.badRequest('Please record at least a deposit payment before check-in');
    }

    if (booking.checkIn) {
      const start = new Date(booking.checkIn);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 1); // allow day before
      const end = booking.checkOut
        ? new Date(booking.checkOut)
        : new Date(booking.checkIn);
      end.setHours(23, 59, 59, 999);

      const now = new Date();
      if (now < start) {
        return ctx.badRequest('Check-in opens the day before your travel date');
      }
      if (now > end) {
        return ctx.badRequest('Check-in window has closed for this booking');
      }
    }

    const updated = await strapi.entityService.update('api::booking.booking', id, {
      data: {
        status: 'checked_in',
        checkedInAt: new Date(),
      },
      populate: { payments: { sort: ['createdAt:desc'] } },
    });

    return ctx.send({
      booking: serializeBooking(updated),
      message: 'Checked in successfully — enjoy your trip!',
    });
  },
}));

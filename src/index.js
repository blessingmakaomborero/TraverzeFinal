'use strict';

module.exports = {
  register(/*{ strapi }*/) {},

  /**
   * Grants permissions for booking, payment, and TAMS routes.
   * Idempotent — safe on every server start.
   */
  async bootstrap({ strapi }) {
    await grantPermissions(strapi);
  },
};

async function grantPermissions(strapi) {
  try {
    const rolesResult = await strapi.entityService.findMany(
      'plugin::users-permissions.role',
      { fields: ['id', 'type'] }
    );

    const publicRole        = rolesResult.find(r => r.type === 'public');
    const authenticatedRole = rolesResult.find(r => r.type === 'authenticated');

    const publicGrants = [
      { action: 'api::booking.booking.createBooking' },
      { action: 'api::booking.booking.checkEmail' },
      { action: 'api::ai-chat.ai-chat.respond' },
      { action: 'api::tams.tams.overview' },
      { action: 'api::tams.tams.fxRates' },
      { action: 'api::tams.tams.createEnquiry' },
      { action: 'api::payment.payment.webhook' },
      { action: 'api::payment.payment.dischubCallback' },
      { action: 'api::destination.destination.find' },
      { action: 'api::destination.destination.findOne' },
    ];

    const authGrants = [
      { action: 'api::booking.booking.myBookings' },
      { action: 'api::booking.booking.findByRef' },
      { action: 'api::booking.booking.confirmBooking' },
      { action: 'api::booking.booking.checkIn' },
      { action: 'api::payment.payment.recordPayment' },
      { action: 'api::payment.payment.createCheckout' },
      { action: 'api::payment.payment.mockComplete' },
      { action: 'api::payment.payment.sessionStatus' },
      { action: 'api::payment.payment.dischubConfig' },
      { action: 'api::payment.payment.createDischub' },
      { action: 'api::payment.payment.dischubStatus' },
      { action: 'api::enquiries-about-flight.custom.mine' },
      { action: 'api::tams.tams.board' },
      { action: 'api::tams.tams.myCases' },
      { action: 'api::tams.tams.listEnquiries' },
      { action: 'api::tams.tams.getEnquiry' },
      { action: 'api::tams.tams.updateProfile' },
      { action: 'api::tams.tams.setRequirements' },
      { action: 'api::tams.tams.saveResearch' },
      { action: 'api::tams.tams.createQuotation' },
      { action: 'api::tams.tams.convertToBooking' },
      { action: 'api::tams.tams.sendQuotation' },
      { action: 'api::tams.tams.approveQuotation' },
      { action: 'api::tams.tams.rejectQuotation' },
      { action: 'api::tams.tams.getBooking' },
      { action: 'api::tams.tams.upsertReservation' },
      { action: 'api::tams.tams.ticketReservations' },
      { action: 'api::tams.tams.recordTamsPayment' },
      { action: 'api::tams.tams.upsertVisa' },
      { action: 'api::tams.tams.setPreDeparture' },
      { action: 'api::tams.tams.createIncident' },
      { action: 'api::tams.tams.updateIncident' },
      { action: 'api::tams.tams.submitFeedback' },
      { action: 'api::tams.tams.closeBooking' },
      { action: 'api::tams.tams.cancelBooking' },
    ];

    if (publicRole) {
      await upsertPermissions(strapi, publicRole.id, publicGrants);
    }
    if (authenticatedRole) {
      await upsertPermissions(strapi, authenticatedRole.id, authGrants);
    }

    strapi.log.info('✅ Booking, Payment & TAMS permissions granted.');
  } catch (err) {
    strapi.log.warn('⚠️  Could not auto-grant permissions:', err.message);
  }
}

async function upsertPermissions(strapi, roleId, grants) {
  for (const { action } of grants) {
    const existing = await strapi.entityService.findMany(
      'plugin::users-permissions.permission',
      { filters: { action, role: { id: roleId } } }
    );

    if (!existing || existing.length === 0) {
      await strapi.entityService.create('plugin::users-permissions.permission', {
        data: { action, role: roleId, enabled: true },
      });
    } else if (!existing[0].enabled) {
      await strapi.entityService.update(
        'plugin::users-permissions.permission',
        existing[0].id,
        { data: { enabled: true } }
      );
    }
  }
}

'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

function digits(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d || null;
}

module.exports = createCoreController(
  'api::other-services-enquiry.other-services-enquiry',
  ({ strapi }) => ({
    async create(ctx) {
      let params;
      try {
        params =
          typeof ctx.request.body === 'string'
            ? JSON.parse(ctx.request.body)
            : ctx.request.body || {};
      } catch {
        return ctx.badRequest('Invalid JSON body');
      }

      const email = (params.Email || params.email || '').toLowerCase().trim();
      if (!email) return ctx.badRequest('Email is required');

      const phone =
        digits(params.Phone_Number ?? params.phone_number ?? params.PhoneNumber ?? params.phone);

      const serviceEnquired =
        params.Service_Enquired ||
        params.serviceEnquired ||
        params.packageEnq ||
        (params.serviceTitle || params.serviceId
          ? { title: params.serviceTitle, id: params.serviceId }
          : null);

      const enquiry = await strapi.entityService.create(
        'api::other-services-enquiry.other-services-enquiry',
        {
          data: {
            FirstName:
              params.FirstName || params.firstName || params.name || '',
            LastName:
              params.LastName || params.lastName || params.surname || '',
            Email: email,
            Phone_Number: phone,
            Message: params.Message || params.message || '',
            Service_Enquired: serviceEnquired,
            publishedAt: new Date(),
          },
        }
      );

      return enquiry;
    },
  })
);

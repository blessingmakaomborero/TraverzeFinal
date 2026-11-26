'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController(
  'api::holiday-packages-enquiry.holiday-packages-enquiry',
  ({ strapi }) => ({

    async create(ctx) {
      let params;

      try {
        params = typeof ctx.request.body === 'string'
          ? JSON.parse(ctx.request.body)
          : ctx.request.body;
      } catch {
        return ctx.badRequest('Invalid JSON body');
      }

      if (!params.Email) return ctx.badRequest('Email is required');

      const phoneDigits = String(params.PhoneNumber ?? params.phone ?? '')
        .replace(/\D/g, '');

      const enquiry = await strapi.entityService.create(
        'api::holiday-packages-enquiry.holiday-packages-enquiry',
        {
          data: {
            FirstName:       params.FirstName,
            LastName:        params.LastName,
            Email:           params.Email,
            PhoneNumber:     phoneDigits || null,
            Message:         params.Message,
            Enquired_Package: params.Enquired_Package,
            DateOfTravel:    params.DateOfTravel    || null,
            /* payment intent fields stored in Message as JSON supplement */
            publishedAt:     new Date(),
          },
        }
      );

      return enquiry;
    },
  })
);

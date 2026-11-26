'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController(
  'api::general-enquiry.general-enquiry',
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

      if (!params.Email && !params.email) {
        return ctx.badRequest('Email is required');
      }

      const phoneRaw =
        params.Phone_Number ??
        params.PhoneNumber ??
        params.phone ??
        '';

      const enquiry = await strapi.entityService.create(
        'api::general-enquiry.general-enquiry',
        {
          data: {
            FirstName: params.FirstName || params.firstName || '',
            LastName: params.LastName || params.surname || params.lastName || '',
            Email: (params.Email || params.email || '').toLowerCase().trim(),
            Phone_Number: String(phoneRaw || '').trim() || null,
            Message: [
              params.Message || params.message || '',
              params.EnquiryType || params.enquiryType
                ? `\n\nEnquiry type: ${params.EnquiryType || params.enquiryType}`
                : '',
            ]
              .join('')
              .trim(),
            Name_Of_Organisation:
              params.Name_Of_Organisation ||
              params.Name_Of_Orgarnisation ||
              params.NameOfOrganisation ||
              params.organisation ||
              '',
            publishedAt: new Date(),
          },
        }
      );

      return enquiry;
    },
  })
);

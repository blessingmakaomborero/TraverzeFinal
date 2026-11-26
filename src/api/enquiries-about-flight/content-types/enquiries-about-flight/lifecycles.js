'use strict';

/**
 * Admin notify on create — failures are non-fatal (Option A email stub OK).
 */
module.exports = {
  async afterCreate(event) {
    const { result } = event;
    try {
      await strapi.plugins['email'].services.email.send({
        to: 'admin@traverzetravel.co.zw',
        from: 'traverzerecruitments@gmail.com',
        subject: `New flight enquiry ${result.enquiryRef || ''}`.trim(),
        text: `Flight enquiry ${result.enquiryRef || result.id}

${result.FirstName} ${result.LastName}
${result.Email} / ${result.PhoneNumber}
${result.TripType} ${result.FlightClass}
${result.DepartureAirport} → ${result.ArrivalAirport}
Depart ${result.DepartureDate} Return ${result.ReturnDate || 'n/a'}
Pax: ${result.Adults || 0}A ${result.Children || 0}C ${result.Infants || 0}I

${result.Message || ''}
`,
      });
    } catch (err) {
      console.error('Flight enquiry admin email failed (stub OK):', err.message);
    }
  },
};

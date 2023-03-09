'use strict';

/**
 * enquiry router.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::enquiries-about-flight.enquiries-about-flight');
// postcss.config.js
module.exports = {
     routes:[ {
      method: 'POST',
      path: '/enquiries-about-flight/enquiries-about-flight',
      handler: 'custom.creat',
    }]
  }
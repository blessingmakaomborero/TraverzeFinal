'use strict';

/**
 * enquiry router.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::other-services-enquiry.other-services-enquiry');
// postcss.config.js
module.exports = {
     routes:[ {
      method: 'POST',
      path: '/other-services-enquiry/other-services-enquiry',
      handler: 'custom.creat',
    }]
  }
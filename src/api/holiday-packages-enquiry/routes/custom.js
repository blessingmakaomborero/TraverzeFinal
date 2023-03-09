'use strict';

/**
 * enquiry router.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::holiday-packages-enquiry.holiday-packages-enquiry');
// postcss.config.js
module.exports = {
     routes:[ {
      method: 'POST',
      path: '/holiday-packages-enquiry/holiday-packages-enquiry',
      handler: 'custom.creat',
    }]
  }
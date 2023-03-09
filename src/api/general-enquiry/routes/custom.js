'use strict';

/**
 * enquiry router.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::general-enquiry.general-enquiry');
// postcss.config.js
module.exports = {
     routes:[ {
      method: 'POST',
      path: '/general-enquiry/general-enquiry',
      handler: 'custom.creat',
    }]
  }
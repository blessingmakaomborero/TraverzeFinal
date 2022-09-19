'use strict';

/**
 * news-update service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::news-update.news-update');

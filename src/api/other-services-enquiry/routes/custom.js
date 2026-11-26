'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/other-services-enquiry/other-services-enquiry',
      handler: 'custom.create',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};

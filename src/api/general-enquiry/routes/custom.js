'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/general-enquiry/general-enquiry',
      handler: 'custom.create',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};

'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/holiday-packages-enquiry/holiday-packages-enquiry',
      handler: 'custom.create',
      config: {
        auth: false,
      },
    },
  ],
};

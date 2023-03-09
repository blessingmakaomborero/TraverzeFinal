'use strict';

/**
 *  enquiry controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::holiday-packages-enquiry.holiday-packages-enquiry',({strapi})=>({

    async creat(ctx){

       let params = JSON.parse(ctx.request.body)
       console.log(params)

     const enquiry = await strapi.entityService.create('api::holiday-packages-enquiry.holiday-packages-enquiry',{
            data:{
                FirstName: params.FirstName,
                LastName: params.LastName,
                Email: params.Email,
                PhoneNumber: params.PhoneNumber,
                Message: params.Message,
                Enquired_Package: params.Enquired_Package,
                DateOfTravel: params.DateOfTravel,
            }
        })
        return enquiry
    }
}));

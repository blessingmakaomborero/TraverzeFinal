'use strict';

/**
 *  enquiry controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::other-services-enquiry.other-services-enquiry',({strapi})=>({

    async creat(ctx){

       let params = JSON.parse(ctx.request.body)
       console.log(params)

     const enquiry = await strapi.entityService.create('api::other-services-enquiry.other-services-enquiry',{
            data:{
                name: params.name,
                surname: params.surname,
                email: params.email,
                phone_number: params.phone_number,
                message: params.message,
                packageEnq: params.packageEnq,
                enquiryID: params.enquiryID,
            }
        })
        return enquiry
    }
}));

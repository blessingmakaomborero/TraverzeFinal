'use strict';

/**
 *  enquiry controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::general-enquiry.general-enquiry',({strapi})=>({

    async creat(ctx){

       let params = JSON.parse(ctx.request.body)
       console.log(params)

     const enquiry = await strapi.entityService.create('api::general-enquiry.general-enquiry',{
            data:{
                FirstName: params.FirstName,
                LastName: params.LastName,
                Email: params.Email,
                Phone_Number: params.Phone_Number,
                Message: params.Message,
                Name_Of_Orgarnisation: params.Name_Of_Orgarnisation,
            }
        })
        return enquiry
    }
}));

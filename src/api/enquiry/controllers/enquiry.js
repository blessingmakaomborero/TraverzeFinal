'use strict';

/**
 *  enquiry controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::enquiry.enquiry',({strapi})=>({

    async create(ctx){

        const {name, email,surname,packageid,phone_number,more_info} = ctx.request.body

     const enquiry = await strapi.db.query('api::enquiry.enquiry').create({
            data:{
                name,
                surname,
                email,
                phone_number,
                more_info,
                packageid
            }
        })
        return enquiry
    }
}));

'use strict';

/**
 *  package controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::package.package', ({strapi})=>({

    async findOne(ctx){
        const {id}= ctx.params

     const entity = await strapi.db.query('api::package.package').findOne({
        where: {Slug: id}
     });
     const sanitizedEntity = await this.sanitizeOutput(entity,ctx);

     return this.transformResponse(sanitizedEntity);
    }
}));

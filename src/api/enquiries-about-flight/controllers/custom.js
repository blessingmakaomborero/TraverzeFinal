'use strict';

/**
 *  enquiry controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::enquiries-about-flight.enquiries-about-flight',({strapi})=>({

    async creat(ctx){

       let params = JSON.parse(ctx.request.body)
       console.log(params)

     const enquiry = await strapi.entityService.create('api::enquiries-about-flight.enquiries-about-flight',{
            data:{
                FirstName: params.FirstName,
                LastName: params.LastName,
                Email: params.Email,
                PhoneNumber: params.PhoneNumber,
                Message: params.Message,
                Children: params.Children,
                Adults: params.Adults,
                DepartureAirport: params.DepartureAirport,
                ArrivalAirport: params.ArrivalAirport,
                SecondDepartureAirport: params.SecondDepartureAirport,
                SecondArrival: params.SecondArrival,
                DepartureDate: params.DepartureDate,
                ReturnDate: params.ReturnDate,
                SecondDepartureDate: params.SecondDepartureDate,
                Terms_Conditions: params.Terms_Conditions,
                TripType: params.TripType,
                FlightClass: params.FlightClass,
                SecondFilghtClass: params.SecondFlightClass,
                OtherCities: params.OtherCities,
                
            }
        })
        return enquiry
    }
}));

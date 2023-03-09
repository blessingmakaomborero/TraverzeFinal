module.exports={
  async  afterCreate(event){
    const{result} = event;

    try{
        await strapi.plugins['email'].services.email.send({
            to: 'admin@traverzetravel.co.zw',
            from: 'traverzerecruitments@gmail.com',
            subject: 'You have a new enquiry about Flights Quotes',
            text: `your enquiry is: 

            First Name : ${result.FirstName},    Last Name: ${result.LastName},
            Email:  ${result.Email},     Phone Number :${result.PhoneNumber},
            Number of Adults: ,${result.Adults}, Number Of Children: ${result.Children},
            Additonal Info :${result.Message},

            Trip Type: ,${result.TripType},   Flight Class :,${result.FlightClass},  Second Flight Class: ,${result.SecondFilghtClass},

            Departure : ,${result.DepartureAirport},   Arrival:  ,${result.ArrivalAirport},
            Departure Date:   ,${result.DepartureDate},    Return Date :,${result.ReturnDate},
            
            Second Departure : ,${result.SecondDepartureAirport}, Second Arrival : ,${result.SecondArrival}, 
            Second Departure Date: ,${result.SecondDepartureDate}, Other Cities : ,${result.OtherCities}
        
            Terms & Conditions: ,${result.Terms_Conditions},
             `,
           
        })
    }catch(err){
        console.log(err)
    }

    }
}
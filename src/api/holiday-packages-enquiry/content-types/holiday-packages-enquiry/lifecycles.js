module.exports={
  async  afterCreate(event){
    const{result} = event;

    try{
        await strapi.plugins['email'].services.email.send({
            to: 'admin@traverzetravel.co.zw',
            from: 'traverzerecruitments@gmail.com',
            subject: 'You Have A New Enquiry About A Holiday Package',
            text: `your enquiry is from: 

            First Name:${result.FirstName}, Last Name :${result.LastName},
             
             Email Address: ${result.Email},  Phone Number: ${result.PhoneNumber},

             Prefered Date Of Travel: ${result.DateOfTravel}

             Other Requirements: ,${result.Message},
            
             Enquired Package : ${result.Enquired_Package}
           
             `,
           
        })
    }catch(err){
        console.log(err)
    }

    }
}
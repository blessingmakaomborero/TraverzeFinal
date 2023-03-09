module.exports={
  async  afterCreate(event){
    const{result} = event;

    try{
        await strapi.plugins['email'].services.email.send({
            to: 'admin@traverzetravel.co.zw',
            from: 'traverzerecruitments@gmail.com',
            subject: 'You have a new enquiry other services',
            text: `your enquiry is:
             ${result.name}, 
             ${result.surname},
             ${result.email},
             ${result.phone_number},
             ${result.packages},
             ${result.message}`,
           
        })
    }catch(err){
        console.log(err)
    }

    }
}
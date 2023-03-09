module.exports = ({ env }) => ({
 
});


module.exports = ({ env }) => {

  if(env('NODE_ENV') === 'production'){
      return {
          upload: {
              provider: 'aws-s3',
              providerOptions: {
                  accessKeyId: env('AWS_ACCESS_KEY_ID'),
                  secretAccessKey: env('AWS_ACCESS_SECRET'),
                  region: env('AWS_REGION'),
                  params: {
                      Bucket: env('AWS_BUCKET'),
                  },
              },
          },
           // ...
  email: {
    config: {
      provider: 'sendgrid', // For community providers pass the full package name (e.g. provider: 'strapi-provider-email-mandrill')
      providerOptions: {
        apiKey: env('SENDGRID_API_KEY'),
      },
      settings: {
        defaultFrom: 'traverzerecruitments@gmail.com',
        defaultReplyTo: 'traverzerecruitments@gmail.com',
        testAddress: 'traverzerecruitments@gmail.com',
      },
    },
  },
  // ...


  instagram: {
    facebookAppClientId: env('INSTAGRAM_APP_CLIENT_ID'),
    facebookAppClientSecret: env('INSTAGRAM_APP_CLIENT_SECRET'),

    // Optionnal - Use `overrideAdminUrl` during development
    // to redirect after instagram login to your local server
    // (take a look at https://ngrok.com/ )
    // ex: 'https://GROK_ID.eu.ngrok.io/admin',
    overrideAdminUrl: null,
},

'instagram-feed': {
  username: 'instagram',
  count: 4,
  fields: {
    shortcode: true,
    owner_id: true,
    date: true,
    comment_count: true,
    like_count: true,
    is_video: true,
    text: true,
    display_url: true,
    thumbnail: true,
    thumbnail_150x150: true,
    thumbnail_240x240: true,
    thumbnail_320x320: true,
    thumbnail_480x480: true,
    thumbnail_640x640: true,
  },
},
      }

  }

  return {
      //Empty config which will use defaults
  }
}
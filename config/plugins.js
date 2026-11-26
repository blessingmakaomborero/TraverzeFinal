'use strict';

module.exports = ({ env }) => {
  const isProd = env('NODE_ENV') === 'production';

  return {
    /* ── EMAIL — Zoho SMTP via nodemailer ────────────────────── */
    email: {
      config: {
        provider: 'strapi-provider-email-nodemailer',
        providerOptions: {
          host:   env('SMTP_HOST',     'smtp.zoho.com'),
          port:   env.int('SMTP_PORT', 465),
          auth: {
            user: env('SMTP_USERNAME', 'info@eliwayssolutions.co.zw'),
            pass: env('SMTP_PASSWORD', 'Password@1'),
          },
          secure:            true,    /* port 465 uses SSL, not STARTTLS */
          requireTLS:        true,
          connectionTimeout: 10000,
          greetingTimeout:   5000,
          tls: {
            rejectUnauthorized: false,  /* allow self-signed in dev */
          },
        },
        settings: {
          defaultFrom:    env('SMTP_DEFAULT_FROM',     'info@eliwayssolutions.co.zw'),
          defaultReplyTo: env('SMTP_DEFAULT_REPLY_TO', 'info@eliwayssolutions.co.zw'),
        },
      },
    },

    /* ── UPLOAD — S3 in production only ─────────────────────── */
    ...(isProd && {
      upload: {
        config: {
          provider: 'aws-s3',
          providerOptions: {
            accessKeyId:     env('AWS_ACCESS_KEY_ID'),
            secretAccessKey: env('AWS_ACCESS_SECRET'),
            region:          env('AWS_REGION'),
            params: { Bucket: env('AWS_BUCKET') },
          },
        },
      },
    }),

    /* ── INSTAGRAM ───────────────────────────────────────────── */
    instagram: {
      facebookAppClientId:     env('INSTAGRAM_APP_CLIENT_ID'),
      facebookAppClientSecret: env('INSTAGRAM_APP_CLIENT_SECRET'),
      overrideAdminUrl: null,
    },

    'instagram-feed': {
      username: 'instagram',
      count: 4,
      fields: {
        shortcode: true, owner_id: true, date: true,
        comment_count: true, like_count: true, is_video: true,
        text: true, display_url: true, thumbnail: true,
        thumbnail_150x150: true, thumbnail_240x240: true,
        thumbnail_320x320: true, thumbnail_480x480: true,
        thumbnail_640x640: true,
      },
    },
  };
};

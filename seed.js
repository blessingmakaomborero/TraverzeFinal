'use strict';

/**
 * Sisonke Travels — seed script
 * Run (with Strapi stopped OR via `node seed.js` which loads its own instance):
 *   cd TraverzeFinal-master && /home/dev/.nvm/versions/node/v18.20.8/bin/node seed.js
 *
 * Seeds ≥5 published items per main content type with travel content + media.
 */

const fs = require('fs');
const path = require('path');
const strapiFactory = require('@strapi/strapi');

const FE_PUBLIC = path.join(
  __dirname,
  '..',
  'TraverzeFinalFrontend-main',
  'public'
);

const MEDIA_CANDIDATES = [
  'images/popular/pop1.jpg',
  'images/popular/pop2.jpg',
  'images/popular/pop3.jpg',
  'images/popular/pop4.jpg',
  'images/popular/pop5.jpg',
  'images/popular/pop6.jpg',
  'images/popular/pop7.jpg',
  'images/popular/pop8.jpg',
  'images/discover/d1.jpg',
  'images/discover/d2.jpg',
  'images/discover/d3.jpg',
  'images/discover/d4.jpg',
  'images/discover/d5.jpg',
  'images/gallery/g1.jpg',
  'images/gallery/g2.jpg',
  'images/gallery/g3.jpg',
  'images/hero/hero1.jpg',
  'images/hero/hero2.jpg',
  'images/hero/hero3.jpg',
  'images/ppost/pop1.jpg',
  'images/ppost/pop2.jpg',
  'images/ppost/pop3.jpg',
].map((rel) => path.join(FE_PUBLIC, rel));

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function uploadFile(app, filePath, name) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/jpeg';

  const uploaded = await app.plugins.upload.services.upload.upload({
    data: {},
    files: {
      path: filePath,
      name: name || path.basename(filePath),
      type: mime,
      size: stat.size,
    },
  });
  return Array.isArray(uploaded) ? uploaded[0] : uploaded;
}

async function ensureMedia(app) {
  const existing = await app.entityService.findMany('plugin::upload.file', {
    limit: 50,
  });
  const localIds = (existing || [])
    .filter((f) => f.url && f.url.startsWith('/uploads/') && (f.mime || '').startsWith('image/'))
    .map((f) => f.id);

  const uploaded = [];
  for (const filePath of MEDIA_CANDIDATES) {
    if (uploaded.length + localIds.length >= 12) break;
    try {
      const file = await uploadFile(app, filePath, path.basename(filePath));
      if (file?.id) uploaded.push(file.id);
    } catch (e) {
      console.log('  ⚠️  upload skip', path.basename(filePath), e.message);
    }
  }

  const ids = [...localIds, ...uploaded];
  if (!ids.length) {
    console.log('  ⚠️  No media available — content will seed without images where optional');
  } else {
    console.log(`  ✅ Media pool: ${ids.length} images`);
  }
  return ids;
}

function pick(ids, i) {
  if (!ids.length) return null;
  return ids[i % ids.length];
}

async function deleteIctServices(app) {
  const ictHints = [
    'laptop',
    'cctv',
    'software',
    'network',
    'ict',
    'server',
    'connectivity',
    'surveillance',
    'cabling',
  ];
  const services = await app.entityService.findMany('api::service.service', {
    publicationState: 'preview',
    limit: 100,
  });
  for (const svc of services || []) {
    const t = (svc.title || '').toLowerCase();
    if (ictHints.some((h) => t.includes(h))) {
      await app.entityService.delete('api::service.service', svc.id);
      console.log(`  🗑️  Removed ICT service: ${svc.title}`);
    }
  }
}

async function upsertMany(app, uid, keyField, items, mapData) {
  const created = [];
  for (const item of items) {
    const key = item[keyField];
    const existing = await app.entityService.findMany(uid, {
      filters: { [keyField]: key },
      publicationState: 'preview',
      limit: 1,
    });
    if (existing?.length) {
      const updated = await app.entityService.update(uid, existing[0].id, {
        data: { ...mapData(item), publishedAt: new Date() },
      });
      created.push(updated);
      console.log(`  ♻️  ${uid} update: ${key}`);
    } else {
      const row = await app.entityService.create(uid, {
        data: { ...mapData(item), publishedAt: new Date() },
      });
      created.push(row);
      console.log(`  ✅ ${uid}: ${key}`);
    }
  }
  return created;
}

async function seed() {
  console.log('🌱 Starting Sisonke Travels seed...');
  const app = await strapiFactory().load();

  try {
    console.log('🖼️  Preparing media...');
    const media = await ensureMedia(app);

    console.log('🧹 Cleaning ICT services...');
    await deleteIctServices(app);

    // ── Locations (5+) ───────────────────────────────────────────
    console.log('📍 Locations...');
    const locationData = [
      { City: 'Cape Town, South Africa' },
      { City: 'Zanzibar, Tanzania' },
      { City: 'Nairobi, Kenya' },
      { City: 'Dubai, UAE' },
      { City: 'Victoria Falls, Zimbabwe' },
      { City: 'Mauritius' },
    ];
    const locations = await upsertMany(
      app,
      'api::location.location',
      'City',
      locationData,
      (x) => x
    );

    // ── Categories (match FE filters + travel) ───────────────────
    console.log('🏷️  Categories...');
    const categoryData = [
      { Category: 'Holiday Package', Flights: 'International', Blogpage: 'All-inclusive holiday packages from Harare.' },
      { Category: 'Weekend Break', Flights: 'Domestic', Blogpage: 'Short getaways for busy travellers.' },
      { Category: 'Group Tour', Flights: 'International', Blogpage: 'Shared adventures with fellow travellers.' },
      { Category: 'Long Term Slow Travel', Flights: 'International', Blogpage: 'Extended stays and slow travel itineraries.' },
      { Category: 'Safari & Wildlife', Flights: 'Domestic', Blogpage: 'Wildlife safaris across Southern and East Africa.' },
      { Category: 'Honeymoon', Flights: 'International', Blogpage: 'Romantic escapes for couples.' },
      { Category: 'Travel Insurance', Flights: 'International', Blogpage: 'Sisonke-arranged travel cover products and indicative prices.' },
    ];
    const categories = await upsertMany(
      app,
      'api::category.category',
      'Category',
      categoryData,
      (x) => x
    );
    const catByName = Object.fromEntries(
      categories.map((c) => [c.Category, c.id])
    );

    // ── News updates (5) ─────────────────────────────────────────
    console.log('📰 News updates...');
    const newsData = [
      { Newscategory: 'Travel Tips' },
      { Newscategory: 'Airlines' },
      { Newscategory: 'Visa & Immigration' },
      { Newscategory: 'Destinations' },
      { Newscategory: 'Travel Deals' },
    ];
    const newsUpdates = await upsertMany(
      app,
      'api::news-update.news-update',
      'Newscategory',
      newsData,
      (x) => x
    );

    // ── Blogs (5) with Cover ─────────────────────────────────────
    console.log('📝 Blogs...');
    const blogData = [
      {
        title: 'Top Beaches Near Africa for Zimbabwe Travellers',
        subTitle: 'Sun, sand, and easy connections from Harare',
        paragraph:
          'From Zanzibar to Mozambique, African coastlines are closer than you think when you fly from Harare with Sisonke Travels.',
        Description: 'A Sisonke Travels guide to beach holidays reachable from Zimbabwe.',
        para1: 'Zanzibar’s Nungwi and Paje beaches reward short regional hops.',
        para2: 'Mauritius pairs lagoons with family resorts and honeymoon villas.',
        para3: 'Ask our Harare consultants for packages that include flights and transfers.',
        quote: 'The ocean is a mighty harmonist.',
        rating: 5,
        news_update: newsUpdates[3]?.id,
      },
      {
        title: 'Safari Season Guide: Kenya & Victoriaibia',
        subTitle: 'When to book the Great Migration and Chobe',
        paragraph:
          'Plan wildlife trips with Sisonke Travels — peak seasons, park fees, and lodge tips for Zimbabwe-based travellers.',
        Description: 'Practical safari timing advice from our Harare desk.',
        para1: 'Masai Mara peaks July–October for migration crossings.',
        para2: 'Chobe stays strong for elephant sightings most of the year.',
        para3: 'We bundle flights, lodges, and park fees into one booking.',
        quote: 'In every walk with nature one receives far more than he seeks.',
        rating: 5,
        news_update: newsUpdates[3]?.id,
      },
      {
        title: 'Dubai Stopovers from Harare',
        subTitle: 'City lights, desert evenings, shopping',
        paragraph:
          'Emirates and partner routings make Dubai an easy add-on for Zimbabwe travellers.',
        Description: 'Make the most of a Dubai layover with Sisonke Travels.',
        para1: 'Old Dubai souks contrast with Downtown’s skyline.',
        para2: 'Desert safaris pair well with short city packages.',
        para3: 'We arrange hotels near metro lines for easy transfers.',
        quote: 'Travel is the only thing you buy that makes you richer.',
        rating: 4,
        news_update: newsUpdates[1]?.id,
      },
      {
        title: 'Visa Basics for Southern Africa Trips',
        subTitle: 'KAZA UniVisa and passport tips',
        paragraph:
          'Avoid border surprises — Sisonke Travels helps with documentation for Vic Falls, Zambia, and beyond.',
        Description: 'Visa checklist for popular Sisonke Travels itineraries.',
        para1: 'KAZA UniVisa covers Zimbabwe and Zambia for many nationalities.',
        para2: 'Keep six months passport validity and blank pages.',
        para3: 'Our team reviews requirements before you pay deposits.',
        quote: 'Prepare well, travel lightly.',
        rating: 4,
        news_update: newsUpdates[2]?.id,
      },
      {
        title: 'Victoria Falls Weekend Escapes',
        subTitle: 'Two-night breaks from Harare',
        paragraph:
          'Domestic flights put the Smoke that Thunders within reach for a long weekend.',
        Description: 'Weekend Break ideas with Sisonke Travels.',
        para1: 'Combine Falls viewpoints with a Zambezi sunset cruise.',
        para2: 'Optional adrenaline: zip line, rafting, helicopter.',
        para3: 'We hold hotel blocks for peak holiday weekends.',
        quote: 'Adventure is worthwhile.',
        rating: 5,
        news_update: newsUpdates[4]?.id,
      },
    ];

    for (let i = 0; i < blogData.length; i++) {
      const blog = blogData[i];
      const coverId = pick(media, i);
      if (!coverId) {
        console.log(`  ⚠️  Blog needs Cover — skipping ${blog.title}`);
        continue;
      }
      const existing = await app.entityService.findMany('api::blog.blog', {
        filters: { title: blog.title },
        publicationState: 'preview',
        limit: 1,
      });
      const payload = {
        ...blog,
        Slug: slugify(blog.title),
        Cover: coverId,
        publishedAt: new Date(),
      };
      if (existing?.length) {
        await app.entityService.update('api::blog.blog', existing[0].id, {
          data: payload,
        });
        console.log(`  ♻️  Blog: ${blog.title}`);
      } else {
        await app.entityService.create('api::blog.blog', { data: payload });
        console.log(`  ✅ Blog: ${blog.title}`);
      }
    }

    // ── Flights (5) ──────────────────────────────────────────────
    console.log('✈️  Flights...');
    const flightData = [
      { cityA: 'Harare', cityB: 'Johannesburg', From: 'HRE', To: 'JNB', planename: 'Air Zimbabwe', price: 350 },
      { cityA: 'Harare', cityB: 'Dubai', From: 'HRE', To: 'DXB', planename: 'Emirates', price: 1200 },
      { cityA: 'Harare', cityB: 'Nairobi', From: 'HRE', To: 'NBO', planename: 'Kenya Airways', price: 580 },
      { cityA: 'Harare', cityB: 'Victoria Falls', From: 'HRE', To: 'VFA', planename: 'Air Zimbabwe', price: 180 },
      { cityA: 'Johannesburg', cityB: 'Mauritius', From: 'JNB', To: 'MRU', planename: 'Air Mauritius', price: 450 },
    ];
    for (let i = 0; i < flightData.length; i++) {
      const flight = flightData[i];
      const existing = await app.entityService.findMany('api::flight.flight', {
        filters: { cityA: flight.cityA, cityB: flight.cityB, planename: flight.planename },
        publicationState: 'preview',
        limit: 1,
      });
      const payload = {
        ...flight,
        planeImg: pick(media, i + 3),
        publishedAt: new Date(),
      };
      if (existing?.length) {
        await app.entityService.update('api::flight.flight', existing[0].id, {
          data: payload,
        });
        console.log(`  ♻️  Flight: ${flight.cityA} → ${flight.cityB}`);
      } else {
        await app.entityService.create('api::flight.flight', { data: payload });
        console.log(`  ✅ Flight: ${flight.cityA} → ${flight.cityB}`);
      }
    }

    // ── Herovideos (5) ───────────────────────────────────────────
    console.log('🎬 Herovideos...');
    const existingHeroes = await app.entityService.findMany(
      'api::herovideo.herovideo',
      { publicationState: 'preview', limit: 20 }
    );
    for (const h of existingHeroes || []) {
      await app.entityService.delete('api::herovideo.herovideo', h.id);
    }
    const heroEmbeds = [
      'https://www.youtube.com/embed/Scxs7L0vhZ4',
      'https://www.youtube.com/embed/jNQXAC9IVRw',
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
      'https://www.youtube.com/embed/LXb3EKWsInQ',
      'https://www.youtube.com/embed/sPyAQQklc1s',
    ];
    for (let i = 0; i < 5; i++) {
      await app.entityService.create('api::herovideo.herovideo', {
        data: {
          herovids: heroEmbeds[i],
          hero: pick(media, i),
          publishedAt: new Date(),
        },
      });
      console.log(`  ✅ Herovideo #${i + 1}`);
    }

    // ── Packages (5+) with FE category names ─────────────────────
    console.log('📦 Packages...');
    const packageData = [
      {
        title: 'Zanzibar Beach Escape',
        description:
          'Powder beaches and Stone Town culture — curated by Sisonke Travels from Harare.',
        includes: 'Return regional flights\n7 nights beach resort\nBreakfast & dinner\nTransfers\nSpice tour',
        excludes: 'Travel insurance\nVisa fees\nLunches',
        itinerary: 'Day 1 Arrival\nDay 2 Stone Town\nDay 3-6 Beach\nDay 7 Departure',
        activities: 'Snorkelling\nDhow cruise\nSpice tour',
        meals: 'Breakfast & Dinner',
        duration: '8 Days / 7 Nights',
        cost: 1850,
        PeopleSharing: '2 People Sharing',
        flights: 'HRE connections via DAR/NBO',
        cats: ['Holiday Package', 'Honeymoon'],
        loc: 'Zanzibar, Tanzania',
      },
      {
        title: 'Victoria Falls Weekend Break',
        description: 'Two nights at the Falls with cruise and guided viewpoints.',
        includes: 'Domestic flights\n2 nights hotel\nFalls tour\nSunset cruise',
        excludes: 'Adventure activities\nInsurance',
        itinerary: 'Fri fly in\nSat Falls + cruise\nSun depart',
        activities: 'Falls walk\nZambezi cruise',
        meals: 'Breakfast',
        duration: '3 Days / 2 Nights',
        cost: 420,
        PeopleSharing: '2 People Sharing',
        flights: 'HRE–VFA',
        cats: ['Weekend Break', 'Safari & Wildlife'],
        loc: 'Victoria Falls, Zimbabwe',
      },
      {
        title: 'Kenya Group Safari',
        description: 'Shared Masai Mara departure for wildlife enthusiasts.',
        includes: 'Flights\nCamp nights\nGame drives\nPark fees',
        excludes: 'Visa\nTips\nBalloon safari',
        itinerary: 'Nairobi arrival\nMara game drives\nReturn',
        activities: 'Game drives\nMaasai visit',
        meals: 'Full Board',
        duration: '7 Days / 6 Nights',
        cost: 2400,
        PeopleSharing: 'Group / shared vehicles',
        flights: 'HRE–NBO',
        cats: ['Group Tour', 'Safari & Wildlife'],
        loc: 'Nairobi, Kenya',
      },
      {
        title: 'Mauritius Slow Travel Month',
        description: 'Four weeks of lagoons, markets, and mountain walks.',
        includes: 'Flights\nApartment stays\nWeekly transfers\nOrientation',
        excludes: 'Most meals\nOptional tours',
        itinerary: 'Week 1 North\nWeek 2 East\nWeek 3 South\nWeek 4 West',
        activities: 'Beaches\nHiking\nMarkets',
        meals: 'Self-catering',
        duration: '28 Days',
        cost: 3900,
        PeopleSharing: '2 People Sharing',
        flights: 'via JNB–MRU',
        cats: ['Long Term Slow Travel', 'Holiday Package'],
        loc: 'Mauritius',
      },
      {
        title: 'Dubai City Lights Package',
        description: 'Skyline, souks, and a desert evening from Harare.',
        includes: 'Emirates flights\n5 nights hotel\nCity tour\nDesert safari',
        excludes: 'Shopping\nExtra attractions',
        itinerary: 'Arrive\nDowntown\nOld Dubai\nDesert\nDepart',
        activities: 'Burj views\nDune bash\nSouk walk',
        meals: 'Breakfast',
        duration: '6 Days / 5 Nights',
        cost: 1650,
        PeopleSharing: '2 People Sharing',
        flights: 'HRE–DXB',
        cats: ['Holiday Package'],
        loc: 'Dubai, UAE',
      },
      {
        title: 'Africa Travel Cover',
        description: 'Regional cover for trips within Africa. Indicative CMS price — final premium confirmed on proposal.',
        includes: 'Medical & hospitalisation abroad\nEmergency assistance\nBaggage delay/loss support\nDocument loss assistance',
        excludes: 'Pre-existing conditions (unless declared)\nHigh-risk sports unless endorsed',
        itinerary: 'Coverage area: Africa\nMax trip duration: up to 92 days',
        activities: 'Leisure travel within Africa',
        meals: 'n/a',
        duration: 'Up to 92 days',
        cost: 45,
        PeopleSharing: 'Per traveller',
        flights: 'n/a',
        cats: ['Travel Insurance'],
        loc: 'Harare, Zimbabwe',
      },
      {
        title: 'Europe Travel Cover',
        description: 'Schengen & UK leisure cover. CMS indicative price — confirmed after proposal review.',
        includes: 'Medical & hospitalisation abroad\nEmergency dental\nRepatriation assistance\nDelayed departure support',
        excludes: 'Winter sports unless declared\nWork-related travel unless endorsed',
        itinerary: 'Coverage area: Europe\nMax trip duration: up to 92 days',
        activities: 'Leisure travel in Europe',
        meals: 'n/a',
        duration: 'Up to 92 days',
        cost: 75,
        PeopleSharing: 'Per traveller',
        flights: 'n/a',
        cats: ['Travel Insurance'],
        loc: 'Harare, Zimbabwe',
      },
      {
        title: 'Worldwide Basic Cover',
        description: 'Entry-level worldwide leisure cover for Sisonke Travels clients.',
        includes: 'Medical & hospitalisation abroad\nTransport/repatriation assistance\nBaggage support\nUrgent message relay',
        excludes: 'Hajj/Umrah-specific riders\nStudent long-stay (use Students Cover)',
        itinerary: 'Coverage area: Worldwide\nMax trip duration: up to 92 days',
        activities: 'Worldwide leisure',
        meals: 'n/a',
        duration: 'Up to 92 days',
        cost: 95,
        PeopleSharing: 'Per traveller',
        flights: 'n/a',
        cats: ['Travel Insurance'],
        loc: 'Harare, Zimbabwe',
      },
      {
        title: 'Worldwide Plus Cover',
        description: 'Higher medical limit worldwide leisure cover.',
        includes: 'Enhanced medical & hospitalisation\nRepatriation of family member\nLegal defense assistance\nPassport/ID loss abroad',
        excludes: 'Professional sports\nUnapproved adventure activities',
        itinerary: 'Coverage area: Worldwide\nMax trip duration: up to 92 days',
        activities: 'Worldwide leisure+',
        meals: 'n/a',
        duration: 'Up to 92 days',
        cost: 135,
        PeopleSharing: 'Per traveller',
        flights: 'n/a',
        cats: ['Travel Insurance'],
        loc: 'Harare, Zimbabwe',
      },
      {
        title: 'Hajj & Umrah Cover',
        description: 'Saudi Arabia pilgrimage cover options (Basic / Plus Extra tiers on proposal).',
        includes: 'Medical cover for Saudi Arabia pilgrimage\nAssistance aligned to pilgrimage trip length\nDocument support',
        excludes: 'Non-pilgrimage worldwide leisure (use Worldwide plans)',
        itinerary: 'Coverage area: Saudi Arabia\nMax trip duration: up to 45 days',
        activities: 'Hajj / Umrah',
        meals: 'n/a',
        duration: 'Up to 45 days',
        cost: 110,
        PeopleSharing: 'Per traveller',
        flights: 'n/a',
        cats: ['Travel Insurance'],
        loc: 'Harare, Zimbabwe',
      },
      {
        title: 'Students Travel Cover',
        description: 'Longer-stay cover for students studying abroad.',
        includes: 'Medical & hospitalisation abroad\nExtended stay options (6 months / 1 year)\nAssistance while studying',
        excludes: 'Full-time employment abroad\nProfessional practice unless endorsed',
        itinerary: 'Coverage area: Worldwide\nDuration options: 6 months or 1 year',
        activities: 'Study abroad',
        meals: 'n/a',
        duration: '6 months / 1 year',
        cost: 180,
        PeopleSharing: 'Per student',
        flights: 'n/a',
        cats: ['Travel Insurance'],
        loc: 'Harare, Zimbabwe',
      },
    ];

    const locByCity = Object.fromEntries(
      locations.map((l) => [l.City, l.id])
    );

    for (let i = 0; i < packageData.length; i++) {
      const pkg = packageData[i];
      const existing = await app.entityService.findMany('api::package.package', {
        filters: { title: pkg.title },
        publicationState: 'preview',
        limit: 1,
      });
      const { cats, loc, ...fields } = pkg;
      const payload = {
        ...fields,
        Slug: slugify(pkg.title),
        location: locByCity[loc] || null,
        categories: cats.map((n) => catByName[n]).filter(Boolean),
        preview_image: pick(media, i),
        preview_images: [pick(media, i), pick(media, i + 1)].filter(Boolean),
        publishedAt: new Date(),
      };
      if (existing?.length) {
        await app.entityService.update('api::package.package', existing[0].id, {
          data: payload,
        });
        console.log(`  ♻️  Package: ${pkg.title}`);
      } else {
        await app.entityService.create('api::package.package', { data: payload });
        console.log(`  ✅ Package: ${pkg.title}`);
      }
    }

    // ── Travel services (replace ICT) ────────────────────────────
    console.log('🛎️  Services...');
    const serviceData = [
      {
        title: 'Flight Bookings',
        subTitle: 'Domestic and international fares from Harare',
        info: 'Sisonke Travels searches major carriers for routes out of HRE and regional hubs.',
      },
      {
        title: 'Holiday Packages',
        subTitle: 'All-inclusive escapes for every budget',
        info: 'Beach, safari, city, and honeymoon packages designed by our Harare team.',
      },
      {
        title: 'Visa Assistance',
        subTitle: 'Paperwork support for popular destinations',
        info: 'We guide you through visas for Dubai, Schengen, USA, and regional travel.',
      },
      {
        title: 'Travel Insurance',
        subTitle: 'Sisonke-arranged cover products with CMS prices',
        info: 'Choose a travel cover product below. Prices shown are indicative from our CMS and confirmed when your proposal is underwritten. Submitting a proposal is an enquiry only — not a policy.',
      },
      {
        title: 'Airport Transfers',
        subTitle: 'Reliable pickups in key destinations',
        info: 'Private transfers timed to your flights in Vic Falls, Dubai, Zanzibar, and more.',
      },
    ];
    for (let i = 0; i < serviceData.length; i++) {
      const svc = serviceData[i];
      const existing = await app.entityService.findMany('api::service.service', {
        filters: { title: svc.title },
        publicationState: 'preview',
        limit: 1,
      });
      const payload = {
        ...svc,
        Slug: slugify(svc.title),
        Icon: pick(media, i + 2),
        image: pick(media, i + 5),
        publishedAt: new Date(),
      };
      if (existing?.length) {
        await app.entityService.update('api::service.service', existing[0].id, {
          data: payload,
        });
        console.log(`  ♻️  Service: ${svc.title}`);
      } else {
        await app.entityService.create('api::service.service', { data: payload });
        console.log(`  ✅ Service: ${svc.title}`);
      }
    }

    // ── TraverzeService single type — 5 dynamic zone blocks ──────
    console.log('🧩 TraverzeService single type...');
    const tzPayload = {
      services: [
        {
          __component: 'service.services',
          title: 'International Flights',
          info: 'Book long-haul and regional flights with Sisonke Travels consultants.',
          subTitle: 'Harare desk support',
        },
        {
          __component: 'service.visa-assistance',
          title: 'Visa Assistance',
          info: 'Document checks and application guidance.',
          subTitle: 'Popular corridors from Zimbabwe',
        },
        {
          __component: 'service.travel-insurance',
          title: 'Travel Insurance',
          info: 'Policies tailored to safari and beach itineraries.',
          subTitle: 'Peace of mind',
        },
        {
          __component: 'service.airport-transfers',
          title: 'Airport Transfers',
          info: 'Meet-and-greet options in partner destinations.',
          subTitle: 'Door to door',
        },
        {
          __component: 'service.cruises',
          title: 'Cruise Packages',
          info: 'Indian Ocean and beyond — ask for current sailings.',
          subTitle: 'Sail with Sisonke Travels',
        },
      ],
      publishedAt: new Date(),
    };
    const existingTz = await app.entityService.findMany(
      'api::traverze-service.traverze-service',
      { publicationState: 'preview' }
    );
    if (existingTz) {
      await app.entityService.update(
        'api::traverze-service.traverze-service',
        existingTz.id,
        { data: tzPayload }
      );
      console.log('  ♻️  TraverzeService updated with 5 blocks');
    } else {
      await app.entityService.create('api::traverze-service.traverze-service', {
        data: tzPayload,
      });
      console.log('  ✅ TraverzeService created with 5 blocks');
    }

    console.log('\n🎉 Seed complete.');
  } catch (err) {
    console.error('❌ Seed error:', err);
  } finally {
    await app.destroy();
    process.exit(0);
  }
}

seed();

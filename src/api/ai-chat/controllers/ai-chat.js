'use strict';

/* ═══════════════════════════════════════════════════════════════
   TRAVERZE TRAVEL — AI CHAT ENGINE
   Self-hosted travel assistant. No external API keys needed.
   Knows: packages, flights, bookings, FAQs, destinations.
═══════════════════════════════════════════════════════════════ */

const { createCoreController } = require('@strapi/strapi').factories;

/* ── normalise text for matching ── */
const norm = s => (s || '').toLowerCase().trim();
const has  = (text, ...words) => words.some(w => norm(text).includes(w));

/* ── intent detection ── */
function detectIntent(message) {
  const m = norm(message);

  if (has(m, 'hello', 'hi ', 'hey', 'greet', 'good morning', 'good afternoon', 'good evening', 'howzit', 'sup'))
    return 'greeting';
  if (has(m, 'bye', 'goodbye', 'see you', 'farewell', 'thanks', 'thank you', 'thx'))
    return 'farewell';
  if (has(m, 'flight', 'fly', 'plane', 'airline', 'departure', 'arrival', 'airport', 'ticket'))
    return 'flights';
  if (has(m, 'package', 'holiday', 'tour', 'trip', 'vacation', 'getaway', 'deal', 'offer'))
    return 'packages';
  if (has(m, 'zanzibar', 'maldives', 'dubai', 'kenya', 'mauritius', 'victoria falls', 'cape town', 'bali', 'mozambique'))
    return 'destination';
  if (has(m, 'price', 'cost', 'how much', 'fee', 'rate', 'expensive', 'cheap', 'budget', 'afford'))
    return 'pricing';
  if (has(m, 'book', 'reserve', 'booking', 'reservation', 'confirm', 'purchase'))
    return 'booking';
  if (has(m, 'pay', 'payment', 'deposit', 'ecocash', 'bank', 'transfer', 'card', 'cash', 'instalment'))
    return 'payment';
  if (has(m, 'cancel', 'refund', 'change', 'reschedule', 'postpone', 'amend'))
    return 'cancellation';
  if (has(m, 'visa', 'passport', 'document', 'requirement', 'travel document'))
    return 'visa';
  if (has(m, 'insurance', 'cover', 'medical', 'emergency', 'protect'))
    return 'insurance';
  if (has(m, 'hotel', 'accommodation', 'stay', 'lodge', 'resort', 'room'))
    return 'accommodation';
  if (has(m, 'contact', 'phone', 'email', 'address', 'office', 'whatsapp', 'call', 'reach'))
    return 'contact';
  if (has(m, 'dashboard', 'account', 'login', 'sign in', 'password', 'profile'))
    return 'account';
  if (has(m, 'honeymoon', 'romantic', 'couple', 'anniversary', 'wedding'))
    return 'honeymoon';
  if (has(m, 'group', 'family', 'kids', 'children', 'corporate', 'team'))
    return 'group';
  if (has(m, 'weekend', 'short break', 'quick trip', '2 day', '3 day'))
    return 'weekend';
  if (has(m, 'safari', 'game drive', 'wildlife', 'animal', 'big five'))
    return 'safari';
  if (has(m, 'beach', 'ocean', 'sea', 'snorkel', 'dive', 'swim', 'coast', 'island'))
    return 'beach';
  if (has(m, 'when', 'season', 'best time', 'weather', 'climate', 'rainy', 'dry'))
    return 'besttime';
  if (has(m, 'human', 'agent', 'person', 'talk to', 'speak to', 'consultant', 'staff', 'real'))
    return 'human';

  return 'unknown';
}

/* ── fetch live data from Strapi ── */
async function getLivePackages(strapi, limit = 3) {
  try {
    const pkgs = await strapi.entityService.findMany('api::package.package', {
      fields: ['title', 'cost', 'duration'],
      populate: { location: { fields: ['City'] } },
      sort:  ['cost:asc'],
      pagination: { pageSize: limit },
    });
    return pkgs || [];
  } catch { return []; }
}

async function getLiveFlights(strapi, limit = 3) {
  try {
    const flights = await strapi.entityService.findMany('api::flight.flight', {
      fields: ['cityA', 'cityB', 'price', 'planename'],
      sort:  ['price:asc'],
      pagination: { pageSize: limit },
    });
    return flights || [];
  } catch { return []; }
}

/* ── response builder ── */
async function buildResponse(intent, message, strapi) {
  const m = norm(message);

  switch (intent) {

    case 'greeting':
      return {
        text: "Hello! 👋 Welcome to **Sisonke Travels** — your luxury travel partner for over 20 years.\n\nI'm Tara, your AI travel assistant. I can help you with:\n\n✈️ Flight estimates\n🏖️ Holiday packages\n💳 Booking & payments\n🗺️ Destination advice\n\nWhat would you like to explore today?",
        chips: ['Show me packages', 'Flight prices', 'How to book', 'Contact an agent'],
      };

    case 'farewell':
      return {
        text: "It was a pleasure chatting with you! ✈️\n\nWhenever you're ready to start planning your next adventure, we're here 24/7.\n\nSafe travels! 🌍",
        chips: ['Browse packages', 'Contact us'],
      };

    case 'flights': {
      const flights = await getLiveFlights(strapi, 4);
      let flightList = '';
      if (flights.length > 0) {
        flightList = '\n\nHere are some of our current estimates:\n\n' +
          flights.map(f => `✈️ **${f.cityA} → ${f.cityB}** (${f.planename}) — from **$${f.price} USD**`).join('\n');
      }
      return {
        text: `We offer flights from Harare (HRE) to destinations across Africa and the world.${flightList}\n\n💡 These are weekly estimates. For today's best available price — which is almost always lower — speak to a consultant.`,
        chips: ['Get a flight quote', 'View all flights', 'Book a flight', 'Contact agent'],
      };
    }

    case 'packages': {
      const pkgs = await getLivePackages(strapi, 4);
      let pkgList = '';
      if (pkgs.length > 0) {
        pkgList = '\n\nHere are a few of our popular packages:\n\n' +
          pkgs.map(p => `🌍 **${p.title}** — ${p.duration} from **$${p.cost} USD pp**`).join('\n');
      }
      return {
        text: `We curate world-class holiday packages tailored to every traveller.${pkgList}\n\n📌 All packages include flights, accommodation, and key activities. Prices are per person.`,
        chips: ['Beach packages', 'Safari packages', 'Honeymoon packages', 'View all packages'],
      };
    }

    case 'destination': {
      const dest = has(m, 'zanzibar') ? 'Zanzibar'
        : has(m, 'maldives') ? 'Maldives'
        : has(m, 'dubai') ? 'Dubai'
        : has(m, 'kenya') ? 'Kenya'
        : has(m, 'mauritius') ? 'Mauritius'
        : has(m, 'victoria falls') ? 'Victoria Falls'
        : has(m, 'cape town') ? 'Cape Town'
        : has(m, 'bali') ? 'Bali'
        : 'this destination';

      const info = {
        'Zanzibar': { emoji:'🏝️', desc:'White sandy beaches, UNESCO Stone Town, spice farms, dhow cruises.', price:'from $1,850 pp', tip:'Best time: Jun–Oct (dry season)' },
        'Maldives': { emoji:'🌊', desc:'Overwater bungalows, crystal lagoons, world-class snorkelling and diving.', price:'from $4,500 pp', tip:'Best time: Nov–Apr (dry season)' },
        'Dubai':    { emoji:'🏙️', desc:'Desert safaris, Burj Khalifa, Gold Souk, incredible food scene.', price:'from $1,650 pp', tip:'Best time: Oct–Apr (cooler weather)' },
        'Kenya':    { emoji:'🦁', desc:'Masai Mara game drives, Great Migration, hot air balloon safaris.', price:'from $2,400 pp', tip:'Best time: Jul–Oct (Great Migration)' },
        'Mauritius':{ emoji:'🌺', desc:'Lagoon beaches, le Morne, water sports, vibrant Creole culture.', price:'from $3,200 pp', tip:'Best time: May–Dec (dry season)' },
        'Victoria Falls': { emoji:'💦', desc:'One of the 7 Natural Wonders — bungee jumping, Zambezi cruises, game drives.', price:'from $1,200 pp', tip:'Best time: Feb–May (full flow)' },
        'Cape Town':{ emoji:'🏔️', desc:'Table Mountain, Winelands, Boulders Beach penguins, world-class cuisine.', price:'from $1,400 pp', tip:'Best time: Oct–Apr (summer)' },
        'Bali':     { emoji:'🌴', desc:'Rice terraces, Hindu temples, surf beaches, vibrant nightlife.', price:'from $2,100 pp', tip:'Best time: Apr–Oct (dry season)' },
      };

      const d = info[dest] || { emoji:'🌍', desc:'A beautiful destination with amazing experiences.', price:'contact us for pricing', tip:'' };

      return {
        text: `${d.emoji} **${dest}** is one of our most popular destinations!\n\n${d.desc}\n\n💰 Packages **${d.price}** (flights + accommodation included)\n📅 ${d.tip}\n\nWould you like to see our ${dest} packages or get a personalised quote?`,
        chips: [`${dest} packages`, 'Get a quote', 'Best time to travel', 'Other destinations'],
      };
    }

    case 'pricing': {
      const pkgs = await getLivePackages(strapi, 3);
      const cheapest = pkgs.length > 0 ? pkgs[0] : null;
      return {
        text: `Our packages are priced **per person** and include flights, accommodation, and key activities — no hidden fees.\n\n💰 **Pricing range:**\n• Weekend Breaks — from **$500 pp**\n• Holiday Packages — from **$1,200 pp**\n• Luxury / Maldives — from **$3,200 pp**${cheapest ? `\n\n🔥 Current best deal: **${cheapest.title}** — $${cheapest.cost} pp` : ''}\n\n✅ We also offer **30% deposit** to secure your booking, balance due 14 days before travel.`,
        chips: ['See all prices', 'Pay 30% deposit', 'Group discounts', 'Get a custom quote'],
      };
    }

    case 'booking':
      return {
        text: `Booking with Sisonke Travels is simple and secure:\n\n1️⃣ Browse packages at **/Holiday_Packages**\n2️⃣ Click **"Book This Package"** on any package\n3️⃣ Fill in your traveller details & choose dates\n4️⃣ Select your payment method\n5️⃣ Confirm — your booking reference is generated instantly\n\n🔐 A customer account is created automatically so you can track your booking at **/dashboard**.\n\n⏱️ A consultant confirms within **60 minutes**.`,
        chips: ['Browse packages', 'Go to dashboard', 'Payment options', 'Talk to consultant'],
      };

    case 'payment':
      return {
        text: `We offer flexible payment options to suit everyone:\n\n🏦 **Bank Transfer** — Invoice emailed within 2 hours\n📱 **EcoCash** — Instant mobile money\n💬 **WhatsApp Payment** — Pay via WhatsApp\n🏢 **Cash / Office** — Visit our Harare office\n💳 **Card** — Secure payment link emailed to you\n💰 **30% Deposit** — Secure your spot, pay the balance 14 days before travel\n\nAll transactions are handled by qualified consultants. We never store card numbers.`,
        chips: ['Pay 30% deposit', 'EcoCash details', 'Bank details', 'Visit our office'],
      };

    case 'cancellation':
      return {
        text: `We understand plans change. Our policy:\n\n✅ **Free cancellation enquiry** — Contact us any time\n📅 **More than 30 days before travel** — Full refund or free reschedule\n⚠️ **14–30 days before travel** — 50% refund or reschedule fee applies\n❌ **Less than 14 days** — Non-refundable (travel insurance recommended)\n\n💡 We always try to find a solution — call us directly for urgent changes.`,
        chips: ['Contact us urgently', 'Travel insurance', 'Reschedule my trip', 'Speak to consultant'],
      };

    case 'visa':
      return {
        text: `Visa requirements vary by destination and your passport:\n\n🇿🇼 **Zimbabwe passport holders** — Visa on arrival available for many African destinations\n🇿🇦 **South Africa** — Visa-free for SADC nationals\n🇦🇪 **UAE (Dubai)** — Visa required, we can assist\n🇹🇿 **Tanzania/Zanzibar** — Visa on arrival ($50)\n🇲🇻 **Maldives** — Visa on arrival (free)\n\n📋 Our team handles all visa documentation as part of your package. Just ask!`,
        chips: ['Dubai visa help', 'Zanzibar visa', 'Maldives entry', 'Contact our visa team'],
      };

    case 'insurance':
      return {
        text: `We **strongly recommend** travel insurance for all trips. A good policy covers:\n\n🏥 Medical emergencies & evacuation\n✈️ Flight cancellation & delays\n🧳 Lost or stolen luggage\n🏨 Accommodation cancellation\n\n💡 We can arrange comprehensive travel insurance as an add-on to any package. Typical cost: $30–$80 per person depending on destination and duration.`,
        chips: ['Add insurance to booking', 'Get a quote', 'What does it cover?'],
      };

    case 'accommodation':
      return {
        text: `All our packages include carefully selected accommodation:\n\n⭐ **3-Star** — Comfortable hotels with essential amenities\n⭐⭐ **4-Star** — Premium hotels with pools & restaurants\n⭐⭐⭐ **5-Star** — Luxury resorts, overwater villas, private lodges\n\n🏡 We also arrange boutique lodges, beach resorts, and safari camps.\n\nAccommodation is always rated and personally vetted by our team.`,
        chips: ['Luxury packages', 'Budget options', 'Safari lodges', 'Beach resorts'],
      };

    case 'contact':
      return {
        text: `We'd love to hear from you! 📞\n\n📍 **Office:** 1 Kenny Close, Avondale, Harare, Zimbabwe\n📞 **Phone:** +263 77 123 4567\n💬 **WhatsApp:** +263 77 123 4567\n📧 **Email:** enquiries@traverzetravel.co.zw\n\n🕐 **Office Hours:**\nMon–Fri: 08:00–17:00\nSat: 09:00–13:00\n\n💡 For bookings, you can also submit an enquiry online and a consultant will respond within **60 minutes**.`,
        chips: ['Send an enquiry', 'WhatsApp us', 'Book online', 'Visit office'],
      };

    case 'account':
      return {
        text: `Your **Sisonke Travels customer account** lets you:\n\n📋 View all your bookings\n💳 Track payment progress\n💰 Record partial payments\n✅ See booking confirmation status\n📅 Check travel dates\n\n🔐 Your account is **created automatically** when you make your first booking — no registration needed.\n\nLogin at **/account** using the email and password you set during booking.`,
        chips: ['Go to dashboard', 'Make a booking', 'Forgot password', 'Contact support'],
      };

    case 'honeymoon':
      return {
        text: `Congratulations! 💍 We specialise in **honeymoon packages** that create memories for a lifetime.\n\n🌊 **Maldives Overwater Villas** — from $4,500 pp\n🌺 **Mauritius Luxury Escape** — from $3,200 pp\n🏝️ **Zanzibar Romantic Retreat** — from $1,850 pp\n🇮🇩 **Bali Island Retreat** — from $2,100 pp\n\n✨ All honeymoon packages include **romantic extras**: sunset cruises, couples spa, champagne welcome, private dining.\n\nTell us your budget and we'll curate the perfect honeymoon.`,
        chips: ['Maldives honeymoon', 'Mauritius package', 'Zanzibar retreat', 'Custom honeymoon'],
      };

    case 'group':
      return {
        text: `We love group travel! 👨‍👩‍👧‍👦 We specialise in:\n\n🎒 **Group Tours** — 6–20 people, shared itinerary\n👪 **Family Packages** — Kid-friendly resorts & activities\n💼 **Corporate Travel** — Incentive trips & team building\n🎓 **School Tours** — Educational African adventures\n\n💰 **Group discounts** available for 6+ people.\n📋 We handle all logistics — flights, accommodation, transfers, activities.\n\nTell us your group size and destination!`,
        chips: ['Group quote', 'Family packages', 'Corporate travel', 'School tour'],
      };

    case 'weekend':
      return {
        text: `Short on time? Our **Weekend Break** packages are perfect! 🎉\n\n✈️ **Victoria Falls Weekend** — 3 days from $350 pp\n🌊 **Mozambique Beach Escape** — 3 days from $450 pp\n🦁 **Hwange Safari** — 2 nights from $280 pp\n🏙️ **Johannesburg City Break** — 3 days from $320 pp\n\n📅 We can arrange departures **Friday evening** with return **Sunday/Monday** — minimal leave days needed!`,
        chips: ['Victoria Falls', 'Mozambique', 'Safari weekend', 'Book a weekend break'],
      };

    case 'safari':
      return {
        text: `Africa's wildlife is unmatched! 🦁🐘🦒 Our safari destinations:\n\n🌿 **Masai Mara, Kenya** — Great Migration Jul–Oct, $2,400 pp\n🌍 **Chobe, Botswana** — Largest elephant herds, $1,800 pp\n🦏 **Kruger, South Africa** — Big Five, $1,200 pp\n🐆 **Hwange, Zimbabwe** — Uncrowded, authentic, $850 pp\n💦 **Chobe + Victoria Falls** — Ultimate combo, $1,200 pp\n\n🌅 All safaris include expert guides, game drives, and full-board lodges.`,
        chips: ['Masai Mara safari', 'Zimbabwe safari', 'Safari + beach combo', 'Group safari'],
      };

    case 'beach':
      return {
        text: `Sun, sand and crystal water! 🏖️ Our top beach destinations:\n\n🏝️ **Zanzibar** — White sand, turquoise water, from $1,850 pp\n🌊 **Maldives** — Overwater villas, from $4,500 pp\n🌺 **Mauritius** — Lagoon beaches, from $3,200 pp\n🌊 **Mozambique** — Pristine & affordable, from $800 pp\n🇮🇩 **Bali** — Surf & temples, from $2,100 pp\n\n☀️ All beach packages include snorkelling, boat trips, and beach activities.`,
        chips: ['Zanzibar package', 'Maldives escape', 'Mozambique beach', 'Bali retreat'],
      };

    case 'besttime':
      return {
        text: `Great question! Best travel times by destination:\n\n🏝️ **Zanzibar** — Jun–Oct (dry, sunny)\n🦁 **Kenya Safari** — Jul–Oct (Great Migration)\n🇦🇪 **Dubai** — Oct–Apr (cooler, 20–28°C)\n🌊 **Maldives** — Nov–Apr (dry season)\n🌺 **Mauritius** — May–Dec (dry season)\n💦 **Victoria Falls** — Feb–May (full water flow)\n🏔️ **Cape Town** — Oct–Apr (summer)\n\n💡 All year-round departures available from Harare.`,
        chips: ['Plan a trip', 'See packages', 'Ask about weather', 'Contact us'],
      };

    case 'human':
      return {
        text: `Of course! Our travel consultants are standing by. 🧑‍💼\n\n📞 **Call/WhatsApp:** +263 77 123 4567\n📧 **Email:** enquiries@traverzetravel.co.zw\n💬 **Office Hours:** Mon–Fri 08:00–17:00 · Sat 09:00–13:00\n\nOr submit an online enquiry and a consultant will respond within **60 minutes** — even outside office hours.`,
        chips: ['Submit enquiry', 'Call now', 'WhatsApp us', 'Visit office'],
      };

    default: {
      /* try to extract a location or topic and give a helpful fallback */
      const pkgs = await getLivePackages(strapi, 2);
      const pkgHint = pkgs.length > 0
        ? `\n\nFor example, we currently have **${pkgs[0].title}** available from **$${pkgs[0].cost} pp**.`
        : '';
      return {
        text: `I'm not sure I fully understood that, but I'd love to help! 🌍\n\nI can assist with:\n• ✈️ Flights & quotes\n• 🏖️ Holiday packages\n• 💳 Booking & payments\n• 🗺️ Destination advice\n• 📋 Account & bookings${pkgHint}\n\nCould you rephrase your question, or choose one of the options below?`,
        chips: ['Show packages', 'Flight prices', 'How to book', 'Contact agent'],
      };
    }
  }
}

module.exports = createCoreController('api::ai-chat.ai-chat', ({ strapi }) => ({

  async respond(ctx) {
    const { message, history = [] } = ctx.request.body || {};

    if (!message || typeof message !== 'string')
      return ctx.badRequest('message is required');

    if (message.trim().length > 500)
      return ctx.badRequest('message too long');

    /* rate limiting — max 30 messages per session (history length check) */
    if (history.length > 60)
      return ctx.send({
        reply: "You've reached the session limit. Please start a new conversation or contact us directly! 😊",
        chips: ['Contact us', 'Call +263 77 123 4567'],
      });

    const intent  = detectIntent(message);
    const result  = await buildResponse(intent, message, strapi);

    /* simulate slight processing delay for realism (50-200ms) */
    await new Promise(r => setTimeout(r, 80 + Math.random() * 120));

    return ctx.send({
      reply:  result.text,
      chips:  result.chips || [],
      intent,
    });
  },
}));

'use strict';

/* ═══════════════════════════════════════════════════════════════
   TARA — Sisonke Travels assistant
   Self-hosted. Reads live packages, flights, and the signed-in
   customer's own bookings. No external AI key.
═══════════════════════════════════════════════════════════════ */

const { createCoreController } = require('@strapi/strapi').factories;

const BRAND = {
  name: 'Sisonke Travels',
  email: 'enquiries@sisonketravels.co.zw',
  phone: '+263 719 239 230',
  office: '+263 4 799 792',
  whatsapp: 'https://wa.me/263719239230',
  address: '1 Kenny Close, Avondale, Harare',
  hours: 'Mon–Fri 08:00–17:00 · Sat 09:00–13:00',
};

const norm = (s) => (s || '')
  .toLowerCase()
  .replace(/\*/g, '')
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/[^a-z0-9+./\-\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const STOP = new Set([
  'the', 'and', 'for', 'from', 'with', 'what', 'how', 'much', 'can', 'you',
  'please', 'show', 'me', 'our', 'your', 'want', 'need', 'about', 'this',
  'that', 'have', 'any', 'get', 'to', 'of', 'in', 'on', 'is', 'it', 'my',
  'do', 'we', 'a', 'an', 'i', 'trip', 'trips', 'package', 'packages',
  'flight', 'flights', 'price', 'prices', 'cost', 'book', 'booking',
]);

const INTENTS = [
  { id: 'greeting', words: ['hello', 'hi', 'hey', 'hie', 'howzit', 'makadii', 'mhoro', 'good morning', 'good afternoon', 'good evening'] },
  { id: 'farewell', words: ['bye', 'goodbye', 'see you', 'thanks', 'thank you', 'cheers'] },
  { id: 'mytrips', words: ['my booking', 'my bookings', 'my trip', 'my trips', 'my balance', 'balance due', 'booking ref', 'reference', 'where is my', 'payment status', 'how much do i owe'] },
  { id: 'payment', words: ['pay', 'payment', 'ecocash', 'innbucks', 'inn bucks', 'omari', "o'mari", 'zimswitch', 'dischub', 'bank transfer', 'cash', 'deposit', 'checkout'] },
  { id: 'flights', words: ['flight', 'flights', 'fly', 'airline', 'airport', 'ticket', 'fare'] },
  { id: 'packages', words: ['package', 'packages', 'holiday', 'tour', 'getaway', 'deal', 'offer', 'itinerary'] },
  { id: 'destination', words: ['zanzibar', 'maldives', 'dubai', 'kenya', 'mauritius', 'victoria falls', 'cape town', 'bali', 'mozambique', 'hwange', 'johannesburg', 'joburg', 'botswana', 'chobe', 'livingstone', 'kruger', 'masai', 'mara', 'harare'] },
  { id: 'pricing', words: ['price', 'prices', 'cost', 'how much', 'fee', 'rate', 'expensive', 'cheap', 'budget', 'afford', 'quote'] },
  { id: 'booking', words: ['book', 'reserve', 'booking', 'reservation', 'how to book'] },
  { id: 'cancellation', words: ['cancel', 'refund', 'reschedule', 'postpone', 'amend', 'change my'] },
  { id: 'visa', words: ['visa', 'passport', 'travel document'] },
  { id: 'insurance', words: ['insurance', 'cover', 'medical cover'] },
  { id: 'accommodation', words: ['hotel', 'accommodation', 'lodge', 'resort', 'room'] },
  { id: 'contact', words: ['contact', 'phone', 'email', 'address', 'office', 'whatsapp', 'call', 'where are you'] },
  { id: 'account', words: ['dashboard', 'account', 'login', 'log in', 'sign in', 'password', 'profile'] },
  { id: 'honeymoon', words: ['honeymoon', 'romantic', 'anniversary', 'wedding'] },
  { id: 'group', words: ['group', 'family', 'kids', 'children', 'corporate', 'school tour'] },
  { id: 'weekend', words: ['weekend', 'short break', 'quick trip'] },
  { id: 'safari', words: ['safari', 'game drive', 'wildlife', 'big five'] },
  { id: 'beach', words: ['beach', 'snorkel', 'island', 'coast'] },
  { id: 'besttime', words: ['best time', 'season', 'weather', 'climate'] },
  { id: 'human', words: ['talk to an agent', 'live agent', 'live consultant', 'real person', 'human', 'speak to someone', 'consultant'] },
];

const DEST_INFO = {
  zanzibar: { name: 'Zanzibar', emoji: '🏝️', desc: 'White sandy beaches, Stone Town, spice farms and dhow cruises.', tip: 'Best time: Jun–Oct (dry season).' },
  maldives: { name: 'Maldives', emoji: '🌊', desc: 'Overwater villas, clear lagoons, snorkelling and diving.', tip: 'Best time: Nov–Apr.' },
  dubai: { name: 'Dubai', emoji: '🏙️', desc: 'Desert safaris, Burj Khalifa, souks and a big food scene.', tip: 'Best time: Oct–Apr.' },
  kenya: { name: 'Kenya', emoji: '🦁', desc: 'Masai Mara game drives and the Great Migration.', tip: 'Best time: Jul–Oct.' },
  mauritius: { name: 'Mauritius', emoji: '🌺', desc: 'Lagoon beaches, Le Morne and water sports.', tip: 'Best time: May–Dec.' },
  'victoria falls': { name: 'Victoria Falls', emoji: '💦', desc: 'The falls, Zambezi cruises, and the Victoria Falls activities.', tip: 'Best time for full flow: Feb–May.' },
  'cape town': { name: 'Cape Town', emoji: '🏔️', desc: 'Table Mountain, the Winelands and the peninsula.', tip: 'Best time: Oct–Apr.' },
  bali: { name: 'Bali', emoji: '🌴', desc: 'Rice terraces, temples and surf beaches.', tip: 'Best time: Apr–Oct.' },
  mozambique: { name: 'Mozambique', emoji: '🌊', desc: 'A short beach hop from Harare, with lodges and the Indian Ocean.', tip: 'Best time: Apr–Nov.' },
  hwange: { name: 'Hwange', emoji: '🐆', desc: 'Zimbabwe’s flagship park — elephants, big game and quiet camps.', tip: 'Best time: Jul–Oct.' },
  johannesburg: { name: 'Johannesburg', emoji: '🏙️', desc: 'A city break with shopping, food and easy onward connections.', tip: 'Year-round.' },
  botswana: { name: 'Botswana', emoji: '🐘', desc: 'Chobe and the Okavango — elephants, water and classic safari.', tip: 'Best time: May–Oct.' },
  livingstone: { name: 'Livingstone', emoji: '💦', desc: 'The Zambian side of Victoria Falls, with river activities.', tip: 'Best time for full flow: Feb–May.' },
};

let catalogCache = { at: 0, packages: [], flights: [] };

function includesPhrase(text, phrase) {
  if (phrase.includes(' ')) return text.includes(phrase);
  return new RegExp(`(?:^|\\s)${phrase}(?:\\s|$)`).test(text);
}

function scoreMessage(message) {
  const scores = {};
  INTENTS.forEach((intent) => {
    let score = 0;
    intent.words.forEach((word) => {
      if (includesPhrase(message, word)) score += word.includes(' ') ? 4 : 2;
    });
    if (score) scores[intent.id] = score;
  });
  return Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function isFollowUp(message) {
  return /^(how much|what s the price|price|prices|cost|yes|yeah|yep|ok|okay|sure|that one|the first|first one|cheapest|more|tell me more|book it|book this|and|flights|packages)\??$/.test(message);
}

function priorUserText(history) {
  return (history || [])
    .filter((item) => item && item.role === 'user' && typeof item.text === 'string')
    .slice(-4)
    .map((item) => norm(item.text))
    .join(' ');
}

function pickIntent(message, history) {
  if (/\btrv-[a-z0-9]+\b/.test(message)) return { intent: 'mytrips', search: message };
  const ranked = scoreMessage(message);
  if (isFollowUp(message)) {
    const prior = priorUserText(history);
    const priorRanked = scoreMessage(prior);
    let intent = ranked[0] || priorRanked[0] || 'unknown';
    if (/how much|price|cost|cheap/.test(message)) intent = 'pricing';
    if (/^book/.test(message)) intent = 'booking';
    return { intent, search: `${prior} ${message}`.trim() };
  }
  const words = message.split(' ').filter(Boolean);
  if (ranked[0] === 'greeting' && words.length > 3 && ranked[1]) {
    return { intent: ranked[1], search: message };
  }
  if (ranked.includes('mytrips') && (message.includes('my ') || message.includes('owe') || message.includes('balance'))) {
    return { intent: 'mytrips', search: message };
  }
  if (ranked.includes('payment') && ranked.includes('booking')) {
    return { intent: 'payment', search: message };
  }
  return { intent: ranked[0] || 'unknown', search: message };
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'on request';
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function cityOf(pkg) {
  return pkg?.location?.City || '';
}

function cleanName(name) {
  const value = String(name || '').trim();
  if (!/^[A-Za-z][A-Za-z '-]{1,30}$/.test(value)) return '';
  return value.split(' ')[0];
}

async function loadCatalog(strapi) {
  if (Date.now() - catalogCache.at < 60 * 1000) return catalogCache;
  let packages = [];
  let flights = [];
  try {
    packages = await strapi.entityService.findMany('api::package.package', {
      fields: ['title', 'cost', 'duration', 'meals', 'Slug'],
      populate: { location: { fields: ['City'] } },
      sort: ['cost:asc'],
      publicationState: 'live',
      pagination: { pageSize: 40 },
    }) || [];
  } catch (err) {
    strapi.log.warn(`Tara packages: ${err.message}`);
  }
  try {
    flights = await strapi.entityService.findMany('api::flight.flight', {
      fields: ['cityA', 'cityB', 'price', 'planename'],
      sort: ['price:asc'],
      publicationState: 'live',
      pagination: { pageSize: 40 },
    }) || [];
  } catch (err) {
    strapi.log.warn(`Tara flights: ${err.message}`);
  }
  catalogCache = {
    at: Date.now(),
    packages: Array.isArray(packages) ? packages : [],
    flights: Array.isArray(flights) ? flights : [],
  };
  return catalogCache;
}

function searchPackages(packages, query) {
  const words = norm(query).split(' ').filter((word) => word.length > 2 && !STOP.has(word));
  if (!words.length) return [];
  return packages
    .map((pkg) => {
      const hay = norm(`${pkg.title} ${cityOf(pkg)} ${pkg.duration} ${pkg.meals}`);
      const score = words.reduce((sum, word) => sum + (hay.includes(word) ? 1 : 0), 0);
      return { pkg, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.pkg.cost) - Number(b.pkg.cost))
    .map((row) => row.pkg);
}

function searchFlights(flights, query) {
  const words = norm(query).split(' ').filter((word) => word.length > 2 && !STOP.has(word));
  if (!words.length) return flights.slice(0, 4);
  const matched = flights.filter((flight) => {
    const hay = norm(`${flight.cityA} ${flight.cityB} ${flight.planename}`);
    return words.some((word) => hay.includes(word));
  });
  return (matched.length ? matched : flights).slice(0, 4);
}

function packageLines(list) {
  if (!list.length) return '';
  return `\n\n${list.slice(0, 4).map((pkg) => {
    const city = cityOf(pkg);
    const link = pkg.Slug ? ` · [View](/hotels/${pkg.Slug})` : '';
    return `🌍 **${pkg.title}**${city ? ` · ${city}` : ''} — ${pkg.duration || 'dates on request'} from **${money(pkg.cost)} USD** pp${link}`;
  }).join('\n')}`;
}

function flightLines(list) {
  if (!list.length) return '';
  return `\n\n${list.slice(0, 4).map((flight) => (
    `✈️ **${flight.cityA || 'Harare'} → ${flight.cityB || 'destination'}**${flight.planename ? ` (${flight.planename})` : ''} — from **${money(flight.price)} USD**`
  )).join('\n')}`;
}

function spotDestination(text) {
  const found = Object.keys(DEST_INFO).find((key) => text.includes(key));
  return found ? DEST_INFO[found] : null;
}

function statusLabel(status) {
  const labels = {
    pending: 'awaiting confirmation',
    confirmed: 'confirmed',
    partially_paid: 'partly paid',
    fully_paid: 'paid in full',
    checked_in: 'checked in',
    cancelled: 'cancelled',
    completed: 'completed',
    closed: 'closed',
  };
  return labels[status] || status || 'on file';
}

async function signedInUser(strapi, ctx) {
  const header = ctx.request.header.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const payload = await strapi.plugin('users-permissions').service('jwt').verify(header.slice(7));
    if (!payload?.id) return null;
    return await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: payload.id } });
  } catch {
    return null;
  }
}

async function ownBookings(strapi, userId) {
  return strapi.entityService.findMany('api::booking.booking', {
    filters: { customer: { id: userId } },
    fields: ['bookingRef', 'packageTitle', 'status', 'totalCost', 'amountPaid', 'balance', 'currency', 'checkIn', 'checkOut'],
    sort: ['createdAt:desc'],
    pagination: { pageSize: 5 },
  }) || [];
}

function bookingLines(bookings) {
  return bookings.slice(0, 4).map((booking) => {
    const when = booking.checkIn ? ` · ${booking.checkIn}` : '';
    const due = Number(booking.balance) > 0
      ? ` · balance **${money(booking.balance)}**`
      : ' · nothing due';
    return `• **${booking.bookingRef}** — ${booking.packageTitle || 'Booking'}${when} · ${statusLabel(booking.status)}${due} · [Open](/booking/confirmed/${booking.bookingRef})`;
  }).join('\n');
}

async function buildResponse({ intent, search }, message, strapi, user, name) {
  const catalog = await loadCatalog(strapi);
  const packages = searchPackages(catalog.packages, search);
  const shownPackages = packages.length ? packages : catalog.packages.slice(0, 3);
  const flights = searchFlights(catalog.flights, search);
  const place = spotDestination(search);

  switch (intent) {
    case 'greeting':
      return {
        text: `Hello${name ? ` ${name}` : ''}! I'm **Tara** at **${BRAND.name}**.\n\nI can look up holiday packages and flight estimates on the site${user ? ', and I can see the trips on your account' : ''}.\n\nWhat are you planning?`,
        chips: user
          ? ['My bookings', 'Show me packages', 'Flight prices', 'How do I pay?']
          : ['Show me packages', 'Flight prices', 'How do I pay?', 'Talk to an agent'],
      };

    case 'farewell':
      return {
        text: 'Glad I could help. When you are ready to travel, the packages and your dashboard are both open.\n\nSafe travels.',
        chips: ['Show me packages', 'My bookings'],
      };

    case 'mytrips': {
      if (!user) {
        return {
          text: `I can check a booking once you are signed in.\n\n[Sign in](/account) with the email you used to book, then ask me again. Or open [My trips](/dashboard).`,
          chips: ['How to book', 'How do I pay?', 'Talk to an agent'],
        };
      }
      const ref = (message.match(/\btrv-[a-z0-9]+\b/i) || [])[0];
      let bookings = await ownBookings(strapi, user.id);
      if (ref) {
        bookings = bookings.filter((booking) => booking.bookingRef?.toLowerCase() === ref.toLowerCase());
        if (!bookings.length) {
          return {
            text: `I can't see **${ref.toUpperCase()}** on this account. Check the reference, or open [My trips](/dashboard).`,
            chips: ['My bookings', 'Talk to an agent'],
          };
        }
      }
      if (!bookings.length) {
        return {
          text: `There are no bookings on this account yet.\n\nBrowse [holiday packages](/Holiday_Packages) and book from the package page. I'll be able to see it here afterwards.`,
          chips: ['Show me packages', 'How to book'],
        };
      }
      const due = bookings.reduce((sum, booking) => sum + (Number(booking.balance) || 0), 0);
      return {
        text: `Here is what I can see on your account:\n\n${bookingLines(bookings)}\n\n${due > 0 ? `Total still due: **${money(due)} USD**. Pay from [My trips](/dashboard) with EcoCash, InnBucks, O'mari, Zimswitch or card checkout.` : 'Everything I can see is settled.'}`,
        chips: due > 0 ? ['How do I pay?', 'Show me packages', 'Talk to an agent'] : ['Show me packages', 'Flight prices'],
      };
    }

    case 'flights':
      return {
        text: `These are guide fares from the site, not a live airline seat.${flightLines(flights)}\n\nFor today's fare, send an enquiry and a consultant will price it. [Flight estimates](/flights)`,
        chips: ['Show me packages', 'How to book', 'Get a quote', 'Talk to an agent'],
      };

    case 'packages':
      return {
        text: `Here are packages that match what you asked.${packageLines(shownPackages)}\n\nPrices are per person. Open one to see what is included, or browse [all packages](/Holiday_Packages).`,
        chips: ['Beach packages', 'Safari packages', 'How much?', 'How to book'],
      };

    case 'destination': {
      const info = place || { name: 'That destination', emoji: '🌍', desc: 'We arrange it from Harare with flights, stay and the main activities.', tip: '' };
      const matched = packages.length ? packages : [];
      return {
        text: `${info.emoji} **${info.name}**\n\n${info.desc}${info.tip ? `\n📅 ${info.tip}` : ''}${packageLines(matched)}\n\n${matched.length ? 'Those prices are the live packages on the site.' : 'Tell me your dates and budget and a consultant will price it.'}`,
        chips: ['How much?', 'How to book', 'Best time to travel', 'Other destinations'],
      };
    }

    case 'pricing': {
      const list = packages.length ? packages.slice(0, 3) : catalog.packages.slice(0, 3);
      const lead = place
        ? `${place.emoji} For **${place.name}**, this is what is on the site right now.`
        : 'Package prices are per person and come from the live list.';
      return {
        text: `${lead}${packageLines(list)}\n\nYou can pay the full balance, or part of it, from [My trips](/dashboard).`,
        chips: ['Show me packages', 'How do I pay?', 'Flight prices', 'Talk to an agent'],
      };
    }

    case 'booking':
      return {
        text: `Booking on the site:\n\n1. Open a package on [Holiday packages](/Holiday_Packages)\n2. Choose dates and travellers\n3. Confirm — you get a **TRV** reference straight away\n4. Pay from [My trips](/dashboard)\n\nA consultant confirms the booking. Ask me "my bookings" after you sign in and I can read the status.`,
        chips: ['Show me packages', 'How do I pay?', 'My bookings', 'Talk to an agent'],
      };

    case 'payment':
      return {
        text: `Pay from [My trips](/dashboard). The amount is in USD.\n\n📱 **EcoCash** — you approve the prompt on your phone\n🏪 **InnBucks** — you get a code and a QR\n📲 **O'mari** — you confirm with the OTP\n💳 **Zimswitch** and **card checkout** — Dischub\n🏦 **Bank transfer** and **cash** — recorded on the booking and confirmed by a consultant\n\nBank transfer and cash do not go through Dischub. I never see your PIN or card number.`,
        chips: ['My bookings', 'EcoCash', 'InnBucks', 'Talk to an agent'],
      };

    case 'cancellation':
      return {
        text: `Plans change. Email [**${BRAND.email}**](mailto:${BRAND.email}) or WhatsApp [${BRAND.phone}](${BRAND.whatsapp}) with your **TRV** reference.\n\nMore than 30 days before travel, we look at a refund or a free date change. Inside 30 days, airline and hotel rules usually apply. Travel insurance is the safer cover for a late change.`,
        chips: ['Travel insurance', 'My bookings', 'Talk to an agent'],
      };

    case 'visa':
      return {
        text: `Visa rules depend on your passport and the destination.\n\nWe prepare the paperwork with the package. Zimbabwe passport holders often get visa on arrival in parts of Africa. Dubai usually needs a visa before travel. Zanzibar is visa on arrival. The Maldives is a free visa on arrival.\n\nTell us the passport and the country and the consultant confirms the current rule.`,
        chips: ['Dubai visa', 'Zanzibar visa', 'Talk to an agent'],
      };

    case 'insurance':
      return {
        text: `Travel insurance is worth adding. A typical policy covers medical emergencies, cancelled flights, lost luggage and a hotel you can no longer use.\n\nAsk for it on the enquiry and the consultant adds it to the quote. [Contact](/enquiry)`,
        chips: ['How to book', 'Get a quote', 'Talk to an agent'],
      };

    case 'accommodation':
      return {
        text: `Packages name the stay: city hotels, beach resorts and safari lodges. The grade is on the package page.\n\n${packageLines(shownPackages.slice(0, 3))}\n\nOpen a package to see meals and what the stay includes.`,
        chips: ['Safari packages', 'Beach packages', 'Show me packages'],
      };

    case 'contact':
      return {
        text: `**${BRAND.name}**\n\n📍 ${BRAND.address}\n📞 ${BRAND.phone} · office ${BRAND.office}\n💬 [WhatsApp](${BRAND.whatsapp})\n📧 [${BRAND.email}](mailto:${BRAND.email})\n\n🕐 ${BRAND.hours}\n\nLusaka office: Thabo Mbeki Road · +260 954 292 468\n\nOr send an [enquiry](/enquiry). A consultant replies as soon as the office is open.`,
        chips: ['Send an enquiry', 'My bookings', 'Show me packages'],
      };

    case 'account':
      return {
        text: `Your account is created when you book, or you can [sign in](/account) with that email.\n\nFrom [My trips](/dashboard) you can see each booking, what is paid, and pay the balance. Once you are signed in, ask me "my bookings".`,
        chips: ['My bookings', 'How to book', 'How do I pay?'],
      };

    case 'honeymoon':
      return {
        text: `Honeymoon trips we arrange often: Maldives, Mauritius, Zanzibar and Bali, with a sunset activity or a private dinner when the resort allows it.\n\nTell me the destination and the budget.${packageLines(packages.slice(0, 3))}`,
        chips: ['Maldives', 'Zanzibar', 'Mauritius', 'Get a quote'],
      };

    case 'group':
      return {
        text: `We handle families, groups of friends, school tours and company trips. Six or more people should go through a consultant so the price matches the group.\n\nShare the destination, dates and number of travellers on the [enquiry form](/enquiry).`,
        chips: ['Family packages', 'Safari packages', 'Get a quote', 'Talk to an agent'],
      };

    case 'weekend':
      return {
        text: `Short breaks from Harare are usually Victoria Falls, Mozambique, Hwange or Johannesburg — leave Friday, back Sunday or Monday.${packageLines(packages.length ? packages : shownPackages)}\n\n[All packages](/Holiday_Packages)`,
        chips: ['Victoria Falls', 'Mozambique', 'Hwange', 'Flight prices'],
      };

    case 'safari':
      return {
        text: `Safari options include Hwange, Chobe, Kruger and the Masai Mara. Lodges and game drives are listed on the package.${packageLines(packages.length ? packages : [])}\n\n${packages.length ? '' : 'Ask for Hwange or a falls-and-safari combination and I will match what is on the site.'}`,
        chips: ['Hwange', 'Victoria Falls', 'Kenya', 'Get a quote'],
      };

    case 'beach':
      return {
        text: `Beach trips from here are led by Zanzibar, Mozambique, Mauritius, the Maldives and Bali.${packageLines(packages.length ? packages : [])}`,
        chips: ['Zanzibar', 'Mozambique', 'Mauritius', 'Maldives'],
      };

    case 'besttime':
      return {
        text: place
          ? `${place.emoji} **${place.name}** — ${place.tip || 'We can depart year-round from Harare.'}`
          : `Usual dry or pleasant seasons:\n\n🏝️ Zanzibar — Jun–Oct\n🦁 Kenya safari — Jul–Oct\n🇦🇪 Dubai — Oct–Apr\n🌊 Maldives — Nov–Apr\n🌺 Mauritius — May–Dec\n💦 Victoria Falls full flow — Feb–May\n🐆 Hwange — Jul–Oct\n\nWe can still depart from Harare outside those months.`,
        chips: ['Show me packages', 'Zanzibar', 'Victoria Falls', 'Hwange'],
      };

    case 'human':
      return {
        text: `I can connect you with a consultant.\n\n📞 ${BRAND.phone}\n💬 [WhatsApp](${BRAND.whatsapp})\n📧 [${BRAND.email}](mailto:${BRAND.email})\n🕐 ${BRAND.hours}\n\nOr leave your email in the live-chat form and the office will pick it up.`,
        chips: ['WhatsApp us', 'Send an enquiry', 'My bookings'],
      };

    default: {
      if (packages.length) {
        return {
          text: `This is the closest match on the site.${packageLines(packages)}${flights.length && search.split(' ').some((word) => ['fly', 'flight', 'fare'].includes(word)) ? flightLines(flights) : ''}\n\nOpen a package, or tell me the destination and the month.`,
          chips: ['How much?', 'How to book', 'Flight prices', 'Talk to an agent'],
        };
      }
      return {
        text: `I can help with packages, flight estimates, payments and your own bookings.\n\nTry a destination, or ask "how do I pay?"${user ? ' You are signed in, so "my bookings" works too.' : ' Sign in if you want me to read a booking.'}`,
        chips: ['Show me packages', 'Flight prices', 'How do I pay?', 'My bookings'],
      };
    }
  }
}

module.exports = createCoreController('api::ai-chat.ai-chat', ({ strapi }) => ({
  async respond(ctx) {
    const body = ctx.request.body || {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

    if (!message) return ctx.badRequest('message is required');
    if (message.length > 500) return ctx.badRequest('message too long');
    if (history.length > 40) {
      return ctx.send({
        reply: `This chat is full. Start a new one, or email ${BRAND.email}.`,
        chips: ['Talk to an agent'],
        intent: 'farewell',
      });
    }

    const user = await signedInUser(strapi, ctx);
    const name = cleanName(body.name);
    const choice = pickIntent(norm(message), history);
    const result = await buildResponse(choice, norm(message), strapi, user, name);

    return ctx.send({
      reply: result.text,
      chips: result.chips || [],
      intent: choice.intent,
      signedIn: Boolean(user),
    });
  },
}));

'use strict';

/**
 * Option A — manual flight enquiry workflow
 * Customer submit → FLT-ref → agent status pipeline → quotation
 */

const { createCoreController } = require('@strapi/strapi').factories;

const STATUSES = [
  'New',
  'Under Review',
  'Searching',
  'Quotation Sent',
  'Awaiting Response',
  'Accepted',
  'Awaiting Payment',
  'Ticket Issued',
  'Cancelled',
  'Closed',
];

const UID = 'api::enquiries-about-flight.enquiries-about-flight';

function makeFltRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FLT-${stamp}-${rand}`;
}

function appendLog(existing, entry) {
  const log = Array.isArray(existing) ? existing.slice() : [];
  log.push({ at: new Date().toISOString(), ...entry });
  return log;
}

function normalizeTripType(v) {
  if (!v) return 'one-way';
  const s = String(v).toLowerCase().replace(/\s+/g, '-');
  if (s.includes('round') || s.includes('two') || s === 'return') return 'round-trip';
  if (s.includes('multi')) return 'multi-city';
  if (s.includes('one')) return 'one-way';
  return s;
}

function mapBody(params) {
  const phoneDigits = String(params.PhoneNumber ?? params.phone ?? '')
    .replace(/\D/g, '');
  return {
    FirstName: params.FirstName || params.firstName || null,
    LastName: params.LastName || params.lastName || null,
    Email: (params.Email || params.email || '').toLowerCase().trim(),
    PhoneNumber: phoneDigits || null,
    Message: params.Message || params.message || params.notes || null,
    Children: params.Children != null ? Number(params.Children) : (params.children != null ? Number(params.children) : 0),
    Adults: params.Adults != null ? Number(params.Adults) : (params.adults != null ? Number(params.adults) : 1),
    Infants: params.Infants != null ? Number(params.Infants) : (params.infants != null ? Number(params.infants) : 0),
    DepartureAirport: params.DepartureAirport || params.origin || params.from || null,
    ArrivalAirport: params.ArrivalAirport || params.destination || params.to || null,
    SecondDepartureAirport: params.SecondDepartureAirport || params.returnFrom || null,
    SecondArrivalAirport: params.SecondArrivalAirport || params.SecondArrival || params.returnTo || null,
    DepartureDate: params.DepartureDate || params.departDate || null,
    ReturnDate: params.ReturnDate || params.returnDate || null,
    SecondDepartureDate: params.SecondDepartureDate || null,
    Terms_Conditions: !!(params.Terms_Conditions ?? params.terms),
    TripType: normalizeTripType(params.TripType || params.journeyType || params.tripType),
    FlightClass: params.FlightClass || params.cabinClass || params.flightClass || 'Economy',
    SecondFilghtClass: params.SecondFilghtClass || null,
    OtherCitiies: params.OtherCitiies || params.OtherCities || params.multiCityLegs || null,
    contactPreference: params.contactPreference || params.preferredContact || 'email',
  };
}

async function sendAckStub(strapi, enquiry) {
  const subject = `Flight enquiry received — ${enquiry.enquiryRef}`;
  const text = `Dear ${enquiry.FirstName || 'Traveller'},

Thank you for your flight enquiry with Sisonke Travels (Harare).

Reference: ${enquiry.enquiryRef}
Route: ${enquiry.DepartureAirport || '?'} → ${enquiry.ArrivalAirport || '?'}
Journey: ${enquiry.TripType || 'n/a'}
Dates: ${enquiry.DepartureDate || 'TBC'}${enquiry.ReturnDate ? ` – ${enquiry.ReturnDate}` : ''}

Important: This is an enquiry only — not a ticket and not a payment.
An agent will search fares and send a quotation for your approval before any booking or payment.

We will contact you at ${enquiry.Email}${enquiry.PhoneNumber ? ` / ${enquiry.PhoneNumber}` : ''}.

— Sisonke Travels
`;

  try {
    await strapi.plugins['email'].services.email.send({
      to: enquiry.Email,
      from: 'traverzerecruitments@gmail.com',
      subject,
      text,
    });
    return true;
  } catch (err) {
    strapi.log.warn(`[flight-enquiry] ack email stub failed for ${enquiry.enquiryRef}: ${err.message}`);
    /* Log stub so E2E can still assert acknowledgement path */
    strapi.log.info(`[flight-enquiry] ACK_STUB ${enquiry.enquiryRef} → ${enquiry.Email}`);
    return false;
  }
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  /** POST /api/enquiries-about-flight/enquiries-about-flight — public create */
  async create(ctx) {
    let params;
    try {
      params =
        typeof ctx.request.body === 'string'
          ? JSON.parse(ctx.request.body)
          : (ctx.request.body || {});
    } catch (err) {
      return ctx.badRequest('Invalid JSON body');
    }

    const data = mapBody(params);
    if (!data.Email) return ctx.badRequest('Email is required');
    if (!data.DepartureAirport || !data.ArrivalAirport) {
      return ctx.badRequest('Origin and destination cities/airports are required');
    }
    if (!data.DepartureDate) return ctx.badRequest('Departure date is required');

    const enquiryRef = makeFltRef();
    const changeLog = appendLog([], {
      action: 'created',
      by: 'customer',
      status: 'New',
      note: 'Customer submitted flight enquiry (Option A — no ticket/payment)',
    });

    const enquiry = await strapi.entityService.create(UID, {
      data: {
        ...data,
        enquiryRef,
        status: 'New',
        changeLog,
        publishedAt: new Date(),
      },
    });

    const emailed = await sendAckStub(strapi, enquiry);
    const updated = await strapi.entityService.update(UID, enquiry.id, {
      data: {
        acknowledgementSentAt: new Date(),
        changeLog: appendLog(enquiry.changeLog, {
          action: 'acknowledgement',
          by: 'system',
          note: emailed ? 'Customer acknowledgement email sent' : 'Acknowledgement stub logged (email transport unavailable)',
        }),
      },
    });

    ctx.body = {
      ok: true,
      enquiryRef: updated.enquiryRef || enquiryRef,
      id: updated.id,
      status: updated.status || 'New',
      message:
        'Enquiry received. This is not a ticket and no payment is due yet. An agent will send a quotation.',
      acknowledgement: emailed ? 'email_sent' : 'stub_logged',
    };
  },

  /** GET /api/flight-enquiries — agent list */
  async list(ctx) {
    const status = ctx.query.status;
    const filters = status ? { status } : {};
    const rows = await strapi.entityService.findMany(UID, {
      filters,
      sort: { createdAt: 'desc' },
      limit: Math.min(Number(ctx.query.limit) || 100, 200),
    });
    const byStatus = {};
    for (const s of STATUSES) byStatus[s] = [];
    for (const r of rows) {
      const key = r.status && byStatus[r.status] ? r.status : 'New';
      byStatus[key].push(r);
    }
    ctx.body = { count: rows.length, statuses: STATUSES, byStatus, rows };
  },

  /**
   * GET /api/flight-enquiries/mine — customer: own enquiries by login email
   * Customer-visible thread notes only (no internal search notes).
   */
  async mine(ctx) {
    const user = ctx.state.user;
    if (!user?.email) return ctx.unauthorized('Login required');
    const email = String(user.email).toLowerCase().trim();
    const rows = await strapi.entityService.findMany(UID, {
      filters: { Email: email },
      sort: { createdAt: 'desc' },
      limit: 50,
    });
    const sanitized = (rows || []).map((r) => {
      const log = Array.isArray(r.changeLog) ? r.changeLog : [];
      const customerThread = log.filter((c) => c && (c.customerVisible || c.action === 'customer_reply' || c.action === 'quotation_sent'));
      return {
        id: r.id,
        enquiryRef: r.enquiryRef,
        status: r.status,
        TripType: r.TripType,
        FlightClass: r.FlightClass,
        DepartureAirport: r.DepartureAirport,
        ArrivalAirport: r.ArrivalAirport,
        DepartureDate: r.DepartureDate,
        ReturnDate: r.ReturnDate,
        Adults: r.Adults,
        Children: r.Children,
        Infants: r.Infants,
        quotationAmount: r.quotationAmount,
        quotationCurrency: r.quotationCurrency,
        quotationDetails: r.quotationDetails,
        quotationSentAt: r.quotationSentAt,
        assignedAgent: r.assignedAgent,
        tamsEnquiryRef: r.tamsEnquiryRef || null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        customerThread,
      };
    });
    ctx.body = { count: sanitized.length, rows: sanitized };
  },

  /** GET /api/flight-enquiries/:idOrRef */
  async getOne(ctx) {
    const key = ctx.params.id;
    let row = null;
    if (/^\d+$/.test(String(key))) {
      row = await strapi.entityService.findOne(UID, Number(key));
    }
    if (!row) {
      const found = await strapi.entityService.findMany(UID, {
        filters: { enquiryRef: key },
        limit: 1,
      });
      row = found?.[0] || null;
    }
    if (!row) return ctx.notFound('Flight enquiry not found');
    ctx.body = { enquiry: row };
  },

  /** PATCH /api/flight-enquiries/:id/status */
  async setStatus(ctx) {
    const id = ctx.params.id;
    const { status, note, by } = ctx.request.body || {};
    if (!STATUSES.includes(status)) {
      return ctx.badRequest(`status must be one of: ${STATUSES.join(', ')}`);
    }
    const current = await strapi.entityService.findOne(UID, id);
    if (!current) return ctx.notFound('Not found');
    const updated = await strapi.entityService.update(UID, id, {
      data: {
        status,
        changeLog: appendLog(current.changeLog, {
          action: 'status',
          by: by || 'agent',
          from: current.status,
          to: status,
          note: note || null,
        }),
      },
    });
    ctx.body = { enquiry: updated };
  },

  /** POST /api/flight-enquiries/:id/assign */
  async assign(ctx) {
    const id = ctx.params.id;
    const { assignedAgent, note } = ctx.request.body || {};
    if (!assignedAgent) return ctx.badRequest('assignedAgent required');
    const current = await strapi.entityService.findOne(UID, id);
    if (!current) return ctx.notFound('Not found');
    const updated = await strapi.entityService.update(UID, id, {
      data: {
        assignedAgent,
        status: current.status === 'New' ? 'Under Review' : current.status,
        changeLog: appendLog(current.changeLog, {
          action: 'assign',
          by: 'agent',
          note: note || `Assigned to ${assignedAgent}`,
          to: current.status === 'New' ? 'Under Review' : current.status,
        }),
      },
    });
    ctx.body = { enquiry: updated };
  },

  /** POST /api/flight-enquiries/:id/search-notes */
  async searchNotes(ctx) {
    const id = ctx.params.id;
    const { searchNotes, agentNotes, markSearching } = ctx.request.body || {};
    const current = await strapi.entityService.findOne(UID, id);
    if (!current) return ctx.notFound('Not found');
    const nextStatus = markSearching !== false ? 'Searching' : current.status;
    const updated = await strapi.entityService.update(UID, id, {
      data: {
        searchNotes: searchNotes != null ? searchNotes : current.searchNotes,
        agentNotes: agentNotes != null ? agentNotes : current.agentNotes,
        status: nextStatus,
        changeLog: appendLog(current.changeLog, {
          action: 'search_notes',
          by: 'agent',
          note: searchNotes || agentNotes || 'Search notes updated',
          to: nextStatus,
        }),
      },
    });
    ctx.body = { enquiry: updated };
  },

  /** POST /api/flight-enquiries/:id/quotation */
  async quotation(ctx) {
    const id = ctx.params.id;
    const {
      amount,
      currency,
      details,
      send,
      markAwaitingResponse,
      attachmentName,
      attachmentText,
      attachmentStub,
    } = ctx.request.body || {};
    if (amount == null || Number.isNaN(Number(amount))) {
      return ctx.badRequest('quotation amount required');
    }
    const current = await strapi.entityService.findOne(UID, id);
    if (!current) return ctx.notFound('Not found');

    /* Default: Quotation Sent. Pass markAwaitingResponse:true to advance. */
    let status = 'Quotation Sent';
    if (markAwaitingResponse === true) status = 'Awaiting Response';

    const attachLabel = attachmentName || (attachmentStub ? 'quote-stub.txt' : null);
    const attachBody = attachmentText || attachmentStub || null;
    const detailsFull = [
      details || null,
      attachLabel ? `[Attachment: ${attachLabel}]` : null,
      attachBody,
    ].filter(Boolean).join('\n\n') || null;

    const data = {
      quotationAmount: Number(amount),
      quotationCurrency: currency || 'USD',
      quotationDetails: detailsFull,
      quotationSentAt: new Date(),
      status,
      changeLog: appendLog(current.changeLog, {
        action: send === false ? 'quotation_prepared' : 'quotation_sent',
        by: 'agent',
        note: detailsFull || `Quote ${currency || 'USD'} ${amount}`,
        to: status,
        customerVisible: send !== false,
        attachmentName: attachLabel || null,
      }),
    };

    let emailDelivery = 'skipped';
    if (send !== false && current.Email) {
      const quoteText = `Dear ${current.FirstName || 'Traveller'},

Your flight quotation from Sisonke Travels:

Reference: ${current.enquiryRef}
Route: ${current.DepartureAirport} → ${current.ArrivalAirport}
Amount: ${currency || 'USD'} ${amount}

${detailsFull || ''}

This quotation is not a ticket. Payment is only requested after you accept.

— Sisonke Travels
`;
      try {
        await strapi.plugins['email'].services.email.send({
          to: current.Email,
          from: 'traverzerecruitments@gmail.com',
          subject: `Flight quotation ${current.enquiryRef}`,
          text: quoteText,
        });
        emailDelivery = 'sent';
      } catch (err) {
        emailDelivery = 'stubbed';
        strapi.log.info(`[flight-enquiry] QUOTE_STUB ${current.enquiryRef} → ${current.Email} ${currency || 'USD'} ${amount}`);
      }
    }

    const updated = await strapi.entityService.update(UID, id, { data });
    ctx.body = { enquiry: updated, emailDelivery, status };
  },

  /**
   * POST /api/flight-enquiries/:id/reply
   * Customer-visible thread note (emailed when possible).
   */
  async reply(ctx) {
    const id = ctx.params.id;
    const { note, channel } = ctx.request.body || {};
    if (!note || !String(note).trim()) return ctx.badRequest('note required');
    const current = await strapi.entityService.findOne(UID, id);
    if (!current) return ctx.notFound('Not found');

    let emailDelivery = 'skipped';
    if (current.Email) {
      try {
        await strapi.plugins['email'].services.email.send({
          to: current.Email,
          from: 'traverzerecruitments@gmail.com',
          subject: `Update on your flight enquiry ${current.enquiryRef}`,
          text: `Dear ${current.FirstName || 'Traveller'},

Regarding your enquiry ${current.enquiryRef}
(${current.DepartureAirport || '?'} → ${current.ArrivalAirport || '?'}):

${String(note).trim()}

Reply to this email or call Sisonke Travels (Harare) with your reference.

— Sisonke Travels
`,
        });
        emailDelivery = 'sent';
      } catch (err) {
        emailDelivery = 'stubbed';
        strapi.log.info(`[flight-enquiry] REPLY_STUB ${current.enquiryRef} → ${current.Email}`);
      }
    }

    const updated = await strapi.entityService.update(UID, id, {
      data: {
        agentNotes: [current.agentNotes, `[customer-reply/${channel || 'email'}] ${String(note).trim()}`]
          .filter(Boolean)
          .join('\n'),
        changeLog: appendLog(current.changeLog, {
          action: 'customer_reply',
          by: 'agent',
          note: String(note).trim(),
          channel: channel || 'email',
          customerVisible: true,
          emailDelivery,
        }),
      },
    });
    ctx.body = { enquiry: updated, emailDelivery, customerVisible: true };
  },

  /** POST /api/flight-enquiries/:id/contact-note — log customer contact */
  async contactNote(ctx) {
    const id = ctx.params.id;
    const { note, channel, visibleToCustomer } = ctx.request.body || {};
    if (!note) return ctx.badRequest('note required');
    const current = await strapi.entityService.findOne(UID, id);
    if (!current) return ctx.notFound('Not found');

    /* Customer-visible path → same as reply (email when possible) */
    if (visibleToCustomer) {
      ctx.request.body = { note, channel: channel || 'email' };
      return this.reply(ctx);
    }

    const updated = await strapi.entityService.update(UID, id, {
      data: {
        agentNotes: [current.agentNotes, `[${channel || 'contact'}] ${note}`].filter(Boolean).join('\n'),
        changeLog: appendLog(current.changeLog, {
          action: 'contact',
          by: 'agent',
          note,
          channel: channel || 'phone/email',
          customerVisible: false,
        }),
      },
    });
    ctx.body = { enquiry: updated, customerVisible: false };
  },

  /**
   * POST /api/flight-enquiries/:id/accept
   * Customer accepts a sent quotation (enquiry ≠ ticket).
   */
  async accept(ctx) {
    const id = ctx.params.id;
    const { email, by } = ctx.request.body || {};
    const current = await strapi.entityService.findOne(UID, id);
    if (!current) return ctx.notFound('Not found');
    if (current.quotationAmount == null) {
      return ctx.badRequest('No quotation to accept');
    }
    if (!['Quotation Sent', 'Awaiting Response', 'Accepted'].includes(current.status)) {
      return ctx.badRequest(`Cannot accept from status ${current.status}`);
    }
    const jwtEmail = ctx.state?.user?.email;
    const claim = (email || jwtEmail || '').toLowerCase().trim();
    if (claim && current.Email && claim !== String(current.Email).toLowerCase()) {
      return ctx.forbidden('Email does not match this enquiry');
    }
    const updated = await strapi.entityService.update(UID, id, {
      data: {
        status: 'Accepted',
        changeLog: appendLog(current.changeLog, {
          action: 'quote_accepted',
          by: by || claim || 'customer',
          from: current.status,
          to: 'Accepted',
          note: 'Customer accepted quotation — not a ticket; payment still required',
          customerVisible: true,
        }),
      },
    });
    ctx.body = {
      enquiry: updated,
      note: 'Quote accepted. Agent will convert to a payable booking. This is not a ticket.',
    };
  },

  /**
   * POST /api/flight-enquiries/:id/convert-to-booking
   * Option A: create TAMS enquiry + approved quote + booking + flight reservation;
   * link tamsEnquiryRef; set Awaiting Payment.
   */
  async convertToBooking(ctx) {
    const id = ctx.params.id;
    const { by, passengers } = ctx.request.body || {};
    const current = await strapi.entityService.findOne(UID, id);
    if (!current) return ctx.notFound('Not found');
    if (current.quotationAmount == null) {
      return ctx.badRequest('Quotation amount required before convert');
    }
    if (!['Accepted', 'Awaiting Payment'].includes(current.status) && current.status !== 'Quotation Sent') {
      /* Allow Quotation Sent if agent converts with customer verbal accept */
    }
    if (current.tamsEnquiryRef) {
      return ctx.badRequest(`Already linked to ${current.tamsEnquiryRef}`);
    }

    const emailNorm = String(current.Email || '').toLowerCase().trim();
    if (!emailNorm) return ctx.badRequest('Flight enquiry missing email');

    const name = `${current.FirstName || ''} ${current.LastName || ''}`.trim() || emailNorm;
    let profile = await strapi.db.query('api::customer-profile.customer-profile').findOne({
      where: { email: emailNorm },
    });
    if (!profile) {
      profile = await strapi.entityService.create('api::customer-profile.customer-profile', {
        data: {
          fullName: name,
          email: emailNorm,
          phone: current.PhoneNumber || null,
          preferences: {},
        },
      });
    }

    let user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { email: emailNorm },
    });
    if (!user) {
      const crypto = require('crypto');
      const role = await strapi.db.query('plugin::users-permissions.role')
        .findOne({ where: { type: 'authenticated' } });
      user = await strapi.entityService.create('plugin::users-permissions.user', {
        data: {
          username: emailNorm.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6),
          email: emailNorm,
          password: crypto.randomBytes(8).toString('hex'),
          provider: 'local',
          confirmed: true,
          blocked: false,
          role: role?.id ?? null,
        },
      });
      await strapi.entityService.update('api::customer-profile.customer-profile', profile.id, {
        data: { user: user.id },
      });
    }

    function tamsRef(prefix) {
      return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }

    const route = `${current.DepartureAirport || '?'} → ${current.ArrivalAirport || '?'}`;
    const enquiry = await strapi.entityService.create('api::tams-enquiry.tams-enquiry', {
      data: {
        enquiryRef: tamsRef('ENQ'),
        status: 'approved',
        source: `flt:${current.enquiryRef}`,
        destination: current.ArrivalAirport || 'Flight',
        origin: current.DepartureAirport || 'Harare',
        travelDates: {
          depart: current.DepartureDate || null,
          return: current.ReturnDate || null,
        },
        travellers: (current.Adults || 1) + (current.Children || 0) + (current.Infants || 0),
        purpose: 'Flight Quote',
        summary: `Converted from ${current.enquiryRef}\n${route}\n${current.quotationDetails || ''}`,
        assignedAgent: current.assignedAgent || by || null,
        customer: profile.id,
      },
    });

    await strapi.entityService.create('api::travel-requirement.travel-requirement', {
      data: {
        category: 'flight',
        description: `Flight ${route} (${current.TripType || 'one-way'})`,
        priority: 'must',
        details: {
          fltRef: current.enquiryRef,
          cabin: current.FlightClass,
          adults: current.Adults,
          children: current.Children,
          infants: current.Infants,
        },
        enquiry: enquiry.id,
      },
    });

    const amount = Number(current.quotationAmount);
    const currency = current.quotationCurrency || 'USD';
    const quote = await strapi.entityService.create('api::quotation.quotation', {
      data: {
        quoteRef: tamsRef('QTE'),
        version: 1,
        status: 'approved',
        title: `Flight ${route}`,
        currency,
        subtotal: amount,
        taxes: 0,
        total: amount,
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        lineItems: [{
          type: 'flight',
          description: `Flight ${route} · ${current.FlightClass || 'Economy'}`,
          amount,
          supplier: 'Airline TBD (manual Option A)',
        }],
        notes: `From FLT ${current.enquiryRef}`,
        sentAt: current.quotationSentAt || new Date(),
        approvedAt: new Date(),
        enquiry: enquiry.id,
        customer: profile.id,
      },
    });

    const pax = Array.isArray(passengers) && passengers.length
      ? passengers
      : [{ name, type: 'adult' }];

    const booking = await strapi.entityService.create('api::booking.booking', {
      data: {
        bookingRef: tamsRef('TRV'),
        bookingType: 'tams',
        packageTitle: `Flight ${route}`,
        checkIn: current.DepartureDate || null,
        checkOut: current.ReturnDate || null,
        adults: current.Adults || 1,
        children: current.Children || 0,
        totalCost: amount,
        amountPaid: 0,
        balance: amount,
        currency,
        status: 'pending',
        pipelineStage: 'booked',
        passengers: pax,
        notes: `Linked FLT ${current.enquiryRef}`,
        customer: user.id,
        customerProfile: profile.id,
        quotation: quote.id,
        changeLog: [{
          at: new Date().toISOString(),
          action: 'booking_created',
          detail: { fromFlt: current.enquiryRef, tamsEnquiry: enquiry.enquiryRef },
          actor: by || 'agent',
        }],
      },
    });

    const reservation = await strapi.entityService.create('api::reservation.reservation', {
      data: {
        type: 'flight',
        supplier: 'Airline TBD',
        description: `Flight ${route}`,
        startDate: current.DepartureDate || null,
        endDate: current.ReturnDate || current.DepartureDate || null,
        cost: 0,
        sellPrice: amount,
        currency,
        status: 'requested',
        details: {
          fltRef: current.enquiryRef,
          tripType: current.TripType,
          cabin: current.FlightClass,
        },
        booking: booking.id,
      },
    });

    await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enquiry.id, {
      data: { booking: booking.id, status: 'booking' },
    });

    const updated = await strapi.entityService.update(UID, id, {
      data: {
        status: 'Awaiting Payment',
        tamsEnquiryRef: enquiry.enquiryRef,
        changeLog: appendLog(current.changeLog, {
          action: 'converted_to_booking',
          by: by || 'agent',
          to: 'Awaiting Payment',
          note: `TAMS ${enquiry.enquiryRef} / booking ${booking.bookingRef}`,
          customerVisible: true,
        }),
      },
    });

    ctx.body = {
      enquiry: updated,
      tamsEnquiryRef: enquiry.enquiryRef,
      booking: { id: booking.id, bookingRef: booking.bookingRef, totalCost: amount, balance: amount, currency },
      reservation: { id: reservation.id, type: 'flight', status: reservation.status },
      note: 'Booking opened for payment. Ticket only after pay + agent issues PNR/e-ticket (separate fields).',
    };
  },

  /**
   * POST /api/flight-enquiries/:id/ticket
   * Record PNR + e-ticket after payment; refuse if either missing or PNR used as ticket.
   */
  async issueTicket(ctx) {
    const id = ctx.params.id;
    const { pnr, eTicket, by, confirmationNo } = ctx.request.body || {};
    const current = await strapi.entityService.findOne(UID, id);
    if (!current) return ctx.notFound('Not found');
    if (!pnr || !String(pnr).trim()) return ctx.badRequest('pnr required');
    if (!eTicket || !String(eTicket).trim()) {
      return ctx.badRequest('eTicket required — PNR alone is not a ticket');
    }
    if (String(pnr).trim().toUpperCase() === String(eTicket).trim().toUpperCase()) {
      return ctx.badRequest('PNR and e-ticket must be different values');
    }
    if (!['Awaiting Payment', 'Accepted', 'Ticket Issued'].includes(current.status)) {
      /* Prefer Awaiting Payment → Ticket Issued after agent confirms pay in TAMS */
    }

    let bookingUpdated = null;
    if (current.tamsEnquiryRef) {
      const tams = await strapi.db.query('api::tams-enquiry.tams-enquiry').findOne({
        where: { enquiryRef: current.tamsEnquiryRef },
        populate: { booking: { populate: { reservations: true, payments: true } } },
      });
      const booking = tams?.booking;
      if (booking) {
        const paid = Number(booking.amountPaid) || 0;
        if (paid <= 0 && booking.status !== 'confirmed' && booking.status !== 'paid') {
          return ctx.badRequest('Record customer payment on the linked booking before issuing ticket');
        }
        const flightRes = (booking.reservations || []).find((r) => r.type === 'flight');
        if (flightRes) {
          await strapi.entityService.update('api::reservation.reservation', flightRes.id, {
            data: {
              confirmationNo: confirmationNo || String(pnr).trim(),
              ticketOrVoucher: String(eTicket).trim(),
              status: 'ticketed',
              details: {
                ...(flightRes.details || {}),
                pnr: String(pnr).trim(),
                eTicket: String(eTicket).trim(),
                note: 'PNR ≠ e-ticket',
              },
            },
          });
        }
        bookingUpdated = booking.bookingRef;
      }
    }

    const updated = await strapi.entityService.update(UID, id, {
      data: {
        status: 'Ticket Issued',
        agentNotes: [
          current.agentNotes,
          `PNR ${String(pnr).trim()} · e-ticket ${String(eTicket).trim()}`,
        ].filter(Boolean).join('\n'),
        changeLog: appendLog(current.changeLog, {
          action: 'ticket_issued',
          by: by || 'agent',
          to: 'Ticket Issued',
          note: `PNR ${String(pnr).trim()} (locator) · e-ticket ${String(eTicket).trim()}`,
          customerVisible: true,
        }),
      },
    });

    ctx.body = {
      enquiry: updated,
      bookingRef: bookingUpdated,
      note: 'Ticket recorded. PNR is locator only; e-ticket is the travel document.',
    };
  },
}));

'use strict';

/**
 * Sisonke Travels TAMS — Travel Agency Management System workflow API
 * Enquiry → profile → requirements → research → quotation → approval →
 * booking/reservations → payments → ticketing → visa/docs → pre-departure →
 * support → feedback → close
 */

const {
  convertAmount,
  listFxRates,
  computeBookingRefundCap,
  redactCustomer,
  redactPassengers,
  validatePassengers,
  assertPnrNotTicket,
  assertVisaSeparation,
  appendFinancialAudit,
  daysUntil,
} = require('../services/rules');

function ref(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function appendChangeLog(existing, action, detail, actor) {
  const log = Array.isArray(existing) ? [...existing] : [];
  log.push({
    at: new Date().toISOString(),
    action,
    detail: detail || null,
    actor: actor || 'system',
  });
  return log.slice(-200);
}

function wantsRevealDocs(ctx) {
  const q = ctx.query || {};
  const h = ctx.request?.header || {};
  return q.revealDocs === '1' || q.revealDocs === 'true' || h['x-reveal-docs'] === '1';
}

async function loadEnquiry(id) {
  return strapi.entityService.findOne('api::tams-enquiry.tams-enquiry', id, {
    populate: {
      customer: true,
      requirements: true,
      quotations: true,
      booking: true,
    },
  });
}

async function loadBookingFull(id) {
  return strapi.entityService.findOne('api::booking.booking', id, {
    populate: {
      payments: true,
      reservations: true,
      visaCases: true,
      preDepartureItems: true,
      incidents: true,
      feedbacks: true,
      customer: true,
      customerProfile: true,
      quotation: true,
    },
  });
}

function serializeEnquiry(e, opts = {}) {
  if (!e) return null;
  const reveal = !!opts.revealDocs;
  let booking = e.booking;
  if (booking && typeof booking === 'object') {
    booking = {
      ...booking,
      passengers: redactPassengers(booking.passengers, { revealDocs: reveal }),
    };
  }
  return {
    id: e.id,
    enquiryRef: e.enquiryRef,
    status: e.status,
    source: e.source,
    destination: e.destination,
    origin: e.origin,
    travelDates: e.travelDates,
    travellers: e.travellers,
    budget: e.budget,
    purpose: e.purpose,
    summary: e.summary,
    researchNotes: e.researchNotes,
    assignedAgent: e.assignedAgent,
    customer: redactCustomer(e.customer, { revealDocs: reveal }),
    requirements: e.requirements || [],
    quotations: e.quotations || [],
    booking,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

function serializeBookingTams(b, opts = {}) {
  if (!b) return null;
  const reveal = !!opts.revealDocs;
  const visas = (b.visaCases || []).map((v) => {
    if (!v) return v;
    if (reveal) return v;
    return {
      ...v,
      passportNumber: v.passportNumber ? require('../services/rules').maskPassport(v.passportNumber) : null,
      passportRestricted: !!v.passportNumber,
    };
  });
  return {
    id: b.id,
    bookingRef: b.bookingRef,
    bookingType: b.bookingType,
    packageTitle: b.packageTitle,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    adults: b.adults,
    children: b.children,
    totalCost: b.totalCost,
    amountPaid: b.amountPaid,
    balance: b.balance,
    currency: b.currency,
    status: b.status,
    pipelineStage: b.pipelineStage,
    passengers: redactPassengers(b.passengers, { revealDocs: reveal }),
    ticketingNotes: b.ticketingNotes,
    ticketingDeadline: b.ticketingDeadline || null,
    changeLog: b.changeLog || [],
    financialAudit: b.financialAudit || [],
    docsReady: b.docsReady,
    visaReady: b.visaReady,
    closedAt: b.closedAt,
    closureNotes: b.closureNotes,
    confirmedAt: b.confirmedAt,
    checkedInAt: b.checkedInAt,
    notes: b.notes,
    payments: b.payments || [],
    reservations: b.reservations || [],
    visaCases: visas,
    preDepartureItems: b.preDepartureItems || [],
    incidents: b.incidents || [],
    feedbacks: b.feedbacks || [],
    customerProfile: redactCustomer(b.customerProfile, { revealDocs: reveal }),
    quotation: b.quotation,
    createdAt: b.createdAt,
  };
}

module.exports = {
  /** Health / module map */
  async overview(ctx) {
    ctx.body = {
      product: 'Sisonke Travels TAMS',
      stages: [
        'enquiry', 'profiling', 'requirements', 'research', 'quotation',
        'approval', 'booking', 'payments', 'ticketing', 'visa_docs',
        'pre_departure', 'support', 'post_travel', 'close',
      ],
      note: 'GDS live search not connected — mock/manual availability only',
      fx: listFxRates(),
    };
  },

  /** GET /api/tams/fx-rates */
  async fxRates(ctx) {
    ctx.body = listFxRates();
  },

  /**
   * POST /api/tams/enquiries
   * Create enquiry + upsert customer profile (public or auth)
   */
  async createEnquiry(ctx) {
    const b = ctx.request.body || {};
    const {
      fullName, email, phone, organisation, nationality,
      destination, origin, travelDates, travellers, budget,
      purpose, summary, source, password,
    } = b;

    if (!email) return ctx.badRequest('email is required');
    if (!fullName && !(b.firstName || b.lastName)) {
      return ctx.badRequest('fullName is required');
    }
    if (!destination) return ctx.badRequest('destination is required');

    /* Depart/return (or check-in/out) — return must be on or after depart */
    const td = travelDates && typeof travelDates === 'object' ? travelDates : null;
    const departIso = td?.depart || td?.start || null;
    const returnIso = td?.return || td?.end || null;
    if (departIso && returnIso && String(returnIso) < String(departIso)) {
      return ctx.badRequest('Return date must be on or after the departure date.');
    }

    const name = fullName || `${b.firstName || ''} ${b.lastName || ''}`.trim();
    const emailNorm = email.toLowerCase().trim();

    let profile = await strapi.db.query('api::customer-profile.customer-profile').findOne({
      where: { email: emailNorm },
    });

    if (!profile) {
      profile = await strapi.entityService.create('api::customer-profile.customer-profile', {
        data: {
          fullName: name,
          email: emailNorm,
          phone: phone || b.mobile || null,
          organisation: organisation || null,
          nationality: nationality || null,
          notes: null,
          preferences: {},
        },
      });
    } else {
      profile = await strapi.entityService.update('api::customer-profile.customer-profile', profile.id, {
        data: {
          fullName: name || profile.fullName,
          phone: phone || b.mobile || profile.phone,
          organisation: organisation || profile.organisation,
          nationality: nationality || profile.nationality,
        },
      });
    }

    /* Ensure login user exists for customer portal */
    let user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { email: emailNorm },
    });
    let tempPassword = null;
    if (!user) {
      const crypto = require('crypto');
      const chosen = password && String(password).length >= 8
        ? password
        : crypto.randomBytes(8).toString('hex');
      const role = await strapi.db.query('plugin::users-permissions.role')
        .findOne({ where: { type: 'authenticated' } });
      user = await strapi.entityService.create('plugin::users-permissions.user', {
        data: {
          username: emailNorm.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6),
          email: emailNorm,
          password: chosen,
          provider: 'local',
          confirmed: true,
          blocked: false,
          role: role?.id ?? null,
        },
      });
      tempPassword = chosen;
      await strapi.entityService.update('api::customer-profile.customer-profile', profile.id, {
        data: { user: user.id },
      });
    } else if (!profile.user) {
      await strapi.entityService.update('api::customer-profile.customer-profile', profile.id, {
        data: { user: user.id },
      });
    }

    const enquiry = await strapi.entityService.create('api::tams-enquiry.tams-enquiry', {
      data: {
        enquiryRef: ref('ENQ'),
        status: 'new',
        source: source || 'website',
        destination,
        origin: origin || 'Harare',
        travelDates: travelDates || null,
        travellers: travellers || 1,
        budget: budget != null ? parseFloat(budget) : null,
        purpose: purpose || null,
        summary: summary || null,
        assignedAgent: b.assignedAgent || null,
        customer: profile.id,
      },
    });

    /* Optional product requirements from service forms (visa/insurance/transfer/…) */
    const reqItems = Array.isArray(b.requirements) ? b.requirements : [];
    if (reqItems.length) {
      for (const item of reqItems) {
        if (!item || !item.description) continue;
        await strapi.entityService.create('api::travel-requirement.travel-requirement', {
          data: {
            category: item.category || 'other',
            description: item.description,
            priority: item.priority || 'must',
            details: item.details || null,
            enquiry: enquiry.id,
          },
        });
      }
      await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enquiry.id, {
        data: { status: 'requirements' },
      });
    }

    const full = await loadEnquiry(enquiry.id);
    ctx.body = {
      enquiry: serializeEnquiry(full),
      customer: profile,
      user: tempPassword
        ? { id: user.id, email: user.email, tempPassword, isNew: true }
        : { id: user.id, email: user.email, isNew: false },
    };
  },

  /** GET /api/tams/enquiries — list (agent) */
  async listEnquiries(ctx) {
    const { status, q } = ctx.query || {};
    const filters = {};
    if (status) filters.status = status;
    if (q) {
      filters.$or = [
        { enquiryRef: { $containsi: q } },
        { destination: { $containsi: q } },
        { summary: { $containsi: q } },
      ];
    }
    const rows = await strapi.entityService.findMany('api::tams-enquiry.tams-enquiry', {
      filters,
      populate: { customer: true, quotations: true, booking: true, requirements: true },
      sort: { createdAt: 'desc' },
      limit: 100,
    });
    /* Board/list never reveal full passport numbers */
    ctx.body = { enquiries: rows.map((e) => serializeEnquiry(e, { revealDocs: false })) };
  },

  /** GET /api/tams/enquiries/:id */
  async getEnquiry(ctx) {
    const full = await loadEnquiry(ctx.params.id);
    if (!full) return ctx.notFound('Enquiry not found');
    ctx.body = { enquiry: serializeEnquiry(full, { revealDocs: wantsRevealDocs(ctx) }) };
  },

  /** GET /api/tams/my — customer view of own enquiries + quotes */
  async myCases(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Login required');

    const profile = await strapi.db.query('api::customer-profile.customer-profile').findOne({
      where: { email: user.email },
    });

    const enquiries = profile
      ? await strapi.entityService.findMany('api::tams-enquiry.tams-enquiry', {
          filters: { customer: { id: profile.id } },
          populate: { quotations: true, booking: true, requirements: true, customer: true },
          sort: { createdAt: 'desc' },
        })
      : [];

    const quotes = await strapi.entityService.findMany('api::quotation.quotation', {
      filters: {
        $or: [
          ...(profile ? [{ customer: { id: profile.id } }] : []),
          { enquiry: { customer: { email: user.email } } },
        ],
      },
      populate: { enquiry: true },
      sort: { createdAt: 'desc' },
    });

    /* Own profile still masked in API responses — agents use ?revealDocs=1 */
    ctx.body = {
      profile: redactCustomer(profile, { revealDocs: false }),
      enquiries: enquiries.map((e) => serializeEnquiry(e, { revealDocs: false })),
      quotations: quotes,
    };
  },

  /**
   * PATCH /api/tams/enquiries/:id/profile
   * Advance to profiling / update customer profile fields
   */
  async updateProfile(ctx) {
    const enquiry = await loadEnquiry(ctx.params.id);
    if (!enquiry) return ctx.notFound('Enquiry not found');
    const b = ctx.request.body || {};

    if (enquiry.customer?.id) {
      await strapi.entityService.update('api::customer-profile.customer-profile', enquiry.customer.id, {
        data: {
          ...(b.fullName && { fullName: b.fullName }),
          ...(b.phone && { phone: b.phone }),
          ...(b.organisation !== undefined && { organisation: b.organisation }),
          ...(b.nationality && { nationality: b.nationality }),
          ...(b.passportNumber && { passportNumber: b.passportNumber }),
          ...(b.dateOfBirth && { dateOfBirth: b.dateOfBirth }),
          ...(b.address && { address: b.address }),
          ...(b.preferences && { preferences: b.preferences }),
          ...(b.notes !== undefined && { notes: b.notes }),
        },
      });
    }

    const nextStatus = b.advance === false ? enquiry.status : 'profiling';
    await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enquiry.id, {
      data: {
        status: nextStatus,
        ...(b.assignedAgent && { assignedAgent: b.assignedAgent }),
      },
    });

    ctx.body = { enquiry: serializeEnquiry(await loadEnquiry(enquiry.id)) };
  },

  /** POST /api/tams/enquiries/:id/requirements */
  async setRequirements(ctx) {
    const enquiry = await loadEnquiry(ctx.params.id);
    if (!enquiry) return ctx.notFound('Enquiry not found');
    const items = Array.isArray(ctx.request.body?.items) ? ctx.request.body.items : [];
    if (!items.length) return ctx.badRequest('items[] required');

    /* Replace prior requirements for clarity */
    const existing = enquiry.requirements || [];
    for (const r of existing) {
      await strapi.entityService.delete('api::travel-requirement.travel-requirement', r.id);
    }

    const created = [];
    for (const item of items) {
      const row = await strapi.entityService.create('api::travel-requirement.travel-requirement', {
        data: {
          category: item.category || 'other',
          description: item.description || 'Requirement',
          priority: item.priority || 'must',
          details: item.details || null,
          enquiry: enquiry.id,
        },
      });
      created.push(row);
    }

    await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enquiry.id, {
      data: { status: 'requirements' },
    });

    ctx.body = {
      requirements: created,
      enquiry: serializeEnquiry(await loadEnquiry(enquiry.id)),
    };
  },

  /** POST /api/tams/enquiries/:id/research */
  async saveResearch(ctx) {
    const enquiry = await loadEnquiry(ctx.params.id);
    if (!enquiry) return ctx.notFound('Enquiry not found');
    const { researchNotes, availability } = ctx.request.body || {};

    await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enquiry.id, {
      data: {
        status: 'research',
        researchNotes: researchNotes || enquiry.researchNotes,
        summary: availability
          ? `${enquiry.summary || ''}\n[Availability] ${typeof availability === 'string' ? availability : JSON.stringify(availability)}`.trim()
          : enquiry.summary,
      },
    });

    ctx.body = { enquiry: serializeEnquiry(await loadEnquiry(enquiry.id)) };
  },

  /** POST /api/tams/enquiries/:id/quotations */
  async createQuotation(ctx) {
    const enquiry = await loadEnquiry(ctx.params.id);
    if (!enquiry) return ctx.notFound('Enquiry not found');
    const b = ctx.request.body || {};
    const lineItems = Array.isArray(b.lineItems) ? b.lineItems : [];
    const subtotal = lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const taxes = parseFloat(b.taxes) || 0;
    const total = b.total != null ? parseFloat(b.total) : subtotal + taxes;

    /* Supersede prior drafts/sent of same family */
    const prior = enquiry.quotations || [];
    let version = 1;
    for (const q of prior) {
      version = Math.max(version, (q.version || 1) + 1);
      if (['draft', 'sent', 'viewed'].includes(q.status)) {
        await strapi.entityService.update('api::quotation.quotation', q.id, {
          data: { status: 'superseded' },
        });
      }
    }

    const validUntil = b.validUntil || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const status = b.send ? 'sent' : 'draft';

    const quote = await strapi.entityService.create('api::quotation.quotation', {
      data: {
        quoteRef: ref('QTE'),
        version,
        status,
        title: b.title || `${enquiry.destination} itinerary`,
        currency: b.currency || 'USD',
        subtotal,
        taxes,
        total,
        validUntil,
        lineItems,
        notes: b.notes || null,
        sentAt: status === 'sent' ? new Date() : null,
        enquiry: enquiry.id,
        customer: enquiry.customer?.id || null,
      },
    });

    await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enquiry.id, {
      data: { status: status === 'sent' ? 'awaiting_approval' : 'quotation' },
    });

    ctx.body = {
      quotation: quote,
      enquiry: serializeEnquiry(await loadEnquiry(enquiry.id)),
    };
  },

  /** POST /api/tams/quotations/:id/send */
  async sendQuotation(ctx) {
    const quote = await strapi.entityService.findOne('api::quotation.quotation', ctx.params.id, {
      populate: { enquiry: true },
    });
    if (!quote) return ctx.notFound('Quotation not found');
    if (quote.status === 'expired' || quote.status === 'superseded') {
      return ctx.badRequest(`Cannot send ${quote.status} quotation`);
    }

    const updated = await strapi.entityService.update('api::quotation.quotation', quote.id, {
      data: { status: 'sent', sentAt: new Date() },
    });
    if (quote.enquiry?.id) {
      await strapi.entityService.update('api::tams-enquiry.tams-enquiry', quote.enquiry.id, {
        data: { status: 'awaiting_approval' },
      });
    }
    ctx.body = { quotation: updated, email: 'queued_or_skipped' };
  },

  /** POST /api/tams/quotations/:id/approve — customer */
  async approveQuotation(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Login required');

    const quote = await strapi.entityService.findOne('api::quotation.quotation', ctx.params.id, {
      populate: { enquiry: { populate: { customer: true } }, customer: true },
    });
    if (!quote) return ctx.notFound('Quotation not found');
    if (!['sent', 'viewed', 'draft'].includes(quote.status)) {
      return ctx.badRequest(`Cannot approve status=${quote.status}`);
    }
    if (quote.validUntil && new Date(quote.validUntil) < new Date(new Date().toDateString())) {
      await strapi.entityService.update('api::quotation.quotation', quote.id, { data: { status: 'expired' } });
      return ctx.badRequest('Quotation has expired');
    }

    const updated = await strapi.entityService.update('api::quotation.quotation', quote.id, {
      data: { status: 'approved', approvedAt: new Date() },
    });
    if (quote.enquiry?.id) {
      await strapi.entityService.update('api::tams-enquiry.tams-enquiry', quote.enquiry.id, {
        data: { status: 'approved' },
      });
    }
    ctx.body = { quotation: updated };
  },

  /** POST /api/tams/quotations/:id/reject */
  async rejectQuotation(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('Login required');
    const quote = await strapi.entityService.findOne('api::quotation.quotation', ctx.params.id, {
      populate: { enquiry: true },
    });
    if (!quote) return ctx.notFound('Quotation not found');
    const updated = await strapi.entityService.update('api::quotation.quotation', quote.id, {
      data: { status: 'rejected', rejectedAt: new Date() },
    });
    if (quote.enquiry?.id) {
      await strapi.entityService.update('api::tams-enquiry.tams-enquiry', quote.enquiry.id, {
        data: { status: 'quotation' },
      });
    }
    ctx.body = { quotation: updated };
  },

  /**
   * POST /api/tams/enquiries/:id/book
   * Convert approved quotation → booking + reservations
   */
  async convertToBooking(ctx) {
    const enquiry = await loadEnquiry(ctx.params.id);
    if (!enquiry) return ctx.notFound('Enquiry not found');
    if (!['approved', 'awaiting_approval', 'booking'].includes(enquiry.status)) {
      /* allow if a quote is already approved */
    }

    const quotes = enquiry.quotations || [];
    const approved = quotes.find(q => q.status === 'approved')
      || quotes.sort((a, b) => (b.version || 0) - (a.version || 0))[0];
    if (!approved || approved.status !== 'approved') {
      return ctx.badRequest('An approved quotation is required before booking');
    }

    const b = ctx.request.body || {};
    const dates = enquiry.travelDates || {};
    const checkIn = b.checkIn || dates.depart || dates.checkIn || null;
    const checkOut = b.checkOut || dates.return || dates.checkOut || null;

    const paxErr = validatePassengers(b.passengers, enquiry.travellers || b.passengers?.length);
    if (paxErr) return ctx.badRequest(paxErr);

    /* Link user from profile */
    let userId = null;
    if (enquiry.customer?.email) {
      const u = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { email: enquiry.customer.email },
      });
      userId = u?.id || null;
    }

    const deadline = b.ticketingDeadline
      || (checkIn ? new Date(new Date(checkIn).getTime() - 3 * 86400000).toISOString().slice(0, 10) : null);

    const booking = await strapi.entityService.create('api::booking.booking', {
      data: {
        bookingRef: ref('TRV'),
        bookingType: 'tams',
        packageTitle: approved.title || `${enquiry.destination} trip`,
        packageDuration: b.packageDuration || null,
        checkIn,
        checkOut,
        adults: enquiry.travellers || 1,
        children: 0,
        totalCost: approved.total,
        amountPaid: 0,
        balance: approved.total,
        currency: approved.currency || 'USD',
        status: 'pending',
        pipelineStage: 'booked',
        passengers: b.passengers,
        notes: b.notes || enquiry.summary || null,
        ticketingDeadline: deadline,
        changeLog: appendChangeLog([], 'booking_created', {
          fromEnquiry: enquiry.enquiryRef,
          quoteRef: approved.quoteRef,
          total: approved.total,
          currency: approved.currency || 'USD',
        }, ctx.state.user?.email || 'agent'),
        financialAudit: appendFinancialAudit([], {
          action: 'booking_opened',
          currency: approved.currency || 'USD',
          totalCost: approved.total,
          actor: ctx.state.user?.email || 'agent',
        }),
        customer: userId,
        customerProfile: enquiry.customer?.id || null,
        quotation: approved.id,
      },
    });

    const lineItems = Array.isArray(approved.lineItems) ? approved.lineItems : [];
    const reservations = [];
    for (const item of lineItems) {
      const rType = item.type || item.category || 'other';
      const r = await strapi.entityService.create('api::reservation.reservation', {
        data: {
          type: rType,
          supplier: item.supplier || 'TBD',
          description: item.description || item.title || item.label || 'Line item',
          startDate: item.startDate || checkIn,
          endDate: item.endDate || checkOut,
          cost: parseFloat(item.cost) || 0,
          sellPrice: parseFloat(item.amount || item.sellPrice) || 0,
          currency: approved.currency || 'USD',
          status: 'requested',
          details: {
            ...item,
            cancelPolicy: item.cancelPolicy || {
              bands: [
                { minDays: 30, refundPercent: 100 },
                { minDays: 14, refundPercent: 50 },
                { minDays: 0, refundPercent: 0 },
              ],
              nonRefundableTypes: rType === 'insurance' ? ['insurance'] : [],
            },
          },
          booking: booking.id,
        },
      });
      reservations.push(r);
    }

    await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enquiry.id, {
      data: { status: 'booking', booking: booking.id },
    });

    const full = await loadBookingFull(booking.id);
    ctx.body = {
      booking: serializeBookingTams(full, { revealDocs: wantsRevealDocs(ctx) }),
      reservations,
      enquiry: serializeEnquiry(await loadEnquiry(enquiry.id), { revealDocs: wantsRevealDocs(ctx) }),
    };
  },

  /** POST /api/tams/bookings/:id/reservations — add/update reservation */
  async upsertReservation(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    const b = ctx.request.body || {};

    const existing = b.id ? (booking.reservations || []).find((r) => r.id === b.id) : null;
    const nextStatus = b.status || existing?.status || 'requested';
    const nextConf = b.confirmationNo !== undefined ? b.confirmationNo : existing?.confirmationNo;
    const nextTkt = b.ticketOrVoucher !== undefined ? b.ticketOrVoucher : existing?.ticketOrVoucher;
    const pnrErr = assertPnrNotTicket({
      status: nextStatus,
      confirmationNo: nextConf,
      ticketOrVoucher: nextTkt,
    });
    if (pnrErr) return ctx.badRequest(pnrErr);

    const rType = b.type || existing?.type || 'other';
    const visaSep = assertVisaSeparation({ type: rType, status: nextStatus }, booking);
    if (visaSep?.error) return ctx.badRequest(visaSep.error);

    let row;
    if (b.id) {
      row = await strapi.entityService.update('api::reservation.reservation', b.id, {
        data: {
          ...(b.type && { type: b.type }),
          ...(b.supplier !== undefined && { supplier: b.supplier }),
          ...(b.supplierRef !== undefined && { supplierRef: b.supplierRef }),
          ...(b.confirmationNo !== undefined && { confirmationNo: b.confirmationNo }),
          ...(b.ticketOrVoucher !== undefined && { ticketOrVoucher: b.ticketOrVoucher }),
          ...(b.status && { status: b.status }),
          ...(b.description !== undefined && { description: b.description }),
          ...(b.cost != null && { cost: parseFloat(b.cost) }),
          ...(b.sellPrice != null && { sellPrice: parseFloat(b.sellPrice) }),
          ...(b.details && { details: b.details }),
        },
      });
    } else {
      row = await strapi.entityService.create('api::reservation.reservation', {
        data: {
          type: b.type || 'other',
          supplier: b.supplier || null,
          supplierRef: b.supplierRef || null,
          confirmationNo: b.confirmationNo || null,
          ticketOrVoucher: b.ticketOrVoucher || null,
          status: b.status || 'requested',
          description: b.description || '',
          startDate: b.startDate || booking.checkIn,
          endDate: b.endDate || booking.checkOut,
          cost: parseFloat(b.cost) || 0,
          sellPrice: parseFloat(b.sellPrice) || 0,
          currency: b.currency || booking.currency || 'USD',
          details: b.details || null,
          booking: booking.id,
        },
      });
    }

    await strapi.entityService.update('api::booking.booking', booking.id, {
      data: {
        pipelineStage: 'reservations',
        /* Purchasing visa assistance must NOT flip visaReady */
        changeLog: appendChangeLog(booking.changeLog, b.id ? 'reservation_updated' : 'reservation_added', {
          reservationId: row.id,
          type: row.type,
          status: row.status,
          visaNote: visaSep?.note || null,
        }, ctx.state.user?.email || 'agent'),
      },
    });

    ctx.body = {
      reservation: row,
      visaNote: visaSep?.note || null,
      booking: serializeBookingTams(await loadBookingFull(booking.id), { revealDocs: wantsRevealDocs(ctx) }),
    };
  },

  /** POST /api/tams/bookings/:id/ticket — set ticketing/voucher fields */
  async ticketReservations(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    const { items, ticketingNotes, ticketingDeadline, forcePastDeadline } = ctx.request.body || {};
    const updated = [];

    const deadline = ticketingDeadline || booking.ticketingDeadline;
    if (deadline && new Date(deadline) < new Date(new Date().toDateString()) && !forcePastDeadline) {
      return ctx.badRequest(`Ticketing deadline ${deadline} has passed — set forcePastDeadline=true to override`);
    }

    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item.id) continue;
        const existing = (booking.reservations || []).find((r) => r.id === item.id);
        const status = item.status || 'ticketed';
        const confirmationNo = item.confirmationNo || existing?.confirmationNo;
        const ticketOrVoucher = item.ticketOrVoucher || existing?.ticketOrVoucher;
        const pnrErr = assertPnrNotTicket({ status, confirmationNo, ticketOrVoucher });
        if (pnrErr) return ctx.badRequest(pnrErr);

        const rType = existing?.type || item.type;
        if (rType === 'visa' && status === 'ticketed') {
          /* assistance voucher OK — still not visa issuance */
        }

        const row = await strapi.entityService.update('api::reservation.reservation', item.id, {
          data: {
            ...(item.ticketOrVoucher && { ticketOrVoucher: item.ticketOrVoucher }),
            ...(item.confirmationNo && { confirmationNo: item.confirmationNo }),
            ...(item.supplierRef && { supplierRef: item.supplierRef }),
            status,
          },
        });
        updated.push(row);
      }
    }

    await strapi.entityService.update('api::booking.booking', booking.id, {
      data: {
        pipelineStage: 'ticketing',
        ...(ticketingNotes !== undefined && { ticketingNotes }),
        ...(ticketingDeadline && { ticketingDeadline }),
        changeLog: appendChangeLog(booking.changeLog, 'ticketed', {
          count: updated.length,
          forcedPastDeadline: !!forcePastDeadline,
        }, ctx.state.user?.email || 'agent'),
      },
    });

    ctx.body = {
      reservations: updated,
      booking: serializeBookingTams(await loadBookingFull(booking.id), { revealDocs: wantsRevealDocs(ctx) }),
    };
  },

  /** POST /api/tams/bookings/:id/payments — customer, supplier, or policy-checked refund */
  async recordTamsPayment(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    const b = ctx.request.body || {};
    const rawAmount = parseFloat(b.amount);
    if (!rawAmount || rawAmount <= 0) return ctx.badRequest('amount must be > 0');

    const kind = ['supplier', 'refund'].includes(b.paymentKind) ? b.paymentKind : 'customer';
    const bookingCurrency = booking.currency || 'USD';
    const payCurrency = (b.currency || bookingCurrency).toUpperCase();

    let fx;
    try {
      fx = convertAmount(rawAmount, payCurrency, bookingCurrency, b.exchangeRate);
    } catch (e) {
      return ctx.badRequest(e.message);
    }
    const amount = fx.converted; /* always applied in booking currency */

    if (kind === 'refund') {
      const cap = computeBookingRefundCap(booking, b.reservationIds);
      if (amount > cap.maxAllowed + 0.009) {
        return ctx.badRequest(
          `Refund ${amount} ${bookingCurrency} exceeds supplier-policy cap ${cap.maxAllowed} (paid ${booking.amountPaid}). Use /cancel for structured cancel+refund.`
        );
      }
    }

    const payment = await strapi.entityService.create('api::payment.payment', {
      data: {
        amount,
        currency: bookingCurrency,
        originalAmount: rawAmount,
        originalCurrency: payCurrency,
        exchangeRate: fx.rate,
        bookingAmount: amount,
        method: b.method || 'Bank Transfer',
        reference: b.reference || null,
        notes: b.notes || null,
        confirmedBy: b.confirmedBy || ctx.state.user?.email || 'agent',
        paymentKind: kind,
        supplierName: b.supplierName || null,
        supplierRef: b.supplierRef || null,
        settlementStatus: kind === 'supplier' ? (b.settlementStatus || 'settled') : 'n_a',
        status: 'confirmed',
        immutable: true,
        booking: booking.id,
        customer: booking.customer?.id || booking.customer || null,
      },
    });

    let amountPaid = parseFloat(booking.amountPaid) || 0;
    let balance = parseFloat(booking.balance);
    let status = booking.status;
    let confirmedAt = booking.confirmedAt;
    const total = parseFloat(booking.totalCost) || 0;

    if (kind === 'customer') {
      const remaining = Math.max(0, total - amountPaid);
      const applied = Math.min(amount, remaining);
      amountPaid = amountPaid + applied;
      balance = Math.max(0, total - amountPaid);
      if (status === 'pending') {
        status = 'confirmed';
        confirmedAt = confirmedAt || new Date();
      }
      if (balance <= 0) status = booking.status === 'checked_in' ? 'checked_in' : 'fully_paid';
      else if (amountPaid > 0) status = booking.status === 'checked_in' ? 'checked_in' : 'partially_paid';
    } else if (kind === 'refund') {
      amountPaid = Math.max(0, amountPaid - amount);
      balance = Math.max(0, total - amountPaid);
      if (amountPaid <= 0 && status !== 'cancelled' && status !== 'closed') {
        status = 'confirmed';
      } else if (amountPaid > 0 && balance > 0 && status !== 'checked_in' && status !== 'closed') {
        status = 'partially_paid';
      }
    }

    const audit = appendFinancialAudit(booking.financialAudit, {
      action: `payment_${kind}`,
      paymentId: payment.id,
      originalAmount: rawAmount,
      originalCurrency: payCurrency,
      exchangeRate: fx.rate,
      bookingAmount: amount,
      bookingCurrency,
      reference: b.reference || null,
      actor: ctx.state.user?.email || 'agent',
    });

    await strapi.entityService.update('api::booking.booking', booking.id, {
      data: {
        amountPaid,
        balance,
        status,
        confirmedAt,
        pipelineStage: booking.pipelineStage === 'booked' ? 'reservations' : booking.pipelineStage,
        changeLog: appendChangeLog(booking.changeLog, `payment_${kind}`, {
          amount,
          originalAmount: rawAmount,
          originalCurrency: payCurrency,
          exchangeRate: fx.rate,
          reference: b.reference || null,
        }, ctx.state.user?.email || 'agent'),
        financialAudit: audit,
      },
    });

    const enqs = await strapi.entityService.findMany('api::tams-enquiry.tams-enquiry', {
      filters: { booking: { id: booking.id } },
      limit: 1,
    });
    if (enqs[0] && kind !== 'refund') {
      await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enqs[0].id, {
        data: { status: 'in_progress' },
      });
    }

    ctx.body = {
      payment,
      fx,
      booking: serializeBookingTams(await loadBookingFull(booking.id), { revealDocs: wantsRevealDocs(ctx) }),
    };
  },

  /**
   * POST /api/tams/bookings/:id/cancel
   * Cancel selected reservations under supplier bands and optionally issue refund.
   */
  async cancelBooking(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    if (booking.status === 'closed') return ctx.badRequest('Booking already closed');

    const b = ctx.request.body || {};
    const reservationIds = Array.isArray(b.reservationIds) ? b.reservationIds : null;
    const cap = computeBookingRefundCap(booking, reservationIds);
    const refundAmount = b.refundAmount != null ? parseFloat(b.refundAmount) : cap.maxAllowed;
    if (Number.isNaN(refundAmount) || refundAmount < 0) return ctx.badRequest('Invalid refundAmount');
    if (refundAmount > cap.maxAllowed + 0.009) {
      return ctx.badRequest(`Refund exceeds supplier-policy cap of ${cap.maxAllowed} ${booking.currency || 'USD'}`);
    }

    const targets = reservationIds?.length
      ? (booking.reservations || []).filter((r) => reservationIds.includes(r.id))
      : (booking.reservations || []);

    for (const r of targets) {
      await strapi.entityService.update('api::reservation.reservation', r.id, {
        data: { status: 'cancelled' },
      });
    }

    let payment = null;
    let amountPaid = parseFloat(booking.amountPaid) || 0;
    let balance = parseFloat(booking.balance);
    const total = parseFloat(booking.totalCost) || 0;
    let status = 'cancelled';
    let financialAudit = booking.financialAudit;

    if (refundAmount > 0) {
      payment = await strapi.entityService.create('api::payment.payment', {
        data: {
          amount: refundAmount,
          currency: booking.currency || 'USD',
          originalAmount: refundAmount,
          originalCurrency: booking.currency || 'USD',
          exchangeRate: 1,
          bookingAmount: refundAmount,
          method: b.method || 'Refund',
          reference: b.reference || `CXL-${booking.bookingRef}`,
          notes: b.notes || 'Cancellation refund per supplier bands',
          confirmedBy: ctx.state.user?.email || 'agent',
          paymentKind: 'refund',
          status: 'confirmed',
          immutable: true,
          booking: booking.id,
          customer: booking.customer?.id || booking.customer || null,
        },
      });
      amountPaid = Math.max(0, amountPaid - refundAmount);
      balance = Math.max(0, total - amountPaid);
      financialAudit = appendFinancialAudit(financialAudit, {
        action: 'cancel_refund',
        paymentId: payment.id,
        bookingAmount: refundAmount,
        bookingCurrency: booking.currency || 'USD',
        policy: cap,
        actor: ctx.state.user?.email || 'agent',
      });
    } else {
      financialAudit = appendFinancialAudit(financialAudit, {
        action: 'cancel_no_refund',
        policy: cap,
        actor: ctx.state.user?.email || 'agent',
      });
    }

    await strapi.entityService.update('api::booking.booking', booking.id, {
      data: {
        status,
        amountPaid,
        balance,
        changeLog: appendChangeLog(booking.changeLog, 'cancelled', {
          refundAmount,
          reservationIds: targets.map((t) => t.id),
          policyCap: cap.maxAllowed,
        }, ctx.state.user?.email || 'agent'),
        financialAudit,
      },
    });

    const enqs = await strapi.entityService.findMany('api::tams-enquiry.tams-enquiry', {
      filters: { booking: { id: booking.id } }, limit: 1,
    });
    if (enqs[0]) {
      await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enqs[0].id, {
        data: { status: 'cancelled' },
      });
    }

    ctx.body = {
      policy: cap,
      refundAmount,
      payment,
      booking: serializeBookingTams(await loadBookingFull(booking.id), { revealDocs: wantsRevealDocs(ctx) }),
    };
  },

  /** POST /api/tams/bookings/:id/visa */
  async upsertVisa(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    const b = ctx.request.body || {};
    if (!b.country && !b.id) return ctx.badRequest('country required');

    let row;
    if (b.id) {
      row = await strapi.entityService.update('api::visa-case.visa-case', b.id, {
        data: {
          ...(b.status && { status: b.status }),
          ...(b.visaType && { visaType: b.visaType }),
          ...(b.notes !== undefined && { notes: b.notes }),
          ...(b.status === 'submitted' && { submittedAt: new Date() }),
          ...(['approved', 'rejected', 'issued'].includes(b.status) && { decisionAt: new Date() }),
        },
      });
    } else {
      row = await strapi.entityService.create('api::visa-case.visa-case', {
        data: {
          country: b.country,
          visaType: b.visaType || 'tourist',
          status: b.status || 'docs_pending',
          applicantName: b.applicantName || booking.customerProfile?.fullName || null,
          passportNumber: b.passportNumber || null,
          notes: b.notes || null,
          booking: booking.id,
        },
      });
    }

    /* visaReady ONLY from visa-cases — never from visa reservation / assistance purchase */
    const refreshed = await loadBookingFull(booking.id);
    const visas = refreshed.visaCases || [];
    const visaReady = visas.length > 0 && visas.every(v =>
      ['approved', 'issued', 'not_required'].includes(v.status)
    );
    const visaAssistance = (refreshed.reservations || []).filter((r) => r.type === 'visa');

    await strapi.entityService.update('api::booking.booking', booking.id, {
      data: {
        pipelineStage: 'docs_visa',
        visaReady,
        docsReady: b.docsReady != null ? !!b.docsReady : booking.docsReady,
        changeLog: appendChangeLog(booking.changeLog, 'visa_case_updated', {
          visaCaseId: row.id,
          status: row.status,
          assistanceReservations: visaAssistance.map((r) => ({ id: r.id, status: r.status })),
        }, ctx.state.user?.email || 'agent'),
      },
    });

    const reveal = wantsRevealDocs(ctx);
    ctx.body = {
      visa: reveal ? row : { ...row, passportNumber: row.passportNumber ? require('../services/rules').maskPassport(row.passportNumber) : null },
      assistancePurchased: visaAssistance.some((r) => ['confirmed', 'ticketed', 'held'].includes(r.status)),
      note: 'visaReady reflects visa-case issuance only; reservation is assistance purchase',
      booking: serializeBookingTams(await loadBookingFull(booking.id), { revealDocs: reveal }),
    };
  },

  /** POST /api/tams/bookings/:id/pre-departure */
  async setPreDeparture(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    const { items, sendReminders } = ctx.request.body || {};
    const created = [];

    if (Array.isArray(items) && items.length) {
      for (const it of booking.preDepartureItems || []) {
        await strapi.entityService.delete('api::pre-departure-item.pre-departure-item', it.id);
      }
      for (const it of items) {
        const row = await strapi.entityService.create('api::pre-departure-item.pre-departure-item', {
          data: {
            title: it.title || 'Checklist item',
            description: it.description || null,
            dueDate: it.dueDate || null,
            status: sendReminders ? 'sent' : (it.status || 'pending'),
            sentAt: sendReminders ? new Date() : null,
            booking: booking.id,
          },
        });
        created.push(row);
      }
    } else if (sendReminders) {
      for (const it of booking.preDepartureItems || []) {
        if (it.status === 'pending') {
          created.push(await strapi.entityService.update('api::pre-departure-item.pre-departure-item', it.id, {
            data: { status: 'sent', sentAt: new Date() },
          }));
        }
      }
    }

    await strapi.entityService.update('api::booking.booking', booking.id, {
      data: { pipelineStage: 'pre_departure' },
    });

    ctx.body = {
      items: created,
      reminders: sendReminders ? 'stubbed_send_ok' : 'not_sent',
      booking: serializeBookingTams(await loadBookingFull(booking.id)),
    };
  },

  /** POST /api/tams/bookings/:id/incidents */
  async createIncident(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    const b = ctx.request.body || {};
    if (!b.subject) return ctx.badRequest('subject required');

    const incident = await strapi.entityService.create('api::support-incident.support-incident', {
      data: {
        incidentRef: ref('INC'),
        subject: b.subject,
        description: b.description || null,
        status: 'open',
        severity: b.severity || 'medium',
        openedAt: new Date(),
        booking: booking.id,
      },
    });

    await strapi.entityService.update('api::booking.booking', booking.id, {
      data: { pipelineStage: booking.pipelineStage === 'closed' ? 'closed' : 'travel' },
    });

    const enqs = await strapi.entityService.findMany('api::tams-enquiry.tams-enquiry', {
      filters: { booking: { id: booking.id } }, limit: 1,
    });
    if (enqs[0]) {
      await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enqs[0].id, {
        data: { status: 'travel' },
      });
    }

    ctx.body = { incident, booking: serializeBookingTams(await loadBookingFull(booking.id)) };
  },

  /** PATCH /api/tams/incidents/:id */
  async updateIncident(ctx) {
    const b = ctx.request.body || {};
    const incident = await strapi.entityService.findOne('api::support-incident.support-incident', ctx.params.id);
    if (!incident) return ctx.notFound('Incident not found');
    const updated = await strapi.entityService.update('api::support-incident.support-incident', incident.id, {
      data: {
        ...(b.status && { status: b.status }),
        ...(b.resolution !== undefined && { resolution: b.resolution }),
        ...(b.severity && { severity: b.severity }),
        ...(['resolved', 'closed'].includes(b.status) && { resolvedAt: new Date() }),
      },
    });
    ctx.body = { incident: updated };
  },

  /** POST /api/tams/bookings/:id/feedback */
  async submitFeedback(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    const b = ctx.request.body || {};
    const rating = parseInt(b.rating, 10);
    if (!rating || rating < 1 || rating > 5) return ctx.badRequest('rating 1-5 required');

    const fb = await strapi.entityService.create('api::feedback.feedback', {
      data: {
        rating,
        comment: b.comment || null,
        nps: b.nps != null ? parseInt(b.nps, 10) : null,
        booking: booking.id,
        customer: booking.customerProfile?.id || null,
      },
    });

    await strapi.entityService.update('api::booking.booking', booking.id, {
      data: { pipelineStage: 'post_travel' },
    });
    const enqs = await strapi.entityService.findMany('api::tams-enquiry.tams-enquiry', {
      filters: { booking: { id: booking.id } }, limit: 1,
    });
    if (enqs[0]) {
      await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enqs[0].id, {
        data: { status: 'post_travel' },
      });
    }

    ctx.body = { feedback: fb, booking: serializeBookingTams(await loadBookingFull(booking.id)) };
  },

  /** POST /api/tams/bookings/:id/close */
  async closeBooking(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    const b = ctx.request.body || {};

    await strapi.entityService.update('api::booking.booking', booking.id, {
      data: {
        status: 'closed',
        pipelineStage: 'closed',
        closedAt: new Date(),
        closureNotes: b.closureNotes || b.notes || null,
        changeLog: appendChangeLog(booking.changeLog, 'closed', {
          notes: b.closureNotes || b.notes || null,
        }, ctx.state.user?.email || 'agent'),
      },
    });

    const enqs = await strapi.entityService.findMany('api::tams-enquiry.tams-enquiry', {
      filters: { booking: { id: booking.id } }, limit: 1,
    });
    if (enqs[0]) {
      await strapi.entityService.update('api::tams-enquiry.tams-enquiry', enqs[0].id, {
        data: { status: 'closed' },
      });
    }

    ctx.body = { booking: serializeBookingTams(await loadBookingFull(booking.id)) };
  },

  /** GET /api/tams/bookings/:id */
  async getBooking(ctx) {
    const booking = await loadBookingFull(ctx.params.id);
    if (!booking) return ctx.notFound('Booking not found');
    ctx.body = { booking: serializeBookingTams(booking, { revealDocs: wantsRevealDocs(ctx) }) };
  },

  /** GET /api/tams/board — agent pipeline board */
  async board(ctx) {
    const enquiries = await strapi.entityService.findMany('api::tams-enquiry.tams-enquiry', {
      populate: { customer: true, quotations: true, booking: true },
      sort: { updatedAt: 'desc' },
      limit: 200,
    });
    const byStatus = {};
    for (const e of enquiries) {
      const s = e.status || 'new';
      if (!byStatus[s]) byStatus[s] = [];
      byStatus[s].push(serializeEnquiry(e, { revealDocs: false }));
    }
    ctx.body = { board: byStatus, total: enquiries.length };
  },
};

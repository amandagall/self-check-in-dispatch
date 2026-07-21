// api/customer-notion-sync.js
//
// Airtable -> Notion customer page automation.
// Ticket: "Build Airtable -> Notion customer page automation" (Notion Backlog,
// Ops & Tooling). Scoped and unblocked July 16, 2026 -- see that ticket for the
// three prerequisite decisions this build relies on:
//   1. Notion Page URL field exists on Airtable Customers (dedup guard).
//   2. Notion-only fields (Confirmation Sent, Morning SMS Sent, Lead) default
//      to Pending / Not yet / Amanda & Alicia rather than blank.
//   3. Trigger is event-based: an Airtable Automation calls this endpoint,
//      not an on-demand button or a daily sweep.
//
// --- Trigger config (set this up in Airtable, not in this file) ---
// Watch the CUSTOMERS table, not "record created." Tier lives on the linked
// Experience record, which is itself created by a separate cascade
// ("New Customer -> Set Paid" -> "Customer->Experience Automation"). Those
// automations aren't guaranteed to finish before a same-instant "on create"
// trigger fires, which would ship a Notion page missing Tier.
// Use: When record matches conditions -> "Linked to Experiences" is not empty.
// That only fires once, the moment the cascade has actually finished, same
// pattern already proven out for the Payment Status fix documented in the
// trigger-mechanism decision. Action: send a webhook / run a script that
// POSTs { "recordId": "<Customers record id>" } to this endpoint, header
// x-dispatch-key: <DISPATCH_PASSWORD>.
//
// --- New required env var ---
//   NOTION_API_KEY -- an internal Notion integration token. Create it at
//   notion.so/my-integrations, then share the "Customers" page (and the
//   TEMPLATE page, not required at runtime but handy for the integration to
//   see) with that integration from the Notion UI (••• -> Connections).
//   Without that share step every call below 404s with object_not_found.
// Reused env vars: AIRTABLE_TOKEN, AIRTABLE_BASE_ID, DISPATCH_PASSWORD
// (same as api/hold.js and api/reply.js).
//
// --- What this does NOT do yet ---
// Only the Client Overview table is pre-filled from real data. Emotional Arc
// and Itinerary are intentionally left as the template's bracketed
// placeholders -- per the ticket, those still get written by hand. The
// Notion -> Airtable message push (SMS triggered from the Notion page) is a
// separate, later ticket -- not built here.
//
// --- Not yet tested against a live Notion integration ---
// Built and reasoned through against the real TEMPLATE and a real filled
// example (Sarah Murray's page), but I don't have a Notion integration token
// to run this end-to-end from here. Before trusting it in production: create
// a dummy Customer + Experience record, flip the Airtable automation on, and
// confirm the resulting Notion page looks right -- same test discipline as
// the other automations in this repo. Delete the dummy records after.

const CUSTOMERS_TABLE_ID = 'tblYf7o2C9kpfwvUO';
const EXPERIENCES_TABLE_ID = 'tblNkbMaOWPXIjyYG';
const CUSTOMERS_PAGE_ID = '34e44f2dd74a8006ad40e2a961d0fdbc'; // Notion "Customers" page -- new pages are created as children of this page.
const LAND_UNDER_HEADING = 'Paid Customers'; // new customer pages should land right under this heading, not at the end of the page.
const NOTION_VERSION = '2026-03-11'; // needs to be recent enough to support the "position" param on page creation (see findHeadingBlockId below).

async function airtable(tableId, path, options = {}) {
  const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appUWpk3MAaug3iMO';
  const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + process.env.AIRTABLE_TOKEN,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res.json();
}

async function notion(path, options = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + process.env.NOTION_API_KEY,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (data.object === 'error') {
    throw new Error(`Notion API error (${data.code}): ${data.message}`);
  }
  return data;
}

// Finds the block ID of a top-level heading on a page, by its exact text --
// e.g. so new customer pages can be inserted right under "Paid Customers"
// instead of landing at the bottom of the Customers page. Looked up at
// runtime (rather than hardcoding a block ID) so it keeps working if the
// heading block ever gets recreated -- Notion doesn't preserve a block's ID
// across a delete/retype, but the text stays findable.
async function findHeadingBlockId(pageId, headingText) {
  let cursor;
  do {
    const qs = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : '';
    const data = await notion(`/blocks/${pageId}/children${qs}`);
    for (const block of data.results || []) {
      const richText = block[block.type] && block[block.type].rich_text;
      if (richText && richText.map((r) => r.plain_text).join('').trim() === headingText) {
        return block.id;
      }
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return null; // heading not found -- caller falls back to appending at the end.
}

// ---------- Notion block builders ----------

function rt(text, opts) {
  return [{ type: 'text', text: { content: String(text) }, ...(opts ? { annotations: opts } : {}) }];
}
function boldThenPlain(boldText, plainText) {
  return [
    { type: 'text', text: { content: boldText }, annotations: { bold: true } },
    { type: 'text', text: { content: plainText } },
  ];
}
function paragraph(text) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: rt(text) } };
}
function paragraphRich(richText) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText } };
}
function heading2(text) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: rt(text) } };
}
function heading3(text) {
  return { object: 'block', type: 'heading_3', heading_3: { rich_text: rt(text) } };
}
function divider() {
  return { object: 'block', type: 'divider', divider: {} };
}
function bulleted(text) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt(text) } };
}
function tableRow(cells, boldFirstCell) {
  return {
    object: 'block',
    type: 'table_row',
    table_row: {
      cells: cells.map((c, i) => (boldFirstCell && i === 0 ? rt(c, { bold: true }) : rt(c))),
    },
  };
}
function table(rows, boldFirstCol) {
  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: rows[0].length,
      has_column_header: true,
      has_row_header: false,
      children: rows.map((r, i) => tableRow(r, boldFirstCol && i > 0)),
    },
  };
}
function toggle(summary, children) {
  return { object: 'block', type: 'toggle', toggle: { rich_text: rt(summary), children } };
}

// ---------- Formatting helpers ----------

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Airtable "Check-In Date" -> "30th, July, 2026" (matches the Client Overview
// convention already established on real pages, e.g. Sarah Murray's "11th,
// July, 2026" -- day-ordinal first, then month, then year).
function formatExperienceDate(dateStr) {
  if (!dateStr) return '[Day, Month Date, Year]';
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${ordinal(d.getUTCDate())}, ${month}, ${d.getUTCFullYear()}`;
}

// Same date, formatted "July 30th, 2026" for the page title -- matches
// "Sarah Murray - July 11th, 2026 Customer Experience Page".
function formatTitleDate(dateStr) {
  if (!dateStr) return '[Date TBD]';
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${month} ${ordinal(d.getUTCDate())}, ${d.getUTCFullYear()}`;
}

// Airtable "Check-In Time" is a range like "9am-1pm" or "12pm-4pm" -- both
// halves are real clock times, so Start/End Time can be split straight out
// of it rather than left blank.
function splitCheckInTime(rangeStr) {
  if (!rangeStr || rangeStr.indexOf('-') === -1) {
    return { start: '[e.g. 10:00am]', end: '[e.g. 2:00pm]' };
  }
  const [startRaw, endRaw] = rangeStr.split('-');
  const fmt = (raw) => {
    const m = raw.trim().match(/^(\d+)(am|pm)$/i);
    if (!m) return raw.trim();
    return `${m[1]}:00 ${m[2].toLowerCase()} EST`;
  };
  return { start: fmt(startRaw), end: fmt(endRaw) };
}

// ---------- Template content (mirrors "TEMPLATE — Customer Experience Page") ----------

function stopBlocks(n) {
  return [
    heading3(`Stop ${n} — [Activity Name]`),
    table(
      [
        ['', ''],
        ['Category', '[Nature / Food / Wellness / Culture / Retail / Urban]'],
        ['Pre-book', '[Yes — who books it / No]'],
        ['Time', '[Start – End]'],
        ['Duration', '[Est. mins]'],
        ['Est. Cost', '[$ CAD or Free]'],
        ['Vendor', '[Vendor name and address, or No vendor]'],
      ],
      true
    ),
    paragraph('[What happens at this stop. Specific enough that Alicia can brief Jeannie without further decisions.]'),
    paragraphRich(boldThenPlain('Why this stop: ', "[One sentence grounded in this client's profile, not generic.]")),
    paragraph('[Any flags, booking notes, or rain backups for this stop.]'),
    divider(),
  ];
}

function smsMessageBlock(label, timingNote, body) {
  return [
    paragraphRich(boldThenPlain(label, '')),
    paragraph(timingNote),
    paragraph(body),
    divider(),
  ];
}

function commsArchiveChildren() {
  return [
    paragraph(
      "⚠️ Before sending: Review all stop messages and fill in any vendor-specific placeholders (dish recommendations, wine suggestions, vendor URLs). Confirm all vendor pages are live before including selfcheck-in.ca/vendors/ links."
    ),
    divider(),
    ...smsMessageBlock(
      'DAY-BEFORE SMS',
      'Sent the evening before the experience.',
      'Tomorrow is yours. Your Self Check-In begins at [START TIME] — we’ll send you your first stop then. Sleep well tonight.\n— Self Check-In'
    ),
    ...smsMessageBlock(
      'MORNING-OF SMS',
      'Sent on the morning of the experience before the client replies START. Pull the correct profile template from the Morning of Message page in Notion and fill in the arc logic field.',
      'Before we send you anywhere, we want you to know what we heard.\n[PROFILE CURRENT STATE LINE FROM TEMPLATE]\nToday is built around that. [ARC LOGIC — two sentences max on why this sequence, in the shape of the day not the stops themselves.]\nYou don’t have to figure anything out today. We already did that part.\nA few things worth having with you today: [PACKING NOTES — flat item list, no context given].\nReply START when you’re ready to begin.\n— Self Check-In'
    ),
    ...smsMessageBlock(
      'STOP 1',
      'Sent when the client replies START.',
      '[EMOTIONAL REFRAME — one line naming what this stop is for, in the register of the profile. Not clinical. The feeling.]\n[DESTINATION — name and specific directions, written as a landmark. Include any relevant packing note for this stop woven in naturally.]\n[SENSORY OR ACTIVITY SUGGESTION — one specific thing to notice, try, or do. Named and particular.]\n[PERMISSION STATEMENT from the master recipe file for this activity type.]\nYou’ll want about [DURATION] here. Reply NEXT when you’re ready to move on.\nWant to know more about this place? [selfcheck-in.ca/vendors/VENDORSLUG — omit if vendor page not yet live]\n— Self Check-In'
    ),
    ...smsMessageBlock(
      'STOP 2',
      'Sent when the client replies NEXT.',
      '[EMOTIONAL REFRAME]\n[DESTINATION — with any payment or logistics note woven in clearly. If there is a cost at the counter, name it directly.]\n[SPECIFIC INSTRUCTION — what to do, order, pick up, or experience. Named item or action, not vague.]\n[PERMISSION STATEMENT]\nYou’ll want about [DURATION] here. Reply NEXT when you’re ready to move on.\nWant to know more about this place? [selfcheck-in.ca/vendors/VENDORSLUG — omit if not live]\n— Self Check-In'
    ),
    ...smsMessageBlock(
      'STOP 3',
      'Sent when the client replies NEXT.',
      '[EMOTIONAL REFRAME]\n[DESTINATION — with any reservation, walk-in, or seating note. Tell them how to behave when they arrive.]\n[SPECIFIC INSTRUCTION — what to order or try. Be specific. If a recommendation is needed, Alicia fills it in before sending. If wine or a drink is involved, name the direction even if the exact pour changes daily.]\n[PERMISSION STATEMENT — especially important for solo dining or anything that might feel unfamiliar. Make them feel like they belong there.]\nTake the full [DURATION]. Reply NEXT when you’re done.\nWant to know more about this place? [selfcheck-in.ca/vendors/VENDORSLUG — omit if not live]\n— Self Check-In'
    ),
    ...smsMessageBlock(
      'STOP 4',
      'Sent when the client replies NEXT.',
      '[EMOTIONAL REFRAME]\n[DESTINATION — brief. This stop has no agenda by design.]\n[SOMETHING SPECIFIC TO NOTICE — a mural, a historical detail, a building, a view. Named and particular. Give them something to look for.]\n[PERMISSION STATEMENT]\nAbout [DURATION], or however long feels right. Reply NEXT when you’re ready for your last stop.\n— Self Check-In'
    ),
    ...smsMessageBlock(
      'STOP 5 — FINAL STOP',
      'Sent when the client replies NEXT.',
      '[EMOTIONAL REFRAME — signal that this is the close. They’re leaving with something.]\n[DESTINATION — with mission clearly named. Not a browse — a purpose.]\n[SPECIFIC INSTRUCTION — what to find, buy, or pick up. If there’s a reason for the take-home item, tell them. Connect it to what happens when they get home.]\n[If a closing card is waiting: There’s something waiting for you at the counter. Ask the staff — they’re expecting you.]\n[PERMISSION STATEMENT]\nCard for payment. Bring a bag if you have one.\nWhen you’re ready, reply DONE to close out your day.\nWant to know more about this place? [selfcheck-in.ca/vendors/VENDORSLUG — omit if not live]\n— Self Check-In'
    ),
    ...smsMessageBlock(
      'CLOSE MESSAGE',
      'Sent immediately when the client replies DONE.',
      'That’s your Self Check-In, complete. You came in [ONE WORD FROM THEIR INTAKE — wired / tight / flat / heavy] and gave yourself a few hours to feel something different. Hope it landed. Be gentle with yourself this evening.\n— Self Check-In'
    ),
    ...smsMessageBlock(
      'FEEDBACK MESSAGE',
      'Sent 2–3 hours after the close message. If the experience ran late, send the following morning.',
      'Hey — how are you feeling now compared to when you started this morning?\n— Self Check-In\nIf she replies positively: Really glad to hear that. Thank you for trusting us with your day.\nIf she’s not sure yet: That’s okay — sometimes it takes a little while to settle. Hope you sleep well tonight.\nIf it didn’t quite land: Thank you for telling us honestly — that matters. Would you be open to sharing a bit more about what felt off? We want to get it right.'
    ),
  ];
}

function discontinuedChildren() {
  return [
    ...smsMessageBlock(
      '48-HOUR FOLLOW-UP',
      'Was: sent 48 hours after the close message.',
      'Hey — a couple of days on from your Self Check-In. How are you feeling compared to before? Just curious — no right answer.\n— Self Check-In\nIf she replies positively — optional referral seed (only send if she has replied positively, never cold): So glad. If there’s someone in your life who could use a day like this, feel free to pass us along. We’re always here. — Self Check-In'
    ),
    ...smsMessageBlock(
      'ONE WEEK OUT',
      'Was: sent 7 days after the experience. Skip if the client has already rebooked or been in touch.',
      'It’s been a week since your Self Check-In. Hope the feeling has stuck around — even a little. We’re here whenever you need this again.\n— Self Check-In'
    ),
  ];
}

function buildPageChildren(data) {
  const overviewRows = [
    ['Field', 'Detail'],
    ['Name', data.name],
    ['Profile Code', data.profileCode || '[e.g. P05-ANXIOUS-CALM]'],
    ['Tier', data.tier || '[Half-Day / Full-Day]'],
    ['Constraints', data.constraints || 'None'],
    ['Experience Date', data.experienceDate],
    ['Start Time', data.startTime],
    ['End Time', data.endTime],
    ['Payment Status', data.paymentStatus || '[Paid / Pending / Refunded]'],
    ['Confirmation Sent', 'Pending'],
    ['Morning SMS Sent', 'Not yet'],
    ['Lead', 'Amanda & Alicia'],
  ];

  const commsStatusRows = [
    ['Message', 'Status', 'Notes'],
    ['Confirmation email', '[ ]', ''],
    ['Day-before SMS', '[ ]', ''],
    ['Morning-of SMS', '[ ]', ''],
    ['Post-experience close SMS', '[ ]', ''],
    ['2-hour feedback SMS', '[ ]', ''],
  ];

  return [
    divider(),
    heading2('Client Overview'),
    table(overviewRows, true),
    divider(),

    heading2('Emotional Arc'),
    paragraphRich(boldThenPlain('From: ', "[How they said they're feeling — use their exact intake language]")),
    paragraphRich(boldThenPlain('To: ', '[How they want to feel — use their exact intake language]')),
    paragraphRich(
      boldThenPlain(
        'Arc logic: ',
        '[One or two sentences on why this sequence makes emotional sense for this profile. Written for Alicia to use as a curation brief.]'
      )
    ),
    paragraphRich(
      boldThenPlain(
        'Key Curation Signal: ',
        '[example: The key curation signal here is "somewhere in between" — she\'s not depleted enough to need pure rest, but she doesn\'t have energy to spend either. Stops should be sensory and self-directed, not demanding.]'
      )
    ),
    divider(),

    heading2('Itinerary — Final'),
    ...Array.from({ length: 15 }, (_, i) => stopBlocks(i + 1)).flat(),
    paragraph('Feedback Question:'),
    divider(),

    heading2('Flags for Alicia'),
    bulleted('[Stop name] — [Flag, booking lead time, vendor note, or client-specific consideration]'),
    bulleted('[Stop name] — [Flag]'),
    bulleted('Morning SMS — [Anything the SMS must not mention before a specific stop. e.g. Don\'t mention food before the lunch stop.]'),
    bulleted('Pre-booked anchor — [If applicable: vendor, time, neutral client-facing line for the morning message]'),
    divider(),

    heading2('Packing Notes'),
    paragraph('[Item / Item / Item — flat list, operational only, not customer-facing. Alicia weaves relevant items into the morning message naturally.]'),
    divider(),

    heading2('Special Elements'),
    paragraph('Delete this section if not applicable.'),
    paragraphRich(boldThenPlain('Mystery book date: ', '[Book title, author, where it\'s being held, drop-off deadline, what the handwritten note says]')),
    paragraphRich(boldThenPlain('Closing card: ', '[Where it\'s being delivered, who to hand it to, what it says]')),
    paragraphRich(boldThenPlain('Other: ', '[Any take-home item, pre-booked treat, special arrangement]')),
    divider(),

    heading2(`Book Recommendation — ${data.profileCode || '[Profile Code]'}`),
    paragraph('Delete if no mystery book date in this itinerary.'),
    paragraphRich(boldThenPlain('First choice: ', '[Title — Author. One sentence on why this book for this profile.]')),
    paragraphRich(boldThenPlain('Second choice: ', '[Title — Author. One sentence.]')),
    paragraphRich(boldThenPlain('Third choice: ', '[Title — Author. One sentence.]')),
    divider(),

    heading2('Comms Status'),
    table(commsStatusRows),
    paragraph('48-hour follow-up and one-week-out SMS discontinued 2026-07-16 — no longer part of the standard sequence.'),
    divider(),

    heading2('Client Block — For Comms Prompt'),
    paragraph('Copy this block directly into the comms prompt to generate SMS messages.'),
    bulleted(`Client name: ${data.name}`),
    bulleted(`Profile code: ${data.profileCode || '[Code]'}`),
    bulleted(`Experience date: ${data.experienceDate}`),
    bulleted(`Estimated start time: ${data.startTime}`),
    bulleted(`Estimated end time: ${data.endTime}`),
    bulleted('Arc logic: [One sentence]'),
    bulleted('Anchor booking: [Vendor, time, neutral client-facing line — or None]'),
    bulleted('Packing notes: [Item / Item / Item]'),
    bulleted('Q6 overrides affecting messaging: [e.g. Can\'t drink alcohol / None]'),
    divider(),

    heading2('Notes & Updates'),
    paragraph('Add dated notes here as the experience develops. Newest at top.'),
    divider(),

    heading2('Comms Archive'),
    toggle('Full SMS sequence', commsArchiveChildren()),
    toggle('Discontinued 2026-07-16 — 48-hour follow-up & one-week out (kept for reference)', discontinuedChildren()),
    toggle('Confirmation email', [paragraph('[Paste confirmation email here after sending.]')]),
  ];
}

// Notion caps children arrays at 100 blocks per call. Create with the first
// chunk, then append the rest. `afterBlockId`, if given, places the new page
// right after that block within the parent's content (see
// findHeadingBlockId) instead of Notion's default of appending at the end.
async function createPageChunked(parentId, title, children, afterBlockId) {
  const CHUNK = 100;
  const first = children.slice(0, CHUNK);
  const rest = children.slice(CHUNK);

  const body = {
    parent: { page_id: parentId },
    icon: { type: 'emoji', emoji: '📝' },
    properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
    children: first,
  };
  if (afterBlockId) {
    body.position = { type: 'after_block', after_block: { id: afterBlockId } };
  }

  const page = await notion('/pages', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  for (let i = 0; i < rest.length; i += CHUNK) {
    await notion(`/blocks/${page.id}/children`, {
      method: 'PATCH',
      body: JSON.stringify({ children: rest.slice(i, i + CHUNK) }),
    });
  }

  return page;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const DISPATCH_PASSWORD = process.env.DISPATCH_PASSWORD;
  const key = req.headers['x-dispatch-key'];
  if (!DISPATCH_PASSWORD || key !== DISPATCH_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { recordId } = req.body || {};
  if (!recordId) {
    res.status(400).json({ error: 'recordId is required' });
    return;
  }

  try {
    const customer = await airtable(CUSTOMERS_TABLE_ID, `/${recordId}`);
    const fields = customer.fields || {};

    // Dedup guard -- this is exactly what the Notion Page URL field was added
    // for. If it's already set, this Customer already has a page; no-op
    // rather than create a duplicate.
    if (fields['Notion Page URL']) {
      res.status(200).json({ ok: true, skipped: 'Notion Page URL already set', url: fields['Notion Page URL'] });
      return;
    }

    const linkedExperiences = fields['Linked to Experiences'] || [];
    if (linkedExperiences.length === 0) {
      // Shouldn't happen if the Airtable trigger is "Linked to Experiences is
      // not empty" as documented above, but bail cleanly instead of shipping
      // a page with no Tier if this ever fires early.
      res.status(202).json({ ok: false, reason: 'No linked Experience yet -- nothing to do.' });
      return;
    }

    // Raw Airtable REST API returns linked-record fields as plain record ID
    // strings (e.g. ["rec5bKGm0aOVKsatF"]), not {id, name} objects -- that
    // richer shape is an Airtable MCP-tool convenience, not what this
    // fetch() call gets back. Indexing straight into the array is correct.
    const experience = await airtable(EXPERIENCES_TABLE_ID, `/${linkedExperiences[0]}`);
    const expFields = experience.fields || {};

    const { start, end } = splitCheckInTime(fields['Check-In Time']);

    const data = {
      name: fields['Name'] || 'Unknown',
      profileCode: fields['Profile Code'] || '',
      tier: expFields['Tier'] || '',
      constraints: fields['Constraints'] || '',
      experienceDate: formatExperienceDate(fields['Check-In Date']),
      startTime: start,
      endTime: end,
      // singleSelect fields come back as a plain string from the raw REST API
      // (e.g. "Paid"), not an {id, name, color} object -- same MCP-vs-raw-API
      // distinction as the linked-record fix above.
      paymentStatus: fields['Payment Status'] || '',
    };

    const title = `${data.name} - ${formatTitleDate(fields['Check-In Date'])} Customer Experience Page`;

    // Best-effort: if the heading ever gets renamed/removed, fall back to
    // Notion's default (append at the end) rather than failing the whole run.
    const afterBlockId = await findHeadingBlockId(CUSTOMERS_PAGE_ID, LAND_UNDER_HEADING).catch(() => null);

    const page = await createPageChunked(CUSTOMERS_PAGE_ID, title, buildPageChildren(data), afterBlockId);

    await airtable(CUSTOMERS_TABLE_ID, `/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Notion Page URL': page.url } }),
    });

    res.status(200).json({ ok: true, url: page.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// api/inbound.js
// Updated July 16, 2026 — adds automated post-experience feedback:
//   1. When the Close message (the last non-blank Message field) is sent, automatically
//      schedule the feedback question via Twilio for 2 hours later.
//   2. When the customer replies to that feedback question, classify the reply
//      (Positive / Unsure / Negative) via Claude, log it verbatim to Airtable, and
//      send the matching branch response — bundling the referral seed line (with the
//      customer's personal coupon code) into the Positive branch automatically.
//
// Everything below marked "--- FEEDBACK AUTOMATION ---" is new. Everything else is
// unchanged from the version documented in "SCI Dispatch — SMS Automation P1."
//
// New required env vars (add in Vercel → self-check-in-experiences → Settings → Environment Variables):
//   ANTHROPIC_API_KEY   — for the feedback sentiment classification call
// Reused env vars (already set from P2): TWILIO_MESSAGING_SERVICE_SID, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN

const crypto = require('crypto');

const WEBHOOK_URL = 'https://self-check-in-experiences.vercel.app/api/inbound';
const ADVANCE_KEYWORDS = ['next', 'done'];
const HOLDING_MESSAGE = "Quick pause on our end - we'll be right back with you.";
const DOUBLE_TAP_WINDOW_MS = 60 * 1000;

// --- FEEDBACK AUTOMATION ---
const FEEDBACK_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours
const FEEDBACK_BRANCHES_STATIC = {
  Unsure: "That's okay — sometimes it takes a little while to settle. Hope you sleep well tonight.",
  Negative: "Thank you for telling us honestly — that matters. Would you be open to sharing a bit more about what felt off? We want to get it right.",
};
const FEEDBACK_QUESTION = "Hey — how are you feeling now compared to when you started this morning?";

// Builds the Positive branch reply. Pulls the customer's personal coupon code
// (added July 16, 2026) via the Coupon Code lookup on Experiences and folds it into
// the referral seed line. Falls back to the original generic line if no code is on
// file — e.g. customers created before this field existed.
function buildPositiveReply(couponCode) {
  const base = "Really glad to hear that. Thank you for trusting us with your day.";
  const referral = couponCode
    ? " If there's someone in your life who could use a day like this, feel free to pass along your code — " + couponCode + " — for $15 off their first experience."
    : " If there's someone in your life who could use a day like this, feel free to pass us along.";
  return base + referral + " We're always here.";
}
// --- END FEEDBACK AUTOMATION ---

function validateTwilioSignature(authToken, signature, url, params) {
  const data = Object.keys(params || {})
    .sort()
    .reduce(function (acc, key) { return acc + key + params[key]; }, url);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  return expected === signature;
}

async function airtable(path, options) {
  options = options || {};
  const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appUWpk3MAaug3iMO';
  const TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Experiences';
  const url = 'https://api.airtable.com/v0/' + BASE_ID + '/' + encodeURIComponent(TABLE_NAME) + path;
  const res = await fetch(url, Object.assign({}, options, {
    headers: Object.assign({
      'Authorization': 'Bearer ' + process.env.AIRTABLE_TOKEN,
      'Content-Type': 'application/json',
    }, options.headers || {}),
  }));
  return res.json();
}

async function findExperienceByPhone(rawPhone) {
  const digits = rawPhone.replace(/\D/g, '').slice(-10);
  // FIXED July 16, 2026: the feedback automation sets Status = Complete at the Close
  // message, which happens before the feedback reply comes in. The old formula excluded
  // any Complete record outright, which made the feedback reply itself invisible to this
  // lookup. Now a record still matches if it's Complete but still Awaiting Feedback.
  const formula = 'AND(OR({Status} != "Complete", {Awaiting Feedback}), RIGHT(REGEX_REPLACE({Mobile (from Mobile)} & "", "[^0-9]", ""), 10) = "' + digits + '")';
  const data = await airtable('?filterByFormula=' + encodeURIComponent(formula) + '&maxRecords=1');
  return (data.records && data.records[0]) || null;
}

async function updateExperience(id, fields) {
  return airtable('/' + id, { method: 'PATCH', body: JSON.stringify({ fields: fields }) });
}

async function sendSms(to, from, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth = Buffer.from(sid + ':' + token).toString('base64');
  await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
}

// --- FEEDBACK AUTOMATION ---
// Schedules a message for a future send via Twilio's Messaging Service scheduler —
// same mechanism api/sweep.js already uses for eve-of and morning-of messages.
// Returns the Twilio message SID so it can be logged, same pattern as Eve-Of Message SID.
async function scheduleSms(to, body, sendAtIso) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth = Buffer.from(sid + ':' + token).toString('base64');
  const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
      Body: body,
      SendAt: sendAtIso,
      ScheduleType: 'fixed',
    }),
  });
  const data = await res.json();
  return data.sid || null;
}

// Classifies a free-text feedback reply into Positive / Unsure / Negative via Claude.
// Zero-dependency by design (matches the rest of this file) — plain fetch, no SDK.
async function classifyFeedback(replyText) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8,
      temperature: 0,
      system: 'You classify a customer\'s SMS reply to the question "how are you feeling now compared to when you started this morning?" after a wellness experience. Respond with exactly one word: Positive, Unsure, or Negative. Positive = a clear improvement or good feeling. Negative = it did not land, they feel the same or worse, or they express disappointment. Unsure = anything ambiguous, neutral, or noncommittal. Respond with only the single word, nothing else.',
      messages: [{ role: 'user', content: replyText }],
    }),
  });
  const data = await res.json();
  const raw = ((data.content && data.content[0] && data.content[0].text) || '').trim();
  if (raw === 'Positive' || raw === 'Unsure' || raw === 'Negative') return raw;
  return 'Unsure'; // fail safe: never guess Positive, never send the referral seed on an uncertain classification
}

// Given the fields object and the 0-indexed step that was just sent, returns the field
// name for a given 0-indexed message step. Message 1/2 are specially named; 3–15 are not.
function messageFieldName(stepIndex) {
  if (stepIndex === 0) return 'Message 1 (Eve-Of)';
  if (stepIndex === 1) return 'Message 2 (Morn-Of)';
  return 'Message ' + (stepIndex + 1);
}

// True if the message just sent at stepIndex was the last non-blank one (i.e. the Close message).
function wasCloseMessage(fields, stepIndex) {
  const nextFieldName = messageFieldName(stepIndex + 1);
  const nextValue = fields[nextFieldName];
  return !nextValue || (typeof nextValue === 'string' && nextValue.trim() === '');
}
// --- END FEEDBACK AUTOMATION ---

function twiml(res) {
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<Response></Response>');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const signature = req.headers['x-twilio-signature'];
  const valid = validateTwilioSignature(process.env.TWILIO_AUTH_TOKEN, signature, WEBHOOK_URL, req.body);
  if (!valid) {
    res.status(403).send('Invalid signature');
    return;
  }

  const from = req.body.From;
  const to = req.body.To;
  const body = (req.body.Body || '').trim();
  const bodyLower = body.toLowerCase();
  const now = new Date().toISOString();

  const record = await findExperienceByPhone(from);
  if (!record) {
    await sendSms(process.env.AMANDA_PHONE_NUMBER, to, 'Unknown number ' + from + ' texted: "' + bodyLower + '"');
    return twiml(res);
  }

  const id = record.id;
  const fields = record.fields;
  const mode = fields['Mode'] || 'Auto';
  const lastSentAt = fields['Last Sent At'] ? new Date(fields['Last Sent At']) : null;
  const currentStep = fields['Current Step'] || 0;

  // --- FEEDBACK AUTOMATION ---
  // If we're waiting on this customer's reply to the feedback question, handle it here,
  // before Hold/keyword logic — this is free text, not a next/done reply, and should
  // never fall through to the "forward unmatched reply to Amanda" path.
  if (fields['Awaiting Feedback']) {
    const sentiment = await classifyFeedback(body);
    const couponCode = (fields['Coupon Code'] && fields['Coupon Code'][0]) || '';
    const branchMessage = sentiment === 'Positive'
      ? buildPositiveReply(couponCode)
      : FEEDBACK_BRANCHES_STATIC[sentiment];
    await sendSms(from, to, branchMessage);
    await updateExperience(id, {
      'Feedback Reply': body,
      'Feedback Sentiment': sentiment,
      'Feedback Replied At': now,
      'Awaiting Feedback': false,
      'Referral Seed Sent': sentiment === 'Positive',
      'Last Inbound At': now,
    });
    return twiml(res);
  }
  // --- END FEEDBACK AUTOMATION ---

  if (mode === 'Hold') {
    if (!fields['Hold Notice Sent']) {
      await sendSms(from, to, HOLDING_MESSAGE);
      await updateExperience(id, { 'Hold Notice Sent': true, 'Last Inbound At': now, 'Last Reply': body });
    } else {
      await updateExperience(id, { 'Last Inbound At': now, 'Last Reply': body });
    }
    return twiml(res);
  }

  if (!ADVANCE_KEYWORDS.includes(bodyLower)) {
    await sendSms(process.env.AMANDA_PHONE_NUMBER, to, fields['Customer Name'] + ' replied: "' + body + '"');
    await updateExperience(id, { 'Last Reply': body, 'Last Inbound At': now });
    return twiml(res);
  }

  if (lastSentAt && Date.now() - lastSentAt.getTime() < DOUBLE_TAP_WINDOW_MS) {
    return twiml(res);
  }

  const nextMessage = fields['Next Message'];
  if (!nextMessage || nextMessage === 'Experience complete') {
    await updateExperience(id, { 'Last Inbound At': now });
    return twiml(res);
  }

  await sendSms(from, to, nextMessage);

  const updateFields = {
    'Current Step': currentStep + 1,
    'Last Sent At': now,
    'Last Inbound At': now,
    'Hold Notice Sent': false,
  };

  // --- FEEDBACK AUTOMATION ---
  // If the message we just sent was the Close message, schedule the feedback
  // question for 2 hours from now and mark the record as awaiting a reply.
  if (wasCloseMessage(fields, currentStep)) {
    const sendAt = new Date(Date.now() + FEEDBACK_DELAY_MS).toISOString();
    const feedbackSid = await scheduleSms(from, FEEDBACK_QUESTION, sendAt);
    updateFields['Feedback Message SID'] = feedbackSid || '';
    updateFields['Feedback Sent At'] = sendAt;
    updateFields['Awaiting Feedback'] = true;
    updateFields['Status'] = 'Complete';
  }
  // --- END FEEDBACK AUTOMATION ---

  await updateExperience(id, updateFields);
  return twiml(res);
};
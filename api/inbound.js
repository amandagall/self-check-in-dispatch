// api/inbound.js
//
// Inbound SMS webhook — the automated half of SCI Dispatch.
// Twilio POSTs here whenever a customer texts +1 289 513-8680.
// Looks up the matching Experience by phone, advances the sequence
// on "next"/"done", forwards anything else to Amanda.
//
// Required Vercel env vars (Project Settings -> Environment Variables):
//   TWILIO_ACCOUNT_SID   - from twilio.com/console
//   TWILIO_AUTH_TOKEN    - from twilio.com/console (also verifies inbound requests)
//   AIRTABLE_TOKEN        - same token api/experiences.js already uses
//   AMANDA_PHONE_NUMBER   - where unknown numbers + unrecognised replies get forwarded, e.g. +1XXXXXXXXXX
// Optional (defaults match the Self Check-In base if unset):
//   AIRTABLE_BASE_ID
//   AIRTABLE_TABLE_NAME
//
// IMPORTANT: WEBHOOK_URL below must exactly match the URL you paste into
// Twilio Console -> Phone Numbers -> your number -> "A message comes in".
// Any mismatch (http vs https, trailing slash) breaks signature validation.

const crypto = require('crypto');

const WEBHOOK_URL = 'https://self-check-in-experiences.vercel.app/api/inbound';
const ADVANCE_KEYWORDS = ['next', 'done'];
const HOLDING_MESSAGE = "Quick pause on our end — we'll be right back with you.";
const DOUBLE_TAP_WINDOW_MS = 60 * 1000;

function validateTwilioSignature(authToken, signature, url, params) {
  const data = Object.keys(params || {})
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  return expected === signature;
}

async function airtable(path, options = {}) {
  const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appUWpk3MAaug3iMO';
  const TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Experiences';
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}${path}`;
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

async function findExperienceByPhone(rawPhone) {
  // Twilio sends E.164 (+12895551234); Airtable's Mobile field can be typed
  // in any format. Normalize both to the last 10 digits before comparing,
  // instead of a naive string match that would miss formatted numbers.
  const digits = rawPhone.replace(/\D/g, '').slice(-10);
  const formula = `AND({Status} != "Complete", RIGHT(REGEX_REPLACE({Mobile (from Mobile)} & "", "[^0-9]", ""), 10) = "${digits}")`;
  const data = await airtable(`?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`);
  return (data.records && data.records[0]) || null;
}

async function updateExperience(id, fields) {
  return airtable(`/${id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
}

async function sendSms(to, from, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
}

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

  const from = req.body.From;   // customer's number
  const to = req.body.To;       // our Twilio number — reused as "From" on replies
  const body = (req.body.Body || '').trim().toLowerCase();
  const now = new Date().toISOString();

  const record = await findExperienceByPhone(from);
  if (!record) {
    await sendSms(process.env.AMANDA_PHONE_NUMBER, to, `Unknown number ${from} texted: "${body}"`);
    return twiml(res);
  }

 const { id, fields } = record;
  const mode = fields['Mode'] || 'Auto';
  const lastSentAt = fields['Last Sent At'] ? new Date(fields['Last Sent At']) : null;
  const currentStep = fields['Current Step'] || 0;

  if (mode === 'Hold') {
    if (!fields['Hold Notice Sent']) {
      await sendSms(from, to, HOLDING_MESSAGE);
      await updateExperience(id, { 'Hold Notice Sent': true, 'Last Inbound At': now, 'Last Reply': body });
    } else {
      await updateExperience(id, { 'Last Inbound At': now, 'Last Reply': body });
    }
    return twiml(res);
  }

  if (!ADVANCE_KEYWORDS.includes(body)) {
    await sendSms(process.env.AMANDA_PHONE_NUMBER, to, `${fields['Customer Name']} replied: "${body}"`);
    await updateExperience(id, { 'Last Reply': body, 'Last Inbound At': now });
    return twiml(res);
  }

  if (lastSentAt && Date.now() - lastSentAt.getTime() < DOUBLE_TAP_WINDOW_MS) {
    return twiml(res); // double-tap guard — silently ignore
  }

  const nextMessage = fields['Next Message'];
  if (!nextMessage || nextMessage === 'Experience complete') {
    await updateExperience(id, { 'Last Inbound At': now });
    return twiml(res);
  }

  await sendSms(from, to, nextMessage);
  await updateExperience(id, {
    'Current Step': currentStep + 1,
    'Last Sent At': now,
    'Last Inbound At': now,
    'Hold Notice Sent': false,
  });
  return twiml(res);
}; 
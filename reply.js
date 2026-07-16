// api/reply.js
//
// Manual reply endpoint for SCI Dispatch's Hold-mode "reply box" (P4).
// Lets Amanda send a free-text SMS to a customer from the business number
// (+1 289 513-8680) so it lands in their existing thread -- for mid-day
// itinerary edits, a concerning reply, or anything that needs an actual
// human voice instead of the automated sequence.
//
// This does NOT touch Current Step, Mode, or any sequence field -- it only
// sends the message and stamps Last Sent At, so the dashboard's stall
// detection doesn't keep flagging a conversation Amanda just handled.
//
// Required Vercel env vars: none new. Reuses TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, AIRTABLE_TOKEN, DISPATCH_PASSWORD -- all already
// configured for api/inbound.js and api/experiences.js.
// Optional: AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME (same defaults as elsewhere).

const OUR_NUMBER = '+12895138680';

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

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: OUR_NUMBER, Body: body }),
  });
  return res.json();
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

  const { recordId, to, body } = req.body || {};
  if (!recordId || !to || !body || !String(body).trim()) {
    res.status(400).json({ error: 'recordId, to, and body are all required' });
    return;
  }

  try {
    const twilioResult = await sendSms(to, String(body).trim());
    if (twilioResult.error_code) {
      res.status(502).json({ error: 'Twilio error: ' + (twilioResult.message || twilioResult.error_code) });
      return;
    }
    await airtable(`/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Last Sent At': new Date().toISOString() } }),
    });
    res.status(200).json({ ok: true, sid: twilioResult.sid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

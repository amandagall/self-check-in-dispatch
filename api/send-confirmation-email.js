// api/send-confirmation-email.js
//
// Sends the post-payment confirmation email (subject: "Your Self Check-In
// is booked for [Date]!") and writes back a timestamp so it never sends
// twice. Meant to be triggered by an Airtable Automation on the Customers
// table when Payment Status becomes "Paid" -- everything this needs (Name,
// Email, Check-In Date, Check-In Time) is on the Customer record itself, so
// it doesn't wait on the Experience record or the Notion page pipeline the
// way api/customer-notion-sync.js does.
//
// Required Vercel env vars (new):
//   RESEND_API_KEY   - from resend.com. You'll also need a verified sending
//                       domain there (e.g. selfcheck-in.ca) before Resend
//                       will actually deliver anything -- unverified domains
//                       only let you send to your own account email.
//   CONFIRMATION_FROM_EMAIL - e.g. "Self Check-In <hello@selfcheck-in.ca>".
//                       Falls back to Resend's shared onboarding@resend.dev
//                       address if unset, which works for testing but will
//                       look wrong to customers and has a low sending limit.
// Reuses: AIRTABLE_TOKEN, DISPATCH_PASSWORD (same as every other endpoint).
// Optional: AIRTABLE_BASE_ID (defaults to appUWpk3MAaug3iMO).
//
// This deliberately does NOT touch Notion (no Comms Archive logging) --
// that was scoped out to avoid a race with the Notion page not existing yet
// at Payment Status = Paid time. Add it later as its own best-effort step
// if wanted, same pattern as sweep.js's Morning SMS Sent update.

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appUWpk3MAaug3iMO';
const CUSTOMERS_TABLE_ID = 'tblYf7o2C9kpfwvUO';
const OUR_NUMBER_DISPLAY = '+1 (289) 513-8680';

// Same day-window assumptions as api/sweep.js's MORNING_TIMES_ET, just
// expressed as a full start/end range instead of a single reminder time.
const CHECK_IN_WINDOWS = {
  '9am-1pm': { startHour: 9, startMinute: 0, endHour: 13, endMinute: 0 },
  '12pm-4pm': { startHour: 12, startMinute: 0, endHour: 16, endMinute: 0 },
};

async function airtable(path, options = {}) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${CUSTOMERS_TABLE_ID}${path}`;
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

function firstValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// "2026-07-30" -> "July 30th" (no year -- matches the real precedent email
// that went to Sarah Pardy, "Your Self Check-In is booked for June 2nd!")
function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const month = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' }).format(dt);
  return `${month} ${ordinal(d)}`;
}

// Floating local time, no "Z", no "ctz" param -- per the format decided in
// the "SMS - Calendar reminder" doc, since the experience is delivered by
// text over a window of Eastern-time hours regardless of where the
// customer's own device/calendar thinks it is.
function pad(n) {
  return String(n).padStart(2, '0');
}

function calendarDateTime(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}${pad(m)}${pad(d)}T${pad(hour)}${pad(minute)}00`;
}

function buildCalendarUrl(dateStr, checkInTime) {
  const window = CHECK_IN_WINDOWS[checkInTime];
  if (!window) return null;
  const start = calendarDateTime(dateStr, window.startHour, window.startMinute);
  const end = calendarDateTime(dateStr, window.endHour, window.endMinute);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Self Check-In',
    dates: `${start}/${end}`,
    details: 'Your Self Check-In experience -- keep your phone handy, it arrives by text message.',
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

function buildEmail(firstName, displayDate, calendarUrl) {
  const subject = `Your Self Check-In is booked for ${displayDate}!`;

  const text = `Hi ${firstName},

Your Self Check-In is booked for ${displayDate}.
Add it to your calendar so it's waiting for you: ${calendarUrl}

Things to know:

Your experience will be delivered via text message to the phone number you provided us with on the day. You'll hear from us at ${OUR_NUMBER_DISPLAY} -- save that number to your phone now so our messages come through.

If you need to reschedule your Self Check-In, just let us know at least 24 hours in advance and we'll sort it out.

We'll contact you the evening before to remind you about your Self Check-In and anything you'll need to pack for your day.

If you need additional information about a stop we send you to, there will be a link in the SMS message. We've put together custom venue details -- parking, accessibility, and other useful links -- so click those when they come through.

Can't wait for you to have this day. You deserve it.

Amanda & Alicia
Self Check-In`;

  // Colours and type from Notion > Brand & Voice > Branding Guidelines
  // (Colour Palette + Typography pages) -- not invented here.
  //   Warm Parchment #F8F0E3  primary background
  //   Dark Brown     #2C2820  primary text
  //   Warm Slate     #6B7B8D  accent (replaced Terracotta May 29, 2026)
  //   Warm Greige    #787362  mid-tone / supporting, small labels
  // Cormorant Garamond (weight 500) for the headline only, generous size,
  // never bold, never small. DM Sans for all body copy, never bold, never
  // used for the headline. Web fonts are best-effort in email clients --
  // Georgia/system-serif and system-sans fallbacks carry the same warmth
  // contrast where Cormorant/DM Sans don't load (Outlook, etc).
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=DM+Sans:wght@400&display=swap">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=DM+Sans:wght@400&display=swap');
</style>
</head>
<body style="margin:0; padding:0; background-color:#F8F0E3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F0E3;">
<tr><td align="center" style="padding:48px 24px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%;">

<tr><td style="padding-bottom:32px;">
<div style="font-family:'Cormorant Garamond', Georgia, 'Times New Roman', serif; font-weight:500; font-size:32px; line-height:1.3; color:#2C2820;">
Your Self Check-In is booked for ${displayDate}.
</div>
</td></tr>

<tr><td style="font-family:'DM Sans', -apple-system, Helvetica, Arial, sans-serif; font-size:16px; line-height:1.7; color:#2C2820; padding-bottom:8px;">
Hi ${firstName},
</td></tr>

<tr><td style="font-family:'DM Sans', -apple-system, Helvetica, Arial, sans-serif; font-size:16px; line-height:1.7; color:#2C2820; padding-bottom:28px;">
Add it to your calendar so it's waiting for you:<br>
<a href="${calendarUrl}" style="color:#6B7B8D; text-decoration:underline;">${calendarUrl}</a>
</td></tr>

<tr><td style="padding-bottom:16px;">
<span style="font-family:'DM Sans', -apple-system, Helvetica, Arial, sans-serif; font-size:10px; letter-spacing:0.25em; text-transform:uppercase; color:#787362;">Things to know</span>
</td></tr>

<tr><td style="font-family:'DM Sans', -apple-system, Helvetica, Arial, sans-serif; font-size:16px; line-height:1.7; color:#2C2820; padding-bottom:20px;">
Your experience will be delivered via text message to the phone number you provided us with on the day. You'll hear from us at ${OUR_NUMBER_DISPLAY} -- save that number to your phone now so our messages come through.
</td></tr>

<tr><td style="font-family:'DM Sans', -apple-system, Helvetica, Arial, sans-serif; font-size:16px; line-height:1.7; color:#2C2820; padding-bottom:20px;">
If you need to reschedule your Self Check-In, just let us know at least 24 hours in advance and we'll sort it out.
</td></tr>

<tr><td style="font-family:'DM Sans', -apple-system, Helvetica, Arial, sans-serif; font-size:16px; line-height:1.7; color:#2C2820; padding-bottom:20px;">
We'll contact you the evening before to remind you about your Self Check-In and anything you'll need to pack for your day.
</td></tr>

<tr><td style="font-family:'DM Sans', -apple-system, Helvetica, Arial, sans-serif; font-size:16px; line-height:1.7; color:#2C2820; padding-bottom:36px;">
If you need additional information about a stop we send you to, there will be a link in the SMS message. We've put together custom venue details -- parking, accessibility, and other useful links -- so click those when they come through.
</td></tr>

<tr><td style="font-family:'Cormorant Garamond', Georgia, 'Times New Roman', serif; font-weight:500; font-size:20px; line-height:1.5; color:#2C2820; padding-bottom:28px;">
Can't wait for you to have this day. You deserve it.
</td></tr>

<tr><td style="font-family:'DM Sans', -apple-system, Helvetica, Arial, sans-serif; font-size:16px; line-height:1.7; color:#2C2820;">
Amanda &amp; Alicia<br>Self Check-In
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}

async function sendViaResend(to, email) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.CONFIRMATION_FROM_EMAIL || 'onboarding@resend.dev',
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error('Resend API error (HTTP ' + res.status + '): ' + (data.message || JSON.stringify(data)));
  }
  return data;
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
    const record = await airtable('/' + recordId);
    if (!record || !record.fields) {
      res.status(404).json({ error: 'Customer record not found' });
      return;
    }
    const fields = record.fields;

    // Dedup guard -- this is the whole reason the "Confirmation Email Sent"
    // field exists. Re-running this (retry, automation re-fire, manual
    // test) after a successful send is a no-op, not a re-send.
    if (fields['Confirmation Email Sent']) {
      res.status(202).json({ ok: true, skipped: 'Confirmation Email Sent already set', sentAt: fields['Confirmation Email Sent'] });
      return;
    }

    const email = firstValue(fields['Email']);
    const name = firstValue(fields['Name']) || '';
    const firstName = name.trim().split(/\s+/)[0] || 'there';
    const checkInDate = firstValue(fields['Check-In Date']);
    const checkInTime = firstValue(fields['Check-In Time']);

    if (!email) {
      res.status(400).json({ error: 'No Email on this Customer record' });
      return;
    }
    if (!checkInDate || !CHECK_IN_WINDOWS[checkInTime]) {
      res.status(400).json({ error: 'Missing or unrecognised Check-In Date/Time', checkInDate: checkInDate || null, checkInTime: checkInTime || null });
      return;
    }

    const displayDate = formatDisplayDate(checkInDate);
    const calendarUrl = buildCalendarUrl(checkInDate, checkInTime);
    const emailContent = buildEmail(firstName, displayDate, calendarUrl);

    const sendResult = await sendViaResend(email, emailContent);

    const sentAt = new Date().toISOString();
    await airtable('/' + recordId, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Confirmation Email Sent': sentAt } }),
    });

    res.status(200).json({ ok: true, sentTo: email, subject: emailContent.subject, resendId: sendResult.id, sentAt: sentAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
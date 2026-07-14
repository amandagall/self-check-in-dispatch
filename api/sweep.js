// api/sweep.js
//
// Daily sweep — the scheduled half of SCI Dispatch (P2).
// Finds tomorrow's Ready experiences, hands the eve-of and morning-of
// messages to Twilio's message scheduler, and primes Current Step so
// the reply-driven webhook (api/inbound.js) picks up correctly at the
// first real stop once the customer texts "next."
//
// Required Vercel env vars (in addition to the ones inbound.js uses):
//   TWILIO_MESSAGING_SERVICE_SID  - starts with MG..., from Messaging > Services
// Optional:
//   CRON_SECRET  - if set, /api/sweep only responds to requests carrying
//                  "Authorization: Bearer <CRON_SECRET>" (Vercel Cron sends
//                  this automatically once configured in vercel.json)

const EVE_OF_HOUR_ET = 20;    // 8:00pm ET, night before, everyone
const MORNING_TIMES_ET = {    // 5 minutes before each Check-In Time window starts
  '9am-1pm': { hour: 8, minute: 55 },
  '12pm-4pm': { hour: 11, minute: 55 },
};

function getETDateString(offsetDays) {
  offsetDays = offsetDays || 0;
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = dtf.formatToParts(new Date());
  const y = parseInt(parts.find(function (p) { return p.type === 'year'; }).value, 10);
  const m = parseInt(parts.find(function (p) { return p.type === 'month'; }).value, 10);
  const d = parseInt(parts.find(function (p) { return p.type === 'day'; }).value, 10);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

function etDateTimeToUTC(dateStr, hour, minute) {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0], month = parts[1], day = parts[2];
  const referenceUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', timeZoneName: 'shortOffset' });
  const offsetPart = dtf.formatToParts(referenceUTC).find(function (p) { return p.type === 'timeZoneName'; });
  const offsetHours = parseInt(offsetPart.value.replace('GMT', ''), 10); // -4 (EDT) or -5 (EST)
  return new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute, 0));
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

async function updateExperience(id, fields) {
  return airtable('/' + id, { method: 'PATCH', body: JSON.stringify({ fields: fields }) });
}

async function scheduleSms(to, body, sendAtISO) {
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
      ScheduleType: 'fixed',
      SendAt: sendAtISO,
    }),
  });
  return res.json();
}

async function sendSmsNow(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth = Buffer.from(sid + ':' + token).toString('base64');
  await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID, Body: body }),
  });
}

function firstValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (req.headers['authorization'] !== 'Bearer ' + cronSecret) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  const todayET = getETDateString(0);
  const tomorrowET = getETDateString(1);

  const formula = 'AND({Status} = "Ready", {Scheduled} != TRUE(), {Mode} != "Hold", IS_SAME({Check-In Date}, "' + tomorrowET + '", "day"))';
  const data = await airtable('?filterByFormula=' + encodeURIComponent(formula));
  const records = data.records || [];

  const results = [];

  for (var i = 0; i < records.length; i++) {
    const record = records[i];
    const id = record.id;
    const fields = record.fields;

    try {
      const phone = firstValue(fields['Mobile (from Mobile)']);
      const checkInTime = firstValue(fields['Check-In Time']);
      const morning = MORNING_TIMES_ET[checkInTime];

      if (!phone || !morning) {
        results.push({ id: id, skipped: true, reason: !phone ? 'no phone' : 'unrecognised Check-In Time: ' + checkInTime });
        continue;
      }

      const eveOfMessage = fields['Message 1 (Eve-Of)'];
      const morningMessage = fields['Message 2 (Morn-Of)'];

      const eveOfSendAt = etDateTimeToUTC(todayET, EVE_OF_HOUR_ET, 0).toISOString();
      const morningSendAt = etDateTimeToUTC(tomorrowET, morning.hour, morning.minute).toISOString();

      const eveOfResult = await scheduleSms(phone, eveOfMessage, eveOfSendAt);
      const morningResult = await scheduleSms(phone, morningMessage, morningSendAt);

      await updateExperience(id, {
        'Eve-Of Message SID': eveOfResult.sid || JSON.stringify(eveOfResult),
        'Morning Message SID': morningResult.sid || JSON.stringify(morningResult),
        'Scheduled': true,
        'Current Step': 2,
        'Last Sent At': morningSendAt,
      });

      results.push({ id: id, scheduled: true, eveOfSendAt: eveOfSendAt, morningSendAt: morningSendAt });
    } catch (err) {
      results.push({ id: id, error: err.message });
      if (process.env.AMANDA_PHONE_NUMBER) {
        await sendSmsNow(process.env.AMANDA_PHONE_NUMBER, 'Sweep failed to schedule ' + (fields['Customer Name'] || id) + ': ' + err.message);
      }
    }
  }

  res.status(200).json({ todayET: todayET, tomorrowET: tomorrowET, count: records.length, results: results });
};
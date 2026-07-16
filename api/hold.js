// api/hold.js
//
// Hold toggle endpoint for SCI Dispatch's P4 "human escape hatch."
//
// A plain write of Mode = "Hold" to Airtable is NOT enough to satisfy this
// ticket's "stopping a queued morning message" use case. If P2's nightly
// sweep already ran for this experience, Twilio has the eve-of and/or
// morning message scheduled with a future SendAt (see Eve-Of Message SID /
// Morning Message SID, written by api/sweep.js) -- Twilio fires those on
// its own clock and never checks Airtable's Mode field. So switching INTO
// Hold here also attempts to cancel any not-yet-sent scheduled message via
// Twilio's API, using the stored SIDs. Switching to Auto never needs to
// cancel anything -- it's just the Mode write.
//
// Required Vercel env vars: none new. Reuses TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, AIRTABLE_TOKEN, DISPATCH_PASSWORD.
// Optional: AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME (same defaults as elsewhere).

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

// Twilio refuses to cancel a message that's already been sent (or is too
// close to its send time) -- that's expected, not an error worth surfacing
// as a failure. We just report back what happened so the dashboard can
// tell Amanda plainly.
async function cancelTwilioMessage(sid) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth = Buffer.from(`${accountSid}:${token}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ Status: 'canceled' }),
  });
  const data = await res.json();
  return { canceled: data.status === 'canceled', status: data.status || null, error: data.message || null };
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

  const { recordId, hold } = req.body || {};
  if (!recordId || typeof hold !== 'boolean') {
    res.status(400).json({ error: 'recordId and hold (boolean) are required' });
    return;
  }

  try {
    const cancellations = [];

    if (hold) {
      const record = await airtable(`/${recordId}`);
      const fields = record.fields || {};
      const currentStep = fields['Current Step'] || 0;
      const eveSid = fields['Eve-Of Message SID'];
      const morningSid = fields['Morning Message SID'];

      // Current Step 0 = neither sent yet, 1 = eve-of sent, morning still
      // pending, 2+ = both already sent. Only attempt cancellation for
      // steps that plausibly haven't fired -- skips a guaranteed no-op
      // call rather than skipping anything that might still be pending.
      if (currentStep < 1 && eveSid && !eveSid.startsWith('{')) {
        cancellations.push(Object.assign({ which: 'Eve-Of' }, await cancelTwilioMessage(eveSid)));
      }
      if (currentStep < 2 && morningSid && !morningSid.startsWith('{')) {
        cancellations.push(Object.assign({ which: 'Morning' }, await cancelTwilioMessage(morningSid)));
      }
    }

    await airtable(`/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Mode': hold ? 'Hold' : 'Auto', 'Hold Notice Sent': false } }),
    });

    res.status(200).json({ ok: true, cancellations: cancellations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
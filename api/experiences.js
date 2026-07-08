// Serverless proxy for Dispatch. The Airtable token lives ONLY here,
// as a Vercel Environment Variable, and never reaches the browser.
//
// Required Vercel env vars (Project Settings -> Environment Variables):
//   AIRTABLE_TOKEN      - your new Personal Access Token (data.records:read + write, scoped to this base only)
//   DISPATCH_PASSWORD   - must match the PASSWORD constant in dispatch.html
// Optional (defaults match the current Self Check-In base if unset):
//   AIRTABLE_BASE_ID
//   AIRTABLE_TABLE_NAME

module.exports = async (req, res) => {
  const DISPATCH_PASSWORD = process.env.DISPATCH_PASSWORD;
  const key = req.headers['x-dispatch-key'];

  if (!DISPATCH_PASSWORD || key !== DISPATCH_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appUWpk3MAaug3iMO';
  const TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Experiences';

  if (!AIRTABLE_TOKEN) {
    res.status(500).json({ error: 'Server misconfigured: AIRTABLE_TOKEN not set' });
    return;
  }

  const { id } = req.query;
  const base = 'https://api.airtable.com/v0/' + BASE_ID + '/' + encodeURIComponent(TABLE_NAME);
  const url = id ? base + '/' + id : base;

  try {
    const airtableRes = await fetch(url, {
      method: req.method,
      headers: {
        'Authorization': 'Bearer ' + AIRTABLE_TOKEN,
        'Content-Type': 'application/json'
      },
      body: (req.method === 'PATCH' || req.method === 'POST') ? JSON.stringify(req.body) : undefined
    });
    const data = await airtableRes.json();
    res.status(airtableRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
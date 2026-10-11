// Dependency-free WhatsApp billing relay (Node 18+).
//  • POST /send-bill  – the app asks the server to send one bill via the WhatsApp Business Cloud API
//  • GET  /status     – the app asks for sent / delivered / read / failed per bill
//  • /webhook         – Meta calls this with delivery receipts and failures
// Run:  cp .env.example .env  (fill it in)  →  node --env-file=.env server.js
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');

const env = process.env;
const PORT = Number(env.PORT || 3000);
const API_KEY = env.API_KEY || '';
const TOKEN = env.WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = env.PHONE_NUMBER_ID || '';
const TEMPLATE = env.TEMPLATE_NAME || 'milk_bill';
const LANG = env.TEMPLATE_LANG || 'en';
const VERIFY_TOKEN = env.VERIFY_TOKEN || '';
const APP_SECRET = env.APP_SECRET || '';
const GRAPH = (env.GRAPH_BASE || 'https://graph.facebook.com/v21.0').replace(/\/$/, '');
const DATA_FILE = env.DATA_FILE || './data.json';

if (!API_KEY) { console.error('API_KEY is required (the app sends it in the x-api-key header).'); process.exit(1); }

// ── tiny JSON store: { bills: { [billId]: {status,error,messageId,updatedAt} }, byMessage: { [messageId]: billId } }
let db = { bills: {}, byMessage: {} };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* first run */ }
const save = () => { const tmp = `${DATA_FILE}.tmp`; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DATA_FILE); };
const RANK = { sent: 1, delivered: 2, read: 3 };
function setStatus(billId, patch) {
  const cur = db.bills[billId] || {};
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  // never downgrade delivered/read back to sent, and never let a late "failed" erase a delivery
  if (RANK[cur.status] >= 2 && (patch.status === 'failed' || RANK[patch.status] < RANK[cur.status])) return;
  db.bills[billId] = next;
  if (next.messageId) db.byMessage[next.messageId] = billId;
  save();
}

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 200_000) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const authed = (req) => { const k = String(req.headers['x-api-key'] || ''); return k.length === API_KEY.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(API_KEY)); };

async function sendTemplate(b) {
  const nice = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const params = [b.customerName, `${nice(b.periodStart)} to ${nice(b.periodEnd)}`, `${b.litres} L`, `Rs ${b.ratePerLitre}`, `Rs ${b.amount}`];
  const res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: b.phone, type: 'template',
      template: { name: TEMPLATE, language: { code: LANG }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }] },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.error_user_msg || json?.error?.message || `WhatsApp API error ${res.status}`);
  return json?.messages?.[0]?.id;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });

    if (url.pathname === '/webhook') {
      if (req.method === 'GET') {
        const ok = url.searchParams.get('hub.mode') === 'subscribe' && VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN;
        return ok ? send(res, 200, url.searchParams.get('hub.challenge') || '', 'text/plain') : send(res, 403, { error: 'Forbidden' });
      }
      if (req.method === 'POST') {
        const raw = await readBody(req);
        if (APP_SECRET) {
          const expected = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`;
          const got = String(req.headers['x-hub-signature-256'] || '');
          if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return send(res, 401, { error: 'Bad signature' });
        }
        let payload = {}; try { payload = JSON.parse(raw.toString('utf8')); } catch { /* ignore */ }
        for (const entry of payload.entry || []) for (const ch of entry.changes || []) for (const st of ch.value?.statuses || []) {
          const billId = db.byMessage[st.id]; if (!billId) continue;
          if (st.status === 'failed') setStatus(billId, { status: 'failed', error: st.errors?.[0]?.message || st.errors?.[0]?.title || 'WhatsApp could not deliver the message' });
          else if (RANK[st.status]) setStatus(billId, { status: st.status, error: null });
        }
        return send(res, 200, { ok: true });
      }
    }

    if (!authed(req)) return send(res, 401, { error: 'Invalid API key' });

    if (req.method === 'POST' && url.pathname === '/send-bill') {
      if (!TOKEN || !PHONE_NUMBER_ID) return send(res, 500, { error: 'Server is missing WHATSAPP_TOKEN / PHONE_NUMBER_ID' });
      let b; try { b = JSON.parse((await readBody(req)).toString('utf8')); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
      if (!b.billId || !/^\d{11,15}$/.test(String(b.phone || ''))) return send(res, 400, { error: 'billId and a valid phone (digits with country code) are required' });
      const existing = db.bills[b.billId];
      if (existing && ['sent', 'delivered', 'read'].includes(existing.status)) return send(res, 200, { ok: true, status: existing.status, messageId: existing.messageId, duplicate: true });
      try {
        const messageId = await sendTemplate(b);
        setStatus(b.billId, { status: 'sent', messageId, error: null });
        return send(res, 200, { ok: true, status: 'sent', messageId });
      } catch (e) {
        setStatus(b.billId, { status: 'failed', error: e.message });
        return send(res, 502, { error: e.message });
      }
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      const ids = String(url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 500);
      const statuses = {}; for (const id of ids) if (db.bills[id]) statuses[id] = { status: db.bills[id].status, error: db.bills[id].error || null };
      return send(res, 200, { statuses });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error' });
  }
});
server.listen(PORT, () => console.log(`Billing relay listening on :${PORT}`));

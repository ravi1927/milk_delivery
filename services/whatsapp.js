import { Linking } from 'react-native';
import { BILLING_API_KEY, BILLING_API_URL } from '../constants/business';
import { buildMessage } from './billing';
import * as store from './store';

export const isApiMode = () => !!BILLING_API_URL;
export const modeLabel = () => (isApiMode() ? 'Automatic (WhatsApp Business API)' : 'WhatsApp link (you press Send)');

const attemptsOf = (bill) => (bill.wa?.attempts || 0) + 1;

async function api(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${BILLING_API_URL}${path}`, {
      ...options,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': BILLING_API_KEY, ...(options.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) throw new Error(body?.error || `Server error ${res.status}`);
    return body;
  } finally { clearTimeout(timer); }
}

/** Send (or retry) one bill. Always resolves with the updated bill; never throws. */
export async function sendBill(bill) {
  if (!bill.phone) {
    return store.updateBillWa(bill.id, { status: 'failed', error: 'Customer mobile number is missing or invalid', attempts: attemptsOf(bill) });
  }
  const message = buildMessage(bill);

  if (isApiMode()) {
    try {
      const out = await api('/send-bill', {
        method: 'POST',
        body: JSON.stringify({
          billId: bill.id, phone: bill.phone, customerName: bill.customerName, periodStart: bill.periodStart, periodEnd: bill.periodEnd,
          milkQuantity: bill.milkQuantity, days: bill.days, litres: bill.litres, ratePerLitre: bill.ratePerLitre, amount: bill.amount, message,
        }),
      });
      return store.updateBillWa(bill.id, { mode: 'api', status: out.status || 'sent', messageId: out.messageId || null, error: null, attempts: attemptsOf(bill) });
    } catch (e) {
      const msg = e?.name === 'AbortError' ? 'Server did not respond (timeout)' : (e?.message || 'Could not reach the billing server');
      return store.updateBillWa(bill.id, { mode: 'api', status: 'failed', error: msg, attempts: attemptsOf(bill) });
    }
  }

  // Link mode: open WhatsApp with the message typed in. The admin must press Send inside WhatsApp.
  try {
    await Linking.openURL(`https://wa.me/${bill.phone}?text=${encodeURIComponent(message)}`);
    return store.updateBillWa(bill.id, { mode: 'link', status: 'opened', error: null, attempts: attemptsOf(bill) });
  } catch {
    return store.updateBillWa(bill.id, { mode: 'link', status: 'failed', error: 'Could not open WhatsApp. Is it installed on this phone?', attempts: attemptsOf(bill) });
  }
}

/** Link mode: admin confirms the message was really sent from WhatsApp. */
export const confirmSent = (billId) => store.updateBillWa(billId, { status: 'sent', error: null });
export const markNotSent = (billId) => store.updateBillWa(billId, { status: 'failed', error: 'Message was not sent from WhatsApp' });

/** API mode: pull sent / delivered / read / failed updates from the server. Returns number of bills changed. */
export async function refreshStatuses(bills) {
  if (!isApiMode()) return 0;
  const ids = bills.filter((b) => b.wa?.mode === 'api' && !['delivered', 'read', 'failed'].includes(b.wa.status)).map((b) => b.id);
  if (!ids.length) return 0;
  const out = await api(`/status?ids=${encodeURIComponent(ids.join(','))}`);
  let changed = 0;
  for (const id of ids) {
    const st = out?.statuses?.[id];
    const cur = bills.find((b) => b.id === id);
    if (st && (st.status !== cur.wa.status || (st.error || null) !== (cur.wa.error || null))) {
      await store.updateBillWa(id, { status: st.status, error: st.error || null });
      changed += 1;
    }
  }
  return changed;
}

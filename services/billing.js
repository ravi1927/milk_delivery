// Pure billing helpers (no React / storage imports) so the maths is easy to test.
import { BUSINESS } from '../constants/business';

const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (key) => new Date(`${key}T12:00:00`);
export const shiftKey = (key, days) => { const d = fromKey(key); d.setDate(d.getDate() + days); return toKey(d); };
export const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// "1 L", "500 ml", "1.5L", "2 litres", "250ML"  →  litres as a number
export function parseLitres(value) {
  const m = String(value ?? '').toLowerCase().replace(/,/g, '.').match(/([\d]*\.?[\d]+)\s*([a-z]*)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  return m[2].startsWith('m') ? n / 1000 : n;
}

// Inclusive number of days between two YYYY-MM-DD keys.
export const daysBetween = (start, end) => Math.round((fromKey(end) - fromKey(start)) / 86400000) + 1;

// Billing day for the month of `dateKey` (30th, or the last day of a shorter month such as February).
export function billingDayFor(dateKey) {
  const d = fromKey(dateKey);
  return Math.min(BUSINESS.billingDay, daysInMonth(d.getFullYear(), d.getMonth()));
}
export function cycleDueKey(dateKey) {
  const d = fromKey(dateKey);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(billingDayFor(dateKey))}`;
}
export const isBillingDue = (todayKey) => Number(todayKey.slice(8, 10)) >= billingDayFor(todayKey);

// Normalise an Indian-style mobile number for WhatsApp (digits only, with country code).
export function normalizePhone(raw, countryCode = BUSINESS.countryCode) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = countryCode + d;
  if (d.length < 11 || d.length > 15) return null;
  return d;
}

// Last day already billed for a customer (or null).
export function lastBilledEnd(bills, customerId) {
  let last = null;
  for (const b of bills) if (b.customerId === customerId && (!last || b.periodEnd > last)) last = b.periodEnd;
  return last;
}

// Default start = day after the last bill, otherwise the 1st of the end date's month.
export function defaultStart(bills, customer, endKey) {
  const last = lastBilledEnd(bills, customer.id);
  if (last) return shiftKey(last, 1);
  const first = `${endKey.slice(0, 8)}01`;
  return customer.createdOn && customer.createdOn > first && customer.createdOn <= endKey ? customer.createdOn : first;
}

/**
 * Work out one customer's bill.
 *  mode 'period'    → every day in the period × daily litres × rate   (e.g. 30 days)
 *  mode 'delivered' → only days with a DELIVERED record in the period
 */
export function computeBill({ customer, start, end, deliveries = [], mode = 'period' }) {
  const dailyLitres = parseLitres(customer.milkQuantity);
  const rate = Number(customer.ratePerLitre || 0);
  const periodDays = start > end ? 0 : daysBetween(start, end);
  const days = mode === 'delivered'
    ? deliveries.filter((d) => d.customerId === customer.id && d.status === 'delivered' && d.date >= start && d.date <= end).length
    : periodDays;
  const litres = round2(dailyLitres * days);
  const amount = round2(litres * rate);
  return { dailyLitres, rate, periodDays, days, litres, amount, mode };
}

export const fmtAmount = (n) => {
  const v = round2(n);
  return `₹${Number.isInteger(v) ? v : v.toFixed(2)}`;
};
export const fmtLitres = (n) => `${round2(n)} L`;

const niceDate = (key) => fromKey(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export { niceDate };

export function buildMessage(bill) {
  const lines = [
    `Hello ${bill.customerName},`,
    '',
    `Your milk bill from ${BUSINESS.name} for ${niceDate(bill.periodStart)} to ${niceDate(bill.periodEnd)}:`,
    '',
    `Milk: ${bill.milkQuantity} per day × ${bill.days} day${bill.days === 1 ? '' : 's'} = ${fmtLitres(bill.litres)}`,
    `Rate: ${fmtAmount(bill.ratePerLitre)} per litre`,
    `*Total amount to pay: ${fmtAmount(bill.amount)}*`,
  ];
  if (BUSINESS.paymentNote) lines.push('', BUSINESS.paymentNote);
  lines.push('', `Thank you,`, `${BUSINESS.name}`);
  return lines.join('\n');
}

export const SENT_STATES = ['sent', 'delivered', 'read'];
export const isMessageOk = (bill) => SENT_STATES.includes(bill?.wa?.status);
export const messageProblem = (bill) => {
  const st = bill?.wa?.status || 'pending';
  if (SENT_STATES.includes(st)) return null;
  if (st === 'failed') return bill.wa.error || 'Message failed';
  if (st === 'opened') return 'WhatsApp was opened but sending was not confirmed';
  return 'Not sent yet';
};

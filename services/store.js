import AsyncStorage from '@react-native-async-storage/async-storage';
import { users, areas, customers } from '../data/demoData';
import { parseLitres, cycleDueKey } from './billing';

const K = { u: 'a2_users', a: 'a2_areas', c: 'a2_customers', d: 'a2_daily_deliveries', sub: 'a2_substitutions', lr: 'a2_leave_requests', s: 'a2_session', bills: 'a2_bills' };
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (date, amount) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount); return d; };
export const money = n => `₹${Number(n || 0).toFixed(0)}`;
export const litresFrom = value => parseLitres(value);

async function getJson(key, fallback = []) { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
async function setJson(key, value) { await AsyncStorage.setItem(key, JSON.stringify(value)); }

export async function bootstrap() {
  if (!(await AsyncStorage.getItem(K.u))) await AsyncStorage.multiSet([[K.u, JSON.stringify(users)], [K.a, JSON.stringify(areas)], [K.c, JSON.stringify(customers)], [K.d, '[]'], [K.sub, '[]'], [K.lr, '[]']]);
  if (!(await AsyncStorage.getItem(K.lr))) await AsyncStorage.setItem(K.lr, '[]');
  if (!(await AsyncStorage.getItem(K.bills))) await AsyncStorage.setItem(K.bills, '[]');
  await ensureTodayRecords();
}
export const getUsers = () => getJson(K.u);
export const getAreas = () => getJson(K.a);
export const getCustomers = () => getJson(K.c);
export const getDeliveries = () => getJson(K.d);
export const getSubstitutions = () => getJson(K.sub);
export const getLeaveRequests = () => getJson(K.lr);
export const getBills = () => getJson(K.bills);
export async function login(e, p) { const u = (await getUsers()).find(x => x.email.toLowerCase() === e.toLowerCase() && x.password === p); if (u) await AsyncStorage.setItem(K.s, JSON.stringify(u)); return u || null; }
export async function session() { const x = await AsyncStorage.getItem(K.s); return x ? JSON.parse(x) : null; }
export const logout = () => AsyncStorage.removeItem(K.s);

export async function isBoyOnLeave(boyId, day = dateKey()) {
  const rows = await getLeaveRequests();
  return rows.some(x => x.boyId === boyId && x.date === day && x.status === 'approved');
}

async function effectiveBoyFor(customer, subs, day, leaveRows) {
  const match = subs.find(x => x.date === day && x.customerIds?.includes(customer.id));
  if (match) return match.substituteBoyId || null;
  const leave = leaveRows.some(x => x.boyId === customer.defaultBoyId && x.date === day && x.status === 'approved');
  return leave ? null : (customer.defaultBoyId || null);
}

export async function ensureDailyRecords(day = dateKey()) {
  const [cs, ds, subs, leaveRows] = await Promise.all([getCustomers(), getDeliveries(), getSubstitutions(), getLeaveRequests()]);
  const existing = new Map(ds.filter(x => x.date === day).map(x => [x.customerId, x]));
  const rows = [];
  for (const c of cs.filter(x => x.active)) {
    const old = existing.get(c.id);
    const effectiveBoyId = await effectiveBoyFor(c, subs, day, leaveRows);
    if (old) {
      rows.push(old.status === 'pending' ? { ...old, boyId: effectiveBoyId, areaId: c.areaId, expectedLitres: litresFrom(c.milkQuantity), ratePerLitre: Number(c.ratePerLitre || 0), amount: litresFrom(c.milkQuantity) * Number(c.ratePerLitre || 0) } : old);
    } else {
      rows.push({ id: `${day}_${c.id}`, date: day, customerId: c.id, boyId: effectiveBoyId, areaId: c.areaId, status: 'pending', expectedLitres: litresFrom(c.milkQuantity), ratePerLitre: Number(c.ratePerLitre || 0), amount: litresFrom(c.milkQuantity) * Number(c.ratePerLitre || 0) });
    }
  }
  const merged = ds.filter(x => x.date !== day).concat(rows);
  await setJson(K.d, merged);
}

export const ensureTodayRecords = () => ensureDailyRecords(dateKey());

export async function delivered(id, proofUri) {
  const ds = await getDeliveries();
  await setJson(K.d, ds.map(x => x.id === id ? { ...x, status: 'delivered', proofUri, deliveredAt: new Date().toISOString() } : x));
}

export async function saveCustomer(input, id) {
  const cs = await getCustomers();
  const clean = { ...input, ratePerLitre: Number(input.ratePerLitre || 0), active: true, stoppedOn: null };
  let targetId = id;
  if (id) await setJson(K.c, cs.map(c => c.id === id ? { ...c, ...clean } : c));
  else { targetId = `c_${Date.now()}`; await setJson(K.c, [...cs, { ...clean, id: targetId, createdOn: dateKey() }]); }
  await ensureTodayRecords();
  const ds = await getDeliveries(); const today = dateKey();
  await setJson(K.d, ds.map(d => d.date === today && d.customerId === targetId && d.status === 'pending' ? { ...d, expectedLitres: litresFrom(clean.milkQuantity), ratePerLitre: Number(clean.ratePerLitre || 0), amount: litresFrom(clean.milkQuantity) * Number(clean.ratePerLitre || 0), areaId: clean.areaId } : d));
}
// Soft delete: the customer is hidden from daily lists but stays in storage so a final bill can still be raised.
export async function deleteCustomer(id) { const cs = await getCustomers(); await setJson(K.c, cs.map(c => c.id === id ? { ...c, active: false, defaultBoyId: null, stoppedOn: dateKey() } : c)); }

export async function saveArea(input, id) { const list = await getAreas(); if (id) await setJson(K.a, list.map(a => a.id === id ? { ...a, name: input.name, active: true } : a)); else await setJson(K.a, [...list, { id: `area_${Date.now()}`, name: input.name, active: true }]); }
export async function deleteArea(id) { const cs = await getCustomers(); if (cs.some(c => c.areaId === id && c.active)) throw new Error('Move or remove customers from this area before deleting it.'); const list = await getAreas(); await setJson(K.a, list.filter(a => a.id !== id)); }

export async function assignCustomers(ids, boyId) {
  const [cs, us] = await Promise.all([getCustomers(), getUsers()]);
  const boy = us.find(u => u.id === boyId && u.role === 'delivery'); if (!boy) throw new Error('Delivery boy not found.');
  if (await isBoyOnLeave(boyId, dateKey())) throw new Error('This delivery boy has an approved leave for today.');
  const conflict = cs.filter(c => ids.includes(c.id) && c.defaultBoyId && c.defaultBoyId !== boyId);
  if (conflict.length) throw new Error(`${conflict[0].name} is already assigned. Use Leave / Cover for temporary coverage.`);
  const updated = cs.map(c => ids.includes(c.id) ? { ...c, defaultBoyId: boyId, areaId: c.areaId || boy.areaId } : c);
  await setJson(K.c, updated); await ensureTodayRecords();
  const t = dateKey(); const ds = await getDeliveries(); await setJson(K.d, ds.map(d => d.date === t && ids.includes(d.customerId) && d.status === 'pending' ? { ...d, boyId } : d));
}
export async function unassignCustomer(id) { const cs = await getCustomers(); await setJson(K.c, cs.map(c => c.id === id ? { ...c, defaultBoyId: null } : c)); const ds = await getDeliveries(); const t = dateKey(); await setJson(K.d, ds.map(d => d.date === t && d.customerId === id && d.status === 'pending' ? { ...d, boyId: null } : d)); }

export async function applyLeaveRequest({ boyId, date, reason }) {
  const rows = await getLeaveRequests();
  const duplicate = rows.find(x => x.boyId === boyId && x.date === date && (x.status === 'pending' || x.status === 'approved'));
  if (duplicate) throw new Error(`A ${duplicate.status} leave request already exists for ${date}.`);
  const record = { id: `leave_${Date.now()}`, boyId, date, reason: String(reason || '').trim(), status: 'pending', createdAt: new Date().toISOString() };
  await setJson(K.lr, [...rows, record]);
  return record;
}

export async function reviewLeaveRequest(id, status) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid leave status.');
  const rows = await getLeaveRequests();
  const target = rows.find(x => x.id === id); if (!target) throw new Error('Leave request not found.');
  if (target.status !== 'pending') throw new Error('This leave request has already been reviewed.');
  const updated = rows.map(x => x.id === id ? { ...x, status, reviewedAt: new Date().toISOString() } : x);
  await setJson(K.lr, updated);
  if (target.date === dateKey()) await ensureDailyRecords(target.date);
  return updated.find(x => x.id === id);
}

export async function createSubstitution({ date, areaId, originalBoyId, substituteBoyId, customerIds }) {
  if (!customerIds?.length) throw new Error('Select at least one customer.');
  if (originalBoyId === substituteBoyId) throw new Error('Substitute must be different from the regular delivery boy.');
  if (await isBoyOnLeave(substituteBoyId, date)) throw new Error('The selected substitute has an approved leave on this date.');
  const subs = await getSubstitutions();
  const existing = subs.find(x => x.date === date && x.customerIds?.some(id => customerIds.includes(id)));
  if (existing) throw new Error('One or more selected customers already have a substitute for this date.');
  const record = { id: `sub_${Date.now()}`, date, areaId, originalBoyId, substituteBoyId, customerIds, createdAt: new Date().toISOString() };
  await setJson(K.sub, [...subs, record]);
  await ensureDailyRecords(date);
  const ds = await getDeliveries();
  await setJson(K.d, ds.map(d => d.date === date && customerIds.includes(d.customerId) && d.status === 'pending' ? { ...d, boyId: substituteBoyId, areaId } : d));
}
export async function removeSubstitution(id) { const subs = await getSubstitutions(); const target = subs.find(x => x.id === id); if (!target) return; await setJson(K.sub, subs.filter(x => x.id !== id)); await ensureDailyRecords(target.date); const ds = await getDeliveries(); const cs = await getCustomers(); const leaveRows = await getLeaveRequests(); const targetIds = target.customerIds || []; const next = []; for (const d of ds) { if (d.date === target.date && targetIds.includes(d.customerId) && d.status === 'pending') { const c = cs.find(x => x.id === d.customerId); const boyId = c ? await effectiveBoyFor(c, await getSubstitutions(), target.date, leaveRows) : null; next.push({ ...d, boyId }); } else next.push(d); } await setJson(K.d, next); }

export async function setBoyLeave(boyId, onLeave) { const us = await getUsers(); await setJson(K.u, us.map(u => u.id === boyId ? { ...u, onLeave } : u)); }

export async function refreshUserSession() { const ss = await session(); if (!ss) return null; const us = await getUsers(); const fresh = us.find(u => u.id === ss.id) || null; if (fresh) await AsyncStorage.setItem(K.s, JSON.stringify(fresh)); return fresh; }

// ───────────────────────── Billing ─────────────────────────
// A bill is one customer + one date range. wa = WhatsApp state:
//   status: pending | opened | sent | delivered | read | failed
export async function createBills(drafts, kind) {
  const existing = await getBills();
  const created = [], skipped = [];
  const now = Date.now();
  drafts.forEach((d, i) => {
    const clash = [...existing, ...created].find(b => b.customerId === d.customerId && b.periodStart <= d.periodEnd && b.periodEnd >= d.periodStart);
    if (clash) { skipped.push({ customerName: d.customerName, reason: `Already billed ${clash.periodStart} to ${clash.periodEnd}` }); return; }
    created.push({
      ...d,
      id: `bill_${now}_${i}_${d.customerId}`,
      kind: kind || (d.periodEnd === cycleDueKey(d.periodEnd) ? 'monthly' : 'manual'),
      cycle: d.periodEnd.slice(0, 7),
      createdAt: new Date().toISOString(),
      wa: { status: 'pending', attempts: 0 },
    });
  });
  if (created.length) await setJson(K.bills, [...existing, ...created]);
  return { created, skipped };
}
export async function updateBillWa(id, patch) {
  const rows = await getBills();
  let next = null;
  await setJson(K.bills, rows.map(b => { if (b.id !== id) return b; next = { ...b, wa: { ...b.wa, ...patch, updatedAt: new Date().toISOString() } }; return next; }));
  return next;
}
export async function deleteBill(id) { const rows = await getBills(); await setJson(K.bills, rows.filter(b => b.id !== id)); }

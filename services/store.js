import AsyncStorage from '@react-native-async-storage/async-storage';
import { users, areas, customers } from '../data/demoData';
import { parseLitres, cycleDueKey } from './billing';
import * as api from './apiClient';

const K = { u: 'a2_users', a: 'a2_areas', c: 'a2_customers', d: 'a2_daily_deliveries', sub: 'a2_substitutions', lr: 'a2_leave_requests', s: 'a2_session', bills: 'a2_bills' };
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (date, amount) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount); return d; };
export const money = n => `₹${Number(n || 0).toFixed(0)}`;
export const litresFrom = value => parseLitres(value);

async function getJson(key, fallback = []) { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
async function setJson(key, value) { await AsyncStorage.setItem(key, JSON.stringify(value)); }

const asList = (v) => Array.isArray(v) ? v : [];

async function apiList(resource) {
  if (!(await api.getToken())) return [];
  try { return asList(await api.list(resource)); }
  catch (err) {
    if (api.isAuthError(err)) throw err;
    return [];
  }
}

export async function bootstrap() {
  if (api.apiEnabled()) {
    const token = await api.getToken();
    if (!token) return;
    try { await api.getBootstrap(); }
    catch (err) {
      console.warn('Bootstrap', err);
    }
    return;
  }
  if (!(await AsyncStorage.getItem(K.u))) await AsyncStorage.multiSet([[K.u, JSON.stringify(users)], [K.a, JSON.stringify(areas)], [K.c, JSON.stringify(customers)], [K.d, '[]'], [K.sub, '[]'], [K.lr, '[]']]);
  if (!(await AsyncStorage.getItem(K.lr))) await AsyncStorage.setItem(K.lr, '[]');
  if (!(await AsyncStorage.getItem(K.bills))) await AsyncStorage.setItem(K.bills, '[]');
  await ensureTodayRecords();
}
function uniqueByIdName(list) {
  const seenId = new Set();
  const seenName = new Set();
  const out = [];
  for (const x of asList(list)) {
    const id = String(x?.id ?? '');
    const name = String(x?.name ?? '').trim().toLowerCase();
    if (id && seenId.has(id)) continue;
    if (name && seenName.has(name)) continue;
    if (id) seenId.add(id);
    if (name) seenName.add(name);
    out.push(x);
  }
  return out;
}

export const getUsers = () => api.apiEnabled() ? apiList('users') : getJson(K.u);
export const getAreas = async () => uniqueByIdName(api.apiEnabled() ? await apiList('areas') : await getJson(K.a));
export const getCustomers = () => api.apiEnabled() ? apiList('customers') : getJson(K.c);
export const getDeliveries = () => api.apiEnabled() ? apiList('deliveries') : getJson(K.d);
export const getSubstitutions = () => api.apiEnabled() ? apiList('substitutions') : getJson(K.sub);
export const getLeaveRequests = () => api.apiEnabled() ? apiList('leave_requests') : getJson(K.lr);
export const getBills = () => api.apiEnabled() ? apiList('bills') : getJson(K.bills);
export async function login(e, p) {
  if (api.apiEnabled()) { try { const u = await api.loginApi(e, p); await AsyncStorage.setItem(K.s, JSON.stringify(u)); return u; } catch (err) { if (/Invalid email or password/i.test(err.message)) return null; throw err; } }
  const u = (await getUsers()).find(x => x.email.toLowerCase() === e.toLowerCase() && x.password === p); if (u) await AsyncStorage.setItem(K.s, JSON.stringify(u)); return u || null;
}
export async function session() {
  if (api.apiEnabled()) {
    const token = await api.getToken();
    if (!token) { await AsyncStorage.removeItem(K.s); return null; }
    const x = await AsyncStorage.getItem(K.s);
    if (x) return JSON.parse(x);
    try { const u = await api.me(); if (u) await AsyncStorage.setItem(K.s, JSON.stringify(u)); return u; }
    catch { await api.clearToken(); return null; }
  }
  const x = await AsyncStorage.getItem(K.s); return x ? JSON.parse(x) : null;
}
export async function logout() { if (api.apiEnabled()) await api.logoutApi(); await AsyncStorage.removeItem(K.s); }

export async function createDeliveryBoy({ name, email, password, areaId }) {
  const n = String(name || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');
  if (!n || !em || pw.length < 8) throw new Error('Name, email and password (8+ characters) are required.');
  if (api.apiEnabled()) {
    return api.createUser({ id: `boy_${Date.now()}`, name: n, email: em, password: pw, role: 'delivery', areaId: areaId || null });
  }
  const us = await getUsers();
  if (us.some(u => String(u.email || '').toLowerCase() === em)) throw new Error('That email is already in use.');
  const row = { id: `boy_${Date.now()}`, name: n, email: em, password: pw, role: 'delivery', areaId: areaId || null, onLeave: false, active: true };
  await setJson(K.u, [...us, row]);
  return row;
}

export async function updateDeliveryBoy(id, { name, email, password, areaId, active }) {
  const n = String(name || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');
  if (!id) throw new Error('Delivery boy is missing.');
  if (!n || !em) throw new Error('Name and email are required.');
  if (pw && pw.length < 8) throw new Error('Password must be at least 8 characters, or leave it blank to keep the current password.');
  if (api.apiEnabled()) {
    const body = { name: n, email: em, role: 'delivery', areaId: areaId || null, active: active !== false };
    if (pw) body.password = pw;
    return api.updateUser(id, body);
  }
  const us = await getUsers();
  if (us.some(u => String(u.id) !== String(id) && String(u.email || '').toLowerCase() === em)) throw new Error('That email is already in use.');
  await setJson(K.u, us.map(u => String(u.id) === String(id) ? { ...u, name: n, email: em, areaId: areaId || null, active: active !== false, ...(pw ? { password: pw } : {}) } : u));
}

export async function deleteDeliveryBoy(id) {
  if (!id) throw new Error('Delivery boy is missing.');
  const us = await getUsers();
  const boy = us.find((u) => String(u.id) === String(id) && String(u.role || '').toLowerCase() === 'delivery');
  if (!boy) throw new Error('Delivery boy not found.');
  const cs = await getCustomers();
  const assigned = cs.filter((c) => String(c.defaultBoyId) === String(id) && c.active !== false && c.active !== 0);
  if (api.apiEnabled()) {
    for (const c of assigned) await api.save('customers', { ...c, defaultBoyId: null });
    await api.updateUser(id, { name: boy.name, email: boy.email, role: 'delivery', areaId: boy.areaId || null, active: false });
    return;
  }
  await setJson(K.c, cs.map((c) => String(c.defaultBoyId) === String(id) ? { ...c, defaultBoyId: null } : c));
  await setJson(K.u, us.map((u) => String(u.id) === String(id) ? { ...u, active: false } : u));
}

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
  if (api.apiEnabled()) {
    if (!(await api.getToken())) return;
    try { await api.getBootstrap(); } catch (err) { if (api.isAuthError(err)) throw err; }
    return;
  }
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
  if (api.apiEnabled()) { await api.markDelivered(id, proofUri); return; }
  const ds = await getDeliveries();
  await setJson(K.d, ds.map(x => x.id === id ? { ...x, status: 'delivered', proofUri, deliveredAt: new Date().toISOString() } : x));
}

export async function saveCustomer(input, id) {
  const clean = { ...input, ratePerLitre: Number(input.ratePerLitre || 0), active: true, stoppedOn: null };
  if (api.apiEnabled()) {
    const cs = await getCustomers();
    const prev = id ? cs.find(c => c.id === id) || {} : {};
    const row = { ...prev, ...clean, id: id || `c_${Date.now()}`, createdOn: prev.createdOn || dateKey() };
    await api.save('customers', row);
    await ensureTodayRecords();
    return;
  }
  const cs = await getCustomers();
  let targetId = id;
  if (id) await setJson(K.c, cs.map(c => c.id === id ? { ...c, ...clean } : c));
  else { targetId = `c_${Date.now()}`; await setJson(K.c, [...cs, { ...clean, id: targetId, createdOn: dateKey() }]); }
  await ensureTodayRecords();
  const ds = await getDeliveries(); const today = dateKey();
  await setJson(K.d, ds.map(d => d.date === today && d.customerId === targetId && d.status === 'pending' ? { ...d, expectedLitres: litresFrom(clean.milkQuantity), ratePerLitre: Number(clean.ratePerLitre || 0), amount: litresFrom(clean.milkQuantity) * Number(clean.ratePerLitre || 0), areaId: clean.areaId } : d));
}
// Soft delete: the customer is hidden from daily lists but stays in storage so a final bill can still be raised.
export async function deleteCustomer(id) { if (api.apiEnabled()) { const cs = await getCustomers(); const c = cs.find(x => x.id === id); if (c) await api.save('customers', { ...c, active: false, defaultBoyId: null, stoppedOn: dateKey() }); return; } const cs = await getCustomers(); await setJson(K.c, cs.map(c => c.id === id ? { ...c, active: false, defaultBoyId: null, stoppedOn: dateKey() } : c)); }

export async function saveArea(input, id) { if (api.apiEnabled()) { const list = await getAreas(); const row = await api.save('areas', { id: id || `area_${Date.now()}`, name: input.name, active: true }); await setJson(K.a, [...list.filter(x => x.id !== row.id), row]); return row; } const list = await getAreas(); if (id) await setJson(K.a, list.map(a => a.id === id ? { ...a, name: input.name, active: true } : a)); else await setJson(K.a, [...list, { id: `area_${Date.now()}`, name: input.name, active: true }]); }
export async function deleteArea(id) { if (api.apiEnabled()) { const cs = await getCustomers(); if (cs.some(c => c.areaId === id && c.active)) throw new Error('Move or remove customers from this area before deleting it.'); await api.remove('areas', id); return; } const cs = await getCustomers(); if (cs.some(c => c.areaId === id && c.active)) throw new Error('Move or remove customers from this area before deleting it.'); const list = await getAreas(); await setJson(K.a, list.filter(a => a.id !== id)); }

export async function assignCustomers(ids, boyId) {
  const [cs, us] = await Promise.all([getCustomers(), getUsers()]);
  const boy = us.find(u => u.id === boyId && u.role === 'delivery'); if (!boy) throw new Error('Delivery boy not found.');
  if (await isBoyOnLeave(boyId, dateKey())) throw new Error('This delivery boy has an approved leave for today.');
  const conflict = cs.filter(c => ids.includes(c.id) && c.defaultBoyId && c.defaultBoyId !== boyId);
  if (conflict.length) throw new Error(`${conflict[0].name} is already assigned. Use Leave / Cover for temporary coverage.`);
  const updated = cs.map(c => ids.includes(c.id) ? { ...c, defaultBoyId: boyId, areaId: c.areaId || boy.areaId } : c);
  if (api.apiEnabled()) {
    for (const c of updated.filter(x => ids.includes(x.id))) await api.save('customers', c);
    await ensureTodayRecords();
    return;
  }
  await setJson(K.c, updated); await ensureTodayRecords();
  const t = dateKey(); const ds = await getDeliveries(); await setJson(K.d, ds.map(d => d.date === t && ids.includes(d.customerId) && d.status === 'pending' ? { ...d, boyId } : d));
}
export async function unassignCustomer(id) { if (api.apiEnabled()) { const cs=await getCustomers(); const c=cs.find(x=>x.id===id); if(c) await api.save('customers',{...c,defaultBoyId:null}); for (const d of (await getDeliveries()).filter(x=>x.date===dateKey()&&x.customerId===id&&x.status==='pending')) await api.save('deliveries',{...d,boyId:null}); await bootstrap(); return; } const cs = await getCustomers(); await setJson(K.c, cs.map(c => c.id === id ? { ...c, defaultBoyId: null } : c)); const ds = await getDeliveries(); const t = dateKey(); await setJson(K.d, ds.map(d => d.date === t && d.customerId === id && d.status === 'pending' ? { ...d, boyId: null } : d)); }

export async function applyLeaveRequest({ boyId, date, reason }) {
  const rows = await getLeaveRequests();
  const duplicate = rows.find(x => x.boyId === boyId && x.date === date && (x.status === 'pending' || x.status === 'approved'));
  if (duplicate) throw new Error(`A ${duplicate.status} leave request already exists for ${date}.`);
  const record = { id: `leave_${Date.now()}`, boyId, date, reason: String(reason || '').trim(), status: 'pending', createdAt: new Date().toISOString() };
  if (api.apiEnabled()) return api.save('leave_requests', record);
  await setJson(K.lr, [...rows, record]);
  return record;
}

export async function reviewLeaveRequest(id, status) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid leave status.');
  const rows = await getLeaveRequests();
  const target = rows.find(x => x.id === id); if (!target) throw new Error('Leave request not found.');
  if (target.status !== 'pending') throw new Error('This leave request has already been reviewed.');
  const next = { ...target, status, reviewedAt: new Date().toISOString() };
  if (api.apiEnabled()) {
    await api.save('leave_requests', next);
    if (target.date === dateKey()) await ensureDailyRecords(target.date);
    return next;
  }
  const updated = rows.map(x => x.id === id ? next : x);
  await setJson(K.lr, updated);
  if (target.date === dateKey()) await ensureDailyRecords(target.date);
  return next;
}

export async function createSubstitution({ date, areaId, originalBoyId, substituteBoyId, customerIds }) {
  if (!customerIds?.length) throw new Error('Select at least one customer.');
  if (originalBoyId === substituteBoyId) throw new Error('Substitute must be different from the regular delivery boy.');
  if (await isBoyOnLeave(substituteBoyId, date)) throw new Error('The selected substitute has an approved leave on this date.');
  const subs = await getSubstitutions();
  const existing = subs.find(x => x.date === date && x.customerIds?.some(id => customerIds.includes(id)));
  if (existing) throw new Error('One or more selected customers already have a substitute for this date.');
  const record = { id: `sub_${Date.now()}`, date, areaId, originalBoyId, substituteBoyId, customerIds, createdAt: new Date().toISOString() };
  if (api.apiEnabled()) { await api.save('substitutions', record); await ensureDailyRecords(date); return; }
  await setJson(K.sub, [...subs, record]);
  await ensureDailyRecords(date);
  const ds = await getDeliveries();
  await setJson(K.d, ds.map(d => d.date === date && customerIds.includes(d.customerId) && d.status === 'pending' ? { ...d, boyId: substituteBoyId, areaId } : d));
}
export async function removeSubstitution(id) { if (api.apiEnabled()) { await api.remove('substitutions',id); await bootstrap(); return; } const subs = await getSubstitutions(); const target = subs.find(x => x.id === id); if (!target) return; await setJson(K.sub, subs.filter(x => x.id !== id)); await ensureDailyRecords(target.date); const ds = await getDeliveries(); const cs = await getCustomers(); const leaveRows = await getLeaveRequests(); const targetIds = target.customerIds || []; const next = []; for (const d of ds) { if (d.date === target.date && targetIds.includes(d.customerId) && d.status === 'pending') { const c = cs.find(x => x.id === d.customerId); const boyId = c ? await effectiveBoyFor(c, await getSubstitutions(), target.date, leaveRows) : null; next.push({ ...d, boyId }); } else next.push(d); } await setJson(K.d, next); }

export async function setBoyLeave(boyId, onLeave) { if (api.apiEnabled()) { const us=await getUsers(); const u=us.find(x=>x.id===boyId); if(u) await api.save('users',{...u,onLeave}); return; } const us = await getUsers(); await setJson(K.u, us.map(u => u.id === boyId ? { ...u, onLeave } : u)); }

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
  if (created.length) {
    if (api.apiEnabled()) { for (const bill of created) await api.save('bills', bill); }
    else await setJson(K.bills, [...existing, ...created]);
  }
  return { created, skipped };
}
export async function updateBillWa(id, patch) {
  const rows = await getBills();
  const cur = rows.find(b => b.id === id);
  if (!cur) return null;
  const next = { ...cur, wa: { ...cur.wa, ...patch, updatedAt: new Date().toISOString() } };
  if (api.apiEnabled()) { await api.save('bills', next); return next; }
  await setJson(K.bills, rows.map(b => (b.id === id ? next : b)));
  return next;
}
export async function deleteBill(id) { if (api.apiEnabled()) { await api.remove('bills',id); const rows=await getBills(); await setJson(K.bills,rows.filter(b=>b.id!==id)); return; } const rows = await getBills(); await setJson(K.bills, rows.filter(b => b.id !== id)); }

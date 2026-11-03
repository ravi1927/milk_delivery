import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseLitres, cycleDueKey } from './billing';
import { requiredCustomerLogin } from './customerLogin';
import { parsePoint } from './geo';
import * as api from './apiClient';

const K = { u: 'a2_users', a: 'a2_areas', c: 'a2_customers', d: 'a2_daily_deliveries', sub: 'a2_substitutions', lr: 'a2_leave_requests', s: 'a2_session', bills: 'a2_bills', skips: 'a2_skip_requests' };
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const SKIP_DATE_MESSAGE = 'Choose a date at least one day ahead. Today and past dates cannot be skipped.';
export const UNDO_SKIP_MESSAGE = 'This delivery day has started, so this skip cannot be undone.';
export const addDays = (date, amount) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount); return d; };
export const money = n => `₹${Number(n || 0).toFixed(0)}`;
export const litresFrom = value => parseLitres(value);

const same = (a, b) => String(a ?? '') === String(b ?? '');
const asList = (v) => Array.isArray(v) ? v : [];
const isActive = (row) => row && row.active !== false && row.active !== 0 && row.active !== '0';

async function getJson(key, fallback = []) { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
async function setJson(key, value) { await AsyncStorage.setItem(key, JSON.stringify(value)); }

function sessionUser(user) {
  if (!user || typeof user !== 'object') return null;
  const { password, password_hash, token, access_token, ...rest } = user;
  return rest;
}

async function apiList(resource) {
  if (!(await api.getToken())) throw new Error('Please sign in again.');
  return asList(await api.list(resource));
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

export async function bootstrap() {
  if (api.apiEnabled()) {
    const token = await api.getToken();
    if (!token) return;
    try { await api.getBootstrap(); }
    catch (err) {
      if (api.isAuthError(err)) { await api.clearToken(); await AsyncStorage.removeItem(K.s); return; }
      console.warn('Bootstrap', err);
    }
    return;
  }
  if (!(await AsyncStorage.getItem(K.u))) await AsyncStorage.multiSet([[K.u, '[]'], [K.a, '[]'], [K.c, '[]'], [K.d, '[]'], [K.sub, '[]'], [K.lr, '[]']]);
  if (!(await AsyncStorage.getItem(K.lr))) await AsyncStorage.setItem(K.lr, '[]');
  if (!(await AsyncStorage.getItem(K.bills))) await AsyncStorage.setItem(K.bills, '[]');
  await ensureTodayRecords();
}

export const getUsers = () => api.apiEnabled() ? apiList('users') : getJson(K.u);
export const getAreas = async () => uniqueByIdName(api.apiEnabled() ? await apiList('areas') : await getJson(K.a));
export const getCustomers = () => api.apiEnabled() ? apiList('customers') : getJson(K.c);
export const getDeliveries = () => api.apiEnabled() ? apiList('deliveries') : getJson(K.d);
export const getSubstitutions = () => api.apiEnabled() ? apiList('substitutions') : getJson(K.sub);
export const getLeaveRequests = () => api.apiEnabled() ? apiList('leave_requests') : getJson(K.lr);
export const getBills = () => api.apiEnabled() ? apiList('bills') : getJson(K.bills);
export async function getSkipRequests() {
  if (!api.apiEnabled()) return getJson(K.skips, []);
  try { return asList(await api.list('skip_requests')); }
  catch (err) {
    if (/not found|migration|missing|permission required/i.test(String(err?.message || ''))) return [];
    throw err;
  }
}

export async function login(email, password) {
  const e = String(email || '').trim();
  const p = String(password || '');
  if (!e || !p) return null;
  if (api.apiEnabled()) {
    try {
      const user = sessionUser(await api.loginApi(e, p));
      await AsyncStorage.setItem(K.s, JSON.stringify(user));
      try { await api.getBootstrap(); } catch (err) { console.warn('Bootstrap after login', err); }
      return user;
    } catch (err) {
      if (/Invalid email or password/i.test(err.message)) return null;
      throw err;
    }
  }
  const u = (await getUsers()).find(x => x.email.toLowerCase() === e.toLowerCase() && x.password === p);
  if (u) await AsyncStorage.setItem(K.s, JSON.stringify(sessionUser(u)));
  return u ? sessionUser(u) : null;
}

export async function session() {
  if (api.apiEnabled()) {
    const token = await api.getToken();
    if (!token) { await AsyncStorage.removeItem(K.s); return null; }
    const cached = await AsyncStorage.getItem(K.s);
    if (cached) return sessionUser(JSON.parse(cached));
    try {
      const user = sessionUser(await api.me());
      if (user) await AsyncStorage.setItem(K.s, JSON.stringify(user));
      return user;
    } catch {
      await api.clearToken();
      await AsyncStorage.removeItem(K.s);
      return null;
    }
  }
  const x = await AsyncStorage.getItem(K.s);
  return x ? sessionUser(JSON.parse(x)) : null;
}

export async function logout() {
  if (api.apiEnabled()) await api.logoutApi();
  await AsyncStorage.removeItem(K.s);
}

export async function createDeliveryBoy({ name, email, password, areaId }) {
  const n = String(name || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');
  if (!n || !em || pw.length < 8) throw new Error('Name, email and password (8+ characters) are required.');
  if (api.apiEnabled()) return api.createUser({ id: `boy_${Date.now()}`, name: n, email: em, password: pw, role: 'delivery', areaId: areaId || null });
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
  if (us.some(u => !same(u.id, id) && String(u.email || '').toLowerCase() === em)) throw new Error('That email is already in use.');
  await setJson(K.u, us.map(u => same(u.id, id) ? { ...u, name: n, email: em, areaId: areaId || null, active: active !== false, ...(pw ? { password: pw } : {}) } : u));
}

export async function deleteDeliveryBoy(id) {
  if (!id) throw new Error('Delivery boy is missing.');
  const us = await getUsers();
  const boy = us.find((u) => same(u.id, id) && String(u.role || '').toLowerCase() === 'delivery');
  if (!boy) throw new Error('Delivery boy not found.');
  const cs = await getCustomers();
  const assigned = cs.filter((c) => same(c.defaultBoyId, id) && isActive(c));
  if (api.apiEnabled()) {
    for (const c of assigned) await api.save('customers', { ...c, defaultBoyId: null });
    await api.updateUser(id, { name: boy.name, email: boy.email, role: 'delivery', areaId: boy.areaId || null, active: false });
    return;
  }
  await setJson(K.c, cs.map((c) => same(c.defaultBoyId, id) ? { ...c, defaultBoyId: null } : c));
  await setJson(K.u, us.map((u) => same(u.id, id) ? { ...u, active: false } : u));
}

export async function isBoyOnLeave(boyId, day = dateKey()) {
  const rows = await getLeaveRequests();
  return rows.some(x => same(x.boyId, boyId) && x.date === day && x.status === 'approved');
}

async function effectiveBoyFor(customer, subs, day, leaveRows) {
  const match = subs.find(x => x.date === day && (x.customerIds || []).some(id => same(id, customer.id)));
  if (match) return match.substituteBoyId || null;
  const leave = leaveRows.some(x => same(x.boyId, customer.defaultBoyId) && x.date === day && x.status === 'approved');
  return leave ? null : (customer.defaultBoyId || null);
}

async function syncPendingAssignments(day) {
  const raw = await AsyncStorage.getItem(K.s);
  const me = raw ? JSON.parse(raw) : null;
  if (me?.role && me.role !== 'admin') return;
  let cs, ds, subs, leaveRows;
  try {
    [cs, ds, subs, leaveRows] = await Promise.all([getCustomers(), getDeliveries(), getSubstitutions(), getLeaveRequests()]);
  } catch (err) {
    if (/permission required|403/i.test(String(err?.message || ''))) return;
    throw err;
  }
  for (const c of cs.filter(isActive)) {
    const old = ds.find(d => d.date === day && same(d.customerId, c.id));
    if (!old || old.status !== 'pending') continue;
    const boyId = await effectiveBoyFor(c, subs, day, leaveRows);
    const litres = litresFrom(c.milkQuantity);
    const rate = Number(c.ratePerLitre || 0);
    const changed = !same(old.boyId, boyId)
      || !same(old.areaId, c.areaId)
      || Number(old.expectedLitres) !== litres
      || Number(old.ratePerLitre) !== rate;
    if (!changed) continue;
    await api.save('deliveries', { ...old, boyId, areaId: c.areaId, expectedLitres: litres, ratePerLitre: rate, amount: litres * rate });
  }
}

export async function ensureDailyRecords(day = dateKey()) {
  if (api.apiEnabled()) {
    if (!(await api.getToken())) return;
    await api.getBootstrap();
    await syncPendingAssignments(day);
    return;
  }
  const [cs, ds, subs, leaveRows, skips] = await Promise.all([getCustomers(), getDeliveries(), getSubstitutions(), getLeaveRequests(), getSkipRequests()]);
  const skipped = new Set(skips.filter((s) => s.date === day).map((s) => String(s.customerRecordId || s.customerId || '')));
  const existing = new Map(ds.filter(x => x.date === day).map(x => [x.customerId, x]));
  const rows = [];
  for (const c of cs.filter(isActive)) {
    if (skipped.has(String(c.id))) {
      const old = existing.get(c.id);
      if (old && old.status !== 'pending') rows.push(old);
      continue;
    }
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

function isLocalProof(uri) {
  const value = String(uri || '');
  return /^(file:|content:|ph:|blob:|data:|assets-library:)/i.test(value);
}

export async function delivered(id, proofUri) {
  if (api.apiEnabled()) {
    if (isLocalProof(proofUri)) { await api.uploadDeliveryProof(id, proofUri); return; }
    await api.markDelivered(id, proofUri);
    return;
  }
  const ds = await getDeliveries();
  await setJson(K.d, ds.map(x => x.id === id ? { ...x, status: 'delivered', proofUri, deliveredAt: new Date().toISOString(), proofCreatedAt: new Date().toISOString() } : x));
}

export async function cleanupOldProofs() {
  if (!api.apiEnabled()) throw new Error('Photo cleanup runs on the server.');
  return api.cleanupOldPhotos();
}

function withoutLogin(input) {
  const fields = { ...input };
  delete fields.email;
  delete fields.password;
  delete fields.customerRecordId;
  return fields;
}

function customerLoginOrThrow(email, password) {
  const login = requiredCustomerLogin(email, password);
  if (!login) throw new Error('Enter a login email and a password of at least 8 characters. Both are required to save the customer.');
  return login;
}

async function syncCustomerLogin(customer, email, password) {
  const login = customerLoginOrThrow(email, password);
  const users = await getUsers();
  const existing = users.find((u) => String(u.role) === 'customer' && same(u.customerRecordId, customer.id));
  if (users.some((u) => !same(u.id, existing?.id) && String(u.email || '').toLowerCase() === login.email)) throw new Error('That email is already used by another login.');
  if (api.apiEnabled()) {
    if (existing) {
      await api.updateUser(existing.id, { name: customer.name, email: login.email, role: 'customer', customerRecordId: customer.id, active: true, password: login.password });
    } else {
      await api.createUser({ id: `cu_${customer.id}`.slice(0, 64), name: customer.name, email: login.email, password: login.password, role: 'customer', customerRecordId: customer.id });
    }
    return;
  }
  if (existing) {
    await setJson(K.u, users.map((u) => same(u.id, existing.id) ? { ...u, name: customer.name, email: login.email, role: 'customer', customerRecordId: customer.id, active: true, password: login.password } : u));
    return;
  }
  const row = { id: `cu_${customer.id}`.slice(0, 64), name: customer.name, email: login.email, password: login.password, role: 'customer', customerRecordId: customer.id, active: true };
  await setJson(K.u, [...users, row]);
}

function customerPayload(input, prev, id) {
  const point = parsePoint(input.latitude, input.longitude);
  const clean = {
    ...prev,
    ...input,
    ratePerLitre: Number(input.ratePerLitre || 0),
    active: true,
    stoppedOn: null,
    latitude: point ? point.latitude : null,
    longitude: point ? point.longitude : null,
    id: id || prev.id || `c_${Date.now()}`,
    createdOn: prev.createdOn || dateKey(),
  };
  delete clean.password;
  delete clean.password_hash;
  delete clean.email;
  if (!Object.prototype.hasOwnProperty.call(input, 'defaultBoyId')) clean.defaultBoyId = prev.defaultBoyId ?? null;
  return clean;
}

function emailTaken(users, email, exceptId) {
  return users.some((u) => !same(u.id, exceptId) && String(u.email || '').toLowerCase() === email);
}

export async function saveCustomer(input, id) {
  const login = customerLoginOrThrow(input.email, input.password);
  const fields = withoutLogin(input);
  const point = parsePoint(fields.latitude, fields.longitude);
  const clean = { ...fields, ratePerLitre: Number(fields.ratePerLitre || 0), active: true, stoppedOn: null, latitude: point ? point.latitude : null, longitude: point ? point.longitude : null };
  if (api.apiEnabled()) {
    const cs = await getCustomers();
    const prev = id ? cs.find(c => same(c.id, id)) || {} : {};
    const row = customerPayload(fields, prev, id || `c_${Date.now()}`);
    const users = await getUsers();
    const existing = users.find((u) => String(u.role) === 'customer' && same(u.customerRecordId, row.id));
    if (emailTaken(users, login.email, existing?.id)) throw new Error('That email is already used by another login.');
    await api.save('customers', row);
    await syncCustomerLogin(row, login.email, login.password);
    await ensureTodayRecords();
    return row;
  }
  const cs = await getCustomers();
  const targetId = id || `c_${Date.now()}`;
  const users = await getUsers();
  const existing = users.find((u) => String(u.role) === 'customer' && same(u.customerRecordId, targetId));
  if (emailTaken(users, login.email, existing?.id)) throw new Error('That email is already used by another login.');
  if (id) await setJson(K.c, cs.map(c => c.id === id ? { ...c, ...clean } : c));
  else await setJson(K.c, [...cs, { ...clean, id: targetId, createdOn: dateKey() }]);
  await syncCustomerLogin({ ...clean, id: targetId }, login.email, login.password);
  await ensureTodayRecords();
  const ds = await getDeliveries(); const today = dateKey();
  await setJson(K.d, ds.map(d => d.date === today && d.customerId === targetId && d.status === 'pending' ? { ...d, expectedLitres: litresFrom(clean.milkQuantity), ratePerLitre: Number(clean.ratePerLitre || 0), amount: litresFrom(clean.milkQuantity) * Number(clean.ratePerLitre || 0), areaId: clean.areaId } : d));
  return { ...clean, id: targetId };
}

export async function deleteCustomer(id) {
  if (api.apiEnabled()) {
    const cs = await getCustomers();
    const c = cs.find(x => same(x.id, id));
    if (c) await api.save('customers', { ...c, active: false, defaultBoyId: null, stoppedOn: dateKey() });
    try {
      const users = await getUsers();
      const login = users.find((u) => u.role === 'customer' && same(u.customerRecordId, id));
      if (login) await api.updateUser(login.id, { name: login.name, email: login.email, role: 'customer', customerRecordId: id, active: false });
    } catch (err) { console.warn('Could not disable customer login', err); }
    return;
  }
  const cs = await getCustomers();
  await setJson(K.c, cs.map(c => c.id === id ? { ...c, active: false, defaultBoyId: null, stoppedOn: dateKey() } : c));
}

export async function saveArea(input, id) {
  if (api.apiEnabled()) {
    const row = await api.save('areas', { id: id || `area_${Date.now()}`, name: input.name, active: true });
    return row;
  }
  const list = await getAreas();
  if (id) await setJson(K.a, list.map(a => a.id === id ? { ...a, name: input.name, active: true } : a));
  else await setJson(K.a, [...list, { id: `area_${Date.now()}`, name: input.name, active: true }]);
}

export async function deleteArea(id) {
  const cs = await getCustomers();
  if (cs.some(c => same(c.areaId, id) && isActive(c))) throw new Error('Move or remove customers from this area before deleting it.');
  if (api.apiEnabled()) { await api.remove('areas', id); return; }
  const list = await getAreas();
  await setJson(K.a, list.filter(a => a.id !== id));
}

export async function assignCustomers(ids, boyId) {
  const [cs, us] = await Promise.all([getCustomers(), getUsers()]);
  const boy = us.find(u => same(u.id, boyId) && u.role === 'delivery');
  if (!boy) throw new Error('Delivery boy not found.');
  if (await isBoyOnLeave(boyId, dateKey())) throw new Error('This delivery boy has an approved leave for today.');
  const conflict = cs.filter(c => ids.some(id => same(id, c.id)) && c.defaultBoyId && !same(c.defaultBoyId, boyId));
  if (conflict.length) throw new Error(`${conflict[0].name} is already assigned. Use Leave / Cover for temporary coverage.`);
  const updated = cs.map(c => ids.some(id => same(id, c.id)) ? { ...c, defaultBoyId: boyId, areaId: c.areaId || boy.areaId } : c);
  if (api.apiEnabled()) {
    for (const c of updated.filter(x => ids.some(id => same(id, x.id)))) await api.save('customers', c);
    await ensureTodayRecords();
    return;
  }
  await setJson(K.c, updated);
  await ensureTodayRecords();
  const t = dateKey();
  const ds = await getDeliveries();
  await setJson(K.d, ds.map(d => d.date === t && ids.some(id => same(id, d.customerId)) && d.status === 'pending' ? { ...d, boyId } : d));
}

export async function unassignCustomer(id) {
  if (api.apiEnabled()) {
    const cs = await getCustomers();
    const c = cs.find(x => same(x.id, id));
    if (c) await api.save('customers', { ...c, defaultBoyId: null });
    await ensureTodayRecords();
    return;
  }
  const cs = await getCustomers();
  await setJson(K.c, cs.map(c => c.id === id ? { ...c, defaultBoyId: null } : c));
  const ds = await getDeliveries();
  const t = dateKey();
  await setJson(K.d, ds.map(d => d.date === t && d.customerId === id && d.status === 'pending' ? { ...d, boyId: null } : d));
}

export async function requestSkip({ date, reason }) {
  const day = String(date || '');
  const why = String(reason || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose a date.');
  if (day <= dateKey()) throw new Error(SKIP_DATE_MESSAGE);
  if (!why) throw new Error('Enter a reason for the skip.');
  if (why.length > 500) throw new Error('Reason must be 500 characters or fewer.');
  if (api.apiEnabled()) return api.save('skip_requests', { date: day, reason: why });
  const me = await session();
  const cid = me?.customerRecordId;
  if (!cid) throw new Error('This login is not linked to a customer.');
  const rows = await getJson(K.skips, []);
  if (rows.some((r) => r.date === day && same(r.customerRecordId, cid))) throw new Error('A skip is already requested for that date.');
  const record = { id: `skip_${Date.now()}`, customerRecordId: cid, date: day, reason: why, seen: false, createdAt: new Date().toISOString() };
  await setJson(K.skips, [...rows, record]);
  await ensureDailyRecords(day);
  return record;
}

export async function undoSkip(id) {
  const key = String(id || '');
  if (!key) throw new Error('Skip request not found.');
  const rows = await getSkipRequests();
  const row = rows.find((r) => same(r.id, key));
  if (!row) throw new Error('Skip request not found.');
  const day = String(row.date || '').slice(0, 10);
  if (day <= dateKey()) throw new Error(UNDO_SKIP_MESSAGE);
  if (api.apiEnabled()) return api.undoSkip(key);
  const me = await session();
  const mine = me?.customerRecordId;
  if (!mine || !same(mine, row.customerRecordId)) throw new Error('You can only undo your own skip.');
  await setJson(K.skips, rows.filter((r) => !same(r.id, key)));
  await ensureDailyRecords(day);
  return { ok: true, deletedId: key, date: day };
}

export async function acknowledgeSkip(id) {
  if (api.apiEnabled()) return api.ackSkip(id);
  const rows = await getJson(K.skips, []);
  const next = rows.map((r) => same(r.id, id) ? { ...r, seen: true } : r);
  await setJson(K.skips, next);
  return next.find((r) => same(r.id, id)) || null;
}

export async function applyLeaveRequest({ boyId, date, reason }) {
  const rows = await getLeaveRequests();
  const duplicate = rows.find(x => same(x.boyId, boyId) && x.date === date && (x.status === 'pending' || x.status === 'approved'));
  if (duplicate) throw new Error(`A ${duplicate.status} leave request already exists for ${date}.`);
  const record = { id: `leave_${Date.now()}`, boyId, date, reason: String(reason || '').trim(), status: 'pending', createdAt: new Date().toISOString() };
  if (api.apiEnabled()) return api.save('leave_requests', record);
  await setJson(K.lr, [...rows, record]);
  return record;
}

export async function reviewLeaveRequest(id, status) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid leave status.');
  const rows = await getLeaveRequests();
  const target = rows.find(x => same(x.id, id));
  if (!target) throw new Error('Leave request not found.');
  if (target.status !== 'pending') throw new Error('This leave request has already been reviewed.');
  const next = { ...target, status, reviewedAt: new Date().toISOString() };
  if (api.apiEnabled()) {
    await api.save('leave_requests', next);
    if (target.date === dateKey()) await ensureDailyRecords(target.date);
    return next;
  }
  await setJson(K.lr, rows.map(x => same(x.id, id) ? next : x));
  if (target.date === dateKey()) await ensureDailyRecords(target.date);
  return next;
}

export async function createSubstitution({ date, areaId, originalBoyId, substituteBoyId, customerIds }) {
  if (!customerIds?.length) throw new Error('Select at least one customer.');
  if (same(originalBoyId, substituteBoyId)) throw new Error('Substitute must be different from the regular delivery boy.');
  if (await isBoyOnLeave(substituteBoyId, date)) throw new Error('The selected substitute has an approved leave on this date.');
  const subs = await getSubstitutions();
  const existing = subs.find(x => x.date === date && (x.customerIds || []).some(id => customerIds.some(picked => same(picked, id))));
  if (existing) throw new Error('One or more selected customers already have a substitute for this date.');
  const record = { id: `sub_${Date.now()}`, date, areaId, originalBoyId, substituteBoyId, customerIds, createdAt: new Date().toISOString() };
  if (api.apiEnabled()) {
    await api.save('substitutions', record);
    await ensureDailyRecords(date);
    return record;
  }
  await setJson(K.sub, [...subs, record]);
  await ensureDailyRecords(date);
  const ds = await getDeliveries();
  await setJson(K.d, ds.map(d => d.date === date && customerIds.some(id => same(id, d.customerId)) && d.status === 'pending' ? { ...d, boyId: substituteBoyId, areaId } : d));
  return record;
}

export async function removeSubstitution(id) {
  const subs = await getSubstitutions();
  const target = subs.find(x => same(x.id, id));
  if (!target) return;
  if (api.apiEnabled()) {
    await api.remove('substitutions', id);
    await ensureDailyRecords(target.date);
    return;
  }
  await setJson(K.sub, subs.filter(x => !same(x.id, id)));
  await ensureDailyRecords(target.date);
  const ds = await getDeliveries();
  const cs = await getCustomers();
  const leaveRows = await getLeaveRequests();
  const targetIds = target.customerIds || [];
  const next = [];
  for (const d of ds) {
    if (d.date === target.date && targetIds.some(cid => same(cid, d.customerId)) && d.status === 'pending') {
      const c = cs.find(x => same(x.id, d.customerId));
      const boyId = c ? await effectiveBoyFor(c, await getSubstitutions(), target.date, leaveRows) : null;
      next.push({ ...d, boyId });
    } else next.push(d);
  }
  await setJson(K.d, next);
}

export async function setBoyLeave(boyId, onLeave) {
  const us = await getUsers();
  if (api.apiEnabled()) {
    const u = us.find(x => same(x.id, boyId));
    if (u) await api.updateUser(boyId, { name: u.name, email: u.email, role: u.role || 'delivery', areaId: u.areaId || null, active: u.active !== false });
    return;
  }
  await setJson(K.u, us.map(u => u.id === boyId ? { ...u, onLeave } : u));
}

export async function refreshUserSession() {
  const ss = await session();
  if (!ss) return null;
  const us = await getUsers();
  const fresh = us.find(u => same(u.id, ss.id)) || null;
  if (fresh) await AsyncStorage.setItem(K.s, JSON.stringify(sessionUser(fresh)));
  return fresh ? sessionUser(fresh) : null;
}

export async function createBills(drafts, kind) {
  const existing = await getBills();
  const created = [], skipped = [];
  const now = Date.now();
  drafts.forEach((d, i) => {
    const clash = [...existing, ...created].find(b => same(b.customerId, d.customerId) && b.periodStart <= d.periodEnd && b.periodEnd >= d.periodStart);
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
  const cur = rows.find(b => same(b.id, id));
  if (!cur) return null;
  const next = { ...cur, wa: { ...cur.wa, ...patch, updatedAt: new Date().toISOString() } };
  if (api.apiEnabled()) { await api.save('bills', next); return next; }
  await setJson(K.bills, rows.map(b => (same(b.id, id) ? next : b)));
  return next;
}

export async function deleteBill(id) {
  if (api.apiEnabled()) { await api.remove('bills', id); return; }
  const rows = await getBills();
  await setJson(K.bills, rows.filter(b => !same(b.id, id)));
}

// Optional PHP REST API client. Set API_BASE_URL in constants/business.js to enable it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/business';

const TOKEN_KEY = 'milk_api_token';
export const apiEnabled = () => Boolean(String(API_BASE_URL || '').trim());
export const getToken = () => AsyncStorage.getItem(TOKEN_KEY);
export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY);

const emptyBootstrap = () => ({
  areas: [], customers: [], deliveries: [], substitutions: [], leave_requests: [], bills: [], users: [],
});

function parseBody(text) {
  if (!text || !String(text).trim()) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

export function isAuthError(err) {
  return /authentication required|session expired/i.test(String(err?.message || ''));
}

async function request(path, options = {}) {
  if (!apiEnabled()) throw new Error('PHP API is not configured. Set API_BASE_URL in constants/business.js.');
  const token = await getToken();
  let bodyText = options.body;
  if (token && bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsed.access_token = token;
        bodyText = JSON.stringify(parsed);
      }
    } catch { /* keep original body */ }
  }
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_BASE_URL.replace(/\/$/, '')}${path}${token ? `${sep}access_token=${encodeURIComponent(token)}` : ''}`;
  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
        body: bodyText,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}`, 'X-Authorization': `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const detail = String(err?.message || err || '');
    if (/abort/i.test(detail)) throw new Error('API server timed out. Check the phone network.');
    throw new Error('Cannot reach the API server. Check the phone network and API_BASE_URL.');
  }
  const text = await response.text().catch(() => '');
  const body = parseBody(text);
  if (response.status === 401) {
    const msg = body.error || 'Authentication required';
    if (/session expired/i.test(msg)) await clearToken();
    throw new Error(msg);
  }
  if (!response.ok) throw new Error(body.error || body.detail || `API request failed (${response.status})`);
  return body;
}

export async function loginApi(email, password) {
  const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!result?.token) throw new Error(result?.error || 'Login did not return a token.');
  await AsyncStorage.setItem(TOKEN_KEY, result.token);
  return result.user;
}
export async function logoutApi() {
  try { await request('/auth/logout', { method: 'POST', body: '{}' }); }
  catch { /* still clear local token */ }
  finally { await clearToken(); }
}
export async function getBootstrap() {
  const body = await request('/bootstrap');
  const data = body?.data && typeof body.data === 'object' ? body.data : {};
  return { ...emptyBootstrap(), ...data };
}
export async function list(resource) {
  const body = await request(`/${resource}`);
  return Array.isArray(body.items) ? body.items : [];
}
export async function save(resource, item) {
  const body = await request(`/${resource}`, { method: 'POST', body: JSON.stringify({ item }) });
  return body.item || item;
}
export async function remove(resource, id) {
  return request(`/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function markDelivered(id, proofUri) {
  const body = await request('/deliveries', { method: 'POST', body: JSON.stringify({ item: { id, status: 'delivered', proofUri } }) });
  return body.item;
}
export async function createUser(user) {
  return request('/users', { method: 'POST', body: JSON.stringify(user) });
}
export async function updateUser(id, user) {
  const body = { ...user, id, _update: true };
  if (body.areaId === '' || body.areaId === undefined) body.areaId = null;
  if (!body.password) delete body.password;
  return request(`/users/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(body) });
}
export async function me() { return (await request('/me')).user || null; }

// Optional PHP REST API client. Set API_BASE_URL in constants/business.js to enable it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/business';

const TOKEN_KEY = 'milk_api_token';
export const apiEnabled = () => Boolean(String(API_BASE_URL || '').trim());

async function request(path, options = {}) {
  if (!apiEnabled()) throw new Error('PHP API is not configured. Set API_BASE_URL in constants/business.js.');
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `API request failed (${response.status})`);
  return body;
}

export async function loginApi(email, password) {
  const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  await AsyncStorage.setItem(TOKEN_KEY, result.token);
  return result.user;
}
export async function logoutApi() {
  try { await request('/auth/logout', { method: 'POST', body: '{}' }); }
  finally { await AsyncStorage.removeItem(TOKEN_KEY); }
}
export async function getBootstrap() { return (await request('/bootstrap')).data; }
export async function list(resource) { return (await request(`/${resource}`)).items || []; }
export async function save(resource, item) {
  return (await request(`/${resource}`, { method: 'POST', body: JSON.stringify({ item }) })).item;
}
export async function remove(resource, id) {
  return request(`/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function markDelivered(id, proofUri) {
  return (await request('/deliveries', { method: 'PATCH', body: JSON.stringify({ id, status: 'delivered', proofUri }) })).item;
}
export async function createUser(user) {
  return request('/users', { method: 'POST', body: JSON.stringify(user) });
}
export async function me() { return (await request('/me')).user; }

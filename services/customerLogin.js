export const CUSTOMER_LOGIN_DOMAIN = 'dhaara.com';
export const CUSTOMER_DEFAULT_PASSWORD = 'customer@1234';

// Letters and digits from the customer name. Empty names become "customer".
export function sanitizeCustomerLocalPart(name) {
  const local = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 48);
  return local || 'customer';
}

// name@dhaara.com, then name2@dhaara.com, name3@dhaara.com, and so on.
export function generateCustomerLogin(name, existingEmails = []) {
  const taken = new Set(
    (existingEmails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean),
  );
  const base = sanitizeCustomerLocalPart(name);
  let local = base;
  let n = 2;
  while (taken.has(`${local}@${CUSTOMER_LOGIN_DOMAIN}`) && n < 1000) {
    local = `${base}${n}`;
    n += 1;
  }
  return { email: `${local}@${CUSTOMER_LOGIN_DOMAIN}`, password: CUSTOMER_DEFAULT_PASSWORD };
}

// Both fields are required when a caller supplies a login. Returning null means it is not usable.
export function requiredCustomerLogin(email, password) {
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || pw.length < 8) return null;
  return { email: em, password: pw };
}

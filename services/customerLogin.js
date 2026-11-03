export const CUSTOMER_LOGIN_DOMAIN = 'dhaara.com';

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

function nameHasLetters(name) {
  return /[a-z0-9]/i.test(String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, ''));
}

// Email is name@dhaara.com, then name2@dhaara.com. Password is name@1234 and does not take the number.
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
  return { email: `${local}@${CUSTOMER_LOGIN_DOMAIN}`, password: `${base}@1234` };
}

// Blank until the name has a letter or digit, then the same suggestion as generateCustomerLogin.
export function suggestCustomerLogin(name, existingEmails = []) {
  if (!nameHasLetters(name)) return { email: '', password: '' };
  return generateCustomerLogin(name, existingEmails);
}

// Both fields are required when a caller supplies a login. Returning null means it is not usable.
// Six characters covers a one-letter name plus @1234.
export function requiredCustomerLogin(email, password) {
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || pw.length < 6) return null;
  return { email: em, password: pw };
}

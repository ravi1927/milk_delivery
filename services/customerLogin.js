// Both fields are required. Returning null means the customer must not be saved.
export function requiredCustomerLogin(email, password) {
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || pw.length < 8) return null;
  return { email: em, password: pw };
}

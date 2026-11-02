// Login email and password are optional. A customer record does not need them.
// hasExisting: the customer already has a login, so a blank password keeps that password.
export function customerLoginPlan(email, password, hasExisting = false) {
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');
  const blankPw = !pw.trim();
  if (!em && blankPw) return { action: 'skip' };
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
  if (!emailOk || (!blankPw && pw.length < 8)) return { action: 'incomplete' };
  if (blankPw) return hasExisting ? { action: 'update', email: em } : { action: 'incomplete' };
  return { action: 'create', email: em, password: pw };
}

// The live API rejects role "customer" until the migration is applied.
// That response must not fail the customer record that was already saved.
export function customerRoleUnsupported(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('valid role')
    || msg.includes('customer_record_id')
    || msg.includes('customer_role_unavailable')
    || msg.includes('customer logins are not available')
    || msg.includes('login table is missing')
    || msg.includes('unknown column')
    || (msg.includes('role') && (msg.includes('truncated') || msg.includes('enum')));
}

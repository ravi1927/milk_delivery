export function homeForRole(role) {
  if (role === 'admin') return '/admin';
  if (role === 'customer') return '/customer';
  return '/delivery';
}

// ─────────────────────────────────────────────────────────────
// Business settings – edit these values for your dairy.
// ─────────────────────────────────────────────────────────────
export const BUSINESS = {
  name: 'Dhaara A2 Milk',
  tagline: 'We Make You Smile',
  // Country code added to 10-digit customer mobile numbers (India = 91).
  countryCode: '91',
  // Optional line added at the end of every bill message, e.g. 'Pay by UPI: dhaara@upi'.
  paymentNote: '',
  // Monthly billing day. If a month is shorter (February) the last day of that month is used.
  billingDay: 30,
};

// Set true later to show Admin → Billing & WhatsApp.
export const SHOW_BILLING = false;

// PHP REST API base URL, e.g. https://your-domain.com/api. Leave empty to use local demo storage.
// The URL must point to the PHP API router (index.php), with web-server rewrites configured.
export const API_BASE_URL = 'http://168.144.223.138/api/index.php';

// ─────────────────────────────────────────────────────────────
// WhatsApp sending mode
//  • Leave BILLING_API_URL empty  → "WhatsApp link" mode. The app opens WhatsApp with the
//    bill message already typed; the admin presses Send. Works today, no server needed.
//  • Set BILLING_API_URL (see backend/README.md) → "Automatic" mode. The server sends the
//    message through the WhatsApp Business Cloud API and reports sent / delivered / failed.
// ─────────────────────────────────────────────────────────────
export const BILLING_API_URL = '';
export const BILLING_API_KEY = '';

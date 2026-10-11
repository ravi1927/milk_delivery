# Dhaara A2 Milk – Delivery Management (Expo SDK 57)

Admin and Delivery Boy app for Android and iOS.

## First-time setup (important – new packages)
```bash
npm install
npx expo install expo-print expo-sharing expo-splash-screen
npx expo start -c
```
`expo-print` + `expo-sharing` create and share the PDFs. `expo-splash-screen` shows the logo while the app starts.
The splash image is part of the native build, so it appears fully after a new build
(`eas build --platform android --profile preview`); in Expo Go you see the in-app logo loading screen instead.

## Demo accounts
- Admin: `admin@milk.com` / `admin123`
- Delivery: `ravi@milk.com` / `123456`

## What changed in this version
- **Layout / safe area** – the header is now pinned *below* the status bar / notch / Dynamic Island on every phone
  (iPhone and Android edge-to-edge). Forms scroll and move above the keyboard.
- **Splash + loading** – logo splash, then an animated logo loading screen while data loads.
- **Login** – logo and app name above the sign-in form.
- **Logout** – confirmation, clears the session and always returns to Login (also guarded in `app/_layout.jsx`).
- **PDF reports with logo** – Reports screen → PDF for the selected day, last 7 days, or the month.
  Bills can be exported as a summary PDF or as a single-customer bill PDF.
- **Billing & WhatsApp** (Admin → Billing & WhatsApp) – see below.

## Billing
- Bill amount = daily litres × rate per litre (from the customer form) × number of days.
- Each customer's bill starts the day after their previous bill (or the 1st of the month) and ends on the date you choose.
- Monthly billing day is the **30th** (the last day of February). From that day the dashboard shows a "Monthly billing is due" banner.
- **Bill any time** – pick any end date, untick other customers, create. Customers you delete are kept as
  "(stopped)" so a final bill up to their stop date can still be created.
- Basis switch: *Every day in period* (default, e.g. 30 days) or *Delivered days only*.
- Overlapping bills for the same customer are blocked, so nobody is billed twice for the same day.

## WhatsApp sending
Edit `constants/business.js`.
1. **WhatsApp link mode (default, works now).** The app opens WhatsApp with the bill message typed in; you press Send.
   Come back to the app and confirm. Anything not confirmed stays under **Needs action** (and in the PDF).
2. **Automatic mode (needs a server).** Set `BILLING_API_URL` and `BILLING_API_KEY`. The server in `backend/` sends through the
   WhatsApp Business Cloud API and reports sent / delivered / read / failed. See `backend/README.md`.

A phone app cannot send WhatsApp messages by itself on a schedule while it is closed, and the data is stored on the
phone, so fully automatic sending on the 30th needs the data moved to a server first (next step).

## Data
All data is stored on the device (AsyncStorage). For several phones sharing live data, replace `services/store.js`
with API / database calls.

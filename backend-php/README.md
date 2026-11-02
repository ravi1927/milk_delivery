# Milk Delivery Management — PHP REST API

PHP 8.1+ and MySQL 8+ API for the existing Expo app. UI files are not redesigned.

## 1. Install on your server

1. Create/select the MySQL database `milkDeliverymanagement`.
2. Import `schema.sql` using phpMyAdmin or `mysql -u dbadmin -p < schema.sql`.
3. Copy this folder to your PHP hosting, preferably outside the public document root with a small public router.
4. Copy `.env.example` to `.env` and fill in database credentials. Keep `.env` private and never commit it.
5. Ensure PHP PDO MySQL is enabled and Apache `mod_rewrite` is enabled if using `.htaccess`.
6. Put the API behind HTTPS. Do not use `CORS_ORIGIN=*` in production; set it to your app/web origin if applicable.

For shared hosting, the URL should resolve to `index.php`; for example `https://your-domain.example/api`. If you deploy the folder as the web root, use `https://your-domain.example`; the router accepts either root or `/api/...` paths.

## 2. Create the first admin

Generate a password hash on the server:

```bash
php -r "echo password_hash('CHANGE_ME_NOW', PASSWORD_DEFAULT), PHP_EOL;"
```

Then insert it in phpMyAdmin, replacing the hash and email:

```sql
INSERT INTO users (id,name,email,password_hash,role,active)
VALUES ('admin1','Admin User','admin@example.com','PASTE_HASH_HERE','admin',1);
```

Create delivery accounts from the authenticated admin API:

`POST /users` JSON:
```json
{
  "id": "boy1",
  "name": "Ravi Kumar",
  "email": "ravi@example.com",
  "password": "use-a-strong-password",
  "role": "delivery",
  "areaId": "area1"
}
```

Passwords are hashed using PHP `password_hash`. Demo passwords from `data/demoData.js` are not automatically migrated and should not be used in production.

## 3. Connect the Expo app

In `constants/business.js`, set:

```js
export const API_BASE_URL = 'https://your-domain.example/api';
```

Leave it empty to retain the existing local demo-data mode. Then rebuild/restart the Expo app. Use a reachable HTTPS domain or your server's LAN IP during local testing; `localhost` on a phone points to the phone itself.

## 4. API overview

- `GET /health`
- `POST /auth/login` — email/password, returns bearer token
- `POST /auth/logout`
- `GET /me`
- `GET /bootstrap` — data snapshot and ensures today's pending delivery records for active customers
- `GET /areas`, `/customers`, `/deliveries`, `/substitutions`, `/leave_requests`, `/bills`, `/users`
- `POST /areas`, `/customers`, `/deliveries`, `/substitutions`, `/leave_requests`, `/bills`, `/users`
- `POST /delivery-photos` — delivery staff upload the proof image (multipart field `photo` or JSON `imageBase64`). The file is stored on the server and the delivery is marked delivered with that URL.
- `POST /delivery-photos/cleanup` — admin only. Deletes proof files with `delivery_photos.created_at` older than 30 days and clears those URLs.
- `GET/POST /skip_requests` — a customer submits a date and reason. That customer is left off the delivery boy's route for the date. Admin sees an alert and can mark it seen.
- `PATCH /deliveries` — delivery users can mark only their own assigned delivery as delivered. A `file://` proof URI is rejected; upload the photo first.
- `DELETE /{resource}/{id}` — delete an app record

Every endpoint except health/login requires a bearer token. Admin-only resources are checked server-side. Delivery accounts can only list their own deliveries and mark their own assigned deliveries as delivered.

## 5. WhatsApp Business Cloud API

The original Node.js WhatsApp relay in `../backend` is preserved. It is a separate service for automated bill templates and message-status webhooks. Configure its `.env` values using `../backend/.env.example`, use a Meta-approved template, and expose the webhook over HTTPS. Do not place WhatsApp access tokens in the mobile app.

## Notes

- This API uses `app_records` JSON payloads for flexible app entities while user credentials and sessions have dedicated relational tables. For high-volume production reporting, consider migrating deliveries and bills into fully normalized tables.
- Daily delivery records are created as pending when `/bootstrap` runs for a new server date; historical delivery rows remain intact.
- Passwords are stored only as `password_hash` on `users` and on `login`. Changing a password updates both tables in one transaction. `login` also records each sign-in (user, role, time, success or failure).
- Customer logins use `users.role = 'customer'` and `users.customer_record_id`, which is the app customer id (`app_records.record_id`, for example `c_1791710244128`). It is not the relational `customers.id`. Do not store the password on the customer record.
- Existing databases: apply `migrations/2026-11-02-customer-login-photos-skips.sql` before using customer login, photo cleanup, or skip requests. The script only adds a role value, one column, and new tables.
- Delivery proof files live in `uploads/proofs/` and are served through the API. Direct web access to `uploads/` is denied.

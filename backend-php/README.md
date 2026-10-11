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
- `PATCH /deliveries` — delivery users can mark only their own assigned delivery as delivered and submit `proofUri`
- `DELETE /{resource}/{id}` — delete an app record

Every endpoint except health/login requires a bearer token. Admin-only resources are checked server-side. Delivery accounts can only list their own deliveries and mark their own assigned deliveries as delivered.

## 5. WhatsApp Business Cloud API

The original Node.js WhatsApp relay in `../backend` is preserved. It is a separate service for automated bill templates and message-status webhooks. Configure its `.env` values using `../backend/.env.example`, use a Meta-approved template, and expose the webhook over HTTPS. Do not place WhatsApp access tokens in the mobile app.

## Notes

- This API uses `app_records` JSON payloads for flexible app entities while user credentials and sessions have dedicated relational tables. For high-volume production reporting, consider migrating deliveries and bills into fully normalized tables.
- Daily delivery records are created as pending when `/bootstrap` runs for a new server date; historical delivery rows remain intact.
- Proof upload currently accepts a proof URI supplied by the client. Before production, add a multipart upload endpoint with file type/size validation and private storage; a local device URI is not itself a server-accessible image.
- The PHP source has not been executed against your hosting or your live database in this environment. Test the deployment steps and API flows in staging before production use.

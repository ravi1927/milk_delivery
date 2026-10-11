# API implementation notes

This ZIP retains the original Expo UI and adds:
- `backend-php/`: PHP REST API, MySQL schema, authentication/session handling, role checks, and deployment guide.
- `services/apiClient.js`: bearer-token API client.
- `constants/business.js`: `API_BASE_URL` switch (empty keeps demo/local mode).
- `services/store.js`: API-mode branches for login/bootstrap, key data reads, delivery completion, customer/area changes, assignments, leave review, substitutions, and bill persistence.
- Original `backend/` WhatsApp relay is preserved as-is.

## Before production
1. Set up the MySQL schema and create an admin with a hashed password.
2. Configure `backend-php/.env` on the server and deploy over HTTPS.
3. Set `API_BASE_URL` in `constants/business.js`.
4. Configure the existing Node WhatsApp relay separately; do not put the Meta token in the app.
5. Verify every screen workflow in staging. The current API's flexible JSON records are suitable for a starter integration, but should be normalized further before large-scale production.
6. Delivery proof upload needs a server-side multipart endpoint; the API currently stores the submitted proof URI and cannot fetch a private local phone path.

The mobile UI/design files were not intentionally changed. This is an initial integration implementation and requires deployment/staging validation before production use.

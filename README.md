# Tujenge Hub on Cloudflare

This is the existing `tujenge` app, with its original screens and ledger operations retained. Firebase is no longer used at runtime. `tujenge-new` was not used.

## Sign-in

- Members create an account using a Tanzanian mobile number and a private six-digit PIN, then complete the existing membership form.
- Admin signs in with the owner email and a separately provisioned password.
- Account settings supports credential changes. Admin can reset a member PIN after confirming their identity.
- Sessions use random server-managed tokens in Secure, HttpOnly, SameSite cookies. Logout and credential changes revoke sessions.
- PIN/password hashes use salted PBKDF2. Sign-in attempts are limited by account and source address.

Phone-number ownership is not verified by SMS in this flow. Membership and account recovery should be handled by the group administrator.

## Data

The approved deployment uses the existing `biashara-base-preview-db` database. Only `tujenge_*` tables belong to this app; other preview-app tables are not modified. The group starts with the original demo ledger, as there were no real accounts or financial records to migrate.

Existing ledger calculations run on the Worker. The server derives permissions and actor identity from the session, checks ownership, and loads authoritative records before applying changes. Conditional revision updates prevent simultaneous operations from silently overwriting each other.

## Build and deploy

```sh
npm install
npm run build
npm test
npm run deploy
```

Cloudflare credentials are provided through Wrangler's own authentication. No administrator password is stored in this repository. The database is already provisioned for the configured deployment; a new environment must create the schema and initialize the ledger and hashed administrator credentials separately.

The app's original static images remain at their original URLs. API paths run through the Worker before static assets. The member and administrator screens, documents, meetings, loan operations, payment adjustments, fines, and Jamii payout operations retain their existing interfaces.

Reminder scheduling and external messaging require separate operational configuration; this authentication change does not connect an SMS or WhatsApp sending provider.

## Validation

`test-auth.mjs` runs against an isolated SQLite database. It covers registration, login, saved ledger changes, ownership and admin restrictions, private data, duplicate payment rejection, session revocation, rate limits, origin checks, account recovery, admin document/meeting/fine operations, and concurrent writes.

Live verification covered admin login/logout and session persistence, member registration/login/logout, access restrictions, public page/assets, and the absence of Firebase from the deployed client bundle. The temporary live test account was removed.

Prior live version for rollback: `c92d6029-77cc-4fde-ab62-e3c60c896bd0`.

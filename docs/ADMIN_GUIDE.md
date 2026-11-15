# Administrator Guide

Access the full 21-module Control Panel at `/admin` (requires `role` = `root`, `admin`, or `moderator`).

- The **first registered user** on a fresh database is automatically promoted to `root` administrator (`src/app/api/v1/auth/session/route.ts`).
- **Role Hierarchy**: Only `root` administrators may promote/demote other admins via `Users -> Role selector`.
- **Financial & Moderation Actions**: Approving/rejecting cashouts atomically updates `wallets` and refunds declined payouts inside a MongoDB transaction. All actions are recorded in **Audit Logs** and **Mod History**.
- **Runtime Configuration**: Feature flags (Marketplace, Jobs, Ads, Wallet, Stories, Business, AI Translation), SMTP testing, payment acquiring credentials, currencies, locales, and static legal pages can all be updated dynamically without redeploying.

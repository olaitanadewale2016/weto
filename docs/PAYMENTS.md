# Wallet & Payment Providers Architecture

## Security Invariants
- Balances are authoritative on MongoDB (`wallets` collection) and modified solely within MongoDB ACID transactions (`withMongoTransaction`).
- Conditional `$gte` balance checks prevent overdrafts under concurrent transfers or cashout requests.
- Every wallet credit/debit requires a unique `idempotencyKey` index in `wallet_transactions` to prevent duplicate deposits or double-spends.
- All financial actions emit immutable records to `audit_logs`.

## Supported Gateways
Configure credentials inside **Admin Panel -> Platform Config** or `.env.local`:
- **Stripe**: Checkout Sessions + verified `stripe-signature` webhooks (`/api/v1/payments/webhook/stripe`)
- **PayPal**: Orders v2 REST API + synchronous capture callback (`/api/v1/payments/callback/paypal`) + webhook signature verification
- **YooKassa**: REST v3 Payments + webhook IP/verification (`/api/v1/payments/webhook/yoo_kassa`)
- **RoboKassa**: Hosted Checkout + MD5 `Pass2` webhook verification (`/api/v1/payments/webhook/robokassa`)

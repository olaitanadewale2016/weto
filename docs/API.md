# REST API Reference

Interactive OpenAPI 3.1 JSON schema is served live at `GET /api/v1/docs` and documented inside `/document/developers-api`.

## Authentication Methods
1. **Browser Session Cookie (`__session`)** — Minted via `POST /api/v1/auth/session` with a Firebase ID token.
2. **Firebase Bearer Token** — `Authorization: Bearer <firebase_id_token>`.
3. **Developer API Key** — `X-API-Key: weto_live_<hex>` generated inside **Account Settings -> Security & API**.

## Response Envelope
- Success: `{ "status": "success", "data": ..., "meta": { ... } }`
- Error: `{ "status": "error", "error": { "code": "...", "message": "...", "details": ... } }`

# Email Deliverability

This document describes how `lets-chat` sends email and how the UI handles provider failures for a smooth user experience.

## Auth flows that send email

| Flow | Endpoint / trigger | Token lifetime |
|---|---|---|
| Registration email verification | `POST /auth/register` sends automatically | 24 hours |
| Resend verification email | `POST /auth/resend-verification` | Rotates token, 24 hours |
| Password reset | `POST /auth/forgot-password` | 60 minutes |
| Email change confirmation | `PATCH /auth/me` (request) → `POST /auth/change-email/confirm` | 24 hours |

## Providers

Production uses **Resend** as the primary provider. An optional SMTP fallback can be configured:

```bash
MAIL_PROVIDER=resend
RESEND_API_KEY=...
MAIL_FROM=noreply@example.com

# Optional fallback
MAIL_FALLBACK_PROVIDER=smtp
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

`MAIL_PROVIDER=console` is local-development only and must **not** be used on Render.

## Provider failures

When Resend returns a quota or outage error, the API throws a `MailProviderException` with a safe message and a machine-readable code:

```json
{
  "statusCode": 503,
  "code": "MAIL_PROVIDER_QUOTA_EXCEEDED",
  "message": "Email delivery is temporarily unavailable. Please try again later."
}
```

The frontend maps these codes to a localized `errors.registrationUnavailable` message so users see a friendly "Registration is temporarily unavailable" prompt instead of raw provider errors.

## Avoiding email dependency in verification

For CI and production smoke tests, a reusable pool of pre-verified accounts can be seeded directly in the database. This bypasses disposable-email quotas and keeps verification reliable even when the mail provider is rate-limited.

See `docs/production-verification.md` → "Reusable verifier account pool".

## UX safeguards (B229)

- Post-registration screen shows the target email, a spam-folder hint, and a resend action.
- Resend buttons have a client-side cooldown (matching the backend cooldown) and an attempt limit to discourage abuse.
- Login for an unverified email surfaces a clear message with a one-click resend.
- The verification result page distinguishes success, missing token, and expired/invalid links with a recovery resend form.

## DNS recommendations

For production deliverability, configure SPF, DKIM, and DMARC for the sending domain. Do not commit real DNS values or provider keys to the repository.

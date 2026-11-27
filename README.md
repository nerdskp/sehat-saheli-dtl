# Sehat Saheli — Care Loop

A Design Thinking Lab prototype connecting Telegram visit intake, ASHA workers, patients, and the PHC team. Built with Next.js, React, TypeScript, Express, Supabase, and optional Gemini triage.

## Setup

Use Node.js 22 or newer.

```bash
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

1. Run `backend/supabase-schema.sql` in your Supabase project's SQL editor.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. Keep the service role key on the backend only.
3. Set `TELEGRAM_BOT_TOKEN` to enable long polling. Set `TELEGRAM_CHAT_ID` only if a separate staff chat should receive urgent alerts. Run only one polling instance for a bot token.
4. Set `GEMINI_API_KEY` for AI scoring. Without it, or when the provider fails, the existing heuristic fallback is used. Scores support coordination; clinical review is still required.
5. Run `npm run dev`. Frontend: `http://localhost:3000`; API: `http://localhost:4000/api`.

The database seeds staff accounts, not patient or case records:

| Role | Username | Password | Route |
| --- | --- | --- | --- |
| ASHA | `sunita.asha` | `demo123` | `/asha` |
| PHC | `dr.phc` | `demo123` | `/phc` |
| Patient | Issued during first intake | Issued during first intake | `/patient` |

## Telegram intake

Send `Name, Age, Aadhaar, Symptoms` (or use `|` separators). Labeled lines are also accepted:

```text
Name: Demo Patient
Age: 30
Aadhaar: 234567891234
Symptoms: Reported concern for review
```

Use fictional details for the prototype. Age must be a whole number from 0 to 120. Aadhaar validation checks the 12-digit format, not identity or checksum. A matching Aadhaar adds a follow-up visit; a new one creates a patient account. The reply provides the recorded priority and new account credentials when applicable.

ASHA and PHC dashboards refresh every five seconds. PHC staff acknowledge referrals and select a follow-up date; the server rejects past or invalid dates. Patients can view their care plan and request a callback.

## Test on a phone

1. Connect the phone and computer to the same network.
2. Open `http://<computer-LAN-IP>:3000` on the phone.
3. Leave `NEXT_PUBLIC_API_URL` unset for same-host development, or set it to `http://<computer-LAN-IP>:4000/api`. A phone cannot use your computer's `localhost` address.
4. Add `http://<computer-LAN-IP>:3000` to the comma-separated `FRONTEND_ORIGIN` in `backend/.env` and restart the backend.
5. If Next.js blocks development assets, add the exact LAN hostname/IP to `allowedDevOrigins` in `frontend/next.config.ts` and restart the frontend.

For hosting, set `NEXT_PUBLIC_API_URL` to the public HTTPS API URL **before building**, and allow the hosted frontend origin in backend CORS. The static frontend export cannot run Telegram polling; deploy the backend as a persistent Node process with its environment variables.

## Validation

```bash
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests use mocked API data and cover all four routes at 320, 375, 390, 768, 820, 1024, and 1440 pixels, mobile navigation, intake credentials, callback submission, date selection, and request errors. They do not send Telegram messages or modify Supabase records.

To use an installed Chrome browser instead of downloading Chromium:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:e2e
```

## Prototype limitations

This is a coordination demo, not a diagnostic or prescribing tool. Demo staff passwords, Aadhaar-derived patient credentials, broad staff access, and Telegram intake are not a production identity or authorization system. Use fictional data. Live integration testing requires your own Supabase, Telegram, and optional Gemini credentials. Telegram update processing is not transactional with database writes; after an interrupted intake, check the care record before resending.

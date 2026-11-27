# Sehat Saheli — Progress Summary

## What Has Been Built & Wired

### 1. Supabase Database & Auth
- Migrated backend storage from local SQLite to **Supabase** ([supabase.ts](backend/src/supabase.ts), [supabase-schema.sql](backend/supabase-schema.sql), [data.ts](backend/src/data.ts)).
- Added `phc` role alongside `asha` and `patient`, plus `aadhaar`, `visit_type`, `severity_score`, `severity_level`, `triage_summary`, `alert_flagged`, and `source` columns.
- Cleared dummy patient/case records so all pages show **`None`** when empty and auto-seed only staff accounts (`sunita.asha`, `dr.phc`).

### 2. Telegram Bot + Gemini Triage + Aadhaar Auto-Accounts
- Added `@sehatsaheli_bot` long-polling listener ([telegram.ts](backend/src/telegram.ts)) accepting `Name, Age, Aadhaar, Disease` (comma/pipe-separated or labeled lines).
- Validated 12-digit Aadhaar numbers (`^[2-9]\d{11}$`) in [triage.ts](backend/src/triage.ts):
  - **Existing Aadhaar:** logs a **Follow-up visit** on the patient's record.
  - **New Aadhaar:** logs a **Fresh visit** and auto-creates a patient login (`username`: lowercase first name; `password`: `FIRST3CAPS` + last 4 Aadhaar digits, e.g. `SAT1234`), returning credentials in Telegram / `/asha`.
- Integrated `gemini-2.5-flash` triage to score urgency (`1–10`) from age + symptoms, flag critical alerts (`>= 7`), and assign recommended next steps.

### 3. Role Dashboards (Live 5s Sync, Zero Placeholders)
- **`/asha`** ([AshaWorkspace.tsx](frontend/src/components/AshaWorkspace.tsx)):
  - Live queue, metrics, focus card, Aadhaar/existing-patient visit intake, and patient callback resolution.
  - Replaced chat-bubble triage with an individual per-patient **Triage & Care Card** tracked by `caseId`, plus duplicate-acknowledgement protection.
  - Wired **Households**, **Search**, **Bell Notifications**, **View calendar**, **English / ಕನ್ನಡ** toggle, and **How it works**; removed the redundant ASHA-side PHC handoffs tab.
- **`/phc`** ([phc/page.tsx](frontend/src/app/phc/page.tsx)):
  - Dedicated PHC doctor queue ranked `#1, #2, ...` by Gemini severity score descending, with high-severity alert banner and **Acknowledge** / **Book follow-up** actions.
- **`/patient`** ([patient/page.tsx](frontend/src/app/patient/page.tsx)):
  - Shows live care plan, triage summary, visit history, ASHA worker contact, and **Request a callback** button.

## Mobile and reliability update — 27 November 2026

Reviewed GitHub `main` at `00ffbd3` (the UI update after the original `f5cbb67` progress note).

### Completed
- Responsive login, ASHA, PHC, and patient layouts, including narrow phones and intermediate tablet widths.
- Full-width mobile search, viewport-sized scrollable notifications, visible queue status/date metadata, wrapped PHC rows, and touch-friendly controls.
- Mobile navigation backdrop, Escape dismissal, focus trapping/restoration, background scroll locking, and scrollable navigation on short screens.
- Intake submit locking and visible save errors; new patient credentials remain visible after opening the new care case.
- PHC and patient load errors can recover without treating every outage as a signed-out session; failed mutations display errors.
- Explicit follow-up date selection replaces the fixed November date. The backend validates real dates against the Indian calendar and requires PHC acknowledgement.
- Patient callback buttons disable while sending and while an open callback is present.
- Telegram parsing rejects malformed ages, missing fields and oversized records; external requests have timeouts and intake failures produce a reply.
- Gemini scores determine their matching severity labels and alert flags consistently.
- Updated Supabase/Telegram setup documentation and phone-on-LAN API configuration.

### Verification
- TypeScript checks and production build pass for both workspaces.
- Four backend regression tests pass.
- Eleven mocked browser tests pass, covering 320, 375, 390, 768, 820, 1024 and 1440px widths, menu keyboard/backdrop behavior, Kannada navigation, credentials, callbacks, and follow-up submission/error handling.
- ASHA and PHC mobile screenshots visually reviewed.

### Local checkout and remaining integration verification
- Current checkout: `/Users/surya/dtl/sehat-saheli-dtl`.
- Configure the environment files using README.md, then run `npm run dev` from the repository root.
- This fresh checkout has no live Supabase, Telegram or Gemini credentials. Browser checks use fixtures; live bot delivery, database persistence and real AI responses still need verification with the configured services.
- Existing prototype limits remain: demo passwords, Aadhaar-derived credentials, broad staff access, and non-transactional Telegram intake. Continue using fictional records.

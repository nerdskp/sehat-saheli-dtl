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

## Current Status
- All recent changes are committed on `main` (latest: `f5cbb67 seperate triage`).
- Servers are currently stopped; run `npm run dev` in `D:\DTL\sehat-saheli-dtl` to start frontend (`:3000`), backend (`:4000`), and Telegram polling.

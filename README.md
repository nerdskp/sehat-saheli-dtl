# Sehat Saheli — Care Loop

> One connected care journey: from a home visit to a known next step.

Sehat Saheli is a Design Thinking Lab prototype that helps ASHA workers, families, and PHC teams close the referral and follow-up loop. It makes care coordination visible to the right person at the right time—without positioning itself as a diagnostic or prescribing tool.

**Built with:** Next.js, TypeScript, Tailwind CSS, Express, and SQLite.

## Structure

```text
frontend/   Next.js, TypeScript, Tailwind CSS interface
backend/    Express, TypeScript API and local SQLite database
```

The frontend has separate, protected spaces for ASHA workers and patients. The backend owns the care-case status changes used in the demo: recording an agreed next action, PHC acknowledgement, and follow-up scheduling.

## Run the full app

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:3000`; the API runs on `http://localhost:4000`.

## Sign in

Open `http://localhost:3000`. The landing route takes you to the role-aware login page.

| Role | Username | Password | Opens |
| --- | --- | --- | --- |
| ASHA worker | `sunita.asha` | `demo123` | `/asha` care-coordination workspace |
| Patient | `ramesh.patient` | `demo123` | `/patient` personal care portal |

The login page also lets you select the role to prefill the corresponding demo account.

## Database

On its first start, the backend creates the persistent local database at `backend/data/sehat-saheli.db`. It seeds fictional ASHA-worker and patient accounts, their profiles, care cases, referrals, care events, callback requests, and sign-in sessions. Database files are excluded from Git.

## Validate

```bash
npm run typecheck
npm run build
```

## Important prototype boundary

All data is fictional. The local SQLite database is appropriate for a prototype only. Before any real-world use, move to an appropriately secured managed database, enforce production-grade role-based access controls and audit trails, and use approved clinical protocols rather than product-authored medical guidance.

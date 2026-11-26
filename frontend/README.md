# Sehat Saheli - Care Loop

A responsive Design Thinking Lab prototype for ASHA workers and PHC staff. It demonstrates a closed-loop referral workflow: record a community concern, hand it to a facility, receive acknowledgement, and schedule a home follow-up.

## Prototype scope

- ASHA worker dashboard with today’s care queue
- Guided care-case record for a fictional patient
- PHC handoff queue and acknowledgement
- Follow-up scheduling after facility acknowledgement
- Responsive mobile-first interface

This is a coordination prototype using fictional demo data. It does not diagnose, prescribe, store real patient information, or replace local clinical protocols.

## Run the interface

From the repository root:

```bash
npm run dev:frontend
```

Open `http://localhost:3000`.

To connect it to the local API, start `npm run dev:backend` in a second terminal, or run `npm run dev` to start both. The API base URL can be changed in `.env.local` with `NEXT_PUBLIC_API_URL`.

## Validate a production build

```bash
npm run build:frontend
npm run typecheck:frontend
```

The static export is written to the repository-level `out/` directory, ready for the configured private Sites deployment.

-- Run this once in your Supabase project's SQL Editor.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('asha', 'patient', 'phc')),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asha_workers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  worker_code TEXT NOT NULL UNIQUE,
  village TEXT NOT NULL,
  block TEXT NOT NULL,
  assigned_panchayat TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  patient_code TEXT NOT NULL UNIQUE,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,
  village TEXT NOT NULL,
  aadhaar TEXT UNIQUE,
  linked_asha_worker_id TEXT NOT NULL REFERENCES asha_workers(id)
);

CREATE TABLE IF NOT EXISTS care_cases (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  initials TEXT NOT NULL,
  context TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  tone TEXT NOT NULL,
  tag TEXT NOT NULL,
  next_action TEXT,
  visit_type TEXT NOT NULL DEFAULT 'fresh',
  severity_score INTEGER NOT NULL DEFAULT 1,
  severity_level TEXT NOT NULL DEFAULT 'Moderate',
  triage_summary TEXT,
  alert_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE REFERENCES care_cases(id) ON DELETE CASCADE,
  facility TEXT NOT NULL,
  reason TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Awaiting PHC', 'Received at PHC', 'Follow-up booked')),
  acknowledged_at TEXT,
  follow_up_date TEXT
);

CREATE TABLE IF NOT EXISTS care_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES care_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patient_requests (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

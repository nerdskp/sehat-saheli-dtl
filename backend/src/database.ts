import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDirectory = resolve(__dirname, "..", "data");
mkdirSync(dataDirectory, { recursive: true });

export const db = new DatabaseSync(join(dataDirectory, "sehat-saheli.db"));
db.exec("PRAGMA foreign_keys = ON;");

export type UserRole = "asha" | "patient";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

const now = () => new Date().toISOString();

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) return false;
  const actualHash = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

export function initialiseDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('asha', 'patient')),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
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
      linked_asha_worker_id TEXT NOT NULL REFERENCES asha_workers(id)
    );
    CREATE TABLE IF NOT EXISTS care_cases (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      initials TEXT NOT NULL,
      context TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      tone TEXT NOT NULL,
      tag TEXT NOT NULL,
      next_action TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL UNIQUE REFERENCES care_cases(id) ON DELETE CASCADE,
      facility TEXT NOT NULL,
      reason TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Awaiting PHC', 'Received at PHC', 'Follow-up booked')),
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
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const createdAt = now();
  const sunitaUserId = "user-sunita";
  const rameshUserId = "user-ramesh";
  const ashaPatientUserId = "user-asha-patient";
  const mayaUserId = "user-maya";
  const sanaUserId = "user-sana";
  const sunitaWorkerId = "asha-sunita";
  const rameshPatientId = "patient-ramesh";
  const ashaPatientId = "patient-asha";
  const mayaPatientId = "patient-maya";
  const sanaPatientId = "patient-sana";
  const createUser = db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, role, full_name, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  createUser.run(sunitaUserId, "sunita.asha", hashPassword("demo123"), "asha", "Sunita M.", "9000000001", createdAt);
  createUser.run(rameshUserId, "ramesh.patient", hashPassword("demo123"), "patient", "Ramesh Kumar", "9000000002", createdAt);
  createUser.run(ashaPatientUserId, "asha.patient", hashPassword("demo123"), "patient", "Asha K.", "9000000003", createdAt);
  createUser.run(mayaUserId, "maya.patient", hashPassword("demo123"), "patient", "Maya M.", "9000000004", createdAt);
  createUser.run(sanaUserId, "sana.patient", hashPassword("demo123"), "patient", "Sana F.", "9000000005", createdAt);
  db.prepare("INSERT OR IGNORE INTO asha_workers (id, user_id, worker_code, village, block, assigned_panchayat) VALUES (?, ?, ?, ?, ?, ?)")
    .run(sunitaWorkerId, sunitaUserId, "ASHA-HSK-014", "Hoskote", "Bengaluru Rural", "Hoskote Gram Panchayat");
  db.prepare("INSERT OR IGNORE INTO patients (id, user_id, patient_code, age, gender, village, linked_asha_worker_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(rameshPatientId, rameshUserId, "PT-HSK-201", 58, "Male", "Hoskote", sunitaWorkerId);
  const createPatient = db.prepare("INSERT OR IGNORE INTO patients (id, user_id, patient_code, age, gender, village, linked_asha_worker_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
  createPatient.run(ashaPatientId, ashaPatientUserId, "PT-HSK-202", 26, "Female", "Hoskote", sunitaWorkerId);
  createPatient.run(mayaPatientId, mayaUserId, "PT-HSK-203", 2, "Female", "Hoskote", sunitaWorkerId);
  createPatient.run(sanaPatientId, sanaUserId, "PT-HSK-204", 19, "Female", "Hoskote", sunitaWorkerId);
  const cases = [
    ["case-ramesh", rameshPatientId, "RK", "NCD follow-up", "Due now", "urgent", "Referral pending"],
    ["case-asha", ashaPatientId, "AK", "Routine ANC reminder", "10:30 am", "warm", "Scheduled"],
    ["case-maya", mayaPatientId, "MM", "Post-discharge home visit", "12:00 pm", "blue", "Follow-up"],
    ["case-sana", sanaPatientId, "SF", "Persistent cough check-in", "2:15 pm", "violet", "New concern"]
  ];
  const createCase = db.prepare("INSERT OR IGNORE INTO care_cases (id, patient_id, initials, context, scheduled_for, tone, tag, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const careCase of cases) createCase.run(...careCase, createdAt);
  // Repair only the known fictional seed records if an older prototype database exists.
  db.prepare("UPDATE care_cases SET patient_id = ? WHERE id = ?").run(ashaPatientId, "case-asha");
  db.prepare("UPDATE care_cases SET patient_id = ? WHERE id = ?").run(mayaPatientId, "case-maya");
  db.prepare("UPDATE care_cases SET patient_id = ? WHERE id = ?").run(sanaPatientId, "case-sana");
  db.prepare("INSERT OR IGNORE INTO referrals (id, case_id, facility, reason, sent_at, status) VALUES (?, ?, ?, ?, ?, ?)")
    .run("ref-ramesh", "case-ramesh", "Arogya Mandir, Hoskote", "Review required after field screening", "09:18", "Awaiting PHC");
  const createEvent = db.prepare("INSERT OR IGNORE INTO care_events (id, case_id, event_type, text, timestamp) VALUES (?, ?, ?, ?, ?)");
  createEvent.run("event-1", "case-ramesh", "concern", "ASHA logged a concern and facility-review need.", "09:12");
  createEvent.run("event-2", "case-ramesh", "referral", "Summary shared with Arogya Mandir, Hoskote.", "09:18");
}

export function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(token, userId, expiresAt, now());
  return token;
}

export function getSessionUser(token: string) {
  return db.prepare(`SELECT u.id, u.username, u.full_name AS fullName, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`).get(token, now()) as SessionUser | undefined;
}

export function newId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

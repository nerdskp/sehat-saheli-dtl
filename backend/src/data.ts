import { createSession, db, getSessionUser, initialiseDatabase, newId, verifyPassword, type SessionUser } from "./database";
import type { CareAction, CareCase, CareEvent, CaseStatus, Referral } from "./types";

initialiseDatabase();

type CaseRow = {
  id: string;
  initials: string;
  name: string;
  age: number;
  ward: string;
  context: string;
  time: string;
  tone: CareCase["tone"];
  tag: string;
  next_action: CareAction | null;
  referral_id: string | null;
  referral_status: CaseStatus | null;
};

type ReferralRow = {
  id: string;
  case_id: string;
  facility: string;
  reason: string;
  sent_at: string;
  status: CaseStatus;
  acknowledged_at: string | null;
  follow_up_date: string | null;
};

const caseQuery = `
  SELECT c.id, c.initials, u.full_name AS name, p.age, p.village AS ward,
    c.context, c.scheduled_for AS time, c.tone, c.tag, c.next_action,
    r.id AS referral_id, r.status AS referral_status
  FROM care_cases c
  JOIN patients p ON p.id = c.patient_id
  JOIN users u ON u.id = p.user_id
  LEFT JOIN referrals r ON r.case_id = c.id
`;

const toTask = (row: CaseRow): CareCase => ({
  id: row.id,
  initials: row.initials,
  name: row.name,
  ageLabel: `${row.age} years`,
  ward: row.ward,
  context: row.context,
  time: row.time,
  tone: row.tone,
  tag: row.referral_status === "Received at PHC" ? "PHC received" : row.referral_status === "Follow-up booked" ? "Follow-up booked" : row.tag,
  action: row.next_action ?? undefined,
  referralId: row.referral_id ?? undefined
});

const toReferral = (row: ReferralRow): Referral => ({
  id: row.id,
  caseId: row.case_id,
  facility: row.facility,
  reason: row.reason,
  sentAt: row.sent_at,
  status: row.status,
  acknowledgedAt: row.acknowledged_at ?? undefined,
  followUpDate: row.follow_up_date ?? undefined
});

const getCaseOrThrow = (caseId: string) => {
  const row = db.prepare(`${caseQuery} WHERE c.id = ?`).get(caseId) as CaseRow | undefined;
  if (!row) throw new Error("Care case not found");
  return toTask(row);
};

const getReferralOrThrow = (referralId: string) => {
  const row = db.prepare("SELECT * FROM referrals WHERE id = ?").get(referralId) as ReferralRow | undefined;
  if (!row) throw new Error("Referral not found");
  return toReferral(row);
};

const getEvents = (caseId: string): CareEvent[] => (db.prepare("SELECT id, case_id, event_type, text, timestamp FROM care_events WHERE case_id = ? ORDER BY timestamp").all(caseId) as Array<{ id: string; case_id: string; event_type: CareEvent["type"]; text: string; timestamp: string }>).map((event) => ({ id: event.id, caseId: event.case_id, type: event.event_type, text: event.text, timestamp: event.timestamp }));

const addEvent = (caseId: string, type: CareEvent["type"], text: string, timestamp: string) => {
  db.prepare("INSERT INTO care_events (id, case_id, event_type, text, timestamp) VALUES (?, ?, ?, ?, ?)").run(newId("event"), caseId, type, text, timestamp);
};

export const careStore = {
  authenticate(username: string, password: string) {
    const user = db.prepare("SELECT id, username, password_hash, full_name AS fullName, role FROM users WHERE username = ?").get(username.trim().toLowerCase()) as (SessionUser & { password_hash: string }) | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) return undefined;
    const { password_hash: _passwordHash, ...safeUser } = user;
    return { token: createSession(user.id), user: safeUser };
  },

  sessionUser(token: string) {
    return getSessionUser(token);
  },

  dashboard() {
    const tasks = (db.prepare(`${caseQuery} ORDER BY CASE WHEN c.id = 'case-ramesh' THEN 0 ELSE 1 END, c.scheduled_for`).all() as CaseRow[]).map(toTask);
    const openReferrals = db.prepare("SELECT COUNT(*) AS count FROM referrals WHERE status = 'Awaiting PHC'").get() as { count: number };
    const focusStatus = getReferralOrThrow("ref-ramesh").status;
    return {
      greeting: "Good morning, Sunita.",
      dateLabel: "MONDAY, 24 NOVEMBER",
      tasks,
      metrics: { visitsToday: 4, confirmedVisits: 2, openReferrals: openReferrals.count, followUpsDue: 2 },
      focusCaseId: "case-ramesh",
      focusStatus
    };
  },

  listCases() {
    return (db.prepare(`${caseQuery} ORDER BY c.created_at`).all() as CaseRow[]).map((row) => {
      const careCase = toTask(row);
      return { ...careCase, referral: careCase.referralId ? getReferralOrThrow(careCase.referralId) : undefined, events: getEvents(careCase.id) };
    });
  },

  getCase(caseId: string) {
    const careCase = getCaseOrThrow(caseId);
    return { ...careCase, referral: careCase.referralId ? getReferralOrThrow(careCase.referralId) : undefined, events: getEvents(caseId) };
  },

  recordAction(caseId: string, action: CareAction) {
    getCaseOrThrow(caseId);
    db.prepare("UPDATE care_cases SET next_action = ? WHERE id = ?").run(action, caseId);
    addEvent(caseId, "action", `Next action recorded: ${action}.`, "09:16");
    return this.getCase(caseId);
  },

  acknowledgeReferral(referralId: string) {
    const referral = getReferralOrThrow(referralId);
    db.prepare("UPDATE referrals SET status = ?, acknowledged_at = ? WHERE id = ?").run("Received at PHC", "09:24", referralId);
    addEvent(referral.caseId, "acknowledgement", "PHC accepted the referral and will update the visit.", "09:24");
    return getReferralOrThrow(referralId);
  },

  scheduleFollowUp(caseId: string, date = "Friday, 28 Nov") {
    const careCase = getCaseOrThrow(caseId);
    if (!careCase.referralId) throw new Error("A follow-up needs a linked referral");
    db.prepare("UPDATE referrals SET status = ?, follow_up_date = ? WHERE id = ?").run("Follow-up booked", date, careCase.referralId);
    addEvent(caseId, "follow-up", `Home visit scheduled for ${date}.`, "09:25");
    return getReferralOrThrow(careCase.referralId);
  },

  getAshaProfile(userId: string) {
    const profile = db.prepare(`SELECT a.id, a.worker_code AS workerCode, a.village, a.block, a.assigned_panchayat AS assignedPanchayat, u.full_name AS fullName, u.phone FROM asha_workers a JOIN users u ON u.id = a.user_id WHERE a.user_id = ?`).get(userId) as Record<string, unknown> | undefined;
    if (!profile) throw new Error("ASHA worker profile not found");
    const ashaWorkerId = profile.id as string;
    const patients = db.prepare(`SELECT p.patient_code AS patientCode, u.full_name AS fullName, p.age, p.gender, p.village FROM patients p JOIN users u ON u.id = p.user_id WHERE p.linked_asha_worker_id = ?`).all(ashaWorkerId) as Record<string, unknown>[];
    return { profile, patients };
  },

  getPatientProfile(userId: string) {
    const profile = db.prepare(`SELECT p.id, p.patient_code AS patientCode, p.age, p.gender, p.village, u.full_name AS fullName, a.worker_code AS ashaCode, au.full_name AS ashaName, au.phone AS ashaPhone FROM patients p JOIN users u ON u.id = p.user_id JOIN asha_workers a ON a.id = p.linked_asha_worker_id JOIN users au ON au.id = a.user_id WHERE p.user_id = ?`).get(userId) as Record<string, unknown> | undefined;
    if (!profile) throw new Error("Patient profile not found");
    const cases = db.prepare(`${caseQuery} WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?) ORDER BY c.created_at DESC`).all(userId) as CaseRow[];
    const requests = db.prepare("SELECT id, request_type AS requestType, status, created_at AS createdAt FROM patient_requests WHERE patient_id = (SELECT id FROM patients WHERE user_id = ?) ORDER BY created_at DESC").all(userId) as Record<string, unknown>[];
    return { profile, cases: cases.map(toTask), requests };
  },

  createPatientCallback(userId: string) {
    const patient = db.prepare("SELECT id FROM patients WHERE user_id = ?").get(userId) as { id: string } | undefined;
    if (!patient) throw new Error("Patient profile not found");
    const request = { id: newId("request"), requestType: "Callback requested", status: "Open", createdAt: new Date().toISOString() };
    db.prepare("INSERT INTO patient_requests (id, patient_id, request_type, status, created_at) VALUES (?, ?, ?, ?, ?)").run(request.id, patient.id, request.requestType, request.status, request.createdAt);
    return request;
  }
};

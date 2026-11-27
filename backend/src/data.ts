import { isValidFollowUpDate } from "./follow-up";
import { randomBytes } from "node:crypto";
import { hashPassword, newId, supabase, verifyPassword, type SessionUser } from "./supabase";
import { analyzeSeverityWithGemini, buildPatientCredentials, maskAadhaar, normalizeAadhaar } from "./triage";
import type { CareAction, CareCase, CareEvent, CaseStatus, Referral, SeverityLevel } from "./types";

interface CaseDbRow {
  id: string;
  patient_id: string;
  initials: string;
  context: string;
  scheduled_for: string;
  tone: CareCase["tone"];
  tag: string;
  next_action: CareAction | null;
  visit_type: "fresh" | "follow-up" | null;
  severity_score: number | null;
  severity_level: SeverityLevel | null;
  triage_summary: string | null;
  alert_flagged: boolean | null;
  source: "web" | "telegram" | null;
  created_at: string;
  patients: {
    id: string;
    patient_code: string;
    age: number;
    gender: string;
    village: string;
    aadhaar: string | null;
    users: { id: string; full_name: string };
  };
  referrals: ReferralDbRow | ReferralDbRow[] | null;
}

interface ReferralDbRow {
  id: string;
  case_id: string;
  facility: string;
  reason: string;
  sent_at: string;
  status: CaseStatus;
  acknowledged_at: string | null;
  follow_up_date: string | null;
}

const CASE_SELECT = `
  id, patient_id, initials, context, scheduled_for, tone, tag, next_action,
  visit_type, severity_score, severity_level, triage_summary, alert_flagged, source, created_at,
  patients!inner(id, patient_code, age, gender, village, aadhaar, users!inner(id, full_name)),
  referrals(*)
`;

const timeNow = () => new Date().toTimeString().slice(0, 5);

const unwrapReferral = (raw: CaseDbRow["referrals"]): ReferralDbRow | undefined =>
  Array.isArray(raw) ? raw[0] : raw ?? undefined;

const toTask = (row: CaseDbRow): CareCase => {
  const ref = unwrapReferral(row.referrals);
  return {
    id: row.id,
    initials: row.initials,
    name: row.patients.users.full_name,
    ageLabel: `${row.patients.age} years`,
    ward: row.patients.village,
    context: row.context,
    time: row.scheduled_for,
    tone: row.tone,
    tag: ref?.status === "Received at PHC" ? "PHC received" : ref?.status === "Follow-up booked" ? "Follow-up booked" : row.tag,
    action: row.next_action ?? undefined,
    referralId: ref?.id,
    referralStatus: ref?.status,
    followUpDate: ref?.follow_up_date ?? undefined,
    visitType: row.visit_type ?? "fresh",
    severityScore: row.severity_score ?? 1,
    severityLevel: row.severity_level ?? "Moderate",
    triageSummary: row.triage_summary ?? undefined,
    alertFlagged: Boolean(row.alert_flagged),
    source: row.source ?? "web",
    aadhaarMasked: maskAadhaar(row.patients.aadhaar),
    createdAt: row.created_at
  };
};

const toReferral = (row: ReferralDbRow): Referral => ({
  id: row.id,
  caseId: row.case_id,
  facility: row.facility,
  reason: row.reason,
  sentAt: row.sent_at,
  status: row.status,
  acknowledgedAt: row.acknowledged_at ?? undefined,
  followUpDate: row.follow_up_date ?? undefined
});

async function getCaseRowOrThrow(caseId: string): Promise<CaseDbRow> {
  const { data, error } = await supabase.from("care_cases").select(CASE_SELECT).eq("id", caseId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Care case not found");
  return data as unknown as CaseDbRow;
}

async function getReferralOrThrow(referralId: string): Promise<Referral> {
  const { data, error } = await supabase.from("referrals").select("*").eq("id", referralId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Referral not found");
  return toReferral(data as ReferralDbRow);
}

async function getEvents(caseId: string): Promise<CareEvent[]> {
  const { data, error } = await supabase
    .from("care_events")
    .select("id, case_id, event_type, text, timestamp")
    .eq("case_id", caseId)
    .order("timestamp", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({
    id: e.id,
    caseId: e.case_id,
    type: e.event_type as CareEvent["type"],
    text: e.text,
    timestamp: e.timestamp
  }));
}

async function addEvent(caseId: string, type: CareEvent["type"], text: string, timestamp: string) {
  await supabase.from("care_events").insert({
    id: newId("event"),
    case_id: caseId,
    event_type: type,
    text,
    timestamp
  });
}

export const careStore = {
  async getState(key: string): Promise<string | undefined> {
    const { data } = await supabase.from("app_state").select("value").eq("key", key).maybeSingle();
    return data?.value;
  },

  async setState(key: string, value: string) {
    await supabase.from("app_state").upsert({ key, value }, { onConflict: "key" });
  },

  async authenticate(username: string, password: string) {
    const { data: user } = await supabase
      .from("users")
      .select("id, username, password_hash, full_name, role")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();
    if (!user || !verifyPassword(password, user.password_hash)) return undefined;

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();
    await supabase.from("sessions").insert({ token, user_id: user.id, expires_at: expiresAt });

    return {
      token,
      user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role } as SessionUser
    };
  },

  async sessionUser(token: string): Promise<SessionUser | undefined> {
    const { data } = await supabase
      .from("sessions")
      .select("expires_at, users!inner(id, username, full_name, role)")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!data) return undefined;
    const u = data.users as unknown as { id: string; username: string; full_name: string; role: SessionUser["role"] };
    return { id: u.id, username: u.username, fullName: u.full_name, role: u.role };
  },

  async dashboard(ashaFullName = "ASHA Worker") {
    const { data: rows, error } = await supabase
      .from("care_cases")
      .select(CASE_SELECT)
      .order("severity_score", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const tasks = ((rows ?? []) as unknown as CaseDbRow[]).map(toTask);
    const openReferrals = tasks.filter((t) => t.referralStatus === "Awaiting PHC").length;
    const focusTask = tasks.find((t) => t.referralStatus === "Awaiting PHC") ?? tasks.find((t) => t.referralId) ?? tasks[0];
    const firstName = ashaFullName.trim().split(/\s+/)[0] || "ASHA";

    const { data: reqRows } = await supabase
      .from("patient_requests")
      .select("id, patient_id, request_type, status, created_at, patients!inner(village, users!inner(full_name))")
      .eq("status", "Open")
      .order("created_at", { ascending: false });

    const callbackRequests = (reqRows ?? []).map((r) => {
      const p = r.patients as unknown as { village: string; users: { full_name: string } };
      return {
        id: r.id,
        patientId: r.patient_id,
        patientName: p.users.full_name,
        village: p.village,
        requestType: r.request_type,
        status: r.status,
        createdAt: r.created_at
      };
    });

    return {
      greeting: `Good morning, ${firstName}.`,
      dateLabel: new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }).toUpperCase(),
      tasks,
      metrics: {
        visitsToday: tasks.length,
        confirmedVisits: tasks.filter((t) => t.referralStatus && t.referralStatus !== "Awaiting PHC").length,
        openReferrals,
        followUpsDue: tasks.filter((t) => t.visitType === "follow-up" || t.referralStatus === "Follow-up booked").length
      },
      focusCaseId: focusTask?.id ?? null,
      focusStatus: focusTask?.referralStatus ?? null,
      callbackRequests
    };
  },

  async phcDashboard() {
    const { data: rows, error } = await supabase
      .from("care_cases")
      .select(CASE_SELECT)
      .order("severity_score", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const allCases = ((rows ?? []) as unknown as CaseDbRow[])
      .map(toTask)
      .filter((c) => Boolean(c.referralId) || c.source === "telegram" || c.alertFlagged);

    // Rank active cases by severity score descending (most severe #1), completed follow-ups below.
    const rankedQueue = [...allCases].sort((a, b) => {
      const aDone = a.referralStatus === "Follow-up booked" ? 1 : 0;
      const bDone = b.referralStatus === "Follow-up booked" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return (b.severityScore ?? 1) - (a.severityScore ?? 1);
    });

    const alerts = rankedQueue.filter((c) => c.alertFlagged && c.referralStatus !== "Follow-up booked");

    return {
      alerts,
      queue: rankedQueue,
      counts: {
        total: rankedQueue.length,
        awaiting: rankedQueue.filter((c) => c.referralStatus === "Awaiting PHC").length,
        criticalAlerts: alerts.length
      }
    };
  },

  async listCases() {
    const { data: rows, error } = await supabase.from("care_cases").select(CASE_SELECT).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return Promise.all(
      ((rows ?? []) as unknown as CaseDbRow[]).map(async (row) => {
        const ref = unwrapReferral(row.referrals);
        return {
          ...toTask(row),
          referral: ref ? toReferral(ref) : undefined,
          events: await getEvents(row.id)
        };
      })
    );
  },

  async getCase(caseId: string) {
    const row = await getCaseRowOrThrow(caseId);
    const ref = unwrapReferral(row.referrals);
    return {
      ...toTask(row),
      referral: ref ? toReferral(ref) : undefined,
      events: await getEvents(caseId)
    };
  },

  async createCase(input: { patientId: string; context: string; scheduledFor?: string; tone?: CareCase["tone"]; tag?: string }) {
    const { data: patient } = await supabase
      .from("patients")
      .select("id, age, users!inner(full_name)")
      .eq("id", input.patientId)
      .maybeSingle();
    if (!patient) throw new Error("Patient not found");

    const fullName = (patient.users as unknown as { full_name: string }).full_name;
    const initials = fullName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "PT";
    const triage = await analyzeSeverityWithGemini({ name: fullName, age: patient.age, description: input.context });
    const id = newId("case");

    const { error } = await supabase.from("care_cases").insert({
      id,
      patient_id: patient.id,
      initials,
      context: input.context.trim(),
      scheduled_for: input.scheduledFor?.trim() || "Today",
      tone: input.tone ?? (triage.alertFlagged ? "urgent" : "warm"),
      tag: input.tag?.trim() || "New concern",
      visit_type: "fresh",
      severity_score: triage.severityScore,
      severity_level: triage.severityLevel,
      triage_summary: triage.summary,
      alert_flagged: triage.alertFlagged,
      source: "web"
    });
    if (error) throw new Error(error.message);

    await addEvent(id, "concern", `ASHA logged visit: ${input.context.trim()} (${triage.severityLevel} · ${triage.severityScore}/10).`, timeNow());
    return this.getCase(id);
  },

  async ingestVisitFromIntake(input: { name: string; age: number; aadhaar: string; description: string; source: "telegram" | "web" }) {
    const aadhaar = normalizeAadhaar(input.aadhaar);
    if (!aadhaar) throw new Error("Invalid Aadhaar number (must be 12 digits starting with 2-9)");

    const { data: existingPatient } = await supabase
      .from("patients")
      .select("id, user_id, users!inner(full_name)")
      .eq("aadhaar", aadhaar)
      .maybeSingle();

    let patientId: string;
    let patientName: string;
    let visitType: "fresh" | "follow-up";
    let credentials: { username: string; password: string } | undefined;

    if (existingPatient) {
      patientId = existingPatient.id;
      patientName = (existingPatient.users as unknown as { full_name: string }).full_name;
      visitType = "follow-up";
    } else {
      visitType = "fresh";
      patientName = input.name.trim();
      const creds = buildPatientCredentials(patientName, aadhaar);
      const { data: usernameTaken } = await supabase.from("users").select("id").eq("username", creds.baseUsername).maybeSingle();
      const username = usernameTaken ? `${creds.baseUsername}${aadhaar.slice(-4)}` : creds.baseUsername;
      credentials = { username, password: creds.password };

      const userId = newId("user");
      const { error: userErr } = await supabase.from("users").insert({
        id: userId,
        username,
        password_hash: hashPassword(creds.password),
        role: "patient",
        full_name: patientName,
        phone: `TG-${aadhaar}`
      });
      if (userErr) throw new Error(userErr.message);

      patientId = newId("patient");
      const { error: patErr } = await supabase.from("patients").insert({
        id: patientId,
        user_id: userId,
        patient_code: `PT-TG-${aadhaar.slice(-4)}`,
        age: input.age,
        gender: "Unspecified",
        village: "Hoskote",
        aadhaar,
        linked_asha_worker_id: "asha-sunita"
      });
      if (patErr) throw new Error(patErr.message);
    }

    const triage = await analyzeSeverityWithGemini({ name: patientName, age: input.age, description: input.description });
    const initials = patientName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "PT";
    const tone: CareCase["tone"] =
      triage.severityLevel === "Critical" || triage.severityLevel === "High"
        ? "urgent"
        : triage.severityLevel === "Moderate"
          ? "warm"
          : "blue";
    const caseId = newId("case");
    const nowTime = timeNow();

    const { error: caseErr } = await supabase.from("care_cases").insert({
      id: caseId,
      patient_id: patientId,
      initials,
      context: input.description.trim(),
      scheduled_for: nowTime,
      tone,
      tag: visitType === "follow-up" ? "Follow-up visit" : "Fresh visit",
      next_action: triage.recommendedAction,
      visit_type: visitType,
      severity_score: triage.severityScore,
      severity_level: triage.severityLevel,
      triage_summary: triage.summary,
      alert_flagged: triage.alertFlagged,
      source: input.source
    });
    if (caseErr) throw new Error(caseErr.message);

    await addEvent(caseId, "concern", `${input.source === "telegram" ? "Telegram" : "ASHA"} intake (${visitType}): ${input.description.trim()}.`, nowTime);

    // Every Telegram/triage intake enters the PHC appointment queue ranked by severity.
    const referralId = newId("ref");
    await supabase.from("referrals").insert({
      id: referralId,
      case_id: caseId,
      facility: "Arogya Mandir, Hoskote",
      reason: triage.summary,
      sent_at: nowTime,
      status: "Awaiting PHC"
    });
    await addEvent(caseId, "referral", `Queued for PHC doctor review (Severity ${triage.severityScore}/10 · ${triage.severityLevel}).`, nowTime);

    const careCase = await this.getCase(caseId);
    return { careCase, visitType, isNewAccount: !existingPatient, credentials };
  },

  async createReferral(caseId: string, facility = "Arogya Mandir, Hoskote", reason = "Review required after field screening") {
    const existing = await getCaseRowOrThrow(caseId);
    if (unwrapReferral(existing.referrals)) return this.getCase(caseId);

    const sentAt = timeNow();
    const { error } = await supabase.from("referrals").insert({
      id: newId("ref"),
      case_id: caseId,
      facility: facility.trim(),
      reason: reason.trim(),
      sent_at: sentAt,
      status: "Awaiting PHC"
    });
    if (error) throw new Error(error.message);

    await addEvent(caseId, "referral", `Summary shared with ${facility.trim()}.`, sentAt);
    return this.getCase(caseId);
  },

  async recordAction(caseId: string, action: CareAction) {
    await getCaseRowOrThrow(caseId);
    const { error } = await supabase.from("care_cases").update({ next_action: action }).eq("id", caseId);
    if (error) throw new Error(error.message);
    await addEvent(caseId, "action", `Next action recorded: ${action}.`, timeNow());
    return this.getCase(caseId);
  },

  async acknowledgeReferral(referralId: string) {
    const referral = await getReferralOrThrow(referralId);
    if (referral.status !== "Awaiting PHC") return referral;
    const ackAt = timeNow();
    const { error } = await supabase
      .from("referrals")
      .update({ status: "Received at PHC", acknowledged_at: ackAt })
      .eq("id", referralId);
    if (error) throw new Error(error.message);
    await addEvent(referral.caseId, "acknowledgement", "PHC accepted the referral and will update the visit.", ackAt);
    return getReferralOrThrow(referralId);
  },

  async scheduleFollowUp(caseId: string, date: string) {
    if (!isValidFollowUpDate(date)) throw new Error("Invalid follow-up date: choose today or later");
    const row = await getCaseRowOrThrow(caseId);
    const ref = unwrapReferral(row.referrals);
    if (!ref) throw new Error("A follow-up needs a linked referral");
    if (ref.status === "Follow-up booked") return getReferralOrThrow(ref.id);
    if (ref.status !== "Received at PHC") throw new Error("Invalid follow-up: PHC must acknowledge the referral first");

    const { error } = await supabase
      .from("referrals")
      .update({ status: "Follow-up booked", follow_up_date: date })
      .eq("id", ref.id);
    if (error) throw new Error(error.message);
    await addEvent(caseId, "follow-up", `Home visit scheduled for ${date}.`, timeNow());
    return getReferralOrThrow(ref.id);
  },

  async resolveCallbackRequest(requestId: string) {
    const { data, error } = await supabase
      .from("patient_requests")
      .update({ status: "Completed" })
      .eq("id", requestId)
      .select("id, status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Callback request not found");
    return data;
  },

  async getAshaProfile(userId: string) {
    const { data: worker, error } = await supabase
      .from("asha_workers")
      .select("id, worker_code, village, block, assigned_panchayat, users!inner(full_name, phone)")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!worker) throw new Error("ASHA worker profile not found");

    const wu = worker.users as unknown as { full_name: string; phone: string };
    const profile = {
      id: worker.id,
      workerCode: worker.worker_code,
      village: worker.village,
      block: worker.block,
      assignedPanchayat: worker.assigned_panchayat,
      fullName: wu.full_name,
      phone: wu.phone
    };

    const { data: patRows } = await supabase
      .from("patients")
      .select("id, patient_code, age, gender, village, users!inner(full_name)")
      .eq("linked_asha_worker_id", worker.id);

    const patients = (patRows ?? []).map((p) => ({
      id: p.id,
      patientCode: p.patient_code,
      fullName: (p.users as unknown as { full_name: string }).full_name,
      age: p.age,
      gender: p.gender,
      village: p.village
    }));

    return { profile, patients };
  },

  async getPatientProfile(userId: string) {
    const { data: pat, error } = await supabase
      .from("patients")
      .select("id, patient_code, age, gender, village, aadhaar, users!inner(full_name), asha_workers!inner(worker_code, users!inner(full_name, phone))")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pat) throw new Error("Patient profile not found");

    const pu = pat.users as unknown as { full_name: string };
    const aw = pat.asha_workers as unknown as { worker_code: string; users: { full_name: string; phone: string } };

    const profile = {
      id: pat.id,
      patientCode: pat.patient_code,
      age: pat.age,
      gender: pat.gender,
      village: pat.village,
      aadhaarMasked: maskAadhaar(pat.aadhaar),
      fullName: pu.full_name,
      ashaCode: aw.worker_code,
      ashaName: aw.users.full_name,
      ashaPhone: aw.users.phone
    };

    const { data: caseRows } = await supabase
      .from("care_cases")
      .select(CASE_SELECT)
      .eq("patient_id", pat.id)
      .order("created_at", { ascending: false });

    const { data: reqRows } = await supabase
      .from("patient_requests")
      .select("id, request_type, status, created_at")
      .eq("patient_id", pat.id)
      .order("created_at", { ascending: false });

    return {
      profile,
      cases: ((caseRows ?? []) as unknown as CaseDbRow[]).map(toTask),
      requests: (reqRows ?? []).map((r) => ({
        id: r.id,
        requestType: r.request_type,
        status: r.status,
        createdAt: r.created_at
      }))
    };
  },

  async createPatientCallback(userId: string) {
    const { data: pat } = await supabase.from("patients").select("id").eq("user_id", userId).maybeSingle();
    if (!pat) throw new Error("Patient profile not found");

    const request = {
      id: newId("request"),
      patient_id: pat.id,
      request_type: "Callback requested",
      status: "Open",
      created_at: new Date().toISOString()
    };
    const { error } = await supabase.from("patient_requests").insert(request);
    if (error) throw new Error(error.message);
    return { id: request.id, requestType: request.request_type, status: request.status, createdAt: request.created_at };
  }
};

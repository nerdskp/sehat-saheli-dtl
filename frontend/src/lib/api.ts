export type CaseStatus = "Awaiting PHC" | "Received at PHC" | "Follow-up booked";
export type SeverityLevel = "Low" | "Moderate" | "High" | "Critical";
export type CareAction = "Facility review needed" | "Routine follow-up" | "Need ANM guidance";

export interface CareTask {
  id: string;
  initials: string;
  name: string;
  ageLabel: string;
  ward: string;
  context: string;
  time: string;
  tone: "urgent" | "warm" | "blue" | "violet";
  tag: string;
  action?: CareAction;
  referralId?: string;
  referralStatus?: CaseStatus;
  followUpDate?: string;
  visitType?: "fresh" | "follow-up";
  severityScore?: number;
  severityLevel?: SeverityLevel;
  triageSummary?: string;
  alertFlagged?: boolean;
  source?: "web" | "telegram";
  aadhaarMasked?: string;
}

export interface CareCaseDetail extends CareTask {
  referral?: {
    id: string;
    caseId: string;
    facility: string;
    reason: string;
    sentAt: string;
    status: CaseStatus;
    acknowledgedAt?: string;
    followUpDate?: string;
  };
  events: Array<{ id: string; caseId: string; type: string; text: string; timestamp: string }>;
}

export interface LoginResponse {
  token: string;
  user: { id: string; username: string; fullName: string; role: "asha" | "patient" | "phc" };
}

export interface AshaProfileResponse {
  profile: { workerCode: string; village: string; block: string; assignedPanchayat: string; fullName: string; phone: string };
  patients: Array<{ id: string; patientCode: string; fullName: string; age: number; gender: string; village: string }>;
}

export interface CallbackRequest {
  id: string;
  patientId: string;
  patientName: string;
  village: string;
  requestType: string;
  status: string;
  createdAt: string;
}

export interface PatientProfileResponse {
  profile: { fullName: string; patientCode: string; age: number; gender: string; village: string; ashaName: string; ashaPhone: string };
  cases: CareTask[];
  requests: Array<{ id: string; requestType: string; status: string; createdAt: string }>;
}

interface DashboardPayload {
  greeting: string;
  dateLabel: string;
  tasks: CareTask[];
  metrics: { visitsToday: number; confirmedVisits: number; openReferrals: number; followUpsDue: number };
  focusCaseId: string | null;
  focusStatus: CaseStatus | null;
  callbackRequests: CallbackRequest[];
}

const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}

const authenticated = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });

export interface PhcDashboardPayload {
  alerts: CareTask[];
  queue: CareTask[];
  counts: { total: number; awaiting: number; criticalAlerts: number };
}

export interface IntakeVisitResponse {
  careCase: CareCaseDetail;
  visitType: "fresh" | "follow-up";
  isNewAccount: boolean;
  credentials?: { username: string; password: string };
}

export const careApi = {
  dashboard: (token: string) => request<DashboardPayload>("/dashboard", authenticated(token)),
  phcDashboard: (token: string) => request<PhcDashboardPayload>("/phc/dashboard", authenticated(token)),
  login: (username: string, password: string) => request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  ashaProfile: (token: string) => request<AshaProfileResponse>("/asha/me", authenticated(token)),
  getCase: (token: string, caseId: string) => request<CareCaseDetail>(`/cases/${caseId}`, authenticated(token)),
  createCase: (token: string, payload: { patientId: string; context: string; scheduledFor?: string; tone?: CareTask["tone"] }) =>
    request<CareCaseDetail>("/cases", { method: "POST", body: JSON.stringify(payload), ...authenticated(token) }),
  ingestVisit: (token: string, payload: { name: string; age: number; aadhaar: string; description: string }) =>
    request<IntakeVisitResponse>("/intake/visit", { method: "POST", body: JSON.stringify(payload), ...authenticated(token) }),
  createReferral: (token: string, caseId: string, payload?: { facility?: string; reason?: string }) =>
    request<CareCaseDetail>(`/cases/${caseId}/referrals`, { method: "POST", body: JSON.stringify(payload ?? {}), ...authenticated(token) }),
  resolveCallback: (token: string, requestId: string) =>
    request<{ id: string; status: string }>(`/requests/${requestId}`, { method: "PATCH", ...authenticated(token) }),
  patientProfile: (token: string) => request<PatientProfileResponse>("/patient/me", authenticated(token)),
  requestPatientCallback: (token: string) => request<{ id: string; requestType: string; status: string; createdAt: string }>("/patient/me/callbacks", { method: "POST", ...authenticated(token) }),
  recordAction: (token: string, caseId: string, action: CareAction) => request<CareCaseDetail>(`/cases/${caseId}/action`, { method: "PATCH", body: JSON.stringify({ action }), ...authenticated(token) }),
  acknowledgeReferral: (token: string, referralId: string) => request<{ status: CaseStatus }>(`/referrals/${referralId}/acknowledge`, { method: "POST", ...authenticated(token) }),
  scheduleFollowUp: (token: string, caseId: string) => request<{ status: CaseStatus }>(`/cases/${caseId}/follow-ups`, { method: "POST", body: JSON.stringify({}), ...authenticated(token) })
};

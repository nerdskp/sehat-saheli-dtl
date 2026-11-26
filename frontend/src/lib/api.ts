export type CaseStatus = "Awaiting PHC" | "Received at PHC" | "Follow-up booked";
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
}

export interface LoginResponse {
  token: string;
  user: { id: string; username: string; fullName: string; role: "asha" | "patient" };
}

export interface PatientProfileResponse {
  profile: { fullName: string; patientCode: string; age: number; gender: string; village: string; ashaName: string; ashaPhone: string };
  cases: CareTask[];
  requests: Array<{ id: string; requestType: string; status: string; createdAt: string }>;
}

interface DashboardPayload {
  tasks: CareTask[];
  focusStatus: CaseStatus;
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

export const careApi = {
  dashboard: (token: string) => request<DashboardPayload>("/dashboard", authenticated(token)),
  login: (username: string, password: string) => request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  ashaProfile: (token: string) => request("/asha/me", authenticated(token)),
  patientProfile: (token: string) => request<PatientProfileResponse>("/patient/me", authenticated(token)),
  requestPatientCallback: (token: string) => request<{ id: string; requestType: string; status: string; createdAt: string }>("/patient/me/callbacks", { method: "POST", ...authenticated(token) }),
  recordAction: (token: string, caseId: string, action: CareAction) => request(`/cases/${caseId}/action`, { method: "PATCH", body: JSON.stringify({ action }), ...authenticated(token) }),
  acknowledgeReferral: (token: string, referralId: string) => request<{ status: CaseStatus }>(`/referrals/${referralId}/acknowledge`, { method: "POST", ...authenticated(token) }),
  scheduleFollowUp: (token: string, caseId: string) => request<{ status: CaseStatus }>(`/cases/${caseId}/follow-ups`, { method: "POST", body: JSON.stringify({}), ...authenticated(token) })
};

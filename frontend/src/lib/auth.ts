export type AppRole = "asha" | "patient";

export interface AppSession {
  token: string;
  user: { id: string; username: string; fullName: string; role: AppRole };
}

const key = "sehat-saheli-demo-session";

export function saveSession(session: AppSession) {
  window.localStorage.setItem(key, JSON.stringify(session));
}

export function readSession(): AppSession | null {
  const stored = window.localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as AppSession;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function clearSession() {
  window.localStorage.removeItem(key);
}

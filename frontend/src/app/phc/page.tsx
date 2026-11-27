"use client";

import { AlertTriangle, CalendarCheck, Check, Clock3, HeartPulse, LogOut, RefreshCw, ShieldCheck, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, careApi, type CareTask, type PhcDashboardPayload } from "@/lib/api";
import { clearSession, readSession } from "@/lib/auth";

const severityStyle = (level?: CareTask["severityLevel"]) => {
  if (level === "Critical") return { background: "#ffe5e0", color: "#a82417" };
  if (level === "High") return { background: "#fff0eb", color: "#c25945" };
  if (level === "Moderate") return { background: "#fff5df", color: "#a97421" };
  return { background: "#e8f6f0", color: "#1d6b56" };
};

export default function PhcPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<PhcDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  const actionLock = useRef(false);
  const handleError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
      clearSession();
      router.replace("/login");
    } else setError("Could not refresh the queue. Check your connection and try again.");
  }, [router]);

  const load = useCallback(async (authToken: string) => {
    const payload = await careApi.phcDashboard(authToken);
    setData(payload);
    setError("");
  }, []);

  useEffect(() => {
    const session = readSession();
    if (!session || session.user.role !== "phc") {
      router.replace("/login");
      return;
    }
    setToken(session.token);
    load(session.token).catch(handleError).finally(() => setLoading(false));

    const timer = window.setInterval(() => {
      load(session.token).catch(handleError);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [router, load, handleError]);

  const updateTask = async (task: CareTask, action: "acknowledge" | "follow-up") => {
    if (!token || actionLock.current) return;
    actionLock.current = true;
    setPending(task.id);
    setActionError("");
    try {
      if (action === "acknowledge" && task.referralId) await careApi.acknowledgeReferral(token, task.referralId);
      if (action === "follow-up") await careApi.scheduleFollowUp(token, task.id, dates[task.id]);
      await load(token);
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not save. Try again."); }
    finally { actionLock.current = false; setPending(null); }
  };

  const signOut = () => {
    clearSession();
    router.push("/login");
  };

  if (loading || !data) return <main className="route-loading"><div>{error ? <><p role="alert">{error}</p><button className="primary-button" onClick={() => token && load(token).catch(handleError)}>Retry</button><button className="outline-button" onClick={signOut}>Sign out</button></> : "Opening PHC triage queue…"}</div></main>;

  return (
    <main className="patient-shell">
      <header className="patient-header">
        <div className="patient-brand"><span><HeartPulse size={20} /></span><strong>Sehat Saheli · PHC</strong></div>
        <div className="header-actions">
          <button onClick={() => token && load(token).catch(handleError)}><RefreshCw size={15} />Refresh</button>
          <button onClick={signOut}><LogOut size={16} />Sign out</button>
        </div>
      </header>

      <section className="patient-content">
        {(actionError || error) && <div className="feedback-banner" role="alert">{actionError || error}</div>}
        <div className="patient-welcome">
          <div>
            <p className="eyebrow">AROGYA MANDIR, HOSKOTE · DOCTOR APPOINTMENT QUEUE</p>
            <h1>Severity-Ranked PHC Queue</h1>
            <p>Incoming ASHA &amp; Telegram visits are prioritized for review and ordered with the highest urgency at #1.</p>
          </div>
          <div className="patient-avatar"><Stethoscope size={27} /></div>
        </div>

        <section className="panel" style={{ padding: 18, marginTop: 20, borderColor: data.alerts.length ? "#f2b8ad" : "#e2eae5", background: data.alerts.length ? "#fff5f3" : "white" }}>
          <div className="panel-heading" style={{ alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: data.alerts.length ? "#a82417" : "#4b6760" }}>
              <AlertTriangle size={20} />
              <div>
                <p className="eyebrow" style={{ color: data.alerts.length ? "#a82417" : "#78918b" }}>HIGH-SEVERITY ALERTS ({data.alerts.length})</p>
                <h2 style={{ fontSize: 16 }}>{data.alerts.length ? "Immediate doctor attention recommended" : "None"}</h2>
              </div>
            </div>
          </div>
          {data.alerts.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {data.alerts.map((alert) => (
                <div key={alert.id} className="phc-alert">
                  <div>
                    <strong>{alert.name}</strong> ({alert.ageLabel}) · {alert.context}
                    <div style={{ fontSize: 12, color: "#6a5250", marginTop: 2 }}>{alert.triageSummary ?? "None"}</div>
                  </div>
                  <span className="tag" style={severityStyle(alert.severityLevel)}>{alert.severityLevel} · {alert.severityScore}/10</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="metric-grid" style={{ marginTop: 20 }}>
          <article className="metric-card coral"><div><span>CRITICAL ALERTS</span><strong>{String(data.counts.criticalAlerts).padStart(2, "0")}</strong><small><AlertTriangle size={14} /> needs clinical review</small></div><AlertTriangle size={24} /></article>
          <article className="metric-card amber"><div><span>AWAITING PHC</span><strong>{String(data.counts.awaiting).padStart(2, "0")}</strong><small><Clock3 size={14} /> needs review</small></div><Clock3 size={24} /></article>
          <article className="metric-card teal"><div><span>TOTAL IN QUEUE</span><strong>{String(data.counts.total).padStart(2, "0")}</strong><small><ShieldCheck size={14} /> ranked by severity</small></div><Stethoscope size={24} /></article>
        </div>

        <section className="panel phc-queue" style={{ padding: 24 }}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">APPOINTMENT PRIORITY ORDER</p>
              <h2>Ranked patients ({data.queue.length})</h2>
            </div>
          </div>

          <div className="task-list">
            {data.queue.length === 0 && <p className="empty-request">None</p>}
            {data.queue.map((item, idx) => (
              <div key={item.id} className="task-row phc-task" style={{ alignItems: "flex-start", padding: "14px 4px", cursor: "default" }}>
                <div style={{ minWidth: 34, height: 34, borderRadius: 10, background: idx === 0 && item.alertFlagged ? "#a82417" : "#17645b", color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>
                  #{idx + 1}
                </div>
                <div className="task-person" style={{ flex: 1 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <strong>{item.name}</strong>
                    <span style={{ fontSize: 12, color: "#6c847e" }}>{item.ageLabel} · {item.ward}</span>
                    {item.aadhaarMasked && <span style={{ fontSize: 11, color: "#78918b" }}>Aadhaar {item.aadhaarMasked}</span>}
                    <span className="tag" style={severityStyle(item.severityLevel)}>
                      {item.severityLevel ?? "Moderate"} · {item.severityScore ?? 5}/10
                    </span>
                    <span className="tag tag-blue">{item.visitType === "follow-up" ? "Follow-up visit" : "Fresh visit"}</span>
                    {item.source === "telegram" && <span className="tag tag-violet">Telegram</span>}
                  </div>
                  <span>{item.context}</span>
                  {item.triageSummary && <span style={{ color: "#3d5e57", marginTop: 4 }}>{item.triageSummary}</span>}
                </div>

                <div className="phc-actions">
                  <span className={`tag ${item.referralStatus === "Follow-up booked" ? "tag-blue" : item.referralStatus === "Received at PHC" ? "tag-warm" : "tag-urgent"}`}>
                    {item.referralStatus ?? "Queued"}
                  </span>
                  {item.referralStatus === "Awaiting PHC" && item.referralId && (
                    <button className="primary-button" disabled={pending !== null} onClick={() => void updateTask(item, "acknowledge")}>
                      <Check size={14} />{pending === item.id ? "Saving…" : "Acknowledge"}
                    </button>
                  )}
                  {item.referralStatus === "Received at PHC" && (
                    <form className="follow-up-form" onSubmit={(event) => { event.preventDefault(); void updateTask(item, "follow-up"); }}>
                      <label>Follow-up date for {item.name}<input type="date" required value={dates[item.id] ?? ""} onChange={(event) => setDates((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
                      <button className="outline-button" disabled={pending !== null}>
                        <CalendarCheck size={14} />{pending === item.id ? "Saving…" : "Book follow-up"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

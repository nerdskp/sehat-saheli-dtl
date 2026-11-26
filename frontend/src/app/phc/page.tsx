"use client";

import { AlertTriangle, CalendarCheck, Check, Clock3, HeartPulse, LogOut, RefreshCw, ShieldCheck, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { careApi, type CareTask, type PhcDashboardPayload } from "@/lib/api";
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

  const load = useCallback(async (authToken: string) => {
    const payload = await careApi.phcDashboard(authToken);
    setData(payload);
  }, []);

  useEffect(() => {
    const session = readSession();
    if (!session || session.user.role !== "phc") {
      router.replace("/login");
      return;
    }
    setToken(session.token);
    load(session.token).catch(() => router.replace("/login")).finally(() => setLoading(false));

    const timer = window.setInterval(() => {
      load(session.token).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [router, load]);

  const acknowledge = async (task: CareTask) => {
    if (!token || !task.referralId) return;
    await careApi.acknowledgeReferral(token, task.referralId);
    await load(token);
  };

  const bookFollowUp = async (task: CareTask) => {
    if (!token) return;
    await careApi.scheduleFollowUp(token, task.id);
    await load(token);
  };

  const signOut = () => {
    clearSession();
    router.push("/login");
  };

  if (loading || !data) return <main className="route-loading">Opening PHC triage queue…</main>;

  return (
    <main className="patient-shell">
      <header className="patient-header">
        <div className="patient-brand"><span><HeartPulse size={20} /></span><strong>Sehat Saheli · PHC</strong></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => token && load(token)}><RefreshCw size={15} />Refresh</button>
          <button onClick={signOut}><LogOut size={16} />Sign out</button>
        </div>
      </header>

      <section className="patient-content">
        <div className="patient-welcome">
          <div>
            <p className="eyebrow">AROGYA MANDIR, HOSKOTE · DOCTOR APPOINTMENT QUEUE</p>
            <h1>Severity-Ranked PHC Queue</h1>
            <p>Incoming ASHA &amp; Telegram visits are triaged by Gemini AI and ordered with the highest urgency at #1.</p>
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
                <div key={alert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "white", border: "1px solid #f5d0c8" }}>
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
          <article className="metric-card coral"><div><span>CRITICAL ALERTS</span><strong>{String(data.counts.criticalAlerts).padStart(2, "0")}</strong><small><AlertTriangle size={14} /> flagged by Gemini</small></div><AlertTriangle size={24} /></article>
          <article className="metric-card amber"><div><span>AWAITING PHC</span><strong>{String(data.counts.awaiting).padStart(2, "0")}</strong><small><Clock3 size={14} /> needs review</small></div><Clock3 size={24} /></article>
          <article className="metric-card teal"><div><span>TOTAL IN QUEUE</span><strong>{String(data.counts.total).padStart(2, "0")}</strong><small><ShieldCheck size={14} /> ranked by severity</small></div><Stethoscope size={24} /></article>
        </div>

        <section className="panel" style={{ padding: 24 }}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">APPOINTMENT PRIORITY ORDER</p>
              <h2>Ranked patients ({data.queue.length})</h2>
            </div>
          </div>

          <div className="task-list">
            {data.queue.length === 0 && <p className="empty-request">None</p>}
            {data.queue.map((item, idx) => (
              <div key={item.id} className="task-row" style={{ alignItems: "flex-start", padding: "14px 4px", cursor: "default" }}>
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

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <span className={`tag ${item.referralStatus === "Follow-up booked" ? "tag-blue" : item.referralStatus === "Received at PHC" ? "tag-warm" : "tag-urgent"}`}>
                    {item.referralStatus ?? "Queued"}
                  </span>
                  {item.referralStatus === "Awaiting PHC" && item.referralId && (
                    <button className="primary-button" style={{ minHeight: 34, fontSize: 12 }} onClick={() => acknowledge(item)}>
                      <Check size={14} />Acknowledge
                    </button>
                  )}
                  {item.referralStatus === "Received at PHC" && (
                    <button className="outline-button" style={{ minHeight: 34, fontSize: 12 }} onClick={() => bookFollowUp(item)}>
                      <CalendarCheck size={14} />Book follow-up
                    </button>
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

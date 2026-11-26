"use client";

import {
  Activity,
  ArrowUpRight,
  BellRing,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  HeartPulse,
  Home,
  Languages,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PhoneCall,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  X
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  careApi,
  type AshaProfileResponse,
  type CallbackRequest,
  type CareAction,
  type CareCaseDetail,
  type CareTask,
  type CaseStatus
} from "@/lib/api";

type View = "queue" | "case" | "phc" | "households" | "guide";

const copy = {
  en: {
    fieldCare: "Field care",
    queue: "Today’s queue",
    cases: "Care cases",
    phc: "PHC handoffs",
    households: "Households",
    howItWorks: "How it works",
    signOut: "Sign out",
    newCase: "New care case",
    todaysPeople: "Today's people",
    viewCalendar: "View calendar",
    showRoute: "Back to route",
    visitsToday: "VISITS TODAY",
    openReferrals: "OPEN REFERRALS",
    followUpsDue: "FOLLOW-UPS DUE",
    subheading: "People who need a clear next step today."
  },
  kn: {
    fieldCare: "ಕ್ಷೇತ್ರ ಆರೈಕೆ",
    queue: "ಇಂದಿನ ಸರದಿ",
    cases: "ಆರೈಕೆ ಪ್ರಕರಣಗಳು",
    phc: "PHC ಹಸ್ತಾಂತರಗಳು",
    households: "ಕುಟುಂಬಗಳು",
    howItWorks: "ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ",
    signOut: "ಲಾಗ್ ಔಟ್",
    newCase: "ಹೊಸ ಪ್ರಕರಣ",
    todaysPeople: "ಇಂದಿನ ಜನರು",
    viewCalendar: "ಕ್ಯಾಲೆಂಡರ್ ನೋಡಿ",
    showRoute: "ಮಾರ್ಗಕ್ಕೆ ಹಿಂತಿರುಗಿ",
    visitsToday: "ಇಂದಿನ ಭೇಟಿಗಳು",
    openReferrals: "ತೆರೆದ ರೆಫರಲ್‌ಗಳು",
    followUpsDue: "ಬಾಕಿ ಫಾಲೋ-ಅಪ್",
    subheading: "ಇಂದು ಸ್ಪಷ್ಟ ಮುಂದಿನ ಹಂತ ಬೇಕಾಗಿರುವ ಜನರು."
  }
} as const;

const careActions: CareAction[] = ["Facility review needed", "Routine follow-up", "Need ANM guidance"];

function StatusPill({ status }: { status: CaseStatus }) {
  const classes = {
    "Awaiting PHC": "status status-amber",
    "Received at PHC": "status status-blue",
    "Follow-up booked": "status status-green"
  };
  return <span className={classes[status]}>{status}</span>;
}

export default function AshaWorkspace({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [view, setView] = useState<View>("queue");
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [selectedTask, setSelectedTask] = useState(0);
  const [status, setStatus] = useState<CaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ashaProfile, setAshaProfile] = useState<AshaProfileResponse["profile"] | null>(null);
  const [patients, setPatients] = useState<AshaProfileResponse["patients"]>([]);
  const [callbacks, setCallbacks] = useState<CallbackRequest[]>([]);
  const [showNewCase, setShowNewCase] = useState(false);
  const [newPatientId, setNewPatientId] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newTone, setNewTone] = useState<CareTask["tone"]>("warm");
  const [intakeMode, setIntakeMode] = useState<"existing" | "aadhaar">("aadhaar");
  const [intakeName, setIntakeName] = useState("");
  const [intakeAge, setIntakeAge] = useState("");
  const [intakeAadhaar, setIntakeAadhaar] = useState("");
  const [intakeError, setIntakeError] = useState("");
  const [newCreds, setNewCreds] = useState<{ username: string; password: string; name: string } | null>(null);
  const [greeting, setGreeting] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [metrics, setMetrics] = useState({ visitsToday: 0, confirmedVisits: 0, openReferrals: 0, followUpsDue: 0 });
  const [caseDetail, setCaseDetail] = useState<CareCaseDetail | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [answer, setAnswer] = useState<CareAction | null>(null);
  const [lang, setLang] = useState<"en" | "kn">("en");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [calendarMode, setCalendarMode] = useState(false);
  const t = copy[lang];

  const loadDashboard = async () => {
    const [dashboard, profileRes] = await Promise.all([careApi.dashboard(token), careApi.ashaProfile(token)]);
    setTasks(dashboard.tasks);
    setStatus(dashboard.focusStatus);
    setGreeting(dashboard.greeting);
    setDateLabel(dashboard.dateLabel);
    setMetrics(dashboard.metrics);
    setCallbacks(dashboard.callbackRequests ?? []);
    setAshaProfile(profileRes.profile);
    setPatients(profileRes.patients ?? []);
    setNewPatientId((cur) => cur || profileRes.patients?.[0]?.id || "");
  };

  useEffect(() => {
    let active = true;
    loadDashboard()
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    const timer = window.setInterval(() => {
      loadDashboard().catch(() => {});
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token]);

  const activeTask = tasks[selectedTask] ?? tasks[0];
  const referralTask = tasks.find((task) => task.referralId);
  const focusTask = tasks.find((task) => task.referralStatus === "Awaiting PHC") ?? referralTask ?? tasks[0];

  useEffect(() => {
    if (view !== "case" || !activeTask) return;
    let active = true;
    setCaseDetail(null);
    setAnswer(activeTask.action ?? null);
    const fetchCase = () =>
      careApi.getCase(token, activeTask.id)
        .then((detail) => {
          if (!active) return;
          setCaseDetail(detail);
          setAnswer(detail.action ?? null);
          if (detail.referral) setStatus(detail.referral.status);
        })
        .catch(() => {});
    fetchCase();
    const timer = window.setInterval(fetchCase, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token, view, activeTask?.id, activeTask?.action]);

  const openCase = (index = 0) => {
    setSelectedTask(index);
    setView("case");
  };

  const markReceived = async () => {
    const referralId = caseDetail?.referral?.id ?? referralTask?.referralId;
    if (!referralId) return;
    const referral = await careApi.acknowledgeReferral(token, referralId);
    setStatus(referral.status);
    await loadDashboard();
    if (referralTask) {
      const targetIndex = tasks.findIndex((task) => task.id === referralTask.id);
      if (targetIndex >= 0) setSelectedTask(targetIndex);
    }
    setView("case");
  };

  const scheduleFollowUp = async () => {
    if (!activeTask) return;
    const referral = await careApi.scheduleFollowUp(token, activeTask.id);
    setStatus(referral.status);
    const [detail] = await Promise.all([careApi.getCase(token, activeTask.id), loadDashboard()]);
    setCaseDetail(detail);
  };

  const selectAction = async (choice: CareAction) => {
    if (!activeTask) return;
    setAnswer(choice);
    const updated = await careApi.recordAction(token, activeTask.id, choice);
    setCaseDetail(updated);
    await loadDashboard();
  };

  const createNewCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIntakeError("");
    try {
      if (intakeMode === "aadhaar") {
        if (!intakeName.trim() || !intakeAge || !intakeAadhaar.trim() || !newContext.trim()) return;
        const result = await careApi.ingestVisit(token, {
          name: intakeName.trim(),
          age: Number(intakeAge),
          aadhaar: intakeAadhaar.trim(),
          description: newContext.trim()
        });
        await loadDashboard();
        setShowNewCase(false);
        setIntakeName("");
        setIntakeAge("");
        setIntakeAadhaar("");
        setNewContext("");
        if (result.credentials) setNewCreds({ ...result.credentials, name: result.careCase.name });
        setCaseDetail(result.careCase);
        setSelectedTask(0);
        setView("case");
        return;
      }
      if (!newPatientId || !newContext.trim()) return;
      const created = await careApi.createCase(token, { patientId: newPatientId, context: newContext.trim(), tone: newTone });
      await loadDashboard();
      setShowNewCase(false);
      setNewContext("");
      setCaseDetail(created);
      setSelectedTask(0);
      setView("case");
    } catch (err) {
      setIntakeError(err instanceof Error ? err.message : "Could not record visit");
    }
  };

  const sendReferral = async () => {
    if (!activeTask) return;
    try {
      const updated = await careApi.createReferral(token, activeTask.id, { reason: `${activeTask.context} — facility review requested` });
      setCaseDetail(updated);
      if (updated.referral) setStatus(updated.referral.status);
      await loadDashboard();
    } catch {
      // Ignore transient errors.
    }
  };

  const markCallbackDone = async (requestId: string) => {
    try {
      await careApi.resolveCallback(token, requestId);
      setCallbacks((current) => current.filter((item) => item.id !== requestId));
    } catch {
      // Ignore if offline.
    }
  };

  return (
    <main className="shell">
      <aside className={`sidebar ${showMenu ? "show" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><HeartPulse size={20} strokeWidth={2.8} /></div>
          <div>
            <strong>Sehat Saheli</strong>
            <span>Care loop</span>
          </div>
          <button className="mobile-close icon-button" onClick={() => setShowMenu(false)} aria-label="Close menu"><X size={20} /></button>
        </div>

        <div className="profile-card">
          <div className="avatar avatar-dark">{(ashaProfile?.fullName ?? "A").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{ashaProfile?.fullName ?? "Loading…"}</strong>
            <span>{ashaProfile ? `ASHA · ${ashaProfile.village}` : "—"}</span>
          </div>
          <MoreHorizontal size={18} />
        </div>

        <nav aria-label="Main navigation">
          <button className={view === "queue" ? "nav-item active" : "nav-item"} onClick={() => { setView("queue"); setShowMenu(false); }}><Home size={18} />{t.queue}</button>
          <button className={view === "case" ? "nav-item active" : "nav-item"} onClick={() => { setView("case"); setShowMenu(false); }}><ClipboardCheck size={18} />{t.cases}<span className="nav-count">{tasks.length}</span></button>
          <button className={view === "phc" ? "nav-item active" : "nav-item"} onClick={() => { setView("phc"); setShowMenu(false); }}><Stethoscope size={18} />{t.phc}<span className="nav-count">{metrics.openReferrals}</span></button>
          <button className={view === "households" ? "nav-item active" : "nav-item"} onClick={() => { setView("households"); setShowMenu(false); }}><UsersRound size={18} />{t.households}<span className="nav-count">{patients.length}</span></button>
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setLang((cur) => cur === "en" ? "kn" : "en")}><Languages size={18} />{lang === "en" ? <>English <span className="muted">/ ಕನ್ನಡ</span></> : <>ಕನ್ನಡ <span className="muted">/ English</span></>}</button>
          <button className={view === "guide" ? "nav-item active" : "nav-item"} onClick={() => { setView("guide"); setShowMenu(false); }}><CircleHelp size={18} />{t.howItWorks}</button>
          <button className="nav-item signout-nav" onClick={onSignOut}><LogOut size={18} />{t.signOut}</button>
          <div className="privacy-note"><ShieldCheck size={15} />Live Supabase sync</div>
        </div>
      </aside>

      <section className="app-area">
        <header className="topbar">
          <button className="menu-button icon-button" onClick={() => setShowMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div className="breadcrumbs"><span>{t.fieldCare}</span><ChevronRight size={14} /><strong>{view === "queue" ? t.queue : view === "case" ? t.cases : view === "phc" ? t.phc : view === "households" ? t.households : t.howItWorks}</strong></div>
          <div className="top-actions">
            {showSearch && (
              <input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); if (view !== "queue") setView("queue"); }}
                placeholder="Search patient, ward, symptom…"
                aria-label="Search care cases"
                style={{ height: 36, width: 210, borderRadius: 8, border: "1px solid #cfded7", padding: "0 10px", fontSize: 13 }}
              />
            )}
            <button className="icon-button" aria-label="Search" onClick={() => { setShowSearch((open) => !open); if (showSearch) setSearchQuery(""); else setView("queue"); }}><Search size={19} /></button>
            <button className="icon-button notification" aria-label="Notifications" onClick={() => setView("queue")}><BellRing size={19} />{callbacks.length > 0 && <i />}</button>
            <button className="new-case" onClick={() => { setView("queue"); setShowNewCase((open) => !open); }}><Plus size={18} />{t.newCase}</button>
          </div>
        </header>

        {view === "queue" && (
          <section className="content queue-view">
            {showNewCase && (
              <form className="panel" style={{ padding: 20, marginBottom: 20, display: "grid", gap: 12 }} onSubmit={createNewCase}>
                <div className="panel-heading">
                  <div><p className="eyebrow">NEW CARE CASE</p><h2>Record a home visit (Aadhaar + Gemini triage)</h2></div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button type="button" className="text-button" onClick={() => setIntakeMode(intakeMode === "aadhaar" ? "existing" : "aadhaar")}>
                      {intakeMode === "aadhaar" ? "Pick existing patient" : "Use Aadhaar intake"}
                    </button>
                    <button type="button" className="icon-button" onClick={() => setShowNewCase(false)} aria-label="Close"><X size={18} /></button>
                  </div>
                </div>
                {intakeMode === "aadhaar" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.6fr 1.2fr 1.6fr", gap: 10 }}>
                    <input value={intakeName} onChange={(e) => setIntakeName(e.target.value)} placeholder="Patient full name" required style={{ height: 40, borderRadius: 8, border: "1px solid #cfded7", padding: "0 12px" }} />
                    <input type="number" min={0} max={120} value={intakeAge} onChange={(e) => setIntakeAge(e.target.value)} placeholder="Age" required style={{ height: 40, borderRadius: 8, border: "1px solid #cfded7", padding: "0 12px" }} />
                    <input value={intakeAadhaar} onChange={(e) => setIntakeAadhaar(e.target.value)} placeholder="12-digit Aadhaar" required style={{ height: 40, borderRadius: 8, border: "1px solid #cfded7", padding: "0 12px" }} />
                    <input value={newContext} onChange={(e) => setNewContext(e.target.value)} placeholder="Disease / symptoms" required style={{ height: 40, borderRadius: 8, border: "1px solid #cfded7", padding: "0 12px" }} />
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", gap: 12 }}>
                    <select value={newPatientId} onChange={(e) => setNewPatientId(e.target.value)} required style={{ height: 40, borderRadius: 8, border: "1px solid #cfded7", padding: "0 10px" }}>
                      {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.village})</option>)}
                    </select>
                    <input value={newContext} onChange={(e) => setNewContext(e.target.value)} placeholder="Visit reason (e.g. BP check-in)" required style={{ height: 40, borderRadius: 8, border: "1px solid #cfded7", padding: "0 12px" }} />
                    <select value={newTone} onChange={(e) => setNewTone(e.target.value as CareTask["tone"])} style={{ height: 40, borderRadius: 8, border: "1px solid #cfded7", padding: "0 10px" }}>
                      <option value="warm">Routine (Warm)</option>
                      <option value="urgent">Urgent</option>
                      <option value="blue">Follow-up (Blue)</option>
                      <option value="violet">New concern (Violet)</option>
                    </select>
                  </div>
                )}
                {intakeError && <p className="auth-error">{intakeError}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button type="button" className="outline-button" onClick={() => setShowNewCase(false)}>Cancel</button>
                  <button type="submit" className="primary-button">Analyze &amp; save visit</button>
                </div>
              </form>
            )}

            {newCreds && (
              <div className="panel" style={{ padding: 16, marginBottom: 20, background: "#eaf7f2", borderColor: "#9acbbc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>New Patient Account Created for {newCreds.name}</strong>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Username: <code>{newCreds.username}</code> · Password: <code>{newCreds.password}</code></div>
                </div>
                <button type="button" className="icon-button" onClick={() => setNewCreds(null)} aria-label="Dismiss"><X size={16} /></button>
              </div>
            )}

            {callbacks.length > 0 && (
              <section className="panel" style={{ padding: 18, marginBottom: 20 }}>
                <div className="panel-heading"><div><p className="eyebrow">PATIENT REQUESTS</p><h2>Callbacks waiting ({callbacks.length})</h2></div><PhoneCall size={18} /></div>
                <div className="task-list">
                  {callbacks.map((cb) => (
                    <div key={cb.id} className="task-row" style={{ cursor: "default" }}>
                      <div className="task-person"><strong>{cb.patientName}</strong><span>{cb.requestType} · {cb.village}</span></div>
                      <button type="button" className="outline-button" style={{ marginLeft: "auto" }} onClick={() => markCallbackDone(cb.id)}><Check size={15} />Mark called</button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="page-heading">
              <div>
                <p className="eyebrow">{dateLabel || "TODAY"}</p>
                <h1>{greeting || "Good morning."}</h1>
                <p className="subheading">{loading ? "Loading care queue…" : tasks.length ? t.subheading : "None — no care cases recorded yet."}</p>
              </div>
              <div className="loop-chip"><Activity size={17} /><span>{metrics.openReferrals} open referrals</span></div>
            </div>

            <div className="metric-grid">
              <article className="metric-card coral"><div><span>{t.visitsToday}</span><strong>{String(metrics.visitsToday).padStart(2, "0")}</strong><small><Check size={14} /> {metrics.confirmedVisits} confirmed</small></div><Home size={25} /></article>
              <article className="metric-card amber"><div><span>{t.openReferrals}</span><strong>{String(metrics.openReferrals).padStart(2, "0")}</strong><small><Clock3 size={14} /> awaiting PHC</small></div><Send size={24} /></article>
              <article className="metric-card teal"><div><span>{t.followUpsDue}</span><strong>{String(metrics.followUpsDue).padStart(2, "0")}</strong><small><ArrowUpRight size={14} /> follow-up / booked</small></div><HeartPulse size={25} /></article>
            </div>

            <div className="queue-layout">
              <section className="panel today-panel">
                <div className="panel-heading"><div><p className="eyebrow">{calendarMode ? "SCHEDULE & FOLLOW-UPS" : "CARE ROUTE"}</p><h2>{calendarMode ? "Visit calendar" : t.todaysPeople}</h2></div><button className="text-button" onClick={() => setCalendarMode((m) => !m)}>{calendarMode ? t.showRoute : t.viewCalendar}</button></div>
                <div className="task-list">
                  {tasks.length === 0 ? (
                    <p className="empty-request" style={{ padding: "16px 0" }}>{loading ? "Loading…" : "None"}</p>
                  ) : (
                    tasks
                      .filter((task) => {
                        const q = searchQuery.trim().toLowerCase();
                        if (!q) return true;
                        return `${task.name} ${task.context} ${task.ward} ${task.tag}`.toLowerCase().includes(q);
                      })
                      .sort((a, b) => calendarMode ? (a.followUpDate ?? a.time).localeCompare(b.followUpDate ?? b.time) : 0)
                      .map((task) => {
                        const origIndex = tasks.findIndex((item) => item.id === task.id);
                        return (
                          <button key={task.id} className="task-row" onClick={() => openCase(origIndex)}>
                            <div className={`avatar avatar-${task.tone}`}>{task.initials}</div>
                            <div className="task-person">
                              <strong>{task.name} {task.source === "telegram" ? "· Telegram" : ""}</strong>
                              <span>{task.context}{task.severityLevel ? ` · ${task.severityLevel} (${task.severityScore ?? "-"}/10)` : ""}</span>
                            </div>
                            <div className="task-meta"><em className={`tag tag-${task.tone}`}>{task.visitType === "follow-up" ? "Follow-up" : task.tag}</em><span>{calendarMode && task.followUpDate ? `Due ${task.followUpDate}` : task.time}</span></div>
                            <ChevronRight className="row-chevron" size={19} />
                          </button>
                        );
                      })
                  )}
                </div>
                <button className="add-visit" onClick={() => setShowNewCase(true)}><Plus size={17} />Add another visit or concern</button>
              </section>

              <aside className="panel focus-panel">
                <div className="panel-heading"><div><p className="eyebrow">FOCUS NOW</p><h2>Close this loop</h2></div><span className="focus-dot" /></div>
                {focusTask ? (
                  <>
                    <div className="focus-avatar"><div className={`avatar avatar-${focusTask.tone}`}>{focusTask.initials}</div><div><strong>{focusTask.name}</strong><span>{focusTask.ageLabel} · {focusTask.ward}</span></div></div>
                    <div className="focus-callout"><MapPin size={18} /><p><strong>{focusTask.referralStatus ?? focusTask.tag}</strong><br />{focusTask.triageSummary ?? focusTask.context}</p></div>
                    <div className="mini-timeline">
                      <span className="complete" />
                      <span className={focusTask.referralId ? "complete" : "pending"} />
                      <span className={focusTask.referralStatus && focusTask.referralStatus !== "Awaiting PHC" ? "complete" : focusTask.referralId ? "pending" : ""} />
                      <span className={focusTask.referralStatus === "Follow-up booked" ? "complete" : ""} />
                    </div>
                    <div className="timeline-labels"><span>Recorded</span><span>Sent</span><span>PHC</span><span>Follow-up</span></div>
                    <button className="primary-button" onClick={() => openCase(tasks.findIndex((item) => item.id === focusTask.id))}>Open care case <ChevronRight size={17} /></button>
                  </>
                ) : (
                  <p style={{ opacity: 0.85, marginTop: 18 }}>None</p>
                )}
              </aside>
            </div>

            <div className="insight-strip"><div className="insight-icon"><MessageCircle size={18} /></div><p><strong>Care coordination live:</strong> Every Telegram &amp; ASHA intake updates Supabase and syncs to PHC in real time.</p><button onClick={() => setView("phc")}>See PHC handoffs <ArrowUpRight size={16} /></button></div>
          </section>
        )}

        {view === "case" && (
          <section className="content case-view">
            <button className="back-button" onClick={() => setView("queue")}><ChevronRight size={17} />Back to queue</button>
            {!activeTask ? (
              <section className="panel" style={{ padding: 24, marginTop: 16 }}>
                <p className="eyebrow">CARE CASES</p>
                <h2>None</h2>
                <p className="subheading">No care cases recorded yet.</p>
              </section>
            ) : (
              <>
                <div className="case-heading">
                  <div className="case-person"><div className={`avatar avatar-${activeTask.tone} large`}>{activeTask.initials}</div><div><p className="eyebrow">CARE CASE · {activeTask.visitType === "follow-up" ? "FOLLOW-UP" : "FRESH VISIT"}</p><h1>{activeTask.name}</h1><span>{activeTask.ageLabel} · {activeTask.ward} · {activeTask.context}{activeTask.aadhaarMasked ? ` · Aadhaar ${activeTask.aadhaarMasked}` : ""}</span></div></div>
                  {(caseDetail?.referral?.status ?? activeTask.referralStatus)
                    ? <StatusPill status={caseDetail?.referral?.status ?? activeTask.referralStatus!} />
                    : <span className={`tag tag-${activeTask.tone}`}>{activeTask.tag}</span>}
                </div>
                <div className="case-grid">
                  <section className="panel conversation-panel">
                    <div className="conversation-title"><div><MessageCircle size={19} /><strong>Visit &amp; triage summary</strong></div><span>{activeTask.source === "telegram" ? "Telegram intake" : "Web record"}</span></div>
                    <div className="messages">
                      <div className="message bot">Reported concern: {activeTask.context}<span>{activeTask.time}</span></div>
                      <div className="message worker">Gemini triage: {activeTask.triageSummary ?? "None"}{activeTask.severityLevel ? ` (${activeTask.severityLevel} · ${activeTask.severityScore ?? "-"}/10)` : ""}<span>{activeTask.severityLevel ?? "—"}</span></div>
                      <div className="choice-grid">
                        {careActions.map(choice => <button key={choice} className={answer === choice ? "choice selected" : "choice"} onClick={() => selectAction(choice)}>{answer === choice && <Check size={15} />}{choice}</button>)}
                      </div>
                      {answer && <div className="message worker chosen">Next step: {answer}.<span>Saved</span></div>}
                    </div>
                    <div className="case-disclaimer"><ShieldCheck size={16} />Coordination tool only — follow approved clinical protocols.</div>
                  </section>

                  <aside className="case-side">
                    <section className="panel handoff-card">
                      <div className="card-heading"><div><p className="eyebrow">FACILITY HANDOFF</p><h2>Referral summary</h2></div><Send size={20} /></div>
                      {!caseDetail ? (
                        <p className="subheading">Loading…</p>
                      ) : !caseDetail.referral ? (
                        <>
                          <p className="subheading" style={{ marginBottom: 12 }}>None</p>
                          <button className="primary-button compact" onClick={sendReferral}><Send size={15} />Send referral to PHC</button>
                        </>
                      ) : (
                        <>
                          <dl>
                            <div><dt>To</dt><dd>{caseDetail.referral.facility}</dd></div>
                            <div><dt>Reason</dt><dd>{caseDetail.referral.reason}</dd></div>
                            <div><dt>From</dt><dd>{ashaProfile?.fullName ?? "ASHA"} · ASHA</dd></div>
                          </dl>
                          {caseDetail.referral.status === "Awaiting PHC" ? (
                            <button className="outline-button" onClick={() => setView("phc")}>View PHC handoffs <ArrowUpRight size={16} /></button>
                          ) : (
                            <div className="received-note"><Check size={16} />PHC status: {caseDetail.referral.status}</div>
                          )}
                        </>
                      )}
                    </section>

                    <section className="panel timeline-panel">
                      <div className="card-heading"><div><p className="eyebrow">CARE TIMELINE</p><h2>Recorded events</h2></div></div>
                      <div className="event-list">
                        {caseDetail?.events.length ? (
                          caseDetail.events.map((event) => (
                            <div className="event" key={event.id}>
                              <div className="event-marker done"><Check size={12} /></div>
                              <div><strong style={{ textTransform: "capitalize" }}>{event.type}</strong><p>{event.text}</p></div>
                              <time>{event.timestamp}</time>
                            </div>
                          ))
                        ) : (
                          <p className="empty-request">{caseDetail ? "None" : "Loading…"}</p>
                        )}
                      </div>
                      {caseDetail?.referral?.status === "Received at PHC" && <button className="primary-button compact" onClick={scheduleFollowUp}><PhoneCall size={16} />Schedule return visit</button>}
                      {caseDetail?.referral?.status === "Follow-up booked" && <div className="success-banner"><Check size={17} /><div><strong>Follow-up scheduled</strong><span>{caseDetail.referral.followUpDate ?? "Booked"}</span></div></div>}
                    </section>
                  </aside>
                </div>
              </>
            )}
          </section>
        )}

        {view === "phc" && (
          <section className="content phc-view">
            <div className="page-heading"><div><p className="eyebrow">FACILITY HANDOFFS</p><h1>PHC referrals</h1><p className="subheading">Referrals sent from field visits.</p></div><div className="loop-chip"><Stethoscope size={17} /><span>{metrics.openReferrals} awaiting PHC</span></div></div>
            <div className="phc-grid">
              <section className="panel incoming-panel"><div className="panel-heading"><div><p className="eyebrow">INCOMING</p><h2>Referral queue</h2></div><span className="queue-number">{String(metrics.openReferrals).padStart(2, "0")}</span></div>
                {referralTask ? (
                  <article className="referral-card"><div className="referral-top"><div className={`avatar avatar-${referralTask.tone}`}>{referralTask.initials}</div><div><strong>{referralTask.name}</strong><span>{referralTask.ageLabel} · {referralTask.context}</span></div>{referralTask.referralStatus && <StatusPill status={referralTask.referralStatus} />}</div><div className="referral-details"><p><MapPin size={16} />{referralTask.ward}</p><p><Clock3 size={16} />{referralTask.time}</p></div><div className="referral-reason"><span>TRIAGE SUMMARY</span><p>{referralTask.triageSummary ?? referralTask.context}</p></div>{referralTask.referralStatus === "Awaiting PHC" ? <button className="primary-button" onClick={markReceived}><Check size={17} />Acknowledge referral</button> : <button className="outline-button" onClick={() => openCase(tasks.findIndex((t) => t.id === referralTask.id))}>Open care timeline <ArrowUpRight size={16} /></button>}</article>
                ) : (
                  <p className="empty-request">None</p>
                )}
              </section>
              <aside className="panel system-card"><div className="system-icon"><Activity size={22} /></div><p className="eyebrow">DOCTOR QUEUE</p><h2>Severity-ranked on /phc</h2><p>Doctors sign in to <code>/phc</code> to see all incoming cases ordered by Gemini urgency score.</p><div className="system-steps"><span><Check size={15} />ASHA / Telegram logs visit</span><span><Check size={15} />Gemini ranks severity</span><span><Clock3 size={15} />PHC &amp; follow-up close loop</span></div></aside>
            </div>
          </section>
        )}

        {view === "households" && (
          <section className="content queue-view">
            <div className="page-heading">
              <div>
                <p className="eyebrow">{ashaProfile?.assignedPanchayat ?? "LINKED HOUSEHOLDS"}</p>
                <h1>{t.households} ({patients.length})</h1>
                <p className="subheading">{patients.length ? `Registered households linked to ${ashaProfile?.fullName ?? "ASHA"}.` : "None"}</p>
              </div>
            </div>
            <section className="panel today-panel" style={{ marginTop: 22 }}>
              <div className="task-list" style={{ marginTop: 0 }}>
                {patients.length === 0 ? (
                  <p className="empty-request">None</p>
                ) : (
                  patients.map((patient) => (
                    <div key={patient.id} className="task-row" style={{ cursor: "default" }}>
                      <div className="avatar avatar-blue">{patient.fullName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}</div>
                      <div className="task-person">
                        <strong>{patient.fullName} · {patient.patientCode}</strong>
                        <span>{patient.age} years · {patient.gender} · {patient.village}</span>
                      </div>
                      <button
                        type="button"
                        className="outline-button"
                        style={{ marginLeft: "auto" }}
                        onClick={() => {
                          setIntakeMode("existing");
                          setNewPatientId(patient.id);
                          setShowNewCase(true);
                          setView("queue");
                        }}
                      >
                        <Plus size={15} />Log visit
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </section>
        )}

        {view === "guide" && (
          <section className="content queue-view">
            <div className="page-heading">
              <div>
                <p className="eyebrow">CARE LOOP GUIDE</p>
                <h1>{t.howItWorks}</h1>
                <p className="subheading">How home visits, Telegram intake, Gemini triage, and PHC appointments stay connected.</p>
              </div>
            </div>
            <div className="metric-grid" style={{ marginTop: 22 }}>
              <article className="panel" style={{ padding: 20 }}>
                <p className="eyebrow">1. TELEGRAM VISIT INTAKE</p>
                <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>Send visit details to @sehatsaheli_bot</h2>
                <p className="subheading" style={{ fontSize: 13 }}>Format: <code>Name, Age, 12-digit Aadhaar, Disease</code> (e.g. <code>Satvik, 6, 234567891234, High fever</code>).</p>
              </article>
              <article className="panel" style={{ padding: 20 }}>
                <p className="eyebrow">2. AUTO ACCOUNT &amp; FOLLOW-UP</p>
                <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>Aadhaar-matched patient portal</h2>
                <p className="subheading" style={{ fontSize: 13 }}>Existing Aadhaar adds a follow-up visit. New Aadhaar creates username <code>firstname</code> and password <code>FIRST3CAPS + last 4 digits</code>.</p>
              </article>
              <article className="panel" style={{ padding: 20 }}>
                <p className="eyebrow">3. GEMINI SEVERITY &amp; /phc</p>
                <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>Doctor queue ranked by urgency</h2>
                <p className="subheading" style={{ fontSize: 13 }}>Gemini scores urgency using age + symptoms, triggers alerts on critical cases, and places the highest-severity case #1 on <code>/phc</code>.</p>
              </article>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

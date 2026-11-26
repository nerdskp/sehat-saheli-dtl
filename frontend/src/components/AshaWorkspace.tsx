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
import { useEffect, useState } from "react";
import { careApi, type CareAction, type CareTask, type CaseStatus } from "@/lib/api";

type View = "queue" | "case" | "phc";

const fallbackTasks: CareTask[] = [
  { id: "case-ramesh", initials: "RK", name: "Ramesh Kumar", ageLabel: "58 years", ward: "Ward 3", context: "NCD follow-up", time: "Due now", tone: "urgent", tag: "Referral pending" },
  { id: "case-asha", initials: "AK", name: "Asha K.", ageLabel: "26 years", ward: "Ward 2", context: "Routine ANC reminder", time: "10:30 am", tone: "warm", tag: "Scheduled" },
  { id: "case-maya", initials: "MM", name: "Maya M.", ageLabel: "2 years", ward: "Ward 4", context: "Post-discharge home visit", time: "12:00 pm", tone: "blue", tag: "Follow-up" },
  { id: "case-sana", initials: "SF", name: "Sana F.", ageLabel: "19 years", ward: "Ward 1", context: "Persistent cough check-in", time: "2:15 pm", tone: "violet", tag: "New concern" }
];

const careActions: CareAction[] = ["Facility review needed", "Routine follow-up", "Need ANM guidance"];

const timeline = [
  { title: "Concern recorded", text: "ASHA logged symptoms and a facility review need.", time: "09:12", active: true },
  { title: "Referral sent", text: "Summary shared with Arogya Mandir, Hoskote.", time: "09:18", active: true },
  { title: "PHC response", text: "Waiting for the facility to acknowledge.", time: "Now", active: false },
  { title: "Home follow-up", text: "Schedule after the facility visit is confirmed.", time: "Next", active: false }
];

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
  const [tasks, setTasks] = useState<CareTask[]>(fallbackTasks);
  const [selectedTask, setSelectedTask] = useState(0);
  const [status, setStatus] = useState<CaseStatus>("Awaiting PHC");
  const [showMenu, setShowMenu] = useState(false);
  const [answer, setAnswer] = useState<CareAction | null>(null);

  useEffect(() => {
    let active = true;
    careApi.dashboard(token)
      .then((dashboard) => {
        if (!active) return;
        setTasks(dashboard.tasks);
        setStatus(dashboard.focusStatus);
      })
      .catch(() => {
        // The static deploy stays demoable when an API is not configured.
      });
    return () => { active = false; };
  }, [token]);

  const activeTask = tasks[selectedTask] ?? tasks[0] ?? fallbackTasks[0];

  const openCase = (index = 0) => {
    setSelectedTask(index);
    setView("case");
  };

  const markReceived = async () => {
    try {
      const referral = await careApi.acknowledgeReferral(token, "ref-ramesh");
      setStatus(referral.status);
    } catch {
      setStatus("Received at PHC");
    }
    setView("case");
  };

  const scheduleFollowUp = async () => {
    try {
      const referral = await careApi.scheduleFollowUp(token, "case-ramesh");
      setStatus(referral.status);
    } catch {
      setStatus("Follow-up booked");
    }
  };

  const selectAction = async (choice: CareAction) => {
    setAnswer(choice);
    try {
      await careApi.recordAction(token, activeTask.id, choice);
    } catch {
      // The visual prototype keeps the chosen action locally when offline.
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
          <div className="avatar avatar-dark">SM</div>
          <div>
            <strong>Sunita M.</strong>
            <span>ASHA · Hoskote</span>
          </div>
          <MoreHorizontal size={18} />
        </div>

        <nav aria-label="Main navigation">
          <button className={view === "queue" ? "nav-item active" : "nav-item"} onClick={() => setView("queue")}><Home size={18} />Today&apos;s queue</button>
          <button className={view === "case" ? "nav-item active" : "nav-item"} onClick={() => setView("case")}><ClipboardCheck size={18} />Care cases<span className="nav-count">{tasks.length}</span></button>
          <button className={view === "phc" ? "nav-item active" : "nav-item"} onClick={() => setView("phc")}><Stethoscope size={18} />PHC handoffs<span className="nav-count">1</span></button>
          <button className="nav-item"><UsersRound size={18} />Households</button>
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item"><Languages size={18} />English <span className="muted">/ ಕನ್ನಡ</span></button>
          <button className="nav-item"><CircleHelp size={18} />How it works</button>
          <button className="nav-item signout-nav" onClick={onSignOut}><LogOut size={18} />Sign out</button>
          <div className="privacy-note"><ShieldCheck size={15} />Demo mode · Fictional data</div>
        </div>
      </aside>

      <section className="app-area">
        <header className="topbar">
          <button className="menu-button icon-button" onClick={() => setShowMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div className="breadcrumbs"><span>Field care</span><ChevronRight size={14} /><strong>{view === "queue" ? "Today’s queue" : view === "case" ? "Care case" : "PHC handoffs"}</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Search"><Search size={19} /></button>
            <button className="icon-button notification" aria-label="Notifications"><BellRing size={19} /><i /></button>
            <button className="new-case" onClick={() => openCase(3)}><Plus size={18} />New care case</button>
          </div>
        </header>

        {view === "queue" && (
          <section className="content queue-view">
            <div className="page-heading">
              <div>
                <p className="eyebrow">MONDAY, 24 NOVEMBER</p>
                <h1>Good morning, Sunita.</h1>
                <p className="subheading">Four people need a clear next step today.</p>
              </div>
              <div className="loop-chip"><Activity size={17} /><span>1 care loop needs closure</span></div>
            </div>

            <div className="metric-grid">
              <article className="metric-card coral"><div><span>VISITS TODAY</span><strong>04</strong><small><Check size={14} /> 2 confirmed</small></div><Home size={25} /></article>
              <article className="metric-card amber"><div><span>OPEN REFERRALS</span><strong>01</strong><small><Clock3 size={14} /> awaiting PHC</small></div><Send size={24} /></article>
              <article className="metric-card teal"><div><span>FOLLOW-UPS DUE</span><strong>02</strong><small><ArrowUpRight size={14} /> this week</small></div><HeartPulse size={25} /></article>
            </div>

            <div className="queue-layout">
              <section className="panel today-panel">
                <div className="panel-heading"><div><p className="eyebrow">CARE ROUTE</p><h2>Today&apos;s people</h2></div><button className="text-button">View calendar</button></div>
                <div className="task-list">
                  {tasks.map((task, index) => <button key={task.id} className="task-row" onClick={() => openCase(index)}>
                    <div className={`avatar avatar-${task.tone}`}>{task.initials}</div>
                    <div className="task-person"><strong>{task.name}</strong><span>{task.context}</span></div>
                    <div className="task-meta"><em className={`tag tag-${task.tone}`}>{task.tag}</em><span>{task.time}</span></div>
                    <ChevronRight className="row-chevron" size={19} />
                  </button>)}
                </div>
                <button className="add-visit" onClick={() => openCase(3)}><Plus size={17} />Add another visit or concern</button>
              </section>

              <aside className="panel focus-panel">
                <div className="panel-heading"><div><p className="eyebrow">FOCUS NOW</p><h2>Close this loop</h2></div><span className="focus-dot" /></div>
                <div className="focus-avatar"><div className="avatar avatar-urgent">{tasks[0]?.initials ?? "RK"}</div><div><strong>{tasks[0]?.name ?? "Ramesh Kumar"}</strong><span>{tasks[0]?.ageLabel ?? "58 years"} · {tasks[0]?.ward ?? "Ward 3"}</span></div></div>
                <div className="focus-callout"><MapPin size={18} /><p><strong>Facility review requested</strong><br />Arogya Mandir, Hoskote has not yet acknowledged the referral.</p></div>
                <div className="mini-timeline"><span className="complete" /><span className="complete" /><span className="pending" /><span /></div>
                <div className="timeline-labels"><span>Recorded</span><span>Sent</span><span>PHC</span><span>Follow-up</span></div>
                <button className="primary-button" onClick={() => openCase(0)}>Open care case <ChevronRight size={17} /></button>
              </aside>
            </div>

            <div className="insight-strip"><div className="insight-icon"><MessageCircle size={18} /></div><p><strong>What makes this different?</strong> Sehat Saheli records the next action and confirms the outcome—not just the referral.</p><button onClick={() => setView("phc")}>See PHC view <ArrowUpRight size={16} /></button></div>
          </section>
        )}

        {view === "case" && (
          <section className="content case-view">
            <button className="back-button" onClick={() => setView("queue")}><ChevronRight size={17} />Back to queue</button>
            <div className="case-heading">
              <div className="case-person"><div className="avatar avatar-urgent large">{activeTask.initials}</div><div><p className="eyebrow">OPEN CARE CASE · DEMO</p><h1>{activeTask.name}</h1><span>{activeTask.ageLabel} · {activeTask.ward} · {activeTask.context}</span></div></div>
              <StatusPill status={status} />
            </div>
            <div className="case-grid">
              <section className="panel conversation-panel">
                <div className="conversation-title"><div><MessageCircle size={19} /><strong>Guided visit record</strong></div><span>Protocol-assisted</span></div>
                <div className="messages">
                  <div className="message bot">Hi Sunita. What is the reason for today&apos;s check-in?<span>09:12</span></div>
                  <div className="message worker">{activeTask.id === "case-ramesh" ? "Follow-up after a higher BP reading at a community screening." : "Review the person’s current concern and agree a next action."}<span>09:13</span></div>
                  <div className="message bot">Record observations and select the next step from your approved local protocol. For urgent danger signs, contact emergency services or your supervisor.<span>09:14</span></div>
                  <div className="choice-grid">
                    {careActions.map(choice => <button key={choice} className={answer === choice ? "choice selected" : "choice"} onClick={() => selectAction(choice)}>{answer === choice && <Check size={15} />}{choice}</button>)}
                  </div>
                  {answer && <div className="message worker chosen">Next step: {answer}. I&apos;ve added this to the care record.<span>09:16</span></div>}
                </div>
                <div className="case-disclaimer"><ShieldCheck size={16} />This is a coordination prototype, not a diagnostic or prescribing tool.</div>
              </section>

              <aside className="case-side">
                <section className="panel handoff-card">
                  <div className="card-heading"><div><p className="eyebrow">FACILITY HANDOFF</p><h2>Referral summary</h2></div><Send size={20} /></div>
                  <dl><div><dt>To</dt><dd>Arogya Mandir, Hoskote</dd></div><div><dt>Reason</dt><dd>Review required after field screening</dd></div><div><dt>From</dt><dd>Sunita M. · ASHA</dd></div></dl>
                  {status === "Awaiting PHC" ? <button className="outline-button" onClick={() => setView("phc")}>View PHC queue <ArrowUpRight size={16} /></button> : <div className="received-note"><Check size={16} />PHC has acknowledged this case.</div>}
                </section>

                <section className="panel timeline-panel">
                  <div className="card-heading"><div><p className="eyebrow">CARE TIMELINE</p><h2>Nothing gets lost</h2></div></div>
                  <div className="event-list">{timeline.map((event, i) => <div className="event" key={event.title}><div className={`event-marker ${event.active || (i === 2 && status !== "Awaiting PHC") ? "done" : ""}`}>{(event.active || (i === 2 && status !== "Awaiting PHC")) && <Check size={12} />}</div><div><strong>{event.title}</strong><p>{i === 2 && status !== "Awaiting PHC" ? "PHC accepted the referral and will update the visit." : event.text}</p></div><time>{event.time}</time></div>)}</div>
                  {status === "Received at PHC" && <button className="primary-button compact" onClick={scheduleFollowUp}><PhoneCall size={16} />Schedule return visit</button>}
                  {status === "Follow-up booked" && <div className="success-banner"><Check size={17} /><div><strong>Follow-up scheduled</strong><span>Home visit due Friday, 28 Nov</span></div></div>}
                </section>
              </aside>
            </div>
          </section>
        )}

        {view === "phc" && (
          <section className="content phc-view">
            <div className="page-heading"><div><p className="eyebrow">AROGYA MANDIR · HOSKOTE</p><h1>Facility handoffs</h1><p className="subheading">Incoming community referrals that need a clear response.</p></div><div className="loop-chip"><Stethoscope size={17} /><span>PHC staff view</span></div></div>
            <div className="phc-grid">
              <section className="panel incoming-panel"><div className="panel-heading"><div><p className="eyebrow">INCOMING</p><h2>Referral queue</h2></div><span className="queue-number">01</span></div>
                <article className="referral-card"><div className="referral-top"><div className="avatar avatar-urgent">RK</div><div><strong>Ramesh Kumar</strong><span>Field case from Sunita M.</span></div><StatusPill status={status} /></div><div className="referral-details"><p><MapPin size={16} />Ward 3 · Hoskote</p><p><Clock3 size={16} />Received 09:18</p></div><div className="referral-reason"><span>HANDOFF NOTE</span><p>Facility review requested after a community NCD screening. Please acknowledge and update the visit outcome.</p></div>{status === "Awaiting PHC" ? <button className="primary-button" onClick={markReceived}><Check size={17} />Acknowledge referral</button> : <button className="outline-button" onClick={() => setView("case")}>Open care timeline <ArrowUpRight size={16} /></button>}</article>
              </section>
              <aside className="panel system-card"><div className="system-icon"><Activity size={22} /></div><p className="eyebrow">THE SYSTEM PROMISE</p><h2>From a home visit to a known outcome.</h2><p>Each status update returns to the ASHA&apos;s queue, making the next home follow-up visible.</p><div className="system-steps"><span><Check size={15} />ASHA records action</span><span><Check size={15} />PHC acknowledges</span><span><Clock3 size={15} />Follow-up closes loop</span></div></aside>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

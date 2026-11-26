"use client";

import { CalendarCheck, ChevronRight, HeartPulse, LogOut, PhoneCall, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { careApi, type PatientProfileResponse } from "@/lib/api";
import { clearSession, readSession, type AppSession } from "@/lib/auth";

export default function PatientPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [data, setData] = useState<PatientProfileResponse | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const current = readSession();
    if (!current || current.user.role !== "patient") {
      router.replace("/login");
      return;
    }
    setSession(current);
    careApi.patientProfile(current.token).then(setData).catch(() => router.replace("/login")).finally(() => setLoading(false));

    const timer = window.setInterval(() => {
      careApi.patientProfile(current.token).then(setData).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [router]);

  const requestCallback = async () => {
    if (!session) return;
    try {
      const request = await careApi.requestPatientCallback(session.token);
      setData((current) => current ? { ...current, requests: [request, ...current.requests] } : current);
      setMessage("Your callback request has been sent to your ASHA worker.");
    } catch {
      setMessage("We could not send your request. Please try again.");
    }
  };

  const signOut = () => {
    clearSession();
    router.push("/login");
  };

  if (loading || !data) return <main className="route-loading">Opening your care portal…</main>;
  const { profile, cases, requests } = data;

  const primaryCase = cases[0];
  const nextStepText = !primaryCase
    ? "None"
    : primaryCase.followUpDate
      ? `Home follow-up scheduled for ${primaryCase.followUpDate}.`
      : primaryCase.referralStatus
        ? `Referral status: ${primaryCase.referralStatus}.`
        : primaryCase.action
          ? `Agreed next step: ${primaryCase.action}.`
          : "None";
  const ashaInitials = profile.ashaName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AS";

  return (
    <main className="patient-shell">
      <header className="patient-header"><div className="patient-brand"><span><HeartPulse size={20} /></span><strong>Sehat Saheli</strong></div><button onClick={signOut}><LogOut size={16} />Sign out</button></header>
      <section className="patient-content">
        <div className="patient-welcome"><div><p className="eyebrow">YOUR CARE PORTAL</p><h1>Hello, {profile.fullName.split(" ")[0]}.</h1><p>Live updates from your ASHA worker and PHC care team.</p></div><div className="patient-avatar"><UserRound size={27} /></div></div>
        <div className="patient-grid">
          <section className="patient-card care-plan"><p className="eyebrow">CURRENT CARE PLAN</p><h2>{primaryCase?.context ?? "None"}</h2><span className="patient-status">{primaryCase ? (primaryCase.visitType === "follow-up" ? "Follow-up visit" : primaryCase.tag) : "None"}</span><p>{primaryCase?.triageSummary ?? "None"}</p><div className="care-plan-line"><CalendarCheck size={18} /><span>{nextStepText}</span></div></section>
          <section className="patient-card asha-card"><p className="eyebrow">YOUR ASHA WORKER</p><div className="asha-person"><span>{ashaInitials}</span><div><h2>{profile.ashaName}</h2><p>Community health worker · {profile.village}</p></div></div><button onClick={requestCallback}><PhoneCall size={16} />Request a callback</button>{message && <p className="callback-message">{message}</p>}</section>
        </div>
        <section className="patient-card profile-card-patient"><div><p className="eyebrow">YOUR PROFILE</p><h2>Patient details</h2></div><dl><div><dt>Patient ID</dt><dd>{profile.patientCode}</dd></div><div><dt>Village</dt><dd>{profile.village}</dd></div><div><dt>Age</dt><dd>{profile.age} years</dd></div><div><dt>Support contact</dt><dd>{profile.ashaPhone}</dd></div></dl></section>
        <section className="patient-card" style={{ marginTop: 18 }}>
          <div className="section-title"><div><p className="eyebrow">VISIT HISTORY</p><h2>Recorded visits ({cases.length})</h2></div></div>
          {cases.length ? (
            <div className="request-list">
              {cases.map((c) => (
                <div key={c.id}>
                  <span className="request-check">•</span>
                  <p><strong>{c.context}</strong><small>{c.visitType === "follow-up" ? "Follow-up visit" : "Fresh visit"} · {c.referralStatus ?? c.tag} · {c.time}</small></p>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-request">None</p>
          )}
        </section>
        <section className="patient-card update-card"><div className="section-title"><div><p className="eyebrow">YOUR REQUESTS</p><h2>Updates shared with your ASHA worker</h2></div><ShieldCheck size={22} /></div>{requests.length ? <div className="request-list">{requests.map((request) => <div key={request.id}><span className="request-check">✓</span><p><strong>{request.requestType}</strong><small>{request.status}</small></p><ChevronRight size={17} /></div>)}</div> : <p className="empty-request">None</p>}</section>
      </section>
    </main>
  );
}

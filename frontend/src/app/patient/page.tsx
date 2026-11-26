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

  return (
    <main className="patient-shell">
      <header className="patient-header"><div className="patient-brand"><span><HeartPulse size={20} /></span><strong>Sehat Saheli</strong></div><button onClick={signOut}><LogOut size={16} />Sign out</button></header>
      <section className="patient-content">
        <div className="patient-welcome"><div><p className="eyebrow">YOUR CARE PORTAL</p><h1>Hello, {profile.fullName.split(" ")[0]}.</h1><p>Here is the latest information shared with your care team.</p></div><div className="patient-avatar"><UserRound size={27} /></div></div>
        <div className="patient-grid">
          <section className="patient-card care-plan"><p className="eyebrow">CURRENT CARE PLAN</p><h2>{cases[0]?.context ?? "No active care plan"}</h2><span className="patient-status">{cases[0]?.tag ?? "Up to date"}</span><p>This is a coordination update. For medical advice, speak with your ASHA worker or facility team.</p><div className="care-plan-line"><CalendarCheck size={18} /><span>Next step: a care-team review and follow-up if required.</span></div></section>
          <section className="patient-card asha-card"><p className="eyebrow">YOUR ASHA WORKER</p><div className="asha-person"><span>SM</span><div><h2>{profile.ashaName}</h2><p>Community health worker · Hoskote</p></div></div><button onClick={requestCallback}><PhoneCall size={16} />Request a callback</button>{message && <p className="callback-message">{message}</p>}</section>
        </div>
        <section className="patient-card profile-card-patient"><div><p className="eyebrow">YOUR PROFILE</p><h2>Patient details</h2></div><dl><div><dt>Patient ID</dt><dd>{profile.patientCode}</dd></div><div><dt>Village</dt><dd>{profile.village}</dd></div><div><dt>Age</dt><dd>{profile.age} years</dd></div><div><dt>Support contact</dt><dd>{profile.ashaPhone}</dd></div></dl></section>
        <section className="patient-card update-card"><div className="section-title"><div><p className="eyebrow">YOUR REQUESTS</p><h2>Updates shared with your ASHA worker</h2></div><ShieldCheck size={22} /></div>{requests.length ? <div className="request-list">{requests.map((request) => <div key={request.id}><span className="request-check">✓</span><p><strong>{request.requestType}</strong><small>{request.status} · recorded in your care loop</small></p><ChevronRight size={17} /></div>)}</div> : <p className="empty-request">No requests yet. You can request a callback when you need help reaching your care team.</p>}</section>
      </section>
    </main>
  );
}

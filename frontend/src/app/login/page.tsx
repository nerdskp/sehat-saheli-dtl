"use client";

import { HeartPulse, LockKeyhole, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { careApi } from "@/lib/api";
import { saveSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("sunita.asha");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectDemo = (demoUsername: string) => {
    setUsername(demoUsername);
    setPassword("demo123");
    setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await careApi.login(username, password);
      saveSession(session);
      router.push(session.user.role === "asha" ? "/asha" : "/patient");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message.replace("API request failed (401)", "The login details do not match") : "Could not sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="auth-brand"><span><HeartPulse size={21} strokeWidth={2.8} /></span><div><strong>Sehat Saheli</strong><small>Care loop</small></div></div>
        <div className="story-copy"><p className="eyebrow">ONE CONNECTED CARE JOURNEY</p><h1>Every next step, visible to the right person.</h1><p>ASHA workers, families and PHC teams share a clear path from a home visit to a completed follow-up.</p></div>
        <div className="story-flow"><div><i><UserRound size={18} /></i><span>ASHA records a concern</span></div><b /> <div><i><Stethoscope size={18} /></i><span>PHC confirms action</span></div><b /> <div><i><ShieldCheck size={18} /></i><span>Family sees the next step</span></div></div>
        <p className="story-foot">Prototype only · Fictional demo data · Not a clinical diagnosis tool</p>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap"><p className="eyebrow">SECURE DEMO ACCESS</p><h2>Welcome back</h2><p className="auth-subtitle">Choose a demo profile or sign in with the account details provided.</p>
          <div className="demo-choices">
            <button type="button" className={username === "sunita.asha" ? "demo-choice selected" : "demo-choice"} onClick={() => selectDemo("sunita.asha")}><span className="choice-icon asha"><Stethoscope size={17} /></span><span><strong>ASHA worker</strong><small>Sunita M. · field workspace</small></span></button>
            <button type="button" className={username === "ramesh.patient" ? "demo-choice selected" : "demo-choice"} onClick={() => selectDemo("ramesh.patient")}><span className="choice-icon patient"><UserRound size={17} /></span><span><strong>Patient</strong><small>Ramesh Kumar · care portal</small></span></button>
          </div>
          <form onSubmit={submit}>
            <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            {error && <p className="auth-error">{error}</p>}
            <button className="auth-submit" disabled={loading}>{loading ? "Signing in…" : <><LockKeyhole size={17} />Sign in securely</>}</button>
          </form>
          <p className="demo-note"><strong>Demo password:</strong> demo123</p>
        </div>
      </section>
    </main>
  );
}

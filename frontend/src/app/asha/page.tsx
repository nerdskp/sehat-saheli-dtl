"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AshaWorkspace from "@/components/AshaWorkspace";
import { clearSession, readSession } from "@/lib/auth";

export default function AshaPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session || session.user.role !== "asha") {
      router.replace("/login");
      return;
    }
    setToken(session.token);
  }, [router]);

  const signOut = () => {
    clearSession();
    router.push("/login");
  };

  return token ? <AshaWorkspace token={token} onSignOut={signOut} /> : <main className="route-loading">Checking your ASHA workspace…</main>;
}

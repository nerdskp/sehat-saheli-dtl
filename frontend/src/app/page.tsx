"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => router.replace("/login"), [router]);
  return <main className="route-loading">Opening Sehat Saheli…</main>;
}

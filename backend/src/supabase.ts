import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { UserRole } from "./types";

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) return false;
  const actualHash = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

export function newId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export async function ensureSeedData() {
  const { data: existing, error: checkError } = await supabase
    .from("users")
    .select("id")
    .eq("id", "user-sunita")
    .maybeSingle();

  if (checkError) {
    if (checkError.code === "PGRST205") {
      console.error("Supabase tables not found. Run backend/supabase-schema.sql in your Supabase SQL Editor.");
      return;
    }
    throw new Error(`Supabase seed check failed: ${checkError.message}`);
  }

  // Ensure the demo PHC account exists even on databases seeded before the PHC role was added.
  const { data: phcUser } = await supabase.from("users").select("id").eq("id", "user-phc").maybeSingle();
  if (!phcUser) {
    await supabase.from("users").upsert({
      id: "user-phc",
      username: "dr.phc",
      password_hash: hashPassword("demo123"),
      role: "phc",
      full_name: "Dr. Priya Nair",
      phone: "9000000010"
    }, { onConflict: "id" });
  }

  if (existing) return;

  await supabase.from("users").upsert(
    { id: "user-sunita", username: "sunita.asha", password_hash: hashPassword("demo123"), role: "asha", full_name: "Sunita M.", phone: "9000000001" },
    { onConflict: "id" }
  );

  await supabase.from("asha_workers").upsert({
    id: "asha-sunita",
    user_id: "user-sunita",
    worker_code: "ASHA-HSK-014",
    village: "Hoskote",
    block: "Bengaluru Rural",
    assigned_panchayat: "Hoskote Gram Panchayat"
  }, { onConflict: "id" });
}

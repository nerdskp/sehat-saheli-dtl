import { normalizeAadhaar } from "./triage";

export interface ParsedVisit {
  name: string;
  age: number;
  aadhaar: string;
  description: string;
  village?: string;
}

export const FORMAT_HELP = [
  "Sehat Saheli Bot — Commands & Formats:",
  "",
  "Guided intake: send /new (or send a voice note 🎤)",
  "Check patient status: /status <12-digit Aadhaar>",
  "Set default village/ASHA: /village <name> | /asha <worker_code>",
  "Cancel current step: /cancel",
  "",
  "Or send all details in 1 message (English or Hinglish):",
  "Satvik, 6, 234567891234, High fever since 2 days",
  "Satvik, 6, 234567891234, 2 din se tez bukhar aur khansi hai",
  "",
  "Labeled format:",
  "Name: Satvik",
  "Age: 6",
  "Aadhaar: 234567891234",
  "Disease: 2 din se tez bukhar aur khansi hai"
].join("\n");

export function parseTelegramVisit(text: string): ParsedVisit | { error: string } {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/start") || trimmed.startsWith("/help")) {
    return { error: FORMAT_HELP };
  }

  let name = "";
  let ageRaw = "";
  let aadhaarRaw = "";
  let description = "";
  let village: string | undefined;

  if (/(name|naam)\s*:/i.test(trimmed) && /(age|umar|umr)\s*:/i.test(trimmed)) {
    for (const line of trimmed.split(/\r?\n/)) {
      const match = line.trim().match(/^([a-zA-Z\s]+):\s*(.+)$/);
      if (!match) continue;
      const key = match[1].trim().toLowerCase();
      const val = match[2].trim();
      if (key === "name" || key === "naam") name = val;
      else if (key === "age" || key === "umar" || key === "umr") ageRaw = val;
      else if (key.startsWith("aadhar") || key.startsWith("aadhaar")) aadhaarRaw = val;
      else if (key === "village" || key === "gaon") village = val;
      else if (["disease", "symptoms", "symptom", "description", "visit", "issue", "bimari", "takleef", "lakshan"].includes(key)) description = val;
    }
  } else {
    const parts = trimmed.split(trimmed.includes("|") ? "|" : ",").map((part) => part.trim());
    if (parts.length < 4) {
      return { error: `Could not read all 4 fields (Name, Age, Aadhaar, Disease).\n\n${FORMAT_HELP}` };
    }
    [name, ageRaw, aadhaarRaw] = parts;
    description = parts.slice(3).join(", ");
  }

  const age = /^\d{1,3}$/.test(ageRaw) ? Number(ageRaw) : NaN;
  const aadhaar = normalizeAadhaar(aadhaarRaw);

  if (!name || name.length < 2 || name.length > 100) return { error: `Invalid patient name.\n\n${FORMAT_HELP}` };
  if (!Number.isFinite(age) || age < 0 || age > 120) return { error: `Invalid age "${ageRaw}". Enter years between 0 and 120.` };
  if (!aadhaar) return { error: "Invalid Aadhaar number. It must be 12 digits and cannot start with 0 or 1." };
  if (!description || description.length < 2 || description.length > 300) return { error: "Please include the disease or symptom description." };

  return village ? { name, age, aadhaar, description, village } : { name, age, aadhaar, description };
}

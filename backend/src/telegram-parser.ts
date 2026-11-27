import { normalizeAadhaar } from "./triage";

const FORMAT_HELP = [
  "Send visit details in either format:",
  "",
  "1) Single line:",
  "Satvik, 6, 234567891234, High fever since 2 days",
  "",
  "2) Labeled lines:",
  "Name: Satvik",
  "Age: 6",
  "Aadhaar: 234567891234",
  "Disease: High fever since 2 days"
].join("\n");

export function parseTelegramVisit(text: string): { name: string; age: number; aadhaar: string; description: string } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/start") || trimmed.startsWith("/help")) {
    return { error: FORMAT_HELP };
  }

  let name = "";
  let ageRaw = "";
  let aadhaarRaw = "";
  let description = "";

  if (/name\s*:/i.test(trimmed) && /age\s*:/i.test(trimmed)) {
    for (const line of trimmed.split(/\r?\n/)) {
      const match = line.trim().match(/^([a-zA-Z\s]+):\s*(.+)$/);
      if (!match) continue;
      const key = match[1].trim().toLowerCase();
      const val = match[2].trim();
      if (key === "name") name = val;
      else if (key === "age") ageRaw = val;
      else if (key.startsWith("aadhar") || key.startsWith("aadhaar")) aadhaarRaw = val;
      else if (["disease", "symptoms", "symptom", "description", "visit", "issue"].includes(key)) description = val;
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

  return { name, age, aadhaar, description };
}


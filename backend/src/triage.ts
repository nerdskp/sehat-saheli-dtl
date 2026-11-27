import type { CareAction, SeverityLevel } from "./types";

export interface TriageResult {
  severityScore: number;
  severityLevel: SeverityLevel;
  alertFlagged: boolean;
  summary: string;
  recommendedAction: CareAction;
}

/** Validates standard 12-digit Indian Aadhaar format (cannot begin with 0 or 1). */
export function normalizeAadhaar(raw: string): string | null {
  const digits = raw.replace(/[\s-]+/g, "").trim();
  // ponytail: structural UIDAI format check (12 digits, first digit 2-9); Verhoeff checksum omitted so typed demo numbers work.
  return /^[2-9]\d{11}$/.test(digits) ? digits : null;
}

export function maskAadhaar(aadhaar?: string | null): string | undefined {
  if (!aadhaar || aadhaar.length < 4) return undefined;
  return `XXXX-XXXX-${aadhaar.slice(-4)}`;
}

export function buildPatientCredentials(fullName: string, aadhaar: string) {
  const firstWord = fullName.trim().split(/\s+/)[0] ?? "patient";
  const cleanFirst = firstWord.replace(/[^a-zA-Z0-9]/g, "") || "patient";
  const baseUsername = cleanFirst.toLowerCase();
  const prefix = cleanFirst.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const password = `${prefix}${aadhaar.slice(-4)}`;
  return { baseUsername, password };
}

function fallbackTriage(age: number, description: string): TriageResult {
  const text = description.toLowerCase();
  const urgentWords = ["breath", "unconscious", "seizure", "chest pain", "bleed", "convulsion", "high fever", "severe"];
  const hasUrgent = urgentWords.some((word) => text.includes(word));
  const hasFever = text.includes("fever");
  const vulnerableAge = age <= 5 || age >= 65;

  let severityScore = 3;
  if (hasUrgent) severityScore = 9;
  else if (hasFever && vulnerableAge) severityScore = 8;
  else if (hasFever) severityScore = 5;
  if (vulnerableAge && severityScore < 6 && hasUrgent) severityScore = 9;

  const severityLevel: SeverityLevel =
    severityScore >= 8 ? "Critical" : severityScore >= 6 ? "High" : severityScore >= 4 ? "Moderate" : "Low";
  const alertFlagged = severityScore >= 7;

  return {
    severityScore,
    severityLevel,
    alertFlagged,
    summary: `Age ${age} with "${description.trim()}" assessed as ${severityLevel} priority.`,
    recommendedAction: alertFlagged ? "Facility review needed" : severityScore >= 5 ? "Need ANM guidance" : "Routine follow-up"
  };
}

export async function analyzeSeverityWithGemini(input: {
  name: string;
  age: number;
  description: string;
}): Promise<TriageResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return fallbackTriage(input.age, input.description);

  const prompt = [
    "You are a community-health coordination triage assistant (not a diagnostic or prescribing tool).",
    "Evaluate urgency by combining patient age and reported symptoms (e.g., fever or respiratory symptoms in infants/young children or elderly adults carry higher risk than mild symptoms in healthy adults).",
    `Patient: ${input.name}, Age: ${input.age} years`,
    `Reported condition: ${input.description}`,
    "Respond ONLY with valid JSON matching:",
    '{"severityScore": <integer 1-10>, "severityLevel": "<Low|Moderate|High|Critical>", "alertFlagged": <boolean, true if severityScore >= 7>, "summary": "<one concise non-diagnostic triage sentence>", "recommendedAction": "<Facility review needed|Routine follow-up|Need ANM guidance>"}'
  ].join("\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
        })
      }
    );

    if (!response.ok) return fallbackTriage(input.age, input.description);
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return fallbackTriage(input.age, input.description);

    const parsed = JSON.parse(rawText) as Partial<TriageResult>;
    const rawScore = Number(parsed.severityScore);
    if (!Number.isFinite(rawScore) || rawScore < 1 || rawScore > 10) return fallbackTriage(input.age, input.description);
    const score = Math.round(rawScore);
    const validActions: CareAction[] = ["Facility review needed", "Routine follow-up", "Need ANM guidance"];
    // Keep queue ordering, badge and alert consistent even when model fields disagree.
    const severityLevel: SeverityLevel = score >= 8 ? "Critical" : score >= 6 ? "High" : score >= 4 ? "Moderate" : "Low";
    const alertFlagged = score >= 7;
    const recommendedAction: CareAction = alertFlagged ? "Facility review needed"
      : validActions.includes(parsed.recommendedAction as CareAction) ? parsed.recommendedAction as CareAction : "Routine follow-up";

    return {
      severityScore: score,
      severityLevel,
      alertFlagged,
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : `Assessed ${severityLevel} urgency for age ${input.age}.`,
      recommendedAction
    };
  } catch {
    return fallbackTriage(input.age, input.description);
  }
}

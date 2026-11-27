import type { CareAction, SeverityLevel } from "./types";

export interface TriageResult {
  severityScore: number;
  severityLevel: SeverityLevel;
  alertFlagged: boolean;
  summary: string;
  recommendedAction: CareAction;
  englishDescription: string;
  hinglishDescription: string;
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
  const cleanDescription = description.trim();
  const text = cleanDescription.toLowerCase();
  const urgentWords = [
    "breath", "unconscious", "seizure", "chest pain", "bleed", "convulsion", "high fever", "severe",
    "saans", "dam", "behosh", "daura", "seene", "chhati", "khoon", "tez bukhar", "gambhir"
  ];
  const hasUrgent = urgentWords.some((word) => text.includes(word));
  const hasFever = text.includes("fever") || text.includes("bukhar");
  const vulnerableAge = age <= 5 || age >= 65;

  let severityScore = 3;
  if (hasUrgent) severityScore = 9;
  else if (hasFever && vulnerableAge) severityScore = 8;
  else if (hasFever) severityScore = 5;
  if (vulnerableAge && severityScore < 6 && hasUrgent) severityScore = 9;

  const severityLevel: SeverityLevel =
    severityScore >= 8 ? "Critical" : severityScore >= 6 ? "High" : severityScore >= 4 ? "Moderate" : "Low";
  const alertFlagged = severityScore >= 7;

  // ponytail: offline fallback echoes input for both fields; Gemini handles bilingual English/Hinglish translation when online.
  return {
    severityScore,
    severityLevel,
    alertFlagged,
    summary: `Age ${age} with "${cleanDescription}" assessed as ${severityLevel} priority.`,
    recommendedAction: alertFlagged ? "Facility review needed" : severityScore >= 5 ? "Need ANM guidance" : "Routine follow-up",
    englishDescription: cleanDescription,
    hinglishDescription: cleanDescription
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
    "The reported condition may be in English, Hinglish (Hindi written in Roman script), or Hindi.",
    "Evaluate urgency by combining patient age and reported symptoms (e.g., fever/bukhar or respiratory/saans symptoms in infants/young children or elderly adults carry higher risk than mild symptoms in healthy adults).",
    `Patient: ${input.name}, Age: ${input.age} years`,
    `Reported condition: ${input.description}`,
    "Respond ONLY with valid JSON matching:",
    '{"severityScore": <integer 1-10>, "severityLevel": "<Low|Moderate|High|Critical>", "alertFlagged": <boolean, true if severityScore >= 7>, "summary": "<one concise non-diagnostic triage sentence in English>", "recommendedAction": "<Facility review needed|Routine follow-up|Need ANM guidance>", "englishDescription": "<concise English description of the symptoms>", "hinglishDescription": "<concise Hinglish (Hindi in Roman script) description of the symptoms>"}'
  ].join("\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
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
    const score = Math.min(10, Math.max(1, Math.round(Number(parsed.severityScore) || 5)));
    const validLevels: SeverityLevel[] = ["Low", "Moderate", "High", "Critical"];
    const validActions: CareAction[] = ["Facility review needed", "Routine follow-up", "Need ANM guidance"];

    const severityLevel: SeverityLevel = validLevels.includes(parsed.severityLevel as SeverityLevel)
      ? (parsed.severityLevel as SeverityLevel)
      : score >= 8 ? "Critical" : score >= 6 ? "High" : score >= 4 ? "Moderate" : "Low";
    const alertFlagged = typeof parsed.alertFlagged === "boolean" ? parsed.alertFlagged : score >= 7;
    const recommendedAction: CareAction = validActions.includes(parsed.recommendedAction as CareAction)
      ? (parsed.recommendedAction as CareAction)
      : alertFlagged ? "Facility review needed" : "Routine follow-up";
    const fallbackDesc = input.description.trim();

    return {
      severityScore: score,
      severityLevel,
      alertFlagged,
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : `Assessed ${severityLevel} urgency for age ${input.age}.`,
      recommendedAction,
      englishDescription: typeof parsed.englishDescription === "string" && parsed.englishDescription.trim() ? parsed.englishDescription.trim() : fallbackDesc,
      hinglishDescription: typeof parsed.hinglishDescription === "string" && parsed.hinglishDescription.trim() ? parsed.hinglishDescription.trim() : fallbackDesc
    };
  } catch {
    return fallbackTriage(input.age, input.description);
  }
}

export async function transcribeSymptomAudioWithGemini(audio: {
  base64: string;
  mimeType: string;
}): Promise<{ transcript: string } | { error: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { error: "Voice intake requires GEMINI_API_KEY. Please type the symptoms in English or Hinglish." };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: "Transcribe the patient's symptoms from this voice message (it may be Hindi, Hinglish, Kannada, or English). Respond ONLY with JSON: {\"transcript\": \"<concise symptom description in Hinglish or English>\"}"
              },
              { inlineData: { mimeType: audio.mimeType || "audio/ogg", data: audio.base64 } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        })
      }
    );
    if (!response.ok) return { error: "Could not process voice note right now. Please type the symptoms." };

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return { error: "Could not hear clear symptoms in the voice note. Please try again or type them." };

    const parsed = JSON.parse(rawText) as { transcript?: string };
    const transcript = parsed.transcript?.trim();
    if (!transcript) return { error: "Voice note was empty. Please type the symptoms." };
    return { transcript };
  } catch {
    return { error: "Could not process voice note right now. Please type the symptoms." };
  }
}

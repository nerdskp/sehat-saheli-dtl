import { careStore } from "./data";
import { FORMAT_HELP, parseTelegramVisit, type ParsedVisit } from "./telegram-parser";
import { normalizeAadhaar, transcribeSymptomAudioWithGemini } from "./triage";

export { parseTelegramVisit } from "./telegram-parser";

interface TelegramVoice {
  file_id: string;
  mime_type?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    caption?: string;
    voice?: TelegramVoice;
    audio?: TelegramVoice;
  };
}

interface GuidedDraft {
  step: "name" | "age" | "aadhaar" | "description";
  name?: string;
  age?: number;
  aadhaar?: string;
  description?: string;
}
async function sendTelegramMessage(token: string, chatId: number | string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    signal: AbortSignal.timeout(15000),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  const result = await response.json() as { ok?: boolean };
  if (!response.ok || !result.ok) throw new Error("Telegram could not deliver a message");
}

async function downloadTelegramVoice(token: string, voice: TelegramVoice): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(voice.file_id)}`);
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { ok: boolean; result?: { file_path?: string } };
    const filePath = meta.result?.file_path;
    if (!filePath) return null;

    const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!fileRes.ok) return null;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    return { base64: buf.toString("base64"), mimeType: voice.mime_type || "audio/ogg" };
  } catch {
    return null;
  }
}

async function submitVisitFromTelegram(
  token: string,
  chatId: number,
  alertChatId: string | undefined,
  visit: ParsedVisit
) {
  const [savedVillage, savedAsha] = await Promise.all([
    visit.village ? Promise.resolve(visit.village) : careStore.getState(`tg_village:${chatId}`),
    careStore.getState(`tg_asha:${chatId}`)
  ]);

  let result;
  try {
    result = await careStore.ingestVisitFromIntake({
      name: visit.name,
      age: visit.age,
      aadhaar: visit.aadhaar,
      description: visit.description,
      village: savedVillage,
      ashaWorkerId: savedAsha,
      source: "telegram"
    });
  } catch {
    await sendTelegramMessage(token, chatId, "We could not finish recording this visit. Please ask your ASHA worker to check the care record before resending.");
    return;
  }

  // Persist chat ID so PHC acknowledgements and follow-up bookings notify this chat.
  await careStore.setState(`case_tg_chat:${result.careCase.id}`, String(chatId)).catch(() => {});

  const lines = [
    result.careCase.alertFlagged
      ? `🚨 ALERT: ${result.careCase.severityLevel} priority (${result.careCase.severityScore}/10)`
      : `✅ Recorded (${result.careCase.severityLevel} · ${result.careCase.severityScore}/10)`,
    `Patient: ${result.careCase.name} (${result.careCase.ageLabel} · ${result.careCase.ward})`,
    `Visit type: ${result.visitType === "follow-up" ? "Follow-up visit (existing Aadhaar)" : "Fresh visit (new patient)"}`,
    `Disease (English): ${result.triage.englishDescription}`,
    `Disease (Hinglish): ${result.triage.hinglishDescription}`,
    `Triage note: ${result.careCase.triageSummary ?? visit.description}`,
    result.careCase.referralId ? "PHC Queue: Sent & ranked by severity." : "ASHA Queue: Added to today's visits."
  ];

  if (result.credentials) {
    lines.push(
      "",
      "New Patient Portal Credentials:",
      `Username: ${result.credentials.username}`,
      `Password: ${result.credentials.password}`
    );
  }

  await sendTelegramMessage(token, chatId, lines.join("\n"));

  if (result.careCase.alertFlagged && alertChatId && alertChatId !== String(chatId)) {
    await sendTelegramMessage(
      token,
      alertChatId,
      `🚨 PHC SEVERITY ALERT\n${result.careCase.name} (${result.careCase.ageLabel})\nEnglish: ${result.triage.englishDescription}\nHinglish: ${result.triage.hinglishDescription}\nScore: ${result.careCase.severityScore}/10 (${result.careCase.severityLevel})`
    );
  }
}

export function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const alertChatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token) {
    console.log("Telegram bot disabled (TELEGRAM_BOT_TOKEN not set).");
    return;
  }

  careStore.setCaseUpdateNotifier(async (caseId, text) => {
    const chatId = await careStore.getState(`case_tg_chat:${caseId}`).catch(() => undefined);
    if (chatId) await sendTelegramMessage(token, chatId, text);
  });

  // ponytail: in-memory draft map keeps guided flow zero-latency; server restart clears mid-draft sessions (/new restarts).
  const drafts = new Map<number, GuidedDraft>();
  let stopped = false;

  const advanceDraft = async (chatId: number, draft: GuidedDraft, text: string) => {
    if (draft.step === "name") {
      if (text.length < 2) return sendTelegramMessage(token, chatId, "Please enter a valid patient name (at least 2 characters):");
      draft.name = text;
      draft.step = "age";
      return sendTelegramMessage(token, chatId, "Step 2 — Age in years / Umar batayein (0–120):");
    }
    if (draft.step === "age") {
      const age = Number.parseInt(text, 10);
      if (!Number.isFinite(age) || age < 0 || age > 120) return sendTelegramMessage(token, chatId, "Invalid age. Enter years between 0 and 120:");
      draft.age = age;
      draft.step = "aadhaar";
      return sendTelegramMessage(token, chatId, "Step 3 — 12-digit Aadhaar number batayein:");
    }
    if (draft.step === "aadhaar") {
      const aadhaar = normalizeAadhaar(text);
      if (!aadhaar) return sendTelegramMessage(token, chatId, "Invalid Aadhaar. Enter 12 digits (cannot start with 0 or 1):");
      draft.aadhaar = aadhaar;
      if (draft.description) {
        drafts.delete(chatId);
        return submitVisitFromTelegram(token, chatId, alertChatId, {
          name: draft.name!,
          age: draft.age!,
          aadhaar,
          description: draft.description
        });
      }
      draft.step = "description";
      return sendTelegramMessage(token, chatId, "Step 4 — Disease / Takleef likhein (English ya Hinglish me) ya Voice Note 🎤 bhejein:");
    }
    if (text.length < 2) return sendTelegramMessage(token, chatId, "Please describe the symptoms (text or voice note):");
    drafts.delete(chatId);
    return submitVisitFromTelegram(token, chatId, alertChatId, {
      name: draft.name!,
      age: draft.age!,
      aadhaar: draft.aadhaar!,
      description: text
    });
  };

  const handleVoice = async (chatId: number, voice: TelegramVoice, caption?: string) => {
    await sendTelegramMessage(token, chatId, "🎤 Listening to voice note…");
    const audio = await downloadTelegramVoice(token, voice);
    if (!audio) return sendTelegramMessage(token, chatId, "Could not download voice note. Please try again or type symptoms.");

    const transcribed = await transcribeSymptomAudioWithGemini(audio);
    if ("error" in transcribed) return sendTelegramMessage(token, chatId, transcribed.error);

    if (caption?.trim()) {
      const combined = parseTelegramVisit(`${caption.trim()}, ${transcribed.transcript}`);
      if (!("error" in combined)) {
        drafts.delete(chatId);
        return submitVisitFromTelegram(token, chatId, alertChatId, combined);
      }
    }

    const active = drafts.get(chatId);
    if (active?.step === "description") {
      return advanceDraft(chatId, active, transcribed.transcript);
    }

    drafts.set(chatId, { step: "name", description: transcribed.transcript });
    return sendTelegramMessage(
      token,
      chatId,
      `🎤 Heard: "${transcribed.transcript}"\n\nStep 1 — Patient Name / Mareez ka naam batayein:`
    );
  };

  const handleMessage = async (msg: NonNullable<TelegramUpdate["message"]>) => {
    const chatId = msg.chat.id;
    const voice = msg.voice ?? msg.audio;
    if (voice) return handleVoice(chatId, voice, msg.caption);
    if (!msg.text) return;

    const text = msg.text.trim();
    if (text === "/cancel") {
      drafts.delete(chatId);
      return sendTelegramMessage(token, chatId, "Cancelled. Send /new to start again or /help for formats.");
    }
    if (text === "/new" || text === "/add") {
      drafts.set(chatId, { step: "name" });
      return sendTelegramMessage(token, chatId, "Step 1 — Patient Name / Mareez ka naam batayein:\n(Send /cancel anytime)");
    }
    if (text.startsWith("/village")) {
      const village = text.replace(/^\/village\s*/i, "").trim();
      if (village.length < 2) return sendTelegramMessage(token, chatId, "Usage: /village Hoskote");
      await careStore.setState(`tg_village:${chatId}`, village);
      return sendTelegramMessage(token, chatId, `✅ Default village for this chat set to: ${village}`);
    }
    if (text.startsWith("/asha")) {
      const asha = text.replace(/^\/asha\s*/i, "").trim();
      if (asha.length < 2) return sendTelegramMessage(token, chatId, "Usage: /asha ASHA-HSK-014");
      await careStore.setState(`tg_asha:${chatId}`, asha);
      return sendTelegramMessage(token, chatId, `✅ Default ASHA worker code set to: ${asha}`);
    }
    if (text.startsWith("/status")) {
      const rawAadhaar = text.replace(/^\/status\s*/i, "").trim();
      if (!rawAadhaar) return sendTelegramMessage(token, chatId, "Usage: /status 234567891234");
      const status = await careStore.lookupStatusByAadhaar(rawAadhaar);
      if (!status.ok) return sendTelegramMessage(token, chatId, status.error);
      const c = status.latest;
      return sendTelegramMessage(
        token,
        chatId,
        [
          `📋 Status for ${status.name} (${status.aadhaarMasked} · ${status.village})`,
          `Condition: ${c.context}`,
          `Severity: ${c.severityLevel} (${c.severityScore}/10)`,
          `PHC Status: ${c.referralStatus ?? "In ASHA queue"}${status.queueRank ? ` (Queue #${status.queueRank})` : ""}`,
          c.followUpDate ? `Follow-up Date: ${c.followUpDate}` : ""
        ].filter(Boolean).join("\n")
      );
    }
    if (text.startsWith("/start") || text.startsWith("/help")) {
      drafts.delete(chatId);
      return sendTelegramMessage(token, chatId, FORMAT_HELP);
    }

    const active = drafts.get(chatId);
    if (active) return advanceDraft(chatId, active, text);

    const parsed = parseTelegramVisit(text);
    if ("error" in parsed) return sendTelegramMessage(token, chatId, parsed.error);
    return submitVisitFromTelegram(token, chatId, alertChatId, parsed);
  };

  const poll = async () => {
    let offset = Number(await careStore.getState("telegram_offset").catch(() => "0")) || 0;
    console.log("Sehat Saheli Telegram bot polling started.");

    while (!stopped) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=20`,
          { signal: AbortSignal.timeout(30000) }
        );
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
        for (const update of data.result ?? []) {
          offset = update.update_id + 1;
          await careStore.setState("telegram_offset", String(offset)).catch(() => {});
          if (update.message) await handleMessage(update.message);
        }
      } catch {
        console.error("Telegram polling or message delivery failed; retrying.");
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  };

  void poll();
  return () => { stopped = true; };
}

import { careStore } from "./data";
import { normalizeAadhaar } from "./triage";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

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
      const match = line.match(/^([a-zA-Z\s]+):\s*(.+)$/);
      if (!match) continue;
      const key = match[1].trim().toLowerCase();
      const val = match[2].trim();
      if (key === "name") name = val;
      else if (key === "age") ageRaw = val;
      else if (key.startsWith("aadhar") || key.startsWith("aadhaar")) aadhaarRaw = val;
      else if (["disease", "symptoms", "symptom", "description", "visit", "issue"].includes(key)) description = val;
    }
  } else {
    const parts = trimmed.split(trimmed.includes("|") ? "|" : ",").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 4) {
      return { error: `Could not read all 4 fields (Name, Age, Aadhaar, Disease).\n\n${FORMAT_HELP}` };
    }
    [name, ageRaw, aadhaarRaw] = parts;
    description = parts.slice(3).join(", ");
  }

  const age = Number.parseInt(ageRaw, 10);
  const aadhaar = normalizeAadhaar(aadhaarRaw);

  if (!name || name.length < 2) return { error: `Invalid patient name.\n\n${FORMAT_HELP}` };
  if (!Number.isFinite(age) || age < 0 || age > 120) return { error: `Invalid age "${ageRaw}". Enter years between 0 and 120.` };
  if (!aadhaar) return { error: "Invalid Aadhaar number. It must be 12 digits and cannot start with 0 or 1." };
  if (!description || description.length < 2) return { error: "Please include the disease or symptom description." };

  return { name, age, aadhaar, description };
}

async function sendTelegramMessage(token: string, chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  }).catch(() => {});
}

export function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const alertChatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token) {
    console.log("Telegram bot disabled (TELEGRAM_BOT_TOKEN not set).");
    return;
  }

  let stopped = false;

  const poll = async () => {
    let offset = Number(await careStore.getState("telegram_offset").catch(() => "0")) || 0;
    console.log("Sehat Saheli Telegram bot polling started.");

    while (!stopped) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=20`
        );
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
        for (const update of data.result ?? []) {
          offset = update.update_id + 1;
          await careStore.setState("telegram_offset", String(offset)).catch(() => {});

          const msg = update.message;
          if (!msg?.text) continue;

          const parsed = parseTelegramVisit(msg.text);
          if ("error" in parsed) {
            await sendTelegramMessage(token, msg.chat.id, parsed.error);
            continue;
          }

          const result = await careStore.ingestVisitFromIntake({
            ...parsed,
            source: "telegram"
          });

          const lines = [
            result.careCase.alertFlagged
              ? `🚨 ALERT: ${result.careCase.severityLevel} priority (${result.careCase.severityScore}/10)`
              : `✅ Recorded (${result.careCase.severityLevel} · ${result.careCase.severityScore}/10)`,
            `Patient: ${result.careCase.name} (${result.careCase.ageLabel})`,
            `Visit type: ${result.visitType === "follow-up" ? "Follow-up visit (existing Aadhaar)" : "Fresh visit (new patient)"}`,
            `Triage note: ${result.careCase.triageSummary ?? parsed.description}`,
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

          const reply = lines.join("\n");
          await sendTelegramMessage(token, msg.chat.id, reply);

          if (result.careCase.alertFlagged && alertChatId && alertChatId !== String(msg.chat.id)) {
            await sendTelegramMessage(token, alertChatId, `🚨 PHC SEVERITY ALERT\n${result.careCase.name} (${result.careCase.ageLabel})\n${parsed.description}\nScore: ${result.careCase.severityScore}/10 (${result.careCase.severityLevel})`);
          }
        }
      } catch (err) {
        console.error("Telegram poll error:", err instanceof Error ? err.message : err);
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  };

  void poll();
  return () => { stopped = true; };
}

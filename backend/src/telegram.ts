import { careStore } from "./data";
import { parseTelegramVisit } from "./telegram-parser";
export { parseTelegramVisit } from "./telegram-parser";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
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

          const msg = update.message;
          if (!msg?.text) continue;

          const parsed = parseTelegramVisit(msg.text);
          if ("error" in parsed) {
            await sendTelegramMessage(token, msg.chat.id, parsed.error);
            continue;
          }

          let result;
          try {
            result = await careStore.ingestVisitFromIntake({ ...parsed, source: "telegram" });
          } catch {
            await sendTelegramMessage(token, msg.chat.id, "We could not finish recording this visit. Please ask your ASHA worker to check the care record before resending.");
            continue;
          }

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
      } catch {
        console.error("Telegram polling or message delivery failed; retrying.");
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  };

  void poll();
  return () => { stopped = true; };
}

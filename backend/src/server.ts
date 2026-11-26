import "dotenv/config";
import { createApp } from "./app";
import { ensureSeedData } from "./supabase";
import { startTelegramBot } from "./telegram";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`Sehat Saheli API listening on http://localhost:${port}`);
  ensureSeedData()
    .then(() => startTelegramBot())
    .catch((err) => console.error("Startup init failed:", err instanceof Error ? err.message : err));
});

// Finds the Telegram storage channel and copies the bot settings to Convex.
//
// 1. Put BOT_TOKEN=... in .env.local (gitignored).
// 2. Create a private channel, add the bot as admin with "Post messages",
//    then post any message in the channel.
// 3. node scripts/telegram-setup.mjs            -> lists chats the bot can see
//    node scripts/telegram-setup.mjs <chat_id>  -> test post, then sets
//    TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID on the Convex deployment
//    Add --prod to set them on the production deployment.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN is missing. Add BOT_TOKEN=<token from @BotFather> to .env.local.");
  process.exit(1);
}

const prod = process.argv.includes("--prod");
const chatId = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? process.env.TELEGRAM_CHAT_ID;

async function tg(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`${method}: ${body.error_code} ${body.description}`);
  return body.result;
}

const me = await tg("getMe");
console.log(`Bot: @${me.username}`);

if (!chatId) {
  const updates = await tg("getUpdates", { allowed_updates: ["message", "channel_post", "my_chat_member"] });
  const chats = new Map();
  for (const u of updates) {
    const chat = (u.channel_post ?? u.message ?? u.my_chat_member)?.chat;
    if (chat) chats.set(chat.id, chat);
  }
  if (!chats.size) {
    console.log("No chats found yet. Add the bot to your channel as admin, post a message there, then run this again.");
    process.exit(0);
  }
  console.log("Chats the bot has seen:");
  for (const c of chats.values()) console.log(`  ${c.id}  ${c.type.padEnd(10)} ${c.title ?? c.username ?? c.first_name ?? ""}`);
  console.log("\nRun again with the channel id: node scripts/telegram-setup.mjs <chat_id>");
  process.exit(0);
}

const member = await tg("getChatMember", { chat_id: chatId, user_id: me.id });
if (member.status !== "administrator" && member.status !== "creator") {
  console.error(`The bot is "${member.status}" in ${chatId}. Make it an admin with "Post messages" permission.`);
  process.exit(1);
}
const msg = await tg("sendMessage", { chat_id: chatId, text: "land.db media storage connected ✅", disable_notification: true });
await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
console.log(`Test post to ${chatId} OK.`);

for (const [name, value] of [["TELEGRAM_BOT_TOKEN", token], ["TELEGRAM_CHAT_ID", String(chatId)]]) {
  execFileSync("npx", ["convex", "env", "set", ...(prod ? ["--prod"] : []), name, "--", value], { stdio: ["ignore", "ignore", "inherit"] });
  console.log(`set ${name} on Convex${prod ? " (prod)" : ""}`);
}
console.log("Done. Move existing uploads with: npx convex run telegram:backfill" + (prod ? " --prod" : ""));

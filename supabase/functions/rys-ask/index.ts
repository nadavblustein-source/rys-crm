// "שאל את המערכת": answers questions about the RYS board with Claude, looking things up as the person asking.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

// Same model and monthly cap as "אלוהים" in the Green Tractor (Nadav's choice there, 2026-11-02).
const MODEL = "claude-sonnet-5-5";
const PRICE = { input: 2, output: 10 }; // $ per million tokens; cache writes 1.25x, reads 0.05x for Sonnet 5.5
const MONTHLY_CAP_USD = 15;
const BOARD = "5089628503";
const SUB_BOARD = "5089720173";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Col = { board_id: string; id: string; title: string; type: string; settings: Record<string, any>; hidden: boolean };
type Item = { id: number; board_id: string; group_id: string; parent_item_id: number | null; name: string; vals: Record<string, any>; created_at: string; updated_at: string };
type Upd = { id: number; item_id: number; parent_id: number | null; body: string; creator_name: string | null; created_at: string };

function costOf(u: Anthropic.Beta.BetaUsage): number {
  const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.05;
  return (input * PRICE.input + u.output_tokens * PRICE.output) / 1_000_000;
}

const plain = (html: string) => (html || "")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/[﻿​]/g, "").replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function all<T>(db: SupabaseClient, table: string, cols: string, mod?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (mod) q = mod(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data as T[]));
    if (data.length < 1000) return out;
  }
}

function valText(c: Col, v: any, people: Record<string, string>): string {
  if (v == null || v === "") return "";
  if (c.type === "status") {
    const labels = c.settings?.labels ?? {};
    return labels[String(v.index)] ?? "";
  }
  if (c.type === "people") return (v as string[]).map((id) => people[id] ?? id).join(", ");
  if (c.type === "checkbox") return v ? "כן" : "";
  if (c.type === "date") return String(v).slice(0, 10);
  return String(v).replace(/\s+/g, " ");
}

async function snapshot(db: SupabaseClient) {
  const [cols, groups, people, items] = await Promise.all([
    all<Col>(db, "rys_columns", "*"),
    all<{ board_id: string; id: string; title: string }>(db, "rys_groups", "board_id,id,title"),
    all<{ id: string; name: string }>(db, "rys_people", "id,name"),
    all<Item>(db, "rys_items", "id,board_id,group_id,parent_item_id,name,vals,created_at,updated_at", (q) => q.eq("archived", false).order("position")),
  ]);
  const ppl: Record<string, string> = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const shown = (b: string) => cols.filter((c) => c.board_id === b && !["name", "subtasks", "file"].includes(c.type) && !c.hidden);
  const mainCols = shown(BOARD), subCols = shown(SUB_BOARD);
  const gname: Record<string, string> = Object.fromEntries(groups.filter((g) => g.board_id === BOARD).map((g) => [g.id, g.title]));
  const subsOf: Record<number, Item[]> = {};
  for (const it of items) if (it.board_id === SUB_BOARD && it.parent_item_id) (subsOf[it.parent_item_id] ??= []).push(it);
  const line = (it: Item, cs: Col[]) => cs.map((c) => { const t = valText(c, it.vals?.[c.id], ppl); return t ? `${c.title}: ${t}` : ""; }).filter(Boolean).join(" | ");
  const main = items.filter((i) => i.board_id === BOARD);
  const rows = main.map((it) => {
    const subs = (subsOf[it.id] ?? []).map((s) => `    - ${s.name}${line(s, subCols) ? " | " + line(s, subCols) : ""}`).join("\n");
    return `[${it.id}] ${it.name} | קבוצה: ${gname[it.group_id] ?? it.group_id} | ${line(it, mainCols)} | נוצר: ${it.created_at.slice(0, 10)}${subs ? "\n" + subs : ""}`;
  });
  const statusCols = [...mainCols, ...subCols].filter((c) => c.type === "status").map((c) => `- ${c.title}: ${Object.values(c.settings?.labels ?? {}).filter(Boolean).join(" / ")}`);
  const text = `קבוצות בלוח: ${Object.values(gname).join(", ")}
עמודות הלקוח: ${mainCols.map((c) => c.title).join(", ")}
שורות תשלום (תתי-פריטים) מופיעות מתחת ללקוח עם "-", עם העמודות: ${subCols.map((c) => c.title).join(", ")}
אפשרויות בעמודות הבחירה:
${statusCols.join("\n")}

כל הלקוחות (${main.length}), בפורמט [מספר] שם | שדות:
${rows.join("\n")}`;
  return { text, names: Object.fromEntries(items.map((i) => [i.id, i.name])) as Record<number, string> };
}

const SYSTEM = `אתה העוזר של מערכת ה-CRM "Restart your soul" (RYS) של נדב ורון. המערכת מנהלת לקוחות שמקבלים מכשירים (בעיקר אייפון ומחשבים) דרך מימון של קרן סיוע: הגשת חשבוניות (1, 2, 3), אישורים, סירובים, זיכויים, תשלומים ואיסוף/משלוח.
אתה עונה לנדב או לרון על כל שאלה על הלקוחות והנתונים במערכת, לפי הנתונים בלבד. אל תנחש מספרים ואל תמציא. אם אין מידע, אמור זאת.
הנתונים של כל הלקוחות מופיעים למטה. העדכונים וההערות על כל לקוח (השיחות בין נדב לרון) לא מופיעים: כדי לקרוא אותם השתמש בכלי get_updates, וכדי לחפש מילה או נושא בכל העדכונים השתמש ב-search_updates. כשהשאלה היא "מה קורה עם X" או "למה", תמיד קרא את העדכונים שלו.
אתה רק קורא ועונה. אינך יכול לשנות שום דבר במערכת, ואם מבקשים שינוי, הסבר בקצרה איך עושים אותו במסך.

איך לכתוב את התשובה (חשוב: נדב רוצה שהכל יהיה ברור וקל):
- שורה ראשונה: התשובה עצמה, מודגשת, במשפט אחד.
- כשמזכירים לקוח, כתוב את שמו כקישור בפורמט [שם הלקוח](#item-מספר), למשל [ישראל ישראלי](#item-2663831717). כך אפשר ללחוץ ולפתוח אותו.
- כשיש כמה לקוחות או מספרים להשוות, הצג טבלה קטנה בפורמט markdown. עד 12 שורות; אם יש יותר, כתוב כמה יש בסך הכל.
- סכומים בשקלים שלמים עם מפריד אלפים וסימן ₪ (5,500 ₪). תאריכים בפורמט 29/10.
- אחרי זה לכל היותר 3 נקודות קצרות עם "•" אם יש משהו חשוב לשים לב אליו.
- בלי הקדמות, בלי התנצלויות, בלי כותרות גדולות. עברית פשוטה.`;

const tools: Anthropic.Beta.BetaTool[] = [
  { name: "get_updates", description: "All updates, comments and replies written on one or more customers (by their [number]), oldest first, with author and date.",
    input_schema: { type: "object", properties: { item_ids: { type: "array", items: { type: "integer" }, minItems: 1, maxItems: 20 } }, required: ["item_ids"], additionalProperties: false } },
  { name: "search_updates", description: "Find updates and replies (on any customer) containing a word or phrase. Returns up to 40 matches with the customer, author, date and text. Hebrew text: search a short stem, e.g. 'זיכוי' or 'סירוב'.",
    input_schema: { type: "object", properties: { text: { type: "string", minLength: 2 } }, required: ["text"], additionalProperties: false } },
];

async function runTool(db: SupabaseClient, names: Record<number, string>, name: string, input: any): Promise<string> {
  const fmt = (u: Upd) => `${u.created_at.slice(0, 16).replace("T", " ")} · ${u.creator_name ?? ""}${u.parent_id ? " (תגובה)" : ""}: ${plain(u.body)}`;
  if (name === "get_updates") {
    const ids = (input.item_ids as number[]).slice(0, 20);
    const { data, error } = await db.from("rys_updates").select("id,item_id,parent_id,body,creator_name,created_at").in("item_id", ids).order("created_at");
    if (error) throw error;
    return ids.map((id) => {
      const us = (data as Upd[]).filter((u) => u.item_id === id);
      return `[${id}] ${names[id] ?? "?"} - ${us.length ? us.length + " עדכונים:\n" + us.map(fmt).join("\n") : "אין עדכונים"}`;
    }).join("\n\n");
  }
  if (name === "search_updates") {
    const q = String(input.text).trim();
    const { data, error } = await db.from("rys_updates").select("id,item_id,parent_id,body,creator_name,created_at").ilike("body", `%${q.replace(/[%_]/g, "")}%`).order("created_at", { ascending: false }).limit(40);
    if (error) throw error;
    if (!data.length) return "לא נמצאו עדכונים עם הטקסט הזה";
    return (data as Upd[]).map((u) => `[${u.item_id}] ${names[u.item_id] ?? "?"} · ${fmt(u)}`).join("\n");
  }
  throw new Error("unknown tool " + name);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await db.auth.getUser(auth.replace(/^Bearer /, ""));
  if (!u?.user) return json({ error: "צריך להתחבר מחדש" }, 401);
  const { data: member } = await db.rpc("rys_is_member");
  if (!member) return json({ error: "אין גישה" }, 403);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "העוזר עוד לא מחובר: חסר מפתח של Anthropic" }, 503);

  let body: { question?: string; history?: { role: "user" | "assistant"; content: string }[] };
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const question = String(body.question ?? "").trim().slice(0, 4000);
  if (!question) return json({ error: "אין שאלה" }, 400);

  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const { data: log } = await db.from("rys_ai_log").select("cost").gte("created_at", month.toISOString());
  const spent = (log ?? []).reduce((a: number, r: { cost: number }) => a + Number(r.cost), 0);
  if (spent >= MONTHLY_CAP_USD) return json({ error: "נגמרה המכסה של החודש. אפשר לשאול שוב מה-1 בחודש." }, 429);

  try {
    const snap = await snapshot(db);
    const today = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
    const client = new Anthropic();
    const history = (body.history ?? []).filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content).slice(-12);
    const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: question }];
    let cost = 0, text = "";
    for (let round = 0; round < 8; round++) {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [
          { type: "text", text: SYSTEM },
          { type: "text", text: snap.text, cache_control: { type: "ephemeral" } },
          { type: "text", text: `היום ${today}.` },
        ],
        tools,
        messages,
        output_config: { effort: "medium" },
      } as any);
      cost += costOf(res.usage);
      if (res.stop_reason === "refusal") { text = "לא יכולתי לענות על זה. אפשר לנסח אחרת?"; break; }
      if (res.stop_reason !== "tool_use") {
        text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
        break;
      }
      messages.push({ role: "assistant", content: res.content as any });
      const results = await Promise.all(res.content.filter((b: any) => b.type === "tool_use").map(async (b: any) => {
        try { return { type: "tool_result" as const, tool_use_id: b.id, content: await runTool(db, snap.names, b.name, b.input) }; }
        catch (e) { return { type: "tool_result" as const, tool_use_id: b.id, content: String(e), is_error: true }; }
      }));
      messages.push({ role: "user", content: results });
      if (round === 7) text = "השאלה דרשה יותר מדי בדיקות. אפשר לשאול על משהו מצומצם יותר?";
    }
    text = text || "לא הצלחתי לענות על זה. אפשר לנסח אחרת?";
    await db.from("rys_ai_log").insert({ question, answer: text, cost, user_id: u.user.id });
    return json({ answer: text, cost, spent: spent + cost, cap: MONTHLY_CAP_USD });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Anthropic.AuthenticationError ? "המפתח של Anthropic לא תקין" : e instanceof Anthropic.RateLimitError ? "יותר מדי שאלות ברגע, נסה שוב בעוד דקה" : "משהו השתבש, נסה שוב";
    return json({ error: msg }, 500);
  }
});

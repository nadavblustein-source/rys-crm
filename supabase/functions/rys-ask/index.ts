// "אלוהים": answers questions about the RYS board with Claude, looking things up as the person asking.
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
  .replace(/[\ufeff\u200b]/g, "").replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

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
    const subs = (subsOf[it.id] ?? []).map((s) => `    - [${s.id}] ${s.name}${line(s, subCols) ? " | " + line(s, subCols) : ""}`).join("\n");
    return `[${it.id}] ${it.name} | קבוצה: ${gname[it.group_id] ?? it.group_id} | ${line(it, mainCols)} | נוצר: ${it.created_at.slice(0, 10)}${subs ? "\n" + subs : ""}`;
  });
  const statusCols = [...mainCols, ...subCols].filter((c) => c.type === "status").map((c) => `- ${c.title}: ${Object.values(c.settings?.labels ?? {}).filter(Boolean).join(" / ")}`);
  const text = `קבוצות בלוח: ${Object.values(gname).join(", ")}
עמודות הלקוח: ${mainCols.map((c) => c.title).join(", ")}
עמודות מוסתרות: ${cols.filter((c) => c.board_id === BOARD && c.hidden && !["name", "subtasks", "file"].includes(c.type)).map((c) => c.title).join(", ") || "אין"}
שורות תשלום (תתי-פריטים) מופיעות מתחת ללקוח עם "- [מספר שורה]", עם העמודות: ${subCols.map((c) => c.title).join(", ")}
אפשרויות בעמודות הבחירה:
${statusCols.join("\n")}

כל הלקוחות (${main.length}), בפורמט [מספר] שם | שדות:
${rows.join("\n")}`;
  const subItems = Object.fromEntries(items.filter((i) => i.board_id === SUB_BOARD).map((i) => [i.id, i])) as Record<number, Item>;
  return { text, names: Object.fromEntries(items.map((i) => [i.id, i.name])) as Record<number, string>, mainCols, subCols, cols, groups: groups.filter((g) => g.board_id === BOARD), ppl, gname, items: Object.fromEntries(main.map((i) => [i.id, i])) as Record<number, Item>, subItems, subGroup: groups.find((g) => g.board_id === SUB_BOARD)?.id ?? "topics" };
}

const SYSTEM = `שמך "אלוהים". אתה העוזר של מערכת ה-CRM "Restart your soul" (RYS) של נדב ורון. המערכת מנהלת לקוחות שמקבלים מכשירים (בעיקר אייפון ומחשבים) דרך מימון של קרן סיוע: הגשת חשבוניות (1, 2, 3), אישורים, סירובים, זיכויים, תשלומים ואיסוף/משלוח.
אתה עונה לנדב או לרון על כל שאלה על הלקוחות והנתונים במערכת, לפי הנתונים בלבד. אל תנחש מספרים ואל תמציא. אם אין מידע, אמור זאת.
הנתונים של כל הלקוחות מופיעים למטה. העדכונים וההערות על כל לקוח (השיחות בין נדב לרון) לא מופיעים: כדי לקרוא אותם השתמש בכלי get_updates, וכדי לחפש מילה או נושא בכל העדכונים השתמש ב-search_updates. כשהשאלה היא "מה קורה עם X" או "למה", תמיד קרא את העדכונים שלו.
אתה יכול גם לשנות את המערכת, לבקשת נדב או רון (לשניהם אותן הרשאות):
- שינוי שדות של לקוח, העברת קבוצה או שינוי שם: הכלי propose_changes.
- כל השאר בכלי propose_admin: הוספת לקוח, מחיקת לקוח (עובר לארכיון ואפשר לשחזר), הוספה/עריכה/מחיקה של שורות תשלום, כתיבת עדכון על לקוח, הוספה ושינוי שם של קבוצות, שינוי שם/הסתרה/הצגה/הוספה של עמודות, הוספה ושינוי שם של אפשרויות בעמודות בחירה.
הכלים לא משנים כלום: הם מציגים למשתמש כפתור "אישור", והשינוי קורה רק אחרי שהוא לוחץ. אפשר לבטל אחרי הביצוע. אחרי שהצעת, כתוב במשפט אחד מה יקרה אחרי האישור. אל תכתוב שהשינוי כבר בוצע.
לפני מחיקה ודא שזה הלקוח או השורה הנכונים, ואם יש ספק שאל קודם. אי אפשר למחוק קבוצות, עמודות או אפשרויות דרכך (אפשר להסתיר עמודה); לשינויים בעיצוב או בקוד של המערכת עצמה, הסבר שצריך לבקש מנדב.

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
  { name: "propose_changes", description: "Propose changes to customers for the user to approve with one tap. Nothing changes until they approve. field is a column title exactly as listed, or 'קבוצה' to move the customer to another group, or 'שם' to rename. For choice columns, value must be one of that column's options exactly; for 'קבוצה', a group title exactly. Use an empty value to clear a field.",
    input_schema: { type: "object", properties: { changes: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", properties: {
      item_id: { type: "integer" }, field: { type: "string" }, value: { type: "string" } }, required: ["item_id", "field", "value"], additionalProperties: false } } }, required: ["changes"], additionalProperties: false } },
  { name: "propose_admin", description: "Propose other changes for the user to approve with one tap (nothing changes until they approve). Each op uses only the fields it needs: add_customer(name, group?); delete_customer(item_id); add_payment_row(item_id, name); set_payment(row_id, field, value) where field is a payment column title or 'שם'; delete_payment_row(row_id); add_update(item_id, text); add_group(name); rename_group(group, name); add_column(name, column_type); rename_column(column, name); hide_column(column); show_column(column); add_option(column, name); rename_option(column, option, name). Titles must match exactly as listed.",
    input_schema: { type: "object", properties: { ops: { type: "array", minItems: 1, maxItems: 30, items: { type: "object", properties: {
      op: { type: "string", enum: ["add_customer", "delete_customer", "add_payment_row", "set_payment", "delete_payment_row", "add_update", "add_group", "rename_group", "add_column", "rename_column", "hide_column", "show_column", "add_option", "rename_option"] },
      item_id: { type: "integer" }, row_id: { type: "integer" }, name: { type: "string" }, group: { type: "string" }, field: { type: "string" }, value: { type: "string" },
      text: { type: "string" }, column: { type: "string" }, option: { type: "string" }, column_type: { type: "string", enum: ["text", "numbers", "date", "status", "checkbox", "long_text"] } },
      required: ["op"], additionalProperties: false } } }, required: ["ops"], additionalProperties: false } },
];

type Action = { item_id: number; name: string; field: string; from: string; to: string; patch: { group_id?: string; name?: string; col?: string; val?: any } };

function resolveChange(snap: Awaited<ReturnType<typeof snapshot>>, ch: { item_id: number; field: string; value: string }, ppl: Record<string, string> = {}, sub = false): Action | string {
  const it = sub ? snap.subItems[ch.item_id] : snap.items[ch.item_id];
  if (!it) return `[${ch.item_id}] ${sub ? "לא נמצאה שורת תשלום" : "לא נמצא לקוח"}`;
  const value = String(ch.value ?? "").trim();
  const base = { item_id: it.id, name: it.name, field: ch.field };
  if (ch.field === "קבוצה" && !sub) {
    const gid = Object.keys(snap.gname).find((k) => snap.gname[k] === value);
    if (!gid) return `אין קבוצה בשם "${value}". הקבוצות: ${Object.values(snap.gname).join(", ")}`;
    return { ...base, from: snap.gname[it.group_id] ?? "", to: value, patch: { group_id: gid } };
  }
  if (ch.field === "שם") { if (!value) return "שם לא יכול להיות ריק"; return { ...base, from: it.name, to: value, patch: { name: value } }; }
  const c = (sub ? snap.subCols : snap.mainCols).find((x) => x.title === ch.field);
  if (!c) return `אין עמודה בשם "${ch.field}"`;
  const from = valText(c, it.vals?.[c.id], ppl);
  if (!value) return { ...base, from, to: "(ריק)", patch: { col: c.id, val: null } };
  if (c.type === "status") {
    const labels = c.settings?.labels ?? {};
    const idx = Object.keys(labels).find((k) => labels[k] === value);
    if (idx === undefined) return `אין אפשרות "${value}" בעמודה ${c.title}. האפשרויות: ${Object.values(labels).filter(Boolean).join(" / ")}`;
    return { ...base, from, to: value, patch: { col: c.id, val: { index: idx } } };
  }
  if (c.type === "checkbox") { const on = /^(כן|v|✓|true|1)$/i.test(value); return { ...base, from, to: on ? "כן" : "לא", patch: { col: c.id, val: on ? true : null } }; }
  if (c.type === "numbers") { const n = Number(value.replace(/[,₪\s]/g, "")); if (isNaN(n)) return `"${value}" אינו מספר`; return { ...base, from, to: String(n), patch: { col: c.id, val: String(n) } }; }
  if (c.type === "date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "תאריך בפורמט YYYY-MM-DD"; return { ...base, from, to: value, patch: { col: c.id, val: value } }; }
  if (["people", "file", "subtasks"].includes(c.type)) return `את העמודה ${c.title} משנים במסך`;
  return { ...base, from, to: value, patch: { col: c.id, val: value } };
}

// Admin ops become concrete row changes that the app runs as the signed-in user (RLS applies) after "אישור".
type Op = { t: "insert"; table: string; row: Record<string, any> } | { t: "update"; table: string; match: Record<string, any>; set: Record<string, any>; before: Record<string, any> };
type AdminAction = { kind: "admin"; desc: string; ops: Op[] };
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const PALETTE = ["#579bfc", "#00c875", "#fdab3d", "#e2445c", "#a25ddc", "#037f4c", "#ff642e", "#66ccff"];

function resolveAdmin(snap: Awaited<ReturnType<typeof snapshot>>, o: any, me: { person_id: string | null; name: string }): AdminAction | Action | string {
  const nm = String(o.name ?? "").trim();
  const col = (b: string) => snap.cols.find((c) => c.board_id === b && c.title === String(o.column ?? "").trim() && !["name", "subtasks", "file"].includes(c.type));
  const anyCol = () => col(BOARD) ?? col(SUB_BOARD);
  const grp = (t: string) => snap.groups.find((g) => g.title === String(t ?? "").trim());
  const upd = (table: string, match: Record<string, any>, set: Record<string, any>, before: Record<string, any>): Op => ({ t: "update", table, match, set, before });
  switch (o.op) {
    case "add_customer": {
      if (!nm) return "חסר שם ללקוח";
      const g = o.group ? grp(o.group) : snap.groups[0];
      if (!g) return `אין קבוצה בשם "${o.group}"`;
      const row = { board_id: BOARD, group_id: g.id, name: nm, position: -Date.now() / 1000, vals: {}, creator_id: me.person_id };
      const pay = ["תשלום בש״ח לנדב בלושטיין", "תשלום בש״ח לטרקטור הירוק"];
      return { kind: "admin", desc: `לקוח חדש: ${nm} (בקבוצה ${g.title}, עם שתי שורות תשלום)`, ops: [{ t: "insert", table: "rys_items", row: { ...row, _pay: pay } }] };
    }
    case "delete_customer": {
      const it = snap.items[o.item_id]; if (!it) return `[${o.item_id}] לא נמצא לקוח`;
      return { kind: "admin", desc: `מחיקת הלקוח ${it.name} (עובר לארכיון, אפשר לשחזר)`, ops: [upd("rys_items", { id: it.id }, { archived: true }, { archived: false })] };
    }
    case "add_payment_row": {
      const it = snap.items[o.item_id]; if (!it) return `[${o.item_id}] לא נמצא לקוח`;
      if (!nm) return "חסר שם לשורת התשלום";
      return { kind: "admin", desc: `שורת תשלום חדשה אצל ${it.name}: ${nm}`, ops: [{ t: "insert", table: "rys_items", row: { board_id: SUB_BOARD, group_id: snap.subGroup, parent_item_id: it.id, name: nm, position: Date.now() / 1000, vals: {}, creator_id: me.person_id } }] };
    }
    case "set_payment": {
      const r = resolveChange(snap, { item_id: o.row_id, field: String(o.field ?? ""), value: String(o.value ?? "") }, snap.ppl, true);
      if (typeof r === "string") return r;
      const parent = snap.items[snap.subItems[o.row_id].parent_item_id!];
      return { ...r, sub: true, name: `${parent?.name ?? ""} · ${r.name}` } as any;
    }
    case "delete_payment_row": {
      const s = snap.subItems[o.row_id]; if (!s) return `[${o.row_id}] לא נמצאה שורת תשלום`;
      const parent = snap.items[s.parent_item_id!];
      return { kind: "admin", desc: `מחיקת שורת התשלום "${s.name}" אצל ${parent?.name ?? ""}`, ops: [upd("rys_items", { id: s.id }, { archived: true }, { archived: false })] };
    }
    case "add_update": {
      const it = snap.items[o.item_id]; if (!it) return `[${o.item_id}] לא נמצא לקוח`;
      const text = String(o.text ?? "").trim(); if (!text) return "חסר תוכן לעדכון";
      const body = text.split("\n").map((l) => `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("");
      return { kind: "admin", desc: `עדכון חדש אצל ${it.name}: "${text.slice(0, 120)}"`, ops: [{ t: "insert", table: "rys_updates", row: { item_id: it.id, parent_id: null, body, creator_id: me.person_id, creator_name: me.name } }] };
    }
    case "add_group": {
      if (!nm) return "חסר שם לקבוצה"; if (grp(nm)) return `כבר יש קבוצה בשם "${nm}"`;
      return { kind: "admin", desc: `קבוצה חדשה: ${nm}`, ops: [{ t: "insert", table: "rys_groups", row: { board_id: BOARD, id: uid("g_"), title: nm, color: PALETTE[snap.groups.length % PALETTE.length], position: snap.groups.length + 1 } }] };
    }
    case "rename_group": {
      const g = grp(o.group); if (!g) return `אין קבוצה בשם "${o.group}"`; if (!nm) return "חסר שם חדש";
      return { kind: "admin", desc: `שינוי שם הקבוצה "${g.title}" ל"${nm}"`, ops: [upd("rys_groups", { board_id: BOARD, id: g.id }, { title: nm }, { title: g.title })] };
    }
    case "add_column": {
      if (!nm) return "חסר שם לעמודה"; if (snap.cols.some((c) => c.board_id === BOARD && c.title === nm)) return `כבר יש עמודה בשם "${nm}"`;
      const type = o.column_type ?? "text";
      const settings = type === "status" ? { labels: { "5": "" }, labels_colors: {} } : {};
      const pos = Math.max(0, ...snap.cols.filter((c) => c.board_id === BOARD).map((c: any) => c.position ?? 0)) + 1;
      return { kind: "admin", desc: `עמודה חדשה בטבלת הלקוחות: ${nm}`, ops: [{ t: "insert", table: "rys_columns", row: { board_id: BOARD, id: uid(type === "numbers" ? "numeric_" : type === "checkbox" ? "boolean_" : type === "status" ? "color_" : type === "date" ? "date_" : "text_"), title: nm, type, settings, hidden: false, position: pos } }] };
    }
    case "rename_column": case "hide_column": case "show_column": {
      const c = anyCol(); if (!c) return `אין עמודה בשם "${o.column}"`;
      if (o.op === "rename_column") { if (!nm) return "חסר שם חדש"; return { kind: "admin", desc: `שינוי שם העמודה "${c.title}" ל"${nm}"`, ops: [upd("rys_columns", { board_id: c.board_id, id: c.id }, { title: nm }, { title: c.title })] }; }
      const hide = o.op === "hide_column";
      return { kind: "admin", desc: `${hide ? "הסתרת" : "הצגת"} העמודה "${c.title}"${hide ? " (הנתונים נשמרים)" : ""}`, ops: [upd("rys_columns", { board_id: c.board_id, id: c.id }, { hidden: hide }, { hidden: c.hidden })] };
    }
    case "add_option": case "rename_option": {
      const c = anyCol(); if (!c || c.type !== "status") return `אין עמודת בחירה בשם "${o.column}"`;
      if (!nm) return "חסר שם לאפשרות";
      const st = JSON.parse(JSON.stringify(c.settings ?? {})); st.labels = st.labels ?? {}; st.labels_colors = st.labels_colors ?? {};
      if (Object.values(st.labels).includes(nm)) return `כבר יש אפשרות "${nm}" בעמודה ${c.title}`;
      let desc: string;
      if (o.op === "add_option") {
        let k = 0; while (st.labels[String(k)] || String(k) === "5") k++;
        st.labels[String(k)] = nm; st.labels_colors[String(k)] = { color: PALETTE[k % PALETTE.length] };
        if (st.labels_positions_v2) st.labels_positions_v2[String(k)] = 999;
        desc = `אפשרות חדשה בעמודה ${c.title}: ${nm}`;
      } else {
        const k = Object.keys(st.labels).find((x) => st.labels[x] === String(o.option ?? "").trim());
        if (k === undefined) return `אין אפשרות "${o.option}" בעמודה ${c.title}`;
        st.labels[k] = nm; desc = `שינוי שם האפשרות "${o.option}" ל"${nm}" בעמודה ${c.title} (בכל הלקוחות)`;
      }
      return { kind: "admin", desc, ops: [upd("rys_columns", { board_id: c.board_id, id: c.id }, { settings: st }, { settings: c.settings })] };
    }
  }
  return "פעולה לא מוכרת";
}

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
  const { data: mrow } = await db.from("rys_members").select("person_id,name").eq("user_id", u.user.id).maybeSingle();
  const me = { person_id: mrow?.person_id ?? null, name: mrow?.name ?? "" };
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
    const actions: any[] = [];
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
        if (b.name === "propose_changes") {
          const out = (b.input.changes ?? []).slice(0, 50).map((ch: any) => resolveChange(snap, ch));
          const ok = out.filter((x: any) => typeof x !== "string") as Action[];
          actions.push(...ok);
          const bad = out.filter((x: any) => typeof x === "string");
          return { type: "tool_result" as const, tool_use_id: b.id, content: `${ok.length} שינויים מוצגים למשתמש לאישור.${bad.length ? " נדחו: " + bad.join("; ") : ""}`, is_error: ok.length === 0 };
        }
        if (b.name === "propose_admin") {
          const out = (b.input.ops ?? []).slice(0, 30).map((o: any) => resolveAdmin(snap, o, me));
          const ok = out.filter((x: any) => typeof x !== "string");
          actions.push(...ok);
          const bad = out.filter((x: any) => typeof x === "string");
          return { type: "tool_result" as const, tool_use_id: b.id, content: `${ok.length} שינויים מוצגים למשתמש לאישור.${bad.length ? " נדחו: " + bad.join("; ") : ""}`, is_error: ok.length === 0 };
        }
        try { return { type: "tool_result" as const, tool_use_id: b.id, content: await runTool(db, snap.names, b.name, b.input) }; }
        catch (e) { return { type: "tool_result" as const, tool_use_id: b.id, content: String(e), is_error: true }; }
      }));
      messages.push({ role: "user", content: results });
      if (round === 7) text = "השאלה דרשה יותר מדי בדיקות. אפשר לשאול על משהו מצומצם יותר?";
    }
    text = text || "לא הצלחתי לענות על זה. אפשר לנסח אחרת?";
    await db.from("rys_ai_log").insert({ question, answer: text, cost, user_id: u.user.id });
    return json({ answer: text, actions, cost, spent: spent + cost, cap: MONTHLY_CAP_USD });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Anthropic.AuthenticationError ? "המפתח של Anthropic לא תקין" : e instanceof Anthropic.RateLimitError ? "יותר מדי שאלות ברגע, נסה שוב בעוד דקה" : "משהו השתבש, נסה שוב";
    return json({ error: msg }, 500);
  }
});

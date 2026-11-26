/* RYS CRM: a small Monday-style board on Supabase. */
(function () {
  'use strict';
  const C = window.RYS_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true } });
  const $app = document.getElementById('app');

  const S = {
    user: null, me: null,
    groups: [], subGroups: [], columns: [], subColumns: [], people: {}, members: [],
    items: [], subitems: [], updCounts: {},
    view: 'table', search: '', groupFilter: null, collapsed: {},
    openItem: null, panelTab: 'updates',
    sort: null, filters: {}, updText: {}, lastAct: {}, mentions: [], mentionDone: new Set(), staleDays: 7
  };
  try { S.staleDays = Number(localStorage.getItem('rys_stale')) || 7; } catch (e) {}
  try { S.collapsed = JSON.parse(localStorage.getItem('rys_collapsed') || '{}'); } catch (e) { S.collapsed = {}; }

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const toast = (msg, undo) => {
    const t = document.getElementById('toast'); t.innerHTML = '';
    t.appendChild(document.createTextNode(msg));
    if (undo) { const b = document.createElement('button'); b.textContent = 'בטל'; b.onclick = async () => { t.classList.remove('show'); await undo(); }; t.appendChild(b); }
    t.classList.toggle('undo', !!undo); t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), undo ? 6000 : 2600);
  };
  const icon = {
    board: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>',
    kanban: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#62636f" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    chat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    chevL: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    logout: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11"/></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    spark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 12L4 4l3 8-3 8z"/><path d="M7 12h13"/></svg>',
    wa: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.4-.3z"/></svg>',
    phone: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    sort: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
    filter: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return dd && m ? `${dd}/${m}/${y.slice(2)}` : String(d); };
  const fmtWhen = (ts) => { const d = new Date(ts); return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); };
  const fmtNum = (n) => (n === null || n === undefined || n === '') ? '' : (isNaN(Number(n)) ? String(n) : Number(n).toLocaleString('he-IL'));
  const initials = (n) => (n || '?').trim().charAt(0).toUpperCase();
  const ink = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fff'; const n = parseInt(m[1], 16); const lum = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; const L = 0.2126 * lum(n >> 16) + 0.7152 * lum((n >> 8) & 255) + 0.0722 * lum(n & 255); return L > 0.28 ? '#1f2030' : '#fff'; };
  const darken = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex; if (ink(hex) === '#fff') return hex; const n = parseInt(m[1], 16); const f = (v) => Math.round(v * 0.55); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  const colOf = (cols, id) => cols.find((c) => c.id === id);
  const plain = (html) => { const d = document.createElement('div'); d.innerHTML = window.DOMPurify.sanitize(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n')); return (d.textContent || '').replace(/[\ufeff\u200b]/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim(); };
  const phoneDigits = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('972')) d = '0' + d.slice(3); return d; };
  const fmtPhone = (v) => { const d = phoneDigits(v); if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`; return String(v || ''); };
  const waUrl = (v) => 'https://wa.me/' + phoneDigits(v).replace(/^0/, '972');
  const telUrl = (v) => 'tel:' + phoneDigits(v);
  const memberOf = (personId) => S.members.find((m) => String(m.person_id) === String(personId));
  const personName = (id) => { const m = memberOf(id); return m ? m.name : ((S.people[id] || {}).name || id); };
  const PCOL = ['#0b63c7', '#e2445c', '#00a36c', '#a25ddc', '#fd8c3d', '#037f9c', '#bb3354', '#5559df'];
  const personColor = (id) => { const i = S.members.findIndex((m) => String(m.person_id) === String(id)); if (i >= 0) return PCOL[i % PCOL.length]; let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return PCOL[2 + (Math.abs(h) % (PCOL.length - 2))]; };
  const daysAgo = (ts) => Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);

  function statusInfo(col, v) {
    const s = col.settings || {};
    const labels = s.labels || {};
    let idx = v && v.index != null ? String(v.index) : null;
    if (idx == null) {
      // Monday shows label 5 as the default for an empty cell when it has text
      if (labels['5']) idx = '5'; else return { text: '', color: null };
    }
    if (!labels[idx]) return { text: '', color: null, idx };
    const lc = (s.labels_colors || {})[idx];
    return { text: labels[idx], color: lc ? lc.color : '#797e93', idx };
  }
  function statusOptions(col) {
    const s = col.settings || {};
    const labels = s.labels || {};
    const pos = s.labels_positions_v2 || {};
    const deact = new Set((s.deactivated_labels || []).map(String));
    return Object.keys(labels).filter((k) => labels[k] !== '' && !deact.has(k))
      .sort((a, b) => (pos[a] ?? 999) - (pos[b] ?? 999) || Number(a) - Number(b))
      .map((k) => ({ idx: k, text: labels[k], color: ((s.labels_colors || {})[k] || {}).color || '#797e93' }));
  }
  function cellText(col, v) {
    if (v == null) return '';
    switch (col.type) {
      case 'status': return statusInfo(col, v).text;
      case 'people': return (v || []).map((id) => personName(id)).join(', ');
      case 'phone': return fmtPhone(v);
      case 'date': return fmtDate(v);
      case 'numbers': return fmtNum(v);
      case 'checkbox': return v ? '✓' : '';
      default: return String(v);
    }
  }

  /* ---------- data ---------- */
  async function loadAll() {
    const [g, c, p, it, up, mem, md] = await Promise.all([
      sb.from('rys_groups').select('*').order('position'),
      sb.from('rys_columns').select('*').order('position'),
      sb.from('rys_people').select('*'),
      fetchAll('rys_items', '*', (q) => q.eq('archived', false).order('position')),
      fetchAll('rys_updates', 'id,item_id,parent_id,body,creator_id,creator_name,created_at'),
      sb.from('rys_members').select('*'),
      sb.from('rys_mention_done').select('update_id')
    ]);
    for (const r of [g, c, p, mem]) if (r.error) throw r.error;
    S.groups = g.data.filter((x) => x.board_id === C.boardId);
    S.subGroups = g.data.filter((x) => x.board_id === C.subBoardId);
    S.columns = c.data.filter((x) => x.board_id === C.boardId && !['subtasks','file','name'].includes(x.type) && !x.hidden);
    S.subColumns = c.data.filter((x) => x.board_id === C.subBoardId && !['file','name'].includes(x.type) && !x.hidden);
    S.people = {}; p.data.forEach((x) => { S.people[x.id] = Object.assign({}, x, { photo: null }); });
    const nc = c.data.find((x) => x.board_id === C.boardId && x.type === 'name'); S.nameTitle = nc ? nc.title : 'לקוח';
    S.members = mem.data;
    S.items = it.filter((x) => x.board_id === C.boardId);
    S.subitems = it.filter((x) => x.board_id === C.subBoardId);
    S.updCounts = {}; S.updText = {}; S.lastAct = {}; S.lastUpd = {};
    up.forEach((u) => {
      if (!u.parent_id) S.updCounts[u.item_id] = (S.updCounts[u.item_id] || 0) + 1;
      const t = plain(u.body);
      S.updText[u.item_id] = (S.updText[u.item_id] || '') + ' ' + t.toLowerCase();
      if (!S.lastUpd[u.item_id] || u.created_at > S.lastUpd[u.item_id].created_at) S.lastUpd[u.item_id] = { created_at: u.created_at, text: t, who: u.creator_name || personName(u.creator_id) };
    });
    S.items.forEach((i) => { const lu = S.lastUpd[i.id]; S.lastAct[i.id] = lu && lu.created_at > i.updated_at ? lu.created_at : i.updated_at; });
    S.mentionDone = new Set(((md && md.data) || []).map((r) => String(r.update_id)));
    S.allUpdates = up;
  }
  async function fetchAll(table, cols, mod) {
    const out = []; let from = 0; const step = 1000;
    for (;;) {
      let q = sb.from(table).select(cols).range(from, from + step - 1);
      if (mod) q = mod(q);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...data);
      if (data.length < step) return out;
      from += step;
    }
  }

  async function saveItem(item, patch, quiet) {
    const { data, error } = await sb.from('rys_items').update(patch).eq('id', item.id).select().single();
    if (error) { toast('השמירה נכשלה: ' + error.message); return null; }
    const moved = data.group_id !== item.group_id && !('group_id' in patch);
    Object.assign(item, data); S.lastAct[item.id] = data.updated_at || new Date().toISOString();
    if (moved && !quiet) { const g = S.groups.find((x) => x.id === data.group_id); if (g) toast(`עבר לקבוצה "${g.title}"`); }
    return data;
  }
  async function setVal(item, colId, value) {
    const before = { vals: Object.assign({}, item.vals), group_id: item.group_id };
    const vals = Object.assign({}, item.vals);
    if (value === null || value === '' || (Array.isArray(value) && !value.length)) delete vals[colId]; else vals[colId] = value;
    const r = await saveItem(item, { vals }, true);
    if (r) {
      const g = r.group_id !== before.group_id ? S.groups.find((x) => x.id === r.group_id) : null;
      toast(g ? `נשמר, ועבר לקבוצה "${g.title}"` : 'נשמר', async () => { await saveItem(item, before, true); toast('השינוי בוטל'); renderContent(); if (S.openItem) renderPanel(); });
    }
    return r;
  }

  /* ---------- auth ---------- */
  function renderLogin(msg) {
    $app.innerHTML = '';
    const f = h(`<div class="login"><form novalidate>
      <h1>RYS CRM</h1><p>התחברות למערכת</p>
      <label class="field">שם משתמש<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required dir="ltr"></label>
      <label class="field">סיסמה<input type="password" name="password" autocomplete="current-password" required dir="ltr"></label>
      <div class="err" role="alert">${esc(msg || '')}</div>
      <button class="btn" type="submit">כניסה</button>
    </form></div>`);
    f.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'מתחבר...';
      const { error } = await sb.auth.signInWithPassword({ email: String(fd.get('username')).trim().toLowerCase() + '@users.rys', password: fd.get('password') });
      if (error) { btn.disabled = false; btn.textContent = 'כניסה'; e.target.querySelector('.err').textContent = 'שם המשתמש או הסיסמה לא נכונים'; }
    });
    $app.appendChild(f);
    f.querySelector('input').focus();
  }

  async function start(session) {
    if (!session) { S.user = null; renderLogin(); return; }
    if (S.user && S.user.id === session.user.id) return;
    S.user = session.user;
    $app.innerHTML = '<div class="empty-state">טוען...</div>';
    try {
      await loadAll();
      S.me = S.members.find((m) => m.user_id === S.user.id);
      if (!S.me) { await sb.auth.signOut(); renderLogin('למשתמש הזה אין גישה למערכת'); return; }
      renderShell();
      subscribe();
    } catch (e) {
      $app.innerHTML = `<div class="empty-state">שגיאה בטעינה: ${esc(e.message)}</div>`;
    }
  }

  /* ---------- shell ---------- */
  function renderShell() {
    $app.innerHTML = '';
    const shell = h(`<div class="shell">
      <nav class="nav" aria-label="תפריט ראשי">
        <div class="logo">RYS</div>
        <button class="navbtn" data-view="table" aria-label="טבלה">${icon.board}</button>
        <button class="navbtn" data-view="kanban" aria-label="קנבן">${icon.kanban}</button>
        <button class="navbtn" data-view="urgent" aria-label="מה דחוף">${icon.bell}<span class="badge" data-badge hidden></span></button>
        <button class="navbtn ask" data-act="ask" aria-label="שאל את המערכת">${icon.spark}</button>
        <button class="navbtn bottom" data-view="admin" aria-label="ניהול והגדרות">${icon.gear}</button>
        <button class="navbtn" data-act="logout" aria-label="התנתקות">${icon.logout}</button>
      </nav>
      <div class="main">
        <div class="top">
          <h1>Restart your soul <small id="total"></small></h1>
          <div class="tabs" role="tablist">
            <button class="tab" role="tab" data-view="table">טבלה ראשית</button>
            <button class="tab" role="tab" data-view="kanban">קנבן</button>
            <button class="tab" role="tab" data-view="urgent">מה דחוף <span class="badge" data-badge hidden></span></button>
            <button class="tab" role="tab" data-view="admin">ניהול</button>
          </div>
        </div>
        <div class="stats" id="stats"></div>
        <div class="toolbar">
          <button class="btn" data-act="new">${icon.plus} לקוח חדש</button>
          <button class="btn ghost askbtn" data-act="ask">${icon.spark} שאל את המערכת</button>
          <label class="search">${icon.search}<span class="sr">חיפוש</span><input id="q" type="search" placeholder="חיפוש לפי שם, טלפון, ת״ז, מייל"></label>
        </div>
        <div class="fbar" id="fbar"></div>
        <div class="content" id="content"></div>
      </div>
    </div>`);
    $app.appendChild(shell);
    shell.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.view; renderContent(); window.scrollTo(0, 0); document.getElementById('content').scrollTop = 0; }));
    shell.querySelector('[data-act=logout]').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    shell.querySelector('[data-act=new]').addEventListener('click', () => newItem(S.groups[0].id, 'לקוח חדש', true));
    shell.querySelectorAll('[data-act=ask]').forEach((b) => b.addEventListener('click', openAsk));
    const q = shell.querySelector('#q');
    q.value = S.search;
    q.addEventListener('input', () => { S.search = q.value.trim().toLowerCase(); renderContent(); });
    renderContent();
  }

  function filtered() {
    let list = S.items;
    if (S.groupFilter) list = list.filter((i) => i.group_id === S.groupFilter);
    if (S.search) {
      const q = S.search;
      list = list.filter((i) => {
        if ((i.name || '').toLowerCase().includes(q)) return true;
        for (const c of S.columns) { const t = cellText(c, i.vals[c.id]); if (t && t.toLowerCase().includes(q)) return true; }
        const digits = q.replace(/\D/g, '');
        if (digits.length >= 4) { const ph = String(i.vals.phone_mkza5fxd || '').replace(/\D/g, ''); if (ph.includes(digits) || ph.replace(/^972/, '0').includes(digits)) return true; }
        if (q.length >= 2 && (S.updText[i.id] || '').includes(q)) return true;
        return false;
      });
    }
    for (const [cid, f] of Object.entries(S.filters)) {
      const c = colOf(S.columns, cid); if (!c) continue;
      if (f.labels) list = list.filter((i) => { const v = i.vals[cid]; const idx = v && v.index != null && statusInfo(c, v).text ? String(v.index) : ''; return f.labels.includes(idx); });
      else if (f.text) { const t = f.text.toLowerCase(); list = list.filter((i) => cellText(c, i.vals[cid]).toLowerCase().includes(t)); }
      else if (f.empty) list = list.filter((i) => !cellText(c, i.vals[cid]));
    }
    return sortRows(list);
  }
  function sortKey(c, it) {
    if (!c) return (it.name || '');
    const v = it.vals[c.id];
    if (c.type === 'status') { const s = c.settings || {}; const i = v && v.index != null && statusInfo(c, v).text ? String(v.index) : null; return i == null ? null : ((s.labels_positions_v2 || {})[i] ?? Number(i)); }
    if (c.type === 'numbers') return v == null || v === '' ? null : Number(v);
    if (c.type === 'checkbox') return v ? 1 : null;
    const t = cellText(c, v); return t ? (c.type === 'date' ? String(v) : t) : null;
  }
  function sortRows(list) {
    if (!S.sort) return list;
    const c = S.sort.col === 'name' ? null : colOf(S.columns, S.sort.col); const dir = S.sort.dir;
    return list.slice().sort((a, b) => {
      const x = sortKey(c, a), y = sortKey(c, b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he')) * dir;
    });
  }
  function renderFbar() {
    const el = document.getElementById('fbar'); if (!el) return;
    el.innerHTML = '';
    if (S.view === 'admin' || S.view === 'urgent') return;
    const chips = [];
    if (S.sort) { const c = S.sort.col === 'name' ? { title: S.nameTitle } : colOf(S.columns, S.sort.col); chips.push({ t: `מיון: ${c ? c.title : ''} ${S.sort.dir > 0 ? '↑' : '↓'}`, x: () => { S.sort = null; } }); }
    for (const [cid, f] of Object.entries(S.filters)) {
      const c = colOf(S.columns, cid); if (!c) continue;
      const what = f.labels ? f.labels.map((k) => k === '' ? 'ריק' : ((c.settings.labels || {})[k] || k)).join(', ') : f.empty ? 'ריק' : `"${f.text}"`;
      chips.push({ t: `${c.title}: ${what}`, x: () => { delete S.filters[cid]; } });
    }
    if (!chips.length) return;
    chips.forEach((ch) => { const b = h(`<button class="fchip">${esc(ch.t)} <span aria-hidden="true">✕</span><span class="sr">הסרה</span></button>`); b.addEventListener('click', () => { ch.x(); renderContent(); }); el.appendChild(b); });
    if (chips.length > 1) { const b = h('<button class="btn text">ניקוי הכל</button>'); b.addEventListener('click', () => { S.sort = null; S.filters = {}; renderContent(); }); el.appendChild(b); }
  }
  function colMenu(anchor, c) {
    const id = c ? c.id : 'name';
    const el = h(`<div class="pop colmenu" role="dialog" aria-label="מיון וסינון ${esc(c ? c.title : S.nameTitle)}">
      <div class="mrow"><button class="opt" data-d="1">${icon.sort} סדר עולה</button><button class="opt" data-d="-1">${icon.sort} סדר יורד</button></div></div>`);
    el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { S.sort = { col: id, dir: Number(b.dataset.d) }; closePop(); renderContent(); }));
    if (c && c.type === 'status') {
      const cur = (S.filters[id] && S.filters[id].labels) || [];
      el.appendChild(h(`<div class="mh">${icon.filter} הצג רק:</div>`));
      statusOptions(c).concat([{ idx: '', text: 'ריק', color: '#e6e8ef' }]).forEach((o) => {
        const lb = h(`<label class="fopt"><input type="checkbox" ${cur.includes(o.idx) ? 'checked' : ''}><span class="sw" style="background:${esc(o.color)}"></span>${esc(o.text)}</label>`);
        lb.querySelector('input').addEventListener('change', (e) => {
          const set = new Set((S.filters[id] && S.filters[id].labels) || []);
          e.target.checked ? set.add(o.idx) : set.delete(o.idx);
          if (set.size) S.filters[id] = { labels: [...set] }; else delete S.filters[id];
          renderContent();
        });
        el.appendChild(lb);
      });
    } else if (c) {
      const f = h(`<form class="mrow"><label class="sr" for="ff">סינון לפי ${esc(c.title)}</label><input id="ff" placeholder="סינון: מכיל..." value="${esc((S.filters[id] || {}).text || '')}"><button class="btn">סינון</button></form>`);
      f.addEventListener('submit', (e) => { e.preventDefault(); const v = f.querySelector('input').value.trim(); if (v) S.filters[id] = { text: v }; else delete S.filters[id]; closePop(); renderContent(); });
      el.appendChild(f);
      const em = h('<button class="opt">רק שורות שהשדה הזה ריק בהן</button>'); em.addEventListener('click', () => { S.filters[id] = { empty: true }; closePop(); renderContent(); }); el.appendChild(em);
    }
    if (S.filters[id] || (S.sort && S.sort.col === id)) { const x = h('<button class="opt" style="color:var(--danger)">ניקוי מיון וסינון בעמודה</button>'); x.addEventListener('click', () => { delete S.filters[id]; if (S.sort && S.sort.col === id) S.sort = null; closePop(); renderContent(); }); el.appendChild(x); }
    openPop(anchor, el);
  }

  function renderStats() {
    const el = document.getElementById('stats');
    document.getElementById('total').textContent = `${S.items.length} לקוחות`;
    el.innerHTML = '';
    S.groups.forEach((g) => {
      const n = S.items.filter((i) => i.group_id === g.id).length;
      const b = h(`<button class="stat" aria-pressed="${S.groupFilter === g.id}"><span class="t"><span class="dot" style="background:${esc(g.color)}"></span>${esc(g.title)}</span><span class="n">${n}</span></button>`);
      b.addEventListener('click', () => { S.groupFilter = S.groupFilter === g.id ? null : g.id; renderContent(); });
      el.appendChild(b);
    });
  }

  function renderContent() {
    document.querySelectorAll('[data-view]').forEach((b) => {
      const on = b.dataset.view === S.view;
      b.setAttribute(b.classList.contains('tab') ? 'aria-selected' : 'aria-current', on);
    });
    renderStats(); renderFbar(); renderBadge();
    const el = document.getElementById('content');
    el.innerHTML = '';
    document.getElementById('stats').style.display = S.view === 'admin' || S.view === 'urgent' ? 'none' : '';
    document.querySelector('.toolbar').style.display = S.view === 'admin' || S.view === 'urgent' ? 'none' : '';
    if (S.view === 'admin') window.RYS_ADMIN.render(el, api);
    else if (S.view === 'urgent') el.appendChild(renderUrgent());
    else if (S.view === 'kanban') el.appendChild(renderKanban()); else { el.appendChild(renderTable()); el.appendChild(renderCards()); }
  }

  /* ---------- table ---------- */
  const colWidth = (c) => c.width || ({ status: 150, people: 110, date: 110, numbers: 120, checkbox: 90, long_text: 220, email: 200, phone: 140 }[c.type] || 150);
  const gridCols = (cols, nameW) => `${nameW}px ` + cols.map((c) => colWidth(c) + 'px').join(' ');

  function renderTable() {
    const wrap = h('<div class="board-table"></div>');
    const list = filtered();
    const tpl = gridCols(S.columns, 280);
    S.groups.forEach((g) => {
      const rows = list.filter((i) => i.group_id === g.id);
      if ((S.search || S.groupFilter || Object.keys(S.filters).length) && !rows.length) return;
      const collapsed = !!S.collapsed[g.id];
      const sec = h(`<section class="group">
        <div class="ghead"><button class="toggle" aria-expanded="${!collapsed}" style="color:${darken(g.color)}">${collapsed ? icon.chevL : icon.chev}${esc(g.title)} <span class="count">${rows.length} לקוחות</span></button></div>
      </section>`);
      sec.querySelector('.toggle').addEventListener('click', () => { S.collapsed[g.id] = !collapsed; try { localStorage.setItem('rys_collapsed', JSON.stringify(S.collapsed)); } catch (e) {} renderContent(); });
      if (!collapsed) {
        const box = h(`<div class="gwrap" style="border-right-color:${esc(g.color)}"></div>`);
        const hcell = (c) => { const id = c ? c.id : 'name'; const on = S.filters[id] || (S.sort && S.sort.col === id); const b = h(`<button class="hbtn ${on ? 'on' : ''}" title="מיון וסינון">${esc(c ? c.title : S.nameTitle)}${S.sort && S.sort.col === id ? (S.sort.dir > 0 ? ' ↑' : ' ↓') : ''}${S.filters[id] ? ' ' + icon.filter : ''}</button>`); b.addEventListener('click', (e) => colMenu(e.currentTarget, c)); const d = h(`<div class="cell ${c ? '' : 'name'}"></div>`); d.appendChild(b); return d; };
        const head = h(`<div class="row head" style="grid-template-columns:${tpl}"></div>`);
        head.appendChild(hcell(null));
        S.columns.forEach((c) => head.appendChild(hcell(c)));
        box.appendChild(head);
        rows.forEach((it) => box.appendChild(renderRow(it, S.columns, tpl)));
        const add = h(`<div class="addrow"><label class="sr" for="add-${g.id}">הוספת לקוח לקבוצה ${esc(g.title)}</label><input id="add-${g.id}" placeholder="+ הוספת לקוח"></div>`);
        add.querySelector('input').addEventListener('keydown', async (e) => { if (e.key === 'Enter' && e.target.value.trim()) { const v = e.target.value.trim(); e.target.value = ''; await newItem(g.id, v, false); } });
        box.appendChild(add);
        box.appendChild(renderSumRow(rows, tpl));
        sec.appendChild(box);
      }
      wrap.appendChild(sec);
    });
    if (!wrap.children.length) wrap.appendChild(h('<div class="empty-state">לא נמצאו לקוחות</div>'));
    return wrap;
  }

  function renderSumRow(rows, tpl) {
    const r = h(`<div class="row sumrow" style="grid-template-columns:${tpl}"><div class="cell name"></div></div>`);
    S.columns.forEach((c) => {
      let t = '';
      if (c.type === 'numbers') { const s = rows.reduce((a, i) => a + (Number(i.vals[c.id]) || 0), 0); t = s ? fmtNum(s) : ''; }
      r.appendChild(h(`<div class="cell num">${esc(t)}</div>`));
    });
    return r;
  }

  function renderRow(it, cols, tpl, opts) {
    opts = opts || {};
    const row = h(`<div class="row" style="grid-template-columns:${tpl}"></div>`);
    const n = S.updCounts[it.id] || 0;
    const name = h(`<div class="cell name"><button class="nm" title="${esc(it.name)}">${esc(it.name) || '<span style="color:#999">ללא שם</span>'}</button>${opts.noOpen ? '' : `<button class="open" aria-label="פתיחת ${esc(it.name)}, ${n} עדכונים">${icon.chat}${n || ''}</button>`}</div>`);
    name.querySelector('.nm').addEventListener('click', () => opts.noOpen ? editText(name, it.name, (v) => saveItem(it, { name: v }).then(opts.onChange)) : openPanel(it));
    name.querySelector('.nm').addEventListener('dblclick', (e) => { e.preventDefault(); editText(name, it.name, (v) => saveItem(it, { name: v }).then(() => (opts.onChange || renderContent)())); });
    if (!opts.noOpen) name.querySelector('.open').addEventListener('click', () => openPanel(it));
    row.appendChild(name);
    cols.forEach((c) => row.appendChild(renderCell(it, c, opts.onChange || renderContent)));
    return row;
  }

  function renderCell(it, c, rerender) {
    const v = it.vals[c.id];
    if (c.type === 'status') {
      const s = statusInfo(c, v);
      const cell = h(`<div class="cell st"><button class="${s.color ? '' : 'empty'}" style="${s.color ? 'background:' + esc(s.color) + ';color:' + ink(s.color) : ''}" aria-label="${esc(c.title)}: ${esc(s.text || 'ריק')}"><bdi>${esc(s.text)}</bdi></button></div>`);
      cell.querySelector('button').addEventListener('click', (e) => statusPicker(e.currentTarget, c, async (idx) => { await setVal(it, c.id, idx == null ? null : { index: idx }); rerender(); }));
      return cell;
    }
    if (c.type === 'checkbox') {
      const cell = h(`<div class="cell chk"><input type="checkbox" aria-label="${esc(c.title)}" ${v ? 'checked' : ''}></div>`);
      cell.querySelector('input').addEventListener('change', async (e) => { await setVal(it, c.id, e.target.checked ? true : null); });
      return cell;
    }
    if (c.type === 'people') {
      const ids = v || [];
      const cell = h(`<div class="cell"><button class="edit people" aria-label="${esc(c.title)}: ${esc(cellText(c, v) || 'ריק')}"></button></div>`);
      const b = cell.querySelector('button');
      ids.forEach((id) => { const n = personName(id); b.appendChild(h(`<span class="pchip" style="--pc:${personColor(id)}"><span class="avatar" style="background:${personColor(id)}">${esc(initials(n))}</span>${ids.length === 1 ? esc(n) : ''}</span>`)); });
      b.addEventListener('click', (e) => peoplePicker(e.currentTarget, ids, async (nids) => { await setVal(it, c.id, nids); rerender(); }));
      return cell;
    }
    if (c.type === 'phone' && v) {
      const cell = h(`<div class="cell phonecell"><button class="edit" dir="ltr" title="עריכה">${esc(fmtPhone(v))}</button><a class="wa" href="${esc(waUrl(v))}" target="_blank" rel="noopener" aria-label="וואטסאפ ל-${esc(it.name)}">${icon.wa}</a></div>`);
      cell.querySelector('button').addEventListener('click', () => editText(cell, v, async (nv) => { await setVal(it, c.id, nv); rerender(); }, 'tel'));
      return cell;
    }
    const cls = c.type === 'numbers' ? 'num' : c.type === 'date' ? 'date' : '';
    const txt = cellText(c, v);
    const cell = h(`<div class="cell ${cls}"><button class="edit" title="${esc(txt)}" ${c.type === 'phone' ? 'dir="ltr"' : ''}>${esc(txt)}</button></div>`);
    cell.querySelector('button').addEventListener('click', () => {
      if (c.type === 'long_text') return openPanel(it, 'details');
      const type = c.type === 'numbers' ? 'number' : c.type === 'date' ? 'date' : c.type === 'email' ? 'email' : c.type === 'phone' ? 'tel' : 'text';
      editText(cell, c.type === 'date' ? String(v || '').slice(0, 10) : (v ?? ''), async (nv) => {
        let val = nv;
        if (c.type === 'numbers') val = nv === '' ? null : Number(nv);
        await setVal(it, c.id, val); rerender();
      }, type);
    });
    return cell;
  }

  function editText(cell, value, onSave, type) {
    const prev = cell.innerHTML;
    const inp = h(`<input class="inline" type="${type || 'text'}" ${type === 'number' ? 'step="any"' : ''} ${type === 'tel' || type === 'email' ? 'dir="ltr"' : ''}>`);
    inp.value = value == null ? '' : value;
    cell.innerHTML = ''; cell.appendChild(inp); inp.focus(); if (inp.select && type !== 'date' && type !== 'email' && type !== 'number') inp.select();
    let done = false;
    const finish = async (save) => {
      if (done) return; done = true;
      if (save && String(inp.value) !== String(value == null ? '' : value)) await onSave(inp.value.trim());
      else cell.innerHTML = prev, renderContentSoft(cell);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }
  function renderContentSoft() { if (S.openItem) renderPanel(); renderContent(); }

  /* ---------- popovers ---------- */
  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('mousedown', outside, true); } }
  function outside(e) { if (popEl && !popEl.contains(e.target)) closePop(); }
  function openPop(anchor, el) {
    closePop(); popEl = el; document.body.appendChild(el);
    const r = anchor.getBoundingClientRect(); const w = el.offsetWidth; const hgt = el.offsetHeight;
    let left = r.left + r.width / 2 - w / 2; left = Math.max(8, Math.min(left, innerWidth - w - 8));
    let top = r.bottom + 4; if (top + hgt > innerHeight - 8) top = Math.max(8, r.top - hgt - 4);
    el.style.left = left + 'px'; el.style.top = top + 'px';
    setTimeout(() => document.addEventListener('mousedown', outside, true));
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); anchor.focus(); } });
    const f = el.querySelector('button'); if (f) f.focus();
  }
  function statusPicker(anchor, col, onPick) {
    const el = h(`<div class="pop" role="dialog" aria-label="${esc(col.title)}"></div>`);
    statusOptions(col).forEach((o) => { const b = h(`<button class="lbl" style="background:${esc(o.color)};color:${ink(o.color)}">${esc(o.text)}</button>`); b.addEventListener('click', () => { closePop(); onPick(o.idx); }); el.appendChild(b); });
    const clr = h('<button class="lbl clear">ריק</button>'); clr.addEventListener('click', () => { closePop(); onPick(null); }); el.appendChild(clr);
    openPop(anchor, el);
  }
  function peoplePicker(anchor, ids, onPick) {
    const el = h('<div class="pop" role="dialog" aria-label="בחירת אנשים"></div>');
    Object.values(S.people).sort((a, b) => a.name.localeCompare(b.name, 'he')).forEach((p) => {
      const on = ids.includes(p.id);
      const b = h(`<button class="opt" aria-pressed="${on}"><span class="avatar">${p.photo ? `<img alt="" src="${esc(p.photo)}">` : esc(initials(p.name))}</span>${esc(p.name)}${on ? ' ✓' : ''}</button>`);
      b.addEventListener('click', () => { closePop(); onPick(on ? ids.filter((x) => x !== p.id) : ids.concat(p.id)); });
      el.appendChild(b);
    });
    openPop(anchor, el);
  }
  function groupPicker(anchor, it) {
    const el = h('<div class="pop" role="dialog" aria-label="העברה לקבוצה"></div>');
    S.groups.forEach((g) => { const b = h(`<button class="opt"><span class="dot" style="width:12px;height:12px;border-radius:3px;background:${esc(g.color)}"></span>${esc(g.title)}${g.id === it.group_id ? ' ✓' : ''}</button>`); b.addEventListener('click', async () => { closePop(); const from = it.group_id; await saveItem(it, { group_id: g.id }); renderPanel(); renderContent(); toast(`הועבר ל"${g.title}"`, async () => { await saveItem(it, { group_id: from }, true); renderPanel(); renderContent(); }); }); el.appendChild(b); });
    openPop(anchor, el);
  }

  /* ---------- mobile cards ---------- */
  function renderCards() {
    const wrap = h('<div class="cards"></div>');
    const list = filtered();
    const stCol = colOf(S.columns, C.statusColumn);
    const pkgCol = colOf(S.columns, 'color_mkzacdbj');
    S.groups.forEach((g) => {
      const rows = list.filter((i) => i.group_id === g.id);
      if (!rows.length) return;
      wrap.appendChild(h(`<h2 style="font-size:16px;color:${darken(g.color)};margin:14px 0 8px">${esc(g.title)} <span style="color:#62636f;font-weight:400;font-size:13px">${rows.length}</span></h2>`));
      rows.forEach((it) => {
        const st = stCol ? statusInfo(stCol, it.vals[stCol.id]) : {};
        const pk = pkgCol ? statusInfo(pkgCol, it.vals[pkgCol.id]) : {};
        const ph = it.vals.phone_mkza5fxd || '';
        const c = h(`<div class="card" style="border-right-color:${esc(g.color)}">
          <button class="r1 open"><b>${esc(it.name)}</b><span style="color:#0b63c7;font-size:13px">${S.updCounts[it.id] || 0} עדכונים</span></button>
          <span class="chips">${stCol ? `<button class="chip ${st.text ? '' : 'emptychip'}" data-st style="${st.text ? `background:${esc(st.color)};color:${ink(st.color)}` : ''}" aria-label="סטטוס: ${esc(st.text || 'ריק')}, לשינוי">${esc(st.text || '+ סטטוס')}</button>` : ''}${pk.text ? `<span class="chip" style="background:${esc(pk.color)};color:${ink(pk.color)}">${esc(pk.text)}</span>` : ''}</span>
          ${ph ? `<span class="phrow"><span class="ph" dir="ltr">${esc(fmtPhone(ph))}</span><a class="iconlink" href="${esc(telUrl(ph))}" aria-label="חיוג">${icon.phone}</a><a class="iconlink wa" href="${esc(waUrl(ph))}" target="_blank" rel="noopener" aria-label="וואטסאפ">${icon.wa}</a></span>` : ''}
        </div>`);
        c.querySelector('.open').addEventListener('click', () => openPanel(it));
        const sb2 = c.querySelector('[data-st]');
        if (sb2) sb2.addEventListener('click', (e) => statusPicker(e.currentTarget, stCol, async (idx) => { await setVal(it, stCol.id, idx == null ? null : { index: idx }); renderContent(); }));
        wrap.appendChild(c);
      });
    });
    if (!wrap.querySelector('.card')) wrap.appendChild(h('<div class="empty-state">לא נמצאו לקוחות</div>'));
    return wrap;
  }

  /* ---------- kanban ---------- */
  function renderKanban() {
    const col = colOf(S.columns, C.statusColumn);
    const wrap = h('<div class="kanban"></div>');
    const list = filtered();
    const opts = statusOptions(col).concat([{ idx: null, text: 'ללא סטטוס', color: '#9a9ca8' }]);
    opts.forEach((o) => {
      const items = list.filter((i) => { const v = i.vals[col.id]; return o.idx == null ? !(v && v.index != null) : v && String(v.index) === o.idx; });
      const k = h(`<div class="kcol"><h3 style="background:${esc(o.color)};color:${ink(o.color)}">${esc(o.text)}<span>${items.length}</span></h3></div>`);
      k.addEventListener('dragover', (e) => { e.preventDefault(); k.classList.add('over'); });
      k.addEventListener('dragleave', () => k.classList.remove('over'));
      k.addEventListener('drop', async (e) => {
        e.preventDefault(); k.classList.remove('over');
        const it = S.items.find((x) => String(x.id) === e.dataTransfer.getData('text/plain'));
        if (it) { await setVal(it, col.id, o.idx == null ? null : { index: o.idx }); renderContent(); }
      });
      items.forEach((it) => {
        const pk = statusInfo(colOf(S.columns, 'color_mkzacdbj') || col, it.vals.color_mkzacdbj);
        const c = h(`<button class="kcard" draggable="true"><b>${esc(it.name)}</b><span class="sub">${esc(pk.text || '')}</span><span class="sub">${S.updCounts[it.id] || 0} עדכונים</span></button>`);
        c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(it.id)));
        c.addEventListener('click', () => openPanel(it));
        k.appendChild(c);
      });
      wrap.appendChild(k);
    });
    return wrap;
  }

  /* ---------- create / delete ---------- */
  async function newItem(groupId, name, open) {
    const pos = Math.min(0, ...S.items.filter((i) => i.group_id === groupId).map((i) => i.position)) - 1;
    const { data, error } = await sb.from('rys_items').insert({ board_id: C.boardId, group_id: groupId, name, position: pos, creator_id: S.me.person_id }).select().single();
    if (error) return toast('ההוספה נכשלה: ' + error.message);
    S.items.unshift(data); renderContent();
    if (open) openPanel(data, 'details');
  }
  async function deleteItem(it) {
    if (!confirm(`למחוק את "${it.name}"? הלקוח יעבור לארכיון ואפשר יהיה לשחזר אותו.`)) return;
    const r = await saveItem(it, { archived: true });
    if (r) { S.items = S.items.filter((x) => x.id !== it.id); closePanel(); renderContent(); toast('הלקוח נמחק', async () => { const b = await saveItem(it, { archived: false }, true); if (b) { S.items.push(it); S.items.sort((a, c) => a.position - c.position); renderContent(); toast('הלקוח הוחזר'); } }); }
  }

  /* ---------- side panel ---------- */
  function openPanel(it, tab) { S.openItem = it; S.panelTab = tab || 'updates'; renderPanel(); }
  function closePanel() { S.openItem = null; const p = document.getElementById('panel'); if (p) p.remove(); const s = document.getElementById('scrim'); if (s) s.remove(); }

  function renderPanel() {
    const it = S.openItem; if (!it) return;
    let p = document.getElementById('panel');
    if (!p) {
      const scrim = h('<div class="scrim" id="scrim"></div>'); scrim.addEventListener('click', closePanel); document.body.appendChild(scrim);
      p = h('<div class="panel" id="panel" role="dialog" aria-modal="true"></div>'); document.body.appendChild(p);
      p.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !popEl) closePanel(); });
    }
    const g = S.groups.find((x) => x.id === it.group_id) || {};
    const subs = S.subitems.filter((s) => s.parent_item_id === it.id);
    p.setAttribute('aria-label', it.name);
    p.innerHTML = '';
    const head = h(`<header>
      <div class="ptitle"><button class="iconbtn" data-act="close" aria-label="סגירה">${icon.close}</button><label class="sr" for="pname">שם הלקוח</label><input id="pname"><button class="iconbtn" data-act="del" aria-label="מחיקת לקוח">${icon.trash}</button></div>
      <div class="psum"><button class="btn text" data-act="group" style="color:${darken(g.color)}">● ${esc(g.title || '')}</button></div>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" data-tab="updates">עדכונים (${S.updCounts[it.id] || 0})</button>
        <button class="tab" role="tab" data-tab="details">פרטים</button>
        <button class="tab" role="tab" data-tab="subs">תשלומים (${subs.length})</button>
        <button class="tab" role="tab" data-tab="log">היסטוריה</button>
      </div></header>`);
    const nameInp = head.querySelector('#pname'); nameInp.value = it.name;
    nameInp.addEventListener('change', async () => { await saveItem(it, { name: nameInp.value.trim() }); renderContent(); });
    head.querySelector('[data-act=close]').addEventListener('click', closePanel);
    head.querySelector('[data-act=del]').addEventListener('click', () => deleteItem(it));
    head.querySelector('[data-act=group]').addEventListener('click', (e) => groupPicker(e.currentTarget, it));
    const psum = head.querySelector('.psum');
    ['status', 'color_mkzacdbj', 'color_mkzan83x'].forEach((cid) => {
      const c = colOf(S.columns, cid); if (!c) return;
      const si = statusInfo(c, it.vals[cid]);
      const b = h(`<button class="chip ${si.text ? '' : 'emptychip'}" style="${si.text ? `background:${esc(si.color)};color:${ink(si.color)}` : ''}" title="${esc(c.title)}" aria-label="${esc(c.title)}: ${esc(si.text || 'ריק')}">${esc(si.text || '+ ' + c.title)}</button>`);
      b.addEventListener('click', (e) => statusPicker(e.currentTarget, c, async (idx) => { await setVal(it, cid, idx == null ? null : { index: idx }); renderPanel(); renderContent(); }));
      psum.appendChild(b);
    });
    const ph = it.vals.phone_mkza5fxd;
    if (ph) psum.appendChild(h(`<span class="phrow"><span class="ph" dir="ltr">${esc(fmtPhone(ph))}</span><a class="iconlink" href="${esc(telUrl(ph))}" aria-label="חיוג">${icon.phone}</a><a class="iconlink wa" href="${esc(waUrl(ph))}" target="_blank" rel="noopener" aria-label="וואטסאפ">${icon.wa}</a></span>`));
    head.querySelectorAll('[data-tab]').forEach((b) => { b.setAttribute('aria-selected', b.dataset.tab === S.panelTab); b.addEventListener('click', () => { S.panelTab = b.dataset.tab; renderPanel(); }); });
    p.appendChild(head);
    const body = h('<div class="pbody"></div>');
    p.appendChild(body);
    if (S.panelTab === 'updates') renderUpdates(body, it);
    else if (S.panelTab === 'details') renderDetails(body, it);
    else if (S.panelTab === 'subs') renderSubs(body, it);
    else renderLog(body, it);
    if (!p.contains(document.activeElement)) head.querySelector('[data-act=close]').focus();
  }

  function renderDetails(body, it) {
    const grid = h('<div class="details"></div>');
    S.columns.forEach((c) => {
      const v = it.vals[c.id];
      if (c.type === 'status') {
        const s = statusInfo(c, v);
        const f = h(`<div class="field"><span>${esc(c.title)}</span><button class="stbtn ${s.color ? '' : 'empty'}" style="${s.color ? 'background:' + esc(s.color) + ';color:' + ink(s.color) : ''}">${esc(s.text || 'בחירה')}</button></div>`);
        f.querySelector('button').addEventListener('click', (e) => statusPicker(e.currentTarget, c, async (idx) => { await setVal(it, c.id, idx == null ? null : { index: idx }); renderPanel(); renderContent(); }));
        grid.appendChild(f); return;
      }
      if (c.type === 'people') {
        const f = h(`<div class="field"><span>${esc(c.title)}</span><button class="btn ghost" style="justify-content:flex-start">${esc(cellText(c, v) || 'בחירה')}</button></div>`);
        f.querySelector('button').addEventListener('click', (e) => peoplePicker(e.currentTarget, v || [], async (n) => { await setVal(it, c.id, n); renderPanel(); renderContent(); }));
        grid.appendChild(f); return;
      }
      if (c.type === 'checkbox') {
        const f = h(`<label class="field" style="flex-direction:row;align-items:center;gap:10px;min-height:44px"><input type="checkbox" style="width:22px;height:22px" ${v ? 'checked' : ''}>${esc(c.title)}</label>`);
        f.querySelector('input').addEventListener('change', async (e) => { await setVal(it, c.id, e.target.checked ? true : null); renderContent(); });
        grid.appendChild(f); return;
      }
      const long = c.type === 'long_text';
      const type = c.type === 'numbers' ? 'number' : c.type === 'date' ? 'date' : c.type === 'email' ? 'email' : c.type === 'phone' ? 'tel' : 'text';
      const f = h(`<label class="field ${long ? 'wide' : ''}">${esc(c.title)}${long ? '<textarea rows="4"></textarea>' : `<input type="${type}" ${type === 'number' ? 'step="any"' : ''} ${type === 'tel' || type === 'email' ? 'dir="ltr"' : ''}>`}</label>`);
      const inp = f.querySelector('input,textarea');
      inp.value = v == null ? '' : (c.type === 'date' ? String(v).slice(0, 10) : v);
      inp.addEventListener('change', async () => {
        let nv = inp.value.trim(); if (c.type === 'numbers') nv = nv === '' ? null : Number(nv);
        await setVal(it, c.id, nv); renderContent();
      });
      if (c.type === 'phone' && v) {
        const num = String(v).replace(/[^\d+]/g, '');
        const intl = num.replace(/^\+/, '').replace(/^0/, '972');
        f.appendChild(h(`<span style="display:flex;gap:8px"><a class="btn ghost" href="tel:${esc(num)}">חיוג</a><a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/${esc(intl)}">וואטסאפ</a></span>`));
      }
      if (c.type === 'email' && v) f.appendChild(h(`<a class="btn ghost" href="mailto:${esc(v)}">שליחת מייל</a>`));
      grid.appendChild(f);
    });
    body.appendChild(grid);
    body.appendChild(h(`<p style="color:#62636f;font-size:13px;margin-top:18px">נוצר ב-${esc(fmtWhen(it.created_at))} · עודכן לאחרונה ${esc(fmtWhen(it.updated_at))}</p>`));
  }

  function renderSubs(body, it) {
    const subs = S.subitems.filter((s) => s.parent_item_id === it.id).sort((a, b) => a.position - b.position);
    const tpl = gridCols(S.subColumns, 200);
    const cols = S.subColumns;
    const box = h('<div class="subtbl"></div>');
    const head = h(`<div class="row head" style="grid-template-columns:${tpl}"><div class="cell name">פריט</div></div>`);
    cols.forEach((c) => head.appendChild(h(`<div class="cell">${esc(c.title)}</div>`)));
    box.appendChild(head);
    const re = () => renderPanel();
    subs.forEach((s) => {
      const row = renderRow(s, cols, tpl, { noOpen: true, onChange: re });
      const del = h(`<button class="iconbtn" aria-label="מחיקת ${esc(s.name)}" style="width:36px;height:36px">${icon.trash}</button>`);
      del.addEventListener('click', async () => { if (!confirm(`למחוק את "${s.name}"?`)) return; const r = await saveItem(s, { archived: true }); if (r) { S.subitems = S.subitems.filter((x) => x.id !== s.id); renderPanel(); } });
      row.querySelector('.cell.name').appendChild(del);
      box.appendChild(row);
    });
    const add = h('<div class="addrow"><label class="sr" for="addsub">הוספת תשלום</label><input id="addsub" placeholder="+ הוספת שורה (לדוגמה: תשלום)"></div>');
    add.querySelector('input').addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      const { data, error } = await sb.from('rys_items').insert({ board_id: C.subBoardId, group_id: S.subGroups[0].id, parent_item_id: it.id, name: e.target.value.trim(), position: subs.length, creator_id: S.me.person_id }).select().single();
      if (error) return toast('ההוספה נכשלה');
      S.subitems.push(data); renderPanel(); const ni = document.getElementById('addsub'); if (ni) ni.focus();
    });
    box.appendChild(add);
    body.appendChild(box);
    body.appendChild(h('<p style="color:#62636f;font-size:13px">טיפ: לוחצים על תא כדי לערוך אותו, ולחיצה כפולה על השם משנה אותו.</p>'));
  }

  async function renderUpdates(body, it) {
    const comp = h(`<div class="composer"><label class="sr" for="newupd">עדכון חדש</label><textarea id="newupd" placeholder="כתוב עדכון על הלקוח..."></textarea><div class="acts"><button class="btn" data-post>פרסום עדכון</button></div></div>`);
    mentionButtons(comp);
    comp.querySelector('[data-post]').addEventListener('click', async () => {
      const t = comp.querySelector('textarea').value.trim(); if (!t) return;
      await addUpdate(it, t, null); renderPanel();
    });
    body.appendChild(comp);
    const listEl = h('<div><div class="empty-state">טוען עדכונים...</div></div>');
    body.appendChild(listEl);
    const { data, error } = await sb.from('rys_updates').select('*').eq('item_id', it.id).order('created_at', { ascending: false });
    if (error) { listEl.innerHTML = '<div class="empty-state">שגיאה בטעינת העדכונים</div>'; return; }
    listEl.innerHTML = '';
    const top = data.filter((u) => !u.parent_id);
    if (!top.length) listEl.appendChild(h('<div class="empty-state">אין עדכונים עדיין</div>'));
    top.forEach((u) => {
      const reps = data.filter((r) => r.parent_id === u.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const card = h('<article class="upd"></article>');
      card.appendChild(updMeta(u));
      card.appendChild(updBody(u));
      card.appendChild(updTools(u, it));
      reps.forEach((r) => { const rc = h('<div class="reply"></div>'); rc.appendChild(updMeta(r)); rc.appendChild(updBody(r)); rc.appendChild(updTools(r, it, true)); card.appendChild(rc); });
      const rb = h('<button class="btn text">השב</button>');
      rb.addEventListener('click', () => {
        rb.remove();
        const f = h(`<div class="composer" style="margin:10px 0 0"><label class="sr" for="rep-${u.id}">תגובה</label><textarea id="rep-${u.id}" placeholder="כתוב תגובה..." style="min-height:60px"></textarea><div class="acts"><button class="btn" data-post>שליחה</button></div></div>`);
        mentionButtons(f);
        f.querySelector('[data-post]').addEventListener('click', async () => { const t = f.querySelector('textarea').value.trim(); if (t) { await addUpdate(it, t, u.id); renderPanel(); } });
        card.appendChild(f); f.querySelector('textarea').focus();
      });
      card.appendChild(rb);
      listEl.appendChild(card);
    });
  }
  function updMeta(u) {
    const p = S.people[u.creator_id] || {};
    const name = u.creator_name || p.name || 'משתמש';
    return h(`<div class="meta"><span class="avatar">${p.photo ? `<img alt="" src="${esc(p.photo)}">` : esc(initials(name))}</span><span class="who">${esc(name)}</span><span class="when">${esc(fmtWhen(u.created_at))}${u.updated_at && u.updated_at.slice(0, 16) !== u.created_at.slice(0, 16) && u.author_user ? ' (נערך)' : ''}</span></div>`);
  }
  function updBody(u) {
    const d = h('<div class="body"></div>');
    d.innerHTML = window.DOMPurify.sanitize(u.body || '', { ADD_ATTR: ['target'] });
    d.querySelectorAll('a').forEach((a) => { if (a.classList.contains('user_mention_editor')) { a.removeAttribute('href'); a.className = 'mention'; return; } a.target = '_blank'; a.rel = 'noopener'; });
    return d;
  }
  function updTools(u, it, isReply) {
    const t = h('<div class="tools"></div>');
    if (u.author_user && u.author_user === S.user.id) {
      const e = h('<button class="btn text">עריכה</button>');
      e.addEventListener('click', () => {
        const box = e.closest(isReply ? '.reply' : '.upd').querySelector('.body');
        const ta = h('<textarea style="width:100%;min-height:70px;border:1px solid #c6c9d6;border-radius:8px;padding:8px"></textarea>'); ta.value = box.innerText;
        box.replaceWith(ta); ta.focus();
        e.textContent = 'שמירה';
        e.onclick = async () => { const { error } = await sb.from('rys_updates').update({ body: textToHtml(ta.value), updated_at: new Date().toISOString() }).eq('id', u.id); if (error) toast('השמירה נכשלה'); renderPanel(); };
      }, { once: true });
      const d = h('<button class="btn text" style="color:#c4314b">מחיקה</button>');
      d.addEventListener('click', async () => { if (!confirm('למחוק את העדכון?')) return; const { error } = await sb.from('rys_updates').delete().eq('id', u.id); if (error) return toast('המחיקה נכשלה'); if (!isReply) S.updCounts[it.id] = Math.max(0, (S.updCounts[it.id] || 1) - 1); renderPanel(); renderContent(); });
      t.appendChild(e); t.appendChild(d);
    }
    return t;
  }
  const textToHtml = (t) => {
    let html = '<div dir="rtl">' + t.split(/\n/).map((l) => `<p>${esc(l) || '&nbsp;'}</p>`).join('') + '</div>';
    S.members.filter((m) => m.person_id).forEach((m) => { html = html.split(esc('@' + m.name)).join(`<a class="user_mention_editor" data-mention-type="User" data-mention-id="${esc(m.person_id)}">@${esc(m.name)}</a>`); });
    return html;
  };
  function mentionButtons(comp) {
    const acts = comp.querySelector('.acts'); const ta = comp.querySelector('textarea');
    S.members.filter((m) => m.user_id !== S.user.id && m.person_id).forEach((m) => {
      const b = h(`<button class="btn ghost small" type="button" title="תיוג: ${esc(m.name)} יראה את זה ב'מה דחוף'">@${esc(m.name)}</button>`);
      b.addEventListener('click', () => { const pos = ta.selectionStart ?? ta.value.length; const ins = (pos && !/\s$/.test(ta.value.slice(0, pos)) ? ' ' : '') + '@' + m.name + ' '; ta.value = ta.value.slice(0, pos) + ins + ta.value.slice(pos); ta.focus(); ta.selectionStart = ta.selectionEnd = pos + ins.length; });
      acts.appendChild(b);
    });
  }
  async function addUpdate(it, text, parentId) {
    const { error } = await sb.from('rys_updates').insert({ item_id: it.id, parent_id: parentId, body: textToHtml(text), creator_id: S.me.person_id, creator_name: S.me.name });
    if (error) return toast('הפרסום נכשל: ' + error.message);
    if (!parentId) S.updCounts[it.id] = (S.updCounts[it.id] || 0) + 1;
    saveItem(it, { updated_at: new Date().toISOString() });
    renderContent();
  }

  async function renderLog(body, it) {
    body.appendChild(h('<div class="empty-state">טוען...</div>'));
    const { data, error } = await sb.from('rys_activity').select('*').eq('item_id', it.id).order('created_at', { ascending: false }).limit(200);
    body.innerHTML = '';
    if (error) return body.appendChild(h('<div class="empty-state">שגיאה</div>'));
    if (!data.length) return body.appendChild(h('<div class="empty-state">כאן יופיעו כל השינויים שייעשו מעכשיו במערכת החדשה</div>'));
    const ul = h('<ul class="log"></ul>');
    data.forEach((a) => {
      const col = colOf(S.columns, a.field) || colOf(S.subColumns, a.field);
      const label = a.field === 'name' ? 'שם' : a.field === 'group' ? 'קבוצה' : col ? col.title : a.field;
      const show = (raw) => {
        if (raw == null || raw === '') return '—';
        if (a.field === 'group') return (S.groups.find((g) => g.id === raw) || {}).title || raw;
        if (!col) return raw;
        let v = raw; try { v = JSON.parse(raw); } catch (e) {}
        return cellText(col, v) || '—';
      };
      ul.appendChild(h(`<li><b>${esc(a.user_name || 'מערכת')}</b><span>${esc(label)}: ${esc(show(a.old_val))} ← ${esc(show(a.new_val))}</span><span class="when">${esc(fmtWhen(a.created_at))}</span></li>`));
    });
    body.appendChild(ul);
  }



  /* ---------- what's urgent ---------- */
  function myMentions() {
    if (!S.me || !S.me.person_id || !S.allUpdates) return [];
    const tag = `data-mention-id="${S.me.person_id}"`;
    const live = new Set(S.items.map((i) => i.id));
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    return S.allUpdates.filter((u) => live.has(u.item_id) && u.created_at >= since && (u.body || '').includes(tag) && !S.mentionDone.has(String(u.id)) && String(u.creator_id) !== String(S.me.person_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  function renderBadge() {
    const n = myMentions().length;
    document.querySelectorAll('[data-badge]').forEach((b) => { b.hidden = !n; b.textContent = n; });
  }
  function urgentRow(it, extra) {
    const g = S.groups.find((x) => x.id === it.group_id) || {};
    const lu = S.lastUpd[it.id];
    const r = h(`<button class="urow" style="border-right-color:${esc(g.color || '#ccc')}"><span class="u1"><b>${esc(it.name)}</b><span class="ud">${extra || ''}</span></span>${lu ? `<span class="u2">${esc(lu.who || '')}: ${esc(lu.text.slice(0, 120))}${lu.text.length > 120 ? '…' : ''}</span>` : ''}</button>`);
    r.addEventListener('click', () => openPanel(it));
    return r;
  }
  function renderUrgent() {
    const wrap = h('<div class="urgent"></div>');
    const sec = (title, sub, count) => { const x = h(`<section class="usec"><h2>${title} <span class="cnt">${count}</span></h2>${sub ? `<p class="usub">${sub}</p>` : ''}</section>`); wrap.appendChild(x); return x; };
    // 1. mentions
    const ms = myMentions();
    const m = sec('תייגו אותך', ms.length ? 'מ-14 הימים האחרונים. "טופל" מוריד מהרשימה.' : '', ms.length);
    if (!ms.length) m.appendChild(h('<p class="usub">אין תיוגים פתוחים 🎉</p>'));
    ms.forEach((u) => {
      const it = S.items.find((i) => i.id === u.item_id); if (!it) return;
      const card = h(`<div class="mrowc"><button class="urow" style="border-right-color:#a25ddc"><span class="u1"><b>${esc(it.name)}</b><span class="ud">${esc(u.creator_name || personName(u.creator_id))} · ${esc(fmtWhen(u.created_at))}</span></span><span class="u2">${esc(plain(u.body).slice(0, 220))}</span></button><button class="btn ghost" data-done>טופל ✓</button></div>`);
      card.querySelector('.urow').addEventListener('click', () => openPanel(it));
      card.querySelector('[data-done]').addEventListener('click', async () => {
        const { error } = await sb.from('rys_mention_done').insert({ update_id: u.id });
        if (error) return toast('לא נשמר: ' + error.message);
        S.mentionDone.add(String(u.id)); renderContent();
        toast('סומן כטופל', async () => { await sb.from('rys_mention_done').delete().eq('update_id', u.id); S.mentionDone.delete(String(u.id)); renderContent(); });
      });
      m.appendChild(card);
    });
    // 2. stuck
    const active = ['topics', 'group_mkzreqf8'];
    const stuck = S.items.filter((i) => active.includes(i.group_id) && daysAgo(S.lastAct[i.id] || i.updated_at) >= S.staleDays)
      .sort((a, b) => (S.lastAct[a.id] || '').localeCompare(S.lastAct[b.id] || ''));
    const st = sec(`לא זזו ${S.staleDays} ימים או יותר`, '', stuck.length);
    const sel = h(`<label class="usub" style="display:flex;gap:8px;align-items:center">לקוחות בקליטה ובתהליך שלא היה בהם שינוי או עדכון מעל <select>${[3, 7, 14, 30].map((d) => `<option value="${d}" ${d === S.staleDays ? 'selected' : ''}>${d} ימים</option>`).join('')}</select></label>`);
    sel.querySelector('select').addEventListener('change', (e) => { S.staleDays = Number(e.target.value); try { localStorage.setItem('rys_stale', S.staleDays); } catch (x) {} renderContent(); });
    st.appendChild(sel);
    stuck.forEach((it) => st.appendChild(urgentRow(it, `${daysAgo(S.lastAct[it.id])} ימים בלי תזוזה`)));
    // 3. waiting statuses
    const stCol = colOf(S.columns, 'status');
    if (stCol) ['7', '6', '2'].forEach((idx) => {
      const label = (stCol.settings.labels || {})[idx]; if (!label) return;
      const rows = S.items.filter((i) => i.vals.status && String(i.vals.status.index) === idx).sort((a, b) => (S.lastAct[a.id] || '').localeCompare(S.lastAct[b.id] || ''));
      if (!rows.length) return;
      const x = sec(esc(label), '', rows.length);
      rows.forEach((it) => x.appendChild(urgentRow(it, `${daysAgo(S.lastAct[it.id])} ימים מאז שינוי אחרון`)));
    });
    // 4. not delivered
    const dl = colOf(S.columns, 'color_mkzan83x');
    if (dl) {
      const rows = S.items.filter((i) => i.group_id !== 'group_mm1qdp4y' && i.vals.color_mkzan83x && String(i.vals.color_mkzan83x.index) === '2');
      if (rows.length) { const x = sec('טרם סופק', 'לקוחות (לא מבוטלים) שסטטוס האספקה שלהם "טרם סופק".', rows.length); rows.forEach((it) => x.appendChild(urgentRow(it, (S.groups.find((g) => g.id === it.group_id) || {}).title || ''))); }
    }
    return wrap;
  }

  /* ---------- ask the system (Claude) ---------- */
  const ASK = { turns: [], busy: false };
  function mdToHtml(md) {
    const inline = (t) => esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(#item-(\d+)\)/g, '<a href="#" data-item="$2">$1</a>');
    const lines = String(md || '').split('\n');
    let out = '', i = 0;
    while (i < lines.length) {
      const l = lines[i].trim();
      if (l.startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++; }
        const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const body = rows.filter((r) => !/^\|[\s:|-]+\|?$/.test(r));
        out += '<div class="tblwrap"><table>' + body.map((r, k) => '<tr>' + cells(r).map((c) => k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</table></div>';
        continue;
      }
      if (/^([•\-*]|\d+\.)\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^([•\-*]|\d+\.)\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^([•\-*]|\d+\.)\s+/, '')); i++; }
        out += '<ul>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>';
        continue;
      }
      if (l) out += `<p>${inline(l.replace(/^#+\s*/, ''))}</p>`;
      i++;
    }
    return out;
  }
  function openAsk() {
    let d = document.getElementById('ask');
    if (d) { d.querySelector('textarea').focus(); return; }
    const scrim = h('<div class="scrim" id="askscrim"></div>'); scrim.addEventListener('click', closeAsk); document.body.appendChild(scrim);
    d = h(`<div class="panel ask" id="ask" role="dialog" aria-modal="true" aria-label="שאל את המערכת">
      <header><div class="ptitle"><button class="iconbtn" data-act="close" aria-label="סגירה">${icon.close}</button><h2 style="flex:1;margin:0;font-size:20px;display:flex;align-items:center;gap:8px">${icon.spark} שאל את המערכת</h2><button class="btn text" data-act="clear">שיחה חדשה</button></div></header>
      <div class="pbody" id="asklog"></div>
      <form class="askform"><label class="sr" for="askq">השאלה שלך</label><textarea id="askq" rows="2" placeholder="לדוגמה: אילו לקוחות מחכים לזיכוי?"></textarea><button class="btn" aria-label="שליחה">${icon.send}</button></form>
    </div>`);
    document.body.appendChild(d);
    d.querySelector('[data-act=close]').addEventListener('click', closeAsk);
    d.querySelector('[data-act=clear]').addEventListener('click', () => { ASK.turns = []; renderAsk(); d.querySelector('textarea').focus(); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAsk(); });
    const f = d.querySelector('form'), ta = f.querySelector('textarea');
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
    f.addEventListener('submit', (e) => { e.preventDefault(); const q = ta.value.trim(); if (q && !ASK.busy) { ta.value = ''; ask(q); } });
    d.querySelector('#asklog').addEventListener('click', (e) => {
      const a = e.target.closest('[data-item]'); if (a) { e.preventDefault(); const it = S.items.find((x) => String(x.id) === a.dataset.item); if (it) { closeAsk(); openPanel(it); } else toast('הלקוח לא נמצא'); return; }
      const sug = e.target.closest('[data-q]'); if (sug && !ASK.busy) ask(sug.dataset.q);
    });
    renderAsk(); ta.focus();
  }
  function closeAsk() { ['ask', 'askscrim'].forEach((id) => { const x = document.getElementById(id); if (x) x.remove(); }); }
  function renderAsk() {
    const log = document.getElementById('asklog'); if (!log) return;
    log.innerHTML = '';
    if (!ASK.turns.length) {
      const sugs = ['אילו לקוחות מחכים לזיכוי?', 'כמה לקוחות יש בכל קבוצה?', 'מה קורה עם הלקוח האחרון שנוסף?', 'למי עוד לא יצאה חשבונית 3?'];
      log.appendChild(h(`<div class="askhello"><p>אפשר לשאול כל שאלה על הלקוחות, הסטטוסים, התשלומים והעדכונים. העוזר קורא את כל המערכת ועונה, אבל לא משנה בה כלום.</p><div class="sugs">${sugs.map((q) => `<button class="btn ghost" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`));
    }
    ASK.turns.forEach((t) => {
      if (t.role === 'user') log.appendChild(h(`<div class="msg me">${esc(t.content)}</div>`));
      else { const m = h('<div class="msg bot"></div>'); m.innerHTML = t.error ? `<p style="color:var(--danger)">${esc(t.content)}</p>` : mdToHtml(t.content); log.appendChild(m); }
    });
    if (ASK.busy) log.appendChild(h('<div class="msg bot thinking" aria-live="polite">בודק במערכת<span>.</span><span>.</span><span>.</span></div>'));
    log.scrollTop = log.scrollHeight;
  }
  async function ask(q) {
    const history = ASK.turns.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.content }));
    ASK.turns.push({ role: 'user', content: q }); ASK.busy = true; renderAsk();
    let res;
    try { res = await sb.functions.invoke('rys-ask', { body: { question: q, history } }); } catch (e) { res = { error: e }; }
    ASK.busy = false;
    let data = res.data, err = null;
    if (res.error) {
      try { const ctx = res.error.context; data = ctx && ctx.json ? await ctx.json() : null; } catch (e) { data = null; }
      err = (data && data.error) || 'לא הצלחתי להתחבר לעוזר. נסה שוב.';
    }
    if (err) ASK.turns.push({ role: 'assistant', content: err, error: true });
    else ASK.turns.push({ role: 'assistant', content: data.answer });
    renderAsk();
  }

  /* ---------- realtime ---------- */
  let chan = null;
  function subscribe() {
    if (chan) return;
    let t = null;
    const refresh = () => { clearTimeout(t); t = setTimeout(async () => {
      if (document.querySelector('input.inline, .panel textarea:focus, .panel input:focus')) return; // don't disturb typing
      const open = S.openItem && S.openItem.id;
      await loadAll();
      if (open) S.openItem = S.items.find((i) => i.id === open) || null;
      renderContent(); if (S.openItem) renderPanel(); else closePanel();
    }, 800); };
    chan = sb.channel('rys').on('postgres_changes', { event: '*', schema: 'public', table: 'rys_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rys_updates' }, refresh).subscribe();
  }

  const api = { ink, sb, S, C, h, esc, toast, icon, loadAll, statusOptions, fmtWhen, cellText, plain, rerender: () => renderContent() };

  sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => start(session), 0); });
  sb.auth.getSession().then(({ data }) => start(data.session));
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((r) => r.forEach((x) => x.unregister()));
})();

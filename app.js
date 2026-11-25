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
    openItem: null, panelTab: 'updates'
  };
  try { S.collapsed = JSON.parse(localStorage.getItem('rys_collapsed') || '{}'); } catch (e) { S.collapsed = {}; }

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const toast = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); };
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
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return dd && m ? `${dd}/${m}/${y.slice(2)}` : String(d); };
  const fmtWhen = (ts) => { const d = new Date(ts); return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); };
  const fmtNum = (n) => (n === null || n === undefined || n === '') ? '' : (isNaN(Number(n)) ? String(n) : Number(n).toLocaleString('he-IL'));
  const initials = (n) => (n || '?').trim().charAt(0).toUpperCase();
  const ink = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fff'; const n = parseInt(m[1], 16); const lum = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; const L = 0.2126 * lum(n >> 16) + 0.7152 * lum((n >> 8) & 255) + 0.0722 * lum(n & 255); return L > 0.28 ? '#1f2030' : '#fff'; };
  const darken = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex; if (ink(hex) === '#fff') return hex; const n = parseInt(m[1], 16); const f = (v) => Math.round(v * 0.55); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  const colOf = (cols, id) => cols.find((c) => c.id === id);

  function statusInfo(col, v) {
    const s = col.settings || {};
    const labels = s.labels || {};
    let idx = v && v.index != null ? String(v.index) : null;
    if (idx == null) {
      // Monday shows label 5 as the default for an empty cell when it has text
      if (labels['5']) idx = '5'; else return { text: '', color: null };
    }
    const lc = (s.labels_colors || {})[idx];
    return { text: labels[idx] || '', color: lc ? lc.color : '#797e93', idx };
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
      case 'people': return (v || []).map((id) => (S.people[id] || {}).name || id).join(', ');
      case 'date': return fmtDate(v);
      case 'numbers': return fmtNum(v);
      case 'checkbox': return v ? '✓' : '';
      default: return String(v);
    }
  }

  /* ---------- data ---------- */
  async function loadAll() {
    const [g, c, p, it, up, mem] = await Promise.all([
      sb.from('rys_groups').select('*').order('position'),
      sb.from('rys_columns').select('*').order('position'),
      sb.from('rys_people').select('*'),
      fetchAll('rys_items', '*', (q) => q.eq('archived', false).order('position')),
      fetchAll('rys_updates', 'id,item_id,parent_id'),
      sb.from('rys_members').select('*')
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
    S.updCounts = {}; up.forEach((u) => { if (!u.parent_id) S.updCounts[u.item_id] = (S.updCounts[u.item_id] || 0) + 1; });
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

  async function saveItem(item, patch) {
    const { data, error } = await sb.from('rys_items').update(patch).eq('id', item.id).select().single();
    if (error) { toast('השמירה נכשלה: ' + error.message); return null; }
    const moved = data.group_id !== item.group_id && !('group_id' in patch);
    Object.assign(item, data);
    if (moved) { const g = S.groups.find((x) => x.id === data.group_id); if (g) toast(`עבר לקבוצה "${g.title}"`); }
    return data;
  }
  async function setVal(item, colId, value) {
    const vals = Object.assign({}, item.vals);
    if (value === null || value === '' || (Array.isArray(value) && !value.length)) delete vals[colId]; else vals[colId] = value;
    return saveItem(item, { vals });
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
        <button class="navbtn bottom" data-view="admin" aria-label="ניהול והגדרות">${icon.gear}</button>
        <button class="navbtn" data-act="logout" aria-label="התנתקות">${icon.logout}</button>
      </nav>
      <div class="main">
        <div class="top">
          <h1>Restart your soul <small id="total"></small></h1>
          <div class="tabs" role="tablist">
            <button class="tab" role="tab" data-view="table">טבלה ראשית</button>
            <button class="tab" role="tab" data-view="kanban">קנבן</button>
            <button class="tab" role="tab" data-view="admin">ניהול</button>
          </div>
        </div>
        <div class="stats" id="stats"></div>
        <div class="toolbar">
          <button class="btn" data-act="new">${icon.plus} לקוח חדש</button>
          <label class="search">${icon.search}<span class="sr">חיפוש</span><input id="q" type="search" placeholder="חיפוש לפי שם, טלפון, ת״ז, מייל"></label>
        </div>
        <div class="content" id="content"></div>
      </div>
    </div>`);
    $app.appendChild(shell);
    shell.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.view; renderContent(); }));
    shell.querySelector('[data-act=logout]').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    shell.querySelector('[data-act=new]').addEventListener('click', () => newItem(S.groups[0].id, 'לקוח חדש', true));
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
        return false;
      });
    }
    return list;
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
    renderStats();
    const el = document.getElementById('content');
    el.innerHTML = '';
    document.getElementById('stats').style.display = S.view === 'admin' ? 'none' : '';
    document.querySelector('.toolbar').style.display = S.view === 'admin' ? 'none' : '';
    if (S.view === 'admin') window.RYS_ADMIN.render(el, api);
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
      if ((S.search || S.groupFilter) && !rows.length) return;
      const collapsed = !!S.collapsed[g.id];
      const sec = h(`<section class="group">
        <div class="ghead"><button class="toggle" aria-expanded="${!collapsed}" style="color:${darken(g.color)}">${collapsed ? icon.chevL : icon.chev}${esc(g.title)} <span class="count">${rows.length} לקוחות</span></button></div>
      </section>`);
      sec.querySelector('.toggle').addEventListener('click', () => { S.collapsed[g.id] = !collapsed; try { localStorage.setItem('rys_collapsed', JSON.stringify(S.collapsed)); } catch (e) {} renderContent(); });
      if (!collapsed) {
        const box = h(`<div class="gwrap" style="border-right-color:${esc(g.color)}"></div>`);
        const head = h(`<div class="row head" style="grid-template-columns:${tpl}"><div class="cell name">${esc(S.nameTitle)}</div></div>`);
        S.columns.forEach((c) => head.appendChild(h(`<div class="cell">${esc(c.title)}</div>`)));
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
      ids.forEach((id) => { const p = S.people[id] || { name: id }; b.appendChild(h(`<span class="avatar" title="${esc(p.name)}">${p.photo ? `<img alt="" src="${esc(p.photo)}">` : esc(initials(p.name))}</span>`)); });
      b.addEventListener('click', (e) => peoplePicker(e.currentTarget, ids, async (nids) => { await setVal(it, c.id, nids); rerender(); }));
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
    S.groups.forEach((g) => { const b = h(`<button class="opt"><span class="dot" style="width:12px;height:12px;border-radius:3px;background:${esc(g.color)}"></span>${esc(g.title)}${g.id === it.group_id ? ' ✓' : ''}</button>`); b.addEventListener('click', async () => { closePop(); await saveItem(it, { group_id: g.id }); renderPanel(); renderContent(); }); el.appendChild(b); });
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
        const c = h(`<button class="card" style="border-right-color:${esc(g.color)}">
          <span class="r1"><b>${esc(it.name)}</b><span style="color:#0b63c7;font-size:13px">${S.updCounts[it.id] || 0} עדכונים</span></span>
          <span style="display:flex;gap:6px;flex-wrap:wrap">${st.text ? `<span class="chip" style="background:${esc(st.color)};color:${ink(st.color)}">${esc(st.text)}</span>` : ''}${pk.text ? `<span class="chip" style="background:${esc(pk.color)};color:${ink(pk.color)}">${esc(pk.text)}</span>` : ''}</span>
          ${ph ? `<span class="ph">${esc(ph)}</span>` : ''}
        </button>`);
        c.addEventListener('click', () => openPanel(it));
        wrap.appendChild(c);
      });
    });
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
    if (r) { S.items = S.items.filter((x) => x.id !== it.id); closePanel(); renderContent(); toast('הלקוח הועבר לארכיון'); }
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
      <div style="display:flex;align-items:center;gap:8px;padding:0 6px"><button class="btn text" data-act="group" style="color:${darken(g.color)}">● ${esc(g.title || '')}</button></div>
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
        await setVal(it, c.id, nv); toast('נשמר'); renderContent();
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
    const comp = h(`<div class="composer"><label class="sr" for="newupd">עדכון חדש</label><textarea id="newupd" placeholder="כתוב עדכון על הלקוח..."></textarea><div class="acts"><button class="btn">פרסום עדכון</button></div></div>`);
    comp.querySelector('button').addEventListener('click', async () => {
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
        const f = h(`<div class="composer" style="margin:10px 0 0"><label class="sr" for="rep-${u.id}">תגובה</label><textarea id="rep-${u.id}" placeholder="כתוב תגובה..." style="min-height:60px"></textarea><div class="acts"><button class="btn">שליחה</button></div></div>`);
        f.querySelector('button').addEventListener('click', async () => { const t = f.querySelector('textarea').value.trim(); if (t) { await addUpdate(it, t, u.id); renderPanel(); } });
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
    d.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
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
  const textToHtml = (t) => '<div dir="rtl">' + t.split(/\n/).map((l) => `<p>${esc(l) || '&nbsp;'}</p>`).join('') + '</div>';
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

  const api = { ink, sb, S, C, h, esc, toast, icon, loadAll, statusOptions, fmtWhen, rerender: () => renderContent() };

  sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => start(session), 0); });
  sb.auth.getSession().then(({ data }) => start(data.session));
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((r) => r.forEach((x) => x.unregister()));
})();

/* RYS CRM: admin and settings screen. */
window.RYS_ADMIN = (function () {
  'use strict';
  const PALETTE = ['#00c875', '#037f4c', '#9cd326', '#cab641', '#ffcb00', '#fdab3d', '#ff642e', '#df2f4a', '#e2445c', '#ff158a', '#ff5ac4', '#a25ddc', '#9d50dd', '#784bd1', '#579bfc', '#0086c0', '#66ccff', '#225091', '#a1e3f6', '#797e93', '#c4c4c4', '#333333'];

  async function render(el, A) {
    const { S, h, esc } = A;
    const me = S.me;
    el.innerHTML = '';
    const wrap = h('<div class="admin" style="max-width:980px;display:flex;flex-direction:column;gap:22px;padding-top:16px"></div>');
    el.appendChild(wrap);

    // my password: everyone
    wrap.appendChild(myPassword(A));
    wrap.appendChild(exportCard(A));
    const designer = me.is_admin || me.can_design;
    if (!designer) { wrap.appendChild(h('<p style="color:#62636f">את שאר ההגדרות יכול לשנות רק מנהל המערכת.</p>')); return; }
    if (me.is_admin) wrap.appendChild(await usersCard(A));
    wrap.appendChild(groupsCard(A));
    wrap.appendChild(columnsCard(A));
    wrap.appendChild(automationsCard(A));
    wrap.appendChild(await archiveCard(A));
  }

  const card = (h, title, sub) => h(`<section style="background:#fff;border-radius:14px;padding:20px;box-shadow:0 1px 0 #e3e5ee"><h2 style="margin:0 0 4px;font-size:19px">${title}</h2>${sub ? `<p style="margin:0 0 14px;color:#62636f;font-size:14px">${sub}</p>` : ''}</section>`);
  const rowStyle = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid #eef0f5';
  const inputStyle = 'border:1px solid #c6c9d6;border-radius:8px;padding:8px 10px;min-height:42px;font-size:15px';

  function myPassword(A) {
    const { h, sb, S, toast } = A;
    const c = card(h, 'הסיסמה שלי', `מחובר כ-${A.esc(S.me.username || S.me.name)}`);
    const f = h(`<form style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end"><label class="field">סיסמה חדשה<input type="password" name="p" autocomplete="new-password" minlength="6" required dir="ltr" style="${inputStyle}"></label><button class="btn">החלפת סיסמה</button></form>`);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p = f.p.value;
      const { error } = await sb.rpc('rys_set_password', { p_user: S.user.id, p_password: p });
      if (error) return toast(error.message);
      f.reset(); toast('הסיסמה הוחלפה');
    });
    c.appendChild(f);
    return c;
  }

  async function usersCard(A) {
    const { h, esc, sb, toast, S } = A;
    const c = card(h, 'משתמשים', 'מי יכול להיכנס למערכת. "עורך מערכת" יכול לשנות קבוצות, עמודות, תוויות ואוטומציות, אבל לא לנהל משתמשים.');
    const { data } = await sb.from('rys_members').select('*').order('created_at');
    (data || []).forEach((m) => {
      const r = h(`<div style="${rowStyle}"><b style="min-width:120px">${esc(m.name)}</b><span dir="ltr" style="color:#62636f;min-width:90px">${esc(m.username || '')}</span>${m.is_admin ? '<span style="background:#e7f0fd;color:#0b63c7;border-radius:6px;padding:2px 8px;font-size:13px">מנהל</span>' : `<label style="display:flex;gap:6px;align-items:center;min-height:42px" title="יכול לשנות קבוצות, עמודות, תוויות ואוטומציות. לא יכול לנהל משתמשים."><input type="checkbox" data-a="design" style="width:20px;height:20px" ${m.can_design ? 'checked' : ''}>עורך מערכת</label>`}<span style="flex:1"></span><button class="btn ghost" data-a="pw">איפוס סיסמה</button></div>`);
      const dz = r.querySelector('[data-a=design]');
      if (dz) dz.addEventListener('change', async () => {
        const { error } = await sb.from('rys_members').update({ can_design: dz.checked }).eq('user_id', m.user_id);
        if (error) { dz.checked = !dz.checked; return toast(error.message); }
        toast(dz.checked ? `${m.name} יכול עכשיו לערוך את מבנה המערכת` : `${m.name} כבר לא עורך מערכת`);
      });
      r.querySelector('[data-a=pw]').addEventListener('click', async () => {
        const p = prompt(`סיסמה חדשה ל-${m.name} (6 תווים לפחות):`);
        if (!p) return;
        const { error } = await sb.rpc('rys_set_password', { p_user: m.user_id, p_password: p });
        toast(error ? error.message : 'הסיסמה עודכנה');
      });
      c.appendChild(r);
    });
    const f = h(`<form style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:14px">
      <label class="field">שם לתצוגה<input name="n" required style="${inputStyle}"></label>
      <label class="field">שם משתמש (באנגלית)<input name="u" required dir="ltr" pattern="[A-Za-z0-9_.-]{2,30}" style="${inputStyle}"></label>
      <label class="field">סיסמה<input name="p" type="text" required minlength="6" dir="ltr" style="${inputStyle}"></label>
      <label style="display:flex;gap:6px;align-items:center;min-height:42px"><input type="checkbox" name="a" style="width:20px;height:20px">מנהל</label>
      <button class="btn">הוספת משתמש</button></form>`);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await sb.rpc('rys_create_user', { p_username: f.u.value.trim(), p_name: f.n.value.trim(), p_password: f.p.value, p_admin: f.a.checked, p_person_id: null });
      if (error) return toast(error.message.includes('duplicate') ? 'שם המשתמש תפוס' : error.message);
      toast('המשתמש נוסף'); A.rerender();
    });
    c.appendChild(f);
    return c;
  }

  function groupsCard(A) {
    const { h, esc, sb, toast, S } = A;
    const c = card(h, 'קבוצות', 'שינוי שם, צבע וסדר של הקבוצות בלוח, והוספת קבוצה חדשה.');
    const list = S.groups.slice().sort((a, b) => a.position - b.position);
    list.forEach((g, i) => {
      const r = h(`<div style="${rowStyle}"><button class="btn ghost" data-a="color" aria-label="צבע" style="width:44px;padding:0"><span style="width:20px;height:20px;border-radius:5px;background:${esc(g.color)}"></span></button><input value="${esc(g.title)}" aria-label="שם הקבוצה" style="${inputStyle};flex:1;min-width:160px"><span style="color:#62636f;font-size:13px">${S.items.filter((x) => x.group_id === g.id).length} לקוחות</span><button class="btn ghost" data-a="up" aria-label="למעלה" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn ghost" data-a="down" aria-label="למטה" ${i === list.length - 1 ? 'disabled' : ''}>▼</button></div>`);
      r.querySelector('input').addEventListener('change', async (e) => { await upd('rys_groups', g, { title: e.target.value.trim() }); });
      r.querySelector('[data-a=color]').addEventListener('click', (e) => colorPick(A, e.currentTarget, async (col) => { await upd('rys_groups', g, { color: col }); A.rerender(); }));
      const swap = async (j) => { const o = list[j]; const a = g.position; await upd('rys_groups', g, { position: o.position }); await upd('rys_groups', o, { position: a }); S.groups.sort((x, y) => x.position - y.position); A.rerender(); };
      r.querySelector('[data-a=up]').addEventListener('click', () => swap(i - 1));
      r.querySelector('[data-a=down]').addEventListener('click', () => swap(i + 1));
      c.appendChild(r);
    });
    const add = h(`<form style="display:flex;gap:10px;margin-top:14px"><label class="sr" for="ng">שם קבוצה חדשה</label><input id="ng" required placeholder="שם קבוצה חדשה" style="${inputStyle};flex:1"><button class="btn">הוספת קבוצה</button></form>`);
    add.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pos = Math.max(0, ...S.groups.map((x) => x.position)) + 1000;
      const { data, error } = await sb.from('rys_groups').insert({ board_id: A.C.boardId, id: 'g_' + Date.now().toString(36), title: add.querySelector('input').value.trim(), color: '#579bfc', position: pos }).select().single();
      if (error) return toast(error.message);
      S.groups.push(data); A.rerender();
    });
    c.appendChild(add);
    async function upd(t, g, patch) {
      const { error } = await sb.from(t).update(patch).eq('board_id', g.board_id).eq('id', g.id);
      if (error) return toast(error.message);
      Object.assign(g, patch); toast('נשמר');
    }
    return c;
  }

  function columnsCard(A) {
    const { h, esc, sb, toast, S } = A;
    const c = card(h, 'עמודות', 'שינוי שם, הסתרה וסדר של העמודות. בעמודות סטטוס אפשר לערוך את האפשרויות והצבעים.');
    const box = h('<div></div>'); c.appendChild(box);
    let all = [];
    (async () => {
      const { data } = await sb.from('rys_columns').select('*').eq('board_id', A.C.boardId).order('position');
      all = (data || []).filter((x) => !['subtasks', 'file', 'name'].includes(x.type));
      draw();
    })();
    function draw() {
      box.innerHTML = '';
      all.forEach((col, i) => {
        const r = h(`<div style="${rowStyle}"><input value="${esc(col.title)}" aria-label="שם העמודה" style="${inputStyle};flex:1;min-width:160px"><span style="color:#62636f;font-size:13px;min-width:70px">${typeName(col.type)}</span>${col.type === 'status' ? '<button class="btn ghost" data-a="labels">אפשרויות</button>' : ''}<label style="display:flex;gap:6px;align-items:center;min-height:42px"><input type="checkbox" data-a="show" style="width:20px;height:20px" ${col.hidden ? '' : 'checked'}>מוצג</label><button class="btn ghost" data-a="up" aria-label="למעלה" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn ghost" data-a="down" aria-label="למטה" ${i === all.length - 1 ? 'disabled' : ''}>▼</button></div>`);
        r.querySelector('input').addEventListener('change', (e) => save(col, { title: e.target.value.trim() }));
        r.querySelector('[data-a=show]').addEventListener('change', (e) => save(col, { hidden: !e.target.checked }));
        const lb = r.querySelector('[data-a=labels]'); if (lb) lb.addEventListener('click', () => labelsEditor(A, col, () => save(col, { settings: col.settings })));
        const swap = async (j) => { const o = all[j]; const a = col.position; await save(o, { position: a }, true); await save(col, { position: o.position === a ? a + (j > i ? 1 : -1) : o.position }, true); all.sort((x, y) => x.position - y.position); draw(); await A.loadAll(); };
        r.querySelector('[data-a=up]').addEventListener('click', () => swap(i - 1));
        r.querySelector('[data-a=down]').addEventListener('click', () => swap(i + 1));
        box.appendChild(r);
      });
    }
    async function save(col, patch, quiet) {
      const { error } = await sb.from('rys_columns').update(patch).eq('board_id', col.board_id).eq('id', col.id);
      if (error) return toast(error.message);
      Object.assign(col, patch);
      if (!quiet) { toast('נשמר'); await A.loadAll(); }
    }
    return c;
  }
  const typeName = (t) => ({ status: 'סטטוס', text: 'טקסט', numbers: 'מספר', date: 'תאריך', people: 'אנשים', phone: 'טלפון', email: 'מייל', long_text: 'טקסט ארוך', checkbox: 'תיבת סימון' }[t] || t);

  function labelsEditor(A, col, onSave) {
    const { h, esc } = A;
    const s = col.settings = col.settings || {};
    s.labels = s.labels || {}; s.labels_colors = s.labels_colors || {};
    const dlg = h(`<div class="scrim" style="display:flex;align-items:center;justify-content:center;z-index:60"><div role="dialog" aria-modal="true" aria-label="אפשרויות ${esc(col.title)}" style="background:#fff;border-radius:16px;padding:20px;width:min(520px,94vw);max-height:86vh;overflow:auto;display:flex;flex-direction:column;gap:8px"><h2 style="margin:0 0 6px;font-size:19px">אפשרויות: ${esc(col.title)}</h2><div class="lst"></div><button class="btn ghost" data-a="add">+ אפשרות חדשה</button><div style="display:flex;gap:10px;margin-top:10px"><button class="btn" data-a="save">שמירה</button><button class="btn ghost" data-a="cancel">ביטול</button></div></div></div>`);
    const lst = dlg.querySelector('.lst');
    const orig = JSON.stringify(s);
    function draw() {
      lst.innerHTML = '';
      A.statusOptions(col).forEach((o) => {
        const r = h(`<div style="display:flex;gap:8px;align-items:center"><button class="btn ghost" aria-label="צבע" style="width:44px;padding:0"><span style="width:20px;height:20px;border-radius:5px;background:${esc(o.color)}"></span></button><input value="${esc(o.text)}" aria-label="שם האפשרות" style="${inputStyle};flex:1"></div>`);
        r.querySelector('input').addEventListener('input', (e) => { s.labels[o.idx] = e.target.value; });
        r.querySelector('button').addEventListener('click', (e) => colorPick(A, e.currentTarget, (cl) => { s.labels_colors[o.idx] = { color: cl, border: cl }; draw(); }));
        lst.appendChild(r);
      });
    }
    dlg.querySelector('[data-a=add]').addEventListener('click', () => {
      let k = 0; while (s.labels[String(k)] !== undefined && s.labels[String(k)] !== '') k++;
      if (k === 5 && s.labels['5'] === '') k = 11;
      while (s.labels[String(k)]) k++;
      s.labels[String(k)] = 'אפשרות חדשה'; s.labels_colors[String(k)] = { color: PALETTE[k % PALETTE.length] };
      if (s.labels_positions_v2) s.labels_positions_v2[String(k)] = 999;
      draw(); const ins = lst.querySelectorAll('input'); ins[ins.length - 1].select();
    });
    dlg.querySelector('[data-a=save]').addEventListener('click', async () => { dlg.remove(); await onSave(); A.rerender(); });
    dlg.querySelector('[data-a=cancel]').addEventListener('click', () => { Object.assign(s, JSON.parse(orig)); dlg.remove(); });
    document.body.appendChild(dlg); draw();
  }

  function colorPick(A, anchor, onPick) {
    const { h } = A;
    const el = h('<div class="pop" style="display:grid;grid-template-columns:repeat(6,40px);gap:6px" role="dialog" aria-label="בחירת צבע"></div>');
    PALETTE.forEach((c) => { const b = h(`<button aria-label="${c}" style="width:40px;height:40px;border-radius:8px;border:0;background:${c}"></button>`); b.addEventListener('click', () => { el.remove(); onPick(c); }); el.appendChild(b); });
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    el.style.top = Math.min(r.bottom + 4, innerHeight - el.offsetHeight - 8) + 'px';
    el.style.left = Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8)) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function f(e) { if (!el.contains(e.target)) { el.remove(); document.removeEventListener('mousedown', f, true); } }, true));
  }

  function automationsCard(A) {
    const { h, esc, sb, toast, S } = A;
    const col = S.columns.find((c) => c.id === A.C.statusColumn) || {};
    const c = card(h, 'אוטומציות', `כש"${esc(col.title || 'סטטוס')}" משתנה, הלקוח עובר אוטומטית לקבוצה שנבחרה כאן.`);
    const box = h('<div></div>'); c.appendChild(box);
    (async () => {
      const { data } = await sb.from('rys_automations').select('*').eq('column_id', A.C.statusColumn);
      const byIdx = {}; (data || []).forEach((a) => { byIdx[a.label_index] = a; });
      A.statusOptions(col).forEach((o) => {
        const a = byIdx[o.idx];
        const r = h(`<div style="${rowStyle}"><span style="background:${esc(o.color)};color:${A.ink(o.color)};border-radius:6px;padding:6px 12px;min-width:170px;text-align:center">${esc(o.text)}</span><span>←</span><select aria-label="קבוצת יעד עבור ${esc(o.text)}" style="${inputStyle};flex:1;min-width:180px"><option value="">לא להעביר</option>${S.groups.map((g) => `<option value="${esc(g.id)}" ${a && a.active && a.target_group_id === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></div>`);
        r.querySelector('select').addEventListener('change', async (e) => {
          const v = e.target.value;
          let error;
          if (a) ({ error } = v ? await sb.from('rys_automations').update({ target_group_id: v, active: true }).eq('id', a.id) : await sb.from('rys_automations').update({ active: false }).eq('id', a.id));
          else if (v) { const res = await sb.from('rys_automations').insert({ board_id: A.C.boardId, column_id: A.C.statusColumn, label_index: o.idx, target_group_id: v }).select().single(); error = res.error; if (res.data) byIdx[o.idx] = res.data; }
          toast(error ? error.message : 'נשמר');
        });
        box.appendChild(r);
      });
    })();
    return c;
  }

  function exportCard(A) {
    const { h, S, toast } = A;
    const c = card(h, 'גיבוי וייצוא', 'גיבוי אוטומטי של כל הנתונים רץ כל לילה ונשמר 7 ימים, ועותק שבועי נשמר בנפרד. אפשר גם להוריד הכל לאקסל.');
    const b = h('<button class="btn ghost">ייצוא לאקסל</button>');
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        if (!window.XLSX) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
        const gName = (list, id) => (list.find((g) => g.id === id) || {}).title || '';
        const name = (id) => (S.items.find((i) => i.id === id) || {}).name || '';
        const rows = (items, groups, cols, extra) => items.map((i) => { const r = { 'שם': i.name, 'קבוצה': gName(groups, i.group_id) }; if (extra) Object.assign(r, extra(i)); cols.forEach((col) => { const v = i.vals[col.id]; r[col.title] = col.type === 'numbers' && v !== '' && v != null && !isNaN(v) ? Number(v) : A.cellText(col, v); }); return r; });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows(S.items, S.groups, S.columns)), 'לקוחות');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows(S.subitems, S.subGroups, S.subColumns, (i) => ({ 'לקוח': name(i.parent_item_id) }))), 'תשלומים');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(S.allUpdates.map((u) => ({ 'לקוח': name(u.item_id), 'נכתב ע"י': u.creator_name || '', 'תאריך': A.fmtWhen(u.created_at), 'עדכון': A.plain(u.body) }))), 'עדכונים');
        wb.Workbook = { Views: [{ RTL: true }] };
        XLSX.writeFile(wb, `RYS-${new Date().toISOString().slice(0, 10)}.xlsx`);
      } catch (e) { toast('הייצוא נכשל'); }
      b.disabled = false;
    });
    c.appendChild(b);
    return c;
  }

  async function archiveCard(A) {
    const { h, esc, sb, toast, S } = A;
    const c = card(h, 'סל מחזור', 'לקוחות ושורות תשלום שנמחקו. אפשר להחזיר אותם בלחיצה.');
    const { data } = await sb.from('rys_items').select('id,name,board_id,updated_at').eq('archived', true).order('updated_at', { ascending: false }).limit(200);
    if (!data || !data.length) { c.appendChild(h('<p style="color:#62636f;margin:0">אין פריטים שנמחקו</p>')); return c; }
    data.forEach((it) => {
      const r = h(`<div style="${rowStyle}"><b style="flex:1">${esc(it.name)}</b><span style="color:#62636f;font-size:13px">${it.board_id === A.C.boardId ? 'לקוח' : 'שורת תשלום'} · ${esc(A.fmtWhen(it.updated_at))}</span><button class="btn ghost">שחזור</button></div>`);
      r.querySelector('button').addEventListener('click', async () => {
        const { error } = await sb.from('rys_items').update({ archived: false }).eq('id', it.id);
        if (error) return toast(error.message);
        await A.loadAll(); toast('שוחזר'); A.rerender();
      });
      c.appendChild(r);
    });
    return c;
  }

  return { render };
})();

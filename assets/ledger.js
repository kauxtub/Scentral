/* Scentral Ledger client: search that understands transliteration and Arabic script, the twin check, list filters,
   chart tooltips and the shared-title page transition. No dependencies; every page still reads fine without it. */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- text keys ---------- */
  const AR_RE = /[؀-ۿ]/;
  // Arabic: drop short vowels and tatweel, merge alef forms, taa marbuta and alef maqsura
  const arNorm = (s) => s.replace(/[ً-ٰٟـ]/g, '').replace(/[آأإٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
  // Skeleton of a transliterated word, so Khamrah meets Khamra, Ameer meets Amir and Oudh meets Oud
  const skel = (w) => {
    let s = w.replace(/kh/g, 'k').replace(/gh/g, 'g').replace(/sh/g, 's').replace(/th/g, 't').replace(/dh/g, 'd').replace(/q/g, 'k').replace(/ph/g, 'f').replace(/ee/g, 'i').replace(/oo|ou/g, 'u');
    if (!s) return s;
    s = s[0] + s.slice(1).replace(/[aeiouy]/g, '');
    s = s.replace(/(.)\1+/g, '$1');
    return s.length > 2 ? s.replace(/h$/, '') : s;
  };
  const STOP = new Set(['al', 'el', 'the', 'de', 'by']);
  const words = (s) => fold(s).split(' ').filter((w) => w && !STOP.has(w));

  /* ---------- the index (fetched once, on first use) ---------- */
  let IDX = null, idxP = null;
  const load = () => idxP || (idxP = fetch('/data/index.json').then((r) => { if (!r.ok) throw new Error('index'); return r.json(); }).then((d) => {
    const R = d.p.map(([id, name, brand, year, ins, ar, fam, house, votes]) => {
      const w = words(name), bw = words(brand);
      return { id, name, brand, year, ins, ar, fam, house, votes, w, bw, sw: w.map(skel), sbw: bw.map(skel), arN: ar ? arNorm(ar) : '' };
    });
    const H = d.h.map(([slug, name, ar, alias, listed, kind]) => { const w = words(`${name} ${alias}`); return { isHouse: true, slug, name, ar, alias, listed, kind, w, sw: w.map(skel), arN: ar ? arNorm(ar) : '' }; });
    IDX = { R, H, byId: new Map(R.map((r) => [r.id, r])) };
    return IDX;
  }).catch((e) => { idxP = null; throw e; }));

  // How well one query word fits a list of words: exact 4, start of a word 3, sounds the same 2.5, sound-alike start 2, inside a word 1.5
  function wordScore(q, qs, w, sw) {
    let best = 0;
    for (let k = 0; k < w.length; k++) {
      const a = w[k];
      if (a === q) return 4;
      if (a.startsWith(q)) best = Math.max(best, 3);
      else if (qs.length >= 2 && sw[k] === qs) best = Math.max(best, 2.5);
      else if (qs.length >= 2 && sw[k].startsWith(qs)) best = Math.max(best, 2);
      else if (q.length >= 3 && a.includes(q)) best = Math.max(best, 1.5);
    }
    return best;
  }
  function search(raw, opts = {}) {
    const out = [];
    if (AR_RE.test(raw)) {
      const n = arNorm(raw); if (!n) return [];
      if (!opts.perfumesOnly) for (const h of IDX.H) if (h.arN && h.arN.includes(n)) out.push([h, 10 + (h.arN.startsWith(n) ? 2 : 0)]);
      for (const r of IDX.R) if (r.arN && r.arN.includes(n)) out.push([r, (r.arN.startsWith(n) ? 3 : 1) + Math.log10(1 + r.votes) * 0.5]);
    } else {
      const qw = words(raw); if (!qw.length) return [];
      const qs = qw.map(skel), full = qw.join(' ');
      for (const r of IDX.R) {
        let sc = 0, nameHits = 0;
        for (let i = 0; i < qw.length; i++) {
          const a = wordScore(qw[i], qs[i], r.w, r.sw), b = wordScore(qw[i], qs[i], r.bw, r.sbw) * 0.75;
          if (!a && !b) { sc = -1; break; }
          sc += Math.max(a, b); if (a >= b) nameHits++;
        }
        if (sc < 0) continue;
        if (nameHits === qw.length && r.w.join(' ').startsWith(full)) sc += 2;
        out.push([r, sc + Math.log10(1 + r.votes) * 0.6]);
      }
      if (!opts.perfumesOnly) for (const h of IDX.H) {
        let sc = 0;
        for (let i = 0; i < qw.length; i++) { const a = wordScore(qw[i], qs[i], h.w, h.sw); if (!a) { sc = -1; break; } sc += a; }
        if (sc >= 0) out.push([h, sc + 2.5 + Math.log10(1 + h.listed) * 0.6]);
      }
    }
    return out.sort((x, y) => y[1] - x[1]).slice(0, opts.limit || 8).map((x) => x[0]);
  }
  const arSpan = (s) => (s ? ` <span class="ar" lang="ar" dir="rtl">${esc(s)}</span>` : '');
  const resultHtml = (x, i, key) => (x.isHouse
    ? `<a href="/houses/${x.slug}/" role="option" id="${key}-o${i}" aria-selected="false"><b>${esc(x.name)}${arSpan(x.ar)}</b><small>${x.kind ? 'Inspired house' : 'Original house'}, ${x.listed.toLocaleString('en')} perfumes</small><span class="tagx">House</span></a>`
    : `<a href="/p/${x.id}/" role="option" id="${key}-o${i}" aria-selected="false" data-id="${esc(x.id)}"><b data-vt>${esc(x.name)}</b><small>${esc(x.brand)}${x.year ? `, ${x.year}` : ''}${arSpan(x.ar)}</small>${x.fam ? '<span class="tagx">Twins</span>' : ''}</a>`);

  /* ---------- search fields (masthead, home, twin check) ---------- */
  function attach(input) {
    const box = document.getElementById(input.getAttribute('aria-controls'));
    if (!box) return;
    const holder = input.closest('[data-mode]'), mode = holder ? holder.dataset.mode : '', form = input.closest('form');
    const said = document.createElement('p'); // result counts for screen readers
    said.className = 'sr'; said.setAttribute('aria-live', 'polite');
    box.insertAdjacentElement('afterend', said);
    let items = [], active = -1, timer = 0;
    const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const setActive = (i) => {
      const opts = box.querySelectorAll('[role="option"]');
      opts.forEach((o, k) => { o.classList.toggle('hi', k === i); o.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      active = i;
      if (i >= 0 && opts[i]) { input.setAttribute('aria-activedescendant', opts[i].id); opts[i].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
    };
    const render = (q) => {
      box.innerHTML = items.length ? items.map((x, i) => resultHtml(x, i, input.id)).join('') : `<p class="none" role="option" aria-disabled="true" aria-selected="false">Nothing matches “${esc(q)}”. Try another spelling, or the house name.</p>`;
      box.hidden = false; input.setAttribute('aria-expanded', 'true'); setActive(items.length ? 0 : -1);
      said.textContent = items.length ? `${items.length} result${items.length === 1 ? '' : 's'}. Up and down arrows to move, Enter to open.` : 'No results.';
    };
    const run = () => {
      const q = input.value.trim();
      if (!q) { items = []; close(); return Promise.resolve(); }
      return load().then(() => { if (input.value.trim() !== q) return; items = search(q, { perfumesOnly: mode === 'twins' }); render(q); })
        .catch(() => { box.innerHTML = '<p class="none" role="option" aria-disabled="true" aria-selected="false">Search did not load. Refresh the page to try again.</p>'; box.hidden = false; said.textContent = 'Search did not load.'; });
    };
    const choose = (i) => {
      const x = items[i]; if (!x) return;
      if (mode === 'twins' && !x.isHouse) { close(); input.value = x.name; showTwins(x); return; }
      location.href = x.isHouse ? `/houses/${x.slug}/` : `/p/${x.id}/`;
    };
    input.addEventListener('focus', () => { load().catch(() => {}); if (input.value.trim() && items.length) { box.hidden = false; input.setAttribute('aria-expanded', 'true'); } });
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 70); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (box.hidden) { run(); return; }
        const n = items.length; if (n) setActive((active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      } else if (e.key === 'Enter') {
        if (!box.hidden && items.length) { e.preventDefault(); clearTimeout(timer); choose(active >= 0 ? active : 0); }
      } else if (e.key === 'Escape' && !box.hidden) { e.preventDefault(); close(); }
    });
    box.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the field while picking a result
    box.addEventListener('click', (e) => {
      const a = e.target.closest('a[role="option"]');
      if (!a || mode !== 'twins' || !a.dataset.id || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); choose([...box.querySelectorAll('a[role="option"]')].indexOf(a));
    });
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); run().then(() => { if (items.length) choose(0); }); });
    document.addEventListener('click', (e) => { if (!box.hidden && !box.contains(e.target) && e.target !== input) close(); });
  }
  document.querySelectorAll('input[role="combobox"]').forEach(attach);
  const params = new URLSearchParams(location.search);
  // keep a page's state in its address so it can be shared or reloaded (?p= twin check, ?f= list filter)
  const setParam = (k, v) => { const u = new URL(location.href); if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash); };

  /* ---------- twin check ---------- */
  let twP = null;
  const loadTwins = () => twP || (twP = fetch('/data/twins.json').then((r) => { if (!r.ok) throw new Error('twins'); return r.json(); }).catch((e) => { twP = null; throw e; }));
  function showTwins(x, focus = true) {
    const out = document.getElementById('twin-out');
    if (!out) { location.href = `/p/${x.id}/`; return; }
    setParam('p', x.id);
    out.innerHTML = '<div class="twin-card"><div class="skel" aria-hidden="true"><i></i><i></i><i></i></div></div>';
    Promise.all([load(), loadTwins()]).then(([I, T]) => {
      const fam = x.fam && T[x.fam];
      let html;
      if (!x.ins) html = `<p class="empty">Twin families group perfumes from inspired houses, and <b>${esc(x.name)}</b> comes from an original house, ${esc(x.brand)}. Its file lists the inspired versions instead.</p><p class="more"><a class="textlink" href="/p/${x.id}/">Open its file</a></p>`;
      else if (!fam) html = `<p class="empty"><b>${esc(x.name)}</b> (${esc(x.brand)}) has no twins on file yet. It may be its own thing, or too new to have enough ratings.</p><p class="more"><a class="textlink" href="/p/${x.id}/">Open its file</a></p>`;
      else {
        const others = fam.filter((id) => id !== x.id).map((id) => I.byId.get(id)).filter(Boolean);
        html = `<span class="tag">Twin check</span><h2 class="h-m" tabindex="-1">${esc(x.name)} has ${others.length} twin${others.length === 1 ? '' : 's'}</h2><ul class="rows r-list">${others.map((r) => `<li><span class="n"><a href="/p/${r.id}/">${esc(r.name)}</a>${arSpan(r.ar)}</span><span class="y">${r.year || ''}</span><span class="sub">${r.house ? `<a href="/houses/${r.house}/">${esc(r.brand)}</a>` : esc(r.brand)}</span></li>`).join('')}</ul><p class="more"><a class="textlink" href="/twins/${x.fam}/">The whole family, with how alike each pair is</a></p>`;
      }
      out.innerHTML = `<div class="twin-card">${html}</div>`;
      const h = out.querySelector('h2'); if (h && focus) h.focus();
    }).catch(() => { out.innerHTML = '<div class="twin-card"><p class="empty">The twin data did not load. Refresh the page to try again.</p></div>'; });
  }
  // a shared twin-check link (?p=perfume-id) opens with its result showing
  const tq = document.getElementById('tq');
  if (tq && params.get('p')) load().then((I) => { const x = I.byId.get(params.get('p')); if (x) { tq.value = x.name; showTwins(x, false); } }).catch(() => {});

  /* ---------- list filters (houses, names, new drops) ---------- */
  document.querySelectorAll('input[data-filter]').forEach((inp) => {
    const root = document.querySelector(inp.dataset.filter);
    if (!root) return;
    const status = document.createElement('p');
    status.className = 'small filter-n'; status.setAttribute('aria-live', 'polite');
    inp.insertAdjacentElement('afterend', status);
    let rows = null, timer = 0;
    const run = () => {
      if (!rows) rows = [...root.querySelectorAll('[data-k]')].map((el) => ({ el, k: el.dataset.k, sk: el.dataset.k.split(' ').map(skel).join(' ') }));
      const qw = words(inp.value), qs = qw.map(skel);
      let shown = 0;
      for (const r of rows) {
        const hit = qw.every((q, i) => r.k.includes(q) || (qs[i].length >= 2 && r.sk.includes(qs[i])));
        r.el.hidden = !hit; if (hit) shown++;
      }
      status.textContent = qw.length ? (shown ? `${shown} of ${rows.length} shown` : 'Nothing matches. Try another spelling.') : '';
    };
    inp.addEventListener('input', () => { run(); clearTimeout(timer); timer = setTimeout(() => setParam('f', inp.value.trim()), 300); });
    if (params.get('f')) { inp.value = params.get('f'); run(); }
  });

  /* ---------- chart tooltips: hover, tap or keyboard focus ---------- */
  const tip = document.getElementById('tip');
  if (tip) {
    let cur = null;
    const place = (x, y) => {
      const r = tip.getBoundingClientRect();
      let L = x + 14, T = y - r.height - 12;
      if (L + r.width > innerWidth - 8) L = x - r.width - 14;
      if (T < 8) T = y + 18;
      tip.style.left = `${Math.max(8, L)}px`; tip.style.top = `${T}px`;
    };
    const show = (el, x, y) => { cur = el; tip.textContent = el.dataset.tip; tip.hidden = false; place(x, y); };
    const hide = () => { cur = null; tip.hidden = true; };
    const at = (e) => e.target.closest && e.target.closest('[data-tip]');
    document.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const el = at(e); if (el) { if (el !== cur) show(el, e.clientX, e.clientY); else place(e.clientX, e.clientY); } else if (cur) hide(); });
    document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; const el = at(e); if (el) show(el, e.clientX, e.clientY); else if (cur) hide(); });
    document.addEventListener('focusin', (e) => { const el = at(e); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } });
    document.addEventListener('focusout', (e) => { if (cur && e.target === cur) hide(); });
    addEventListener('scroll', () => { if (cur && cur !== document.activeElement) hide(); }, { passive: true });
  }

  /* ---------- pair of the day: the home page carries a few pairs and shows one per day ---------- */
  const pods = document.querySelectorAll('[data-pod]');
  if (pods.length > 1) {
    const day = Math.floor(Date.now() / 864e5) % pods.length;
    pods.forEach((el, i) => { el.hidden = i !== day; });
  }

  /* ---------- shared title: the perfume name you click becomes the next page's headline ---------- */
  // Uses native cross-document view transitions (ledger.css opts in); browsers without them just navigate.
  if ('startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let named = null;
    const reset = () => { if (named) named.style.viewTransitionName = ''; named = null; const h = document.querySelector('.p-name.vt'); if (h) h.style.viewTransitionName = ''; };
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href^="/p/"]');
      if (!a || a.target) return;
      const el = a.querySelector('[data-vt]') || a;
      if (el.getBoundingClientRect().height > 90) return; // only name-sized links morph into a headline
      reset();
      const h = document.querySelector('.p-name.vt'); if (h) h.style.viewTransitionName = 'none';
      el.style.viewTransitionName = 'perfume-title'; named = el;
    });
    addEventListener('pageshow', reset);
  }
})();

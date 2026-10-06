/* The quiz: 6 questions with 4 choices each, about everyday smells, fabrics, reach, flowers and desserts. Each choice
   moves a profile (fresh to warm, dry to sweet, soft to loud) and leans on a few scent families; the perfumes closest
   to that profile are the matches, each shown with its inspired version or the original it is inspired by.
   Answers live in ?a=1423xx (one digit per question) and &l=M|W, so a result can be shared. */
(function () {
  'use strict';
  const root = document.getElementById('quiz');
  if (!root) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // w: fresh (-1) to warm (+1); s: dry (-1) to sweet (+1); r: how far it should reach (0 skin to 1 trail); f: scent families
  const QS = [
    { q: 'Where would you rather be?', o: [
      { t: 'By the sea', d: 'Salt, wind and cold water at sunrise', w: -0.8, s: -0.3, f: { aquatic: 2, citrus: 0.5 } },
      { t: 'In a pine forest', d: 'Resin, needles and damp moss', w: -0.2, s: -0.6, f: { green: 1, woody: 1, aromatic: 1 } },
      { t: 'In a spice market', d: 'Cardamom, saffron and a little smoke', w: 0.8, s: 0.1, f: { spicy: 2, amber: 1 } },
      { t: 'In a bakery at dawn', d: 'Butter, sugar and warm bread', w: 0.4, s: 0.9, f: { gourmand: 2, amber: 0.5 } } ] },
    { q: 'Pick a fabric.', o: [
      { t: 'Crisp cotton', d: 'Fresh from the line, still cool', w: -0.5, s: -0.4, f: { powdery: 1, aromatic: 0.5 } },
      { t: 'Cashmere', d: 'Soft, warm and a little powdery', w: 0.2, s: 0.4, f: { powdery: 1, amber: 0.5 } },
      { t: 'Worn leather', d: 'A jacket with years in it', w: 0.7, s: -0.5, f: { leather_smoke: 2, woody: 0.5 } },
      { t: 'Silk', d: 'Smooth and cool, catching the light', w: 0, s: 0.3, f: { floral: 1, white_floral: 1 } } ] },
    { q: 'How far should your scent reach?', o: [
      { t: 'Only me', d: 'A secret close to the skin', r: 0.15 },
      { t: 'Arm’s length', d: 'Noticed when someone leans in', r: 0.4 },
      { t: 'The whole room', d: 'People know you’ve arrived', r: 0.7 },
      { t: 'A trail behind me', d: 'Still there after you’ve left', r: 0.92 } ] },
    { q: 'Pick a flower, or none.', o: [
      { t: 'Rose', d: 'Petals warming in the sun', s: 0.1, f: { floral: 2 } },
      { t: 'Jasmine', d: 'Heady and creamy after dark', s: 0.2, f: { white_floral: 2 } },
      { t: 'Iris and violet', d: 'Cool, powdery, a little lipstick', s: 0.1, f: { powdery: 2 } },
      { t: 'No flowers, thanks', d: 'Woods and earth instead', s: -0.3, f: { woody: 1, earthy: 1 } } ] },
    { q: 'Pick a dessert.', o: [
      { t: 'Lemon sorbet', d: 'Sharp, cold and bright', w: -0.5, s: 0.2, f: { citrus: 2 } },
      { t: 'Vanilla ice cream', d: 'Soft, creamy and very sweet', w: 0.3, s: 0.9, f: { gourmand: 2 } },
      { t: 'Dark chocolate', d: 'Bitter, rich and slow', w: 0.5, s: 0.1, f: { gourmand: 1, amber: 0.5 } },
      { t: 'A bowl of berries', d: 'Juicy, tart and sunny', w: -0.2, s: 0.6, f: { fruity: 2 } } ] },
    { q: 'Originals or inspired versions?', mode: true, o: [
      { t: 'Originals first', d: 'The perfumes that started it, with their inspired versions', m: 'o' },
      { t: 'Inspired versions first', d: 'Perfumes from inspired houses, with the original behind each', m: 'i' },
      { t: 'Both, side by side', d: 'Pairs of an original and an inspired version', m: 'b' },
      { t: 'Surprise me', d: 'Whatever sits closest, original or inspired', m: 'x' } ] },
  ];
  const params = new URLSearchParams(location.search);
  let ans = (params.get('a') || '').split('').map(Number).filter((n) => n >= 1 && n <= 4).slice(0, QS.length).map((n) => n - 1);
  let step = ans.length === QS.length ? QS.length : 0;
  if (step === 0) ans = [];
  let lean = ['M', 'W'].includes(params.get('l')) ? params.get('l') : '', locked = false, D = null, FAM = [], FIDX = {};
  const dataP = fetch('/data/quiz.json').then((r) => { if (!r.ok) throw new Error('data'); return r.json(); }).then((d) => { D = d; FAM = d.fam; FIDX = Object.fromEntries(FAM.map(([id], i) => [id, i])); return d; });

  /* ---------- the profile the answers add up to ---------- */
  function profile() {
    let w = 0, s = 0, nw = 0, ns = 0, r = 0.45, mode = 'x';
    const fam = FAM.map(() => 0);
    ans.forEach((k, i) => {
      const o = QS[i].o[k]; if (!o) return;
      if (o.w != null) { w += o.w; nw++; } if (o.s != null) { s += o.s; ns++; }
      if (o.r != null) r = o.r; if (o.m) mode = o.m;
      if (o.f) for (const [f, x] of Object.entries(o.f)) if (f in FIDX) fam[FIDX[f]] += x;
    });
    const c = (v) => Math.max(-0.95, Math.min(0.95, v));
    return { w: nw ? c((w / nw) * 1.4) : 0, s: ns ? c((s / ns) * 1.4) : 0, r, mode, fam };
  }

  /* ---------- questions ---------- */
  function shell() {
    root.innerHTML = `<div class="pq-top"><button class="qz-back" id="back" type="button" aria-label="Previous question">Previous</button>
      <ol class="pq-steps" aria-hidden="true">${QS.map((_, i) => `<li data-i="${i}"></li>`).join('')}</ol>
      <span class="qz-count" id="count"></span></div><div id="stage"></div>`;
    root.querySelector('#back').addEventListener('click', () => { if (step > 0 && !locked) { step--; ans.length = step; ask(); } });
  }
  function ask() {
    if (!root.querySelector('#stage')) shell();
    const it = QS[step], stage = root.querySelector('#stage');
    root.querySelector('#count').textContent = `QUESTION ${step + 1} OF ${QS.length}`;
    root.querySelector('#back').disabled = step === 0;
    root.querySelectorAll('.pq-steps li').forEach((li, i) => { li.className = i < step ? 'done' : i === step ? 'now' : ''; });
    stage.innerHTML = `<h1 class="h-l" id="qt" tabindex="-1">${esc(it.q)}</h1>
      <p class="lede">${step === 0 ? '6 questions about what you like to smell. Go with your gut.' : it.mode ? 'Last one: how should your matches be shown?' : 'Go with your gut.'}</p>
      <div class="pq-grid" role="group" aria-labelledby="qt">${it.o.map((o, k) => `<button type="button" class="pq-opt" data-k="${k}" aria-pressed="false"><kbd aria-hidden="true">${k + 1}</kbd><b>${esc(o.t)}</b><span>${esc(o.d)}</span></button>`).join('')}</div>`;
    stage.querySelectorAll('.pq-opt').forEach((b) => b.addEventListener('click', () => choose(+b.dataset.k, b)));
    stage.querySelector('#qt').focus({ preventScroll: true });
  }
  function choose(k, btn) {
    if (locked) return;
    locked = true;
    ans[step] = k;
    if (btn) btn.setAttribute('aria-pressed', 'true');
    setTimeout(() => { locked = false; step++; if (step < QS.length) ask(); else result(); }, 320);
  }
  document.addEventListener('keydown', (e) => {
    if (step >= QS.length || e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const k = ['1', '2', '3', '4'].indexOf(e.key);
    const btn = k >= 0 && root.querySelector(`.pq-opt[data-k="${k}"]`);
    if (btn) { e.preventDefault(); btn.click(); }
  });

  /* ---------- result ---------- */
  const NAMES = {
    crisp: ['Crisp air', 'Fresh and dry'], sunlit: ['Sunlit', 'Fresh and a little sweet'], fresh: ['Open window', 'Fresh, neither sweet nor dry'],
    smoky: ['Woodsmoke', 'Warm and dry'], golden: ['Golden hour', 'Warm and sweet'], warm: ['Ember', 'Warm, neither sweet nor dry'],
    dry: ['Clean lines', 'Dry, between fresh and warm'], sweet: ['Sugar and air', 'Sweet, between fresh and warm'], middle: ['Right in the middle', 'A little of everything'],
  };
  function persona(pr) {
    const T = 0.15, { w, s } = pr;
    const key = w < -T ? (s < -T ? 'crisp' : s > T ? 'sunlit' : 'fresh') : w > T ? (s < -T ? 'smoky' : s > T ? 'golden' : 'warm') : (s < -T ? 'dry' : s > T ? 'sweet' : 'middle');
    const order = pr.fam.map((v, i) => [v, i]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, i]) => FAM[i][1].toLowerCase());
    return { name: NAMES[key][0], line: `${NAMES[key][1]}${order.length ? `, leaning ${order.join(' and ')}` : ''}.`, fams: order };
  }
  const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
  const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  // A ruled scale with the profile's position as a saffron square
  const meter = (lab, lo, hi, v) => `<div class="pq-meter"><span class="pq-m-lab">${esc(lab)}</span><span class="pq-m-ends"><i>${esc(lo)}</i><i>${esc(hi)}</i></span><span class="pq-m-bar" role="img" aria-label="${esc(`${lab}: ${Math.round(((v + 1) / 2) * 100)}% of the way from ${lo} to ${hi}`)}"><b style="left:calc(${(((v + 1) / 2) * 100).toFixed(1)}% - 7px)"></b></span></div>`;
  const pLink = (id, name, cls = '') => `<a href="/p/${encodeURIComponent(id)}/"${cls ? ` class="${cls}"` : ''}><b data-vt>${esc(name)}</b></a>`;

  function result() {
    history.replaceState(null, '', `?a=${ans.map((k) => k + 1).join('')}${lean ? `&l=${lean}` : ''}`);
    root.innerHTML = '<div class="skel" aria-hidden="true"><i></i><i></i><i></i></div>';
    dataP.then(() => {
      const pr = profile(), fn = norm(pr.fam), hasFam = pr.fam.some((x) => x);
      const rows = D.rows.map((r) => ({ id: r[0], name: r[1], brand: r[2], votes: r[3], w: r[4], s: r[5], fam: norm(r[6]), proj: r[7], ins: r[8] === 1, pair: r[9], g: r[10], notes: r[11], ar: r[12] }));
      const score = (r) => {
        let sc = -Math.hypot(r.w - pr.w, r.s - pr.s) + (hasFam ? 0.35 * cos(fn, r.fam) : 0) + 0.03 * Math.log10(1 + r.votes);
        sc -= r.proj >= 0 ? 0.6 * Math.abs(r.proj / 100 - pr.r) : 0.15;
        if (lean && r.g !== 'U' && r.g !== lean) sc -= 0.4;
        return sc;
      };
      const ranked = rows.map((r) => ({ r, sc: score(r) })).sort((a, b) => b.sc - a.sc).map((x) => x.r);
      const pick = (pred, n, used) => { const out = []; for (const r of ranked) { if (out.length >= n) break; if (used.has(r.id) || !pred(r)) continue; out.push(r); used.add(r.id); if (r.pair) used.add(r.pair[0]); } return out; };
      const used = new Set();
      let picks;
      if (pr.mode === 'o') picks = pick((r) => !r.ins, 3, used);
      else if (pr.mode === 'i') picks = pick((r) => r.ins, 3, used);
      else if (pr.mode === 'b') { picks = pick((r) => !r.ins && r.pair, 3, used); if (picks.length < 3) picks.push(...pick((r) => !r.ins, 3 - picks.length, used)); }
      else picks = pick(() => true, 3, used);
      const near = pick(() => true, 6, used);
      const who = persona(pr);
      const card = (r, i) => {
        const tag = r.ins ? 'From an inspired house' : 'Original';
        let link = '';
        if (r.ins && r.pair) link = `<p class="pq-pair"><span>Inspired by</span>${pLink(r.pair[0], r.pair[1])} <small>${esc(r.pair[2])}</small></p>`;
        else if (!r.ins && r.pair) link = `<p class="pq-pair"><span>Inspired version${r.pair[3] > 1 ? ` (1 of ${r.pair[3]})` : ''}</span>${pLink(r.pair[0], r.pair[1])} <small>${esc(r.pair[2])}</small></p>`;
        else if (!r.ins) link = '<p class="pq-pair"><span>No inspired version linked yet</span></p>';
        return `<article class="pq-card"><span class="k">${i + 1}. ${tag}</span>${pLink(r.id, r.name, 'pq-name')}${r.ar ? `<span class="ar" lang="ar" dir="rtl">${esc(r.ar)}</span>` : ''}<small>${esc(r.brand)}${r.notes?.length ? `. ${esc(r.notes.join(', ').toLowerCase())}` : ''}</small>${link}</article>`;
      };
      root.innerHTML = `<div class="pq-res">
        <section class="pq-profile">
          <span class="tag">Your profile</span>
          <h1 class="h-l" id="qt" tabindex="-1">${esc(who.name)}</h1>
          <p class="lede">${esc(who.line)}</p>
          ${meter('Temperature', 'Fresh', 'Warm', pr.w)}${meter('Sweetness', 'Dry', 'Sweet', pr.s)}${meter('Reach', 'Skin', 'Trail', pr.r * 2 - 1)}
          <div class="qz-lean" role="group" aria-label="Lean"><span class="small">Show</span>${[['', 'Everything'], ['M', 'More masculine'], ['W', 'More feminine']].map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${lean === v}">${t}</button>`).join('')}</div>
          <div class="qz-actions"><button class="btn" id="copy" type="button">Copy result link</button><button class="qz-again textlink" id="again" type="button">Start again</button></div>
          <p class="small" id="copied" aria-live="polite"></p>
        </section>
        <section>
          <h2 class="h-m">${pr.mode === 'i' ? 'Inspired perfumes for you' : pr.mode === 'b' ? 'Originals and their versions' : pr.mode === 'o' ? 'Originals for you' : 'Your closest matches'}</h2>
          <div class="pq-cards">${picks.map(card).join('')}</div>
          ${near.length ? `<p class="small gap">Also near your profile: ${near.map((r) => `<a href="/p/${encodeURIComponent(r.id)}/">${esc(r.name)}</a>`).join(', ')}.</p>` : ''}
        </section></div>`;
      root.querySelectorAll('.qz-lean button').forEach((b) => b.addEventListener('click', () => { lean = b.dataset.v; result(); }));
      root.querySelector('#again').addEventListener('click', () => { ans = []; step = 0; lean = ''; history.replaceState(null, '', location.pathname); root.innerHTML = ''; ask(); });
      root.querySelector('#copy').addEventListener('click', async () => {
        const m = root.querySelector('#copied');
        try { await navigator.clipboard.writeText(location.href); m.textContent = 'Link copied. Anyone who opens it sees this result.'; } catch (e) { m.textContent = location.href; }
      });
      window.scrollTo({ top: 0 });
      root.querySelector('#qt').focus({ preventScroll: true });
    }).catch(() => { root.innerHTML = '<p class="empty">The perfume data did not load. Refresh the page to try again.</p>'; });
  }

  if (step === QS.length) result(); else ask();
})();

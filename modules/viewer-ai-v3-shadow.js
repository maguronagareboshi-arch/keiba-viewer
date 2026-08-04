/* 高知ビューア予想AI v3（forward shadow）：現行の印は変更しない。
 * 現行 totalScore を1特徴として飲み込み、レース内相対・相手関係の文脈で読み直す。
 * ⛔特徴の定義は research/viewer-ai-v2/phase3_rebuild.py と1:1。片方だけ直すと本番と学習がズレる。
 *   突き合わせは parity_test.js（不一致0でなければ本番へ出さない）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KvViewerAiV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTRACT = Object.freeze({
    id: 'kochi-viewer-ai-v3', version: '3.0.0', status: 'forward_shadow_only',
    productionMarksAllowed: false, marketInputs: ['past_race_ninki_only'],
    featurePipelineVersion: 'phase3_rebuild',
  });
  const W5 = [1, 0.75, 0.5625, 0.421875, 0.31640625];
  const HIST_CAP = 120;                  // Python側の履歴保持上限と揃える
  const NA = NaN;
  const ok = v => v === v && v !== null && v !== undefined;
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : NA; };

  function evalTrees(trees, x) {
    let s = 0;
    for (let t = 0; t < trees.length; t++) {
      const tree = trees[t];
      let i = 0;
      while (tree[i][0] >= 0) {
        const nd = tree[i], v = x[nd[0]];
        const miss = !(v === v) || (nd[5] && Math.abs(v) <= 1e-35);
        i = miss ? (nd[4] ? nd[2] : nd[3]) : (v <= nd[1] ? nd[2] : nd[3]);
      }
      s += tree[i][1];
    }
    return 1 / (1 + Math.exp(-s));
  }
  function wavg(v) {                     // 直近5「件」の 0.75^i 加重平均
    let s = 0, w = 0;
    for (let i = 0; i < v.length && i < 5; i++) { s += v[i] * W5[i]; w += W5[i]; }
    return w > 0 ? s / w : NA;
  }
  function rankPct(arr) {                // pandas rank(pct=True) 相当（同順位は平均順位）
    const idx = [];
    for (let i = 0; i < arr.length; i++) if (ok(arr[i])) idx.push(i);
    const n = idx.length, out = arr.map(() => NA);
    if (!n) return out;
    idx.sort((a, b) => arr[a] - arr[b]);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && arr[idx[j + 1]] === arr[idx[i]]) j++;
      const r = (i + j + 2) / 2;
      for (let k = i; k <= j; k++) out[idx[k]] = r / n;
      i = j + 1;
    }
    return out;
  }
  const CLSR = { A: 5, B: 4, C1: 3, C2: 2, C3: 1 };
  function effClass(s) {
    s = String(s || '');
    if (s.indexOf('C1') >= 0) return 'C1'; if (s.indexOf('C2') >= 0) return 'C2';
    if (s.indexOf('C3') >= 0) return 'C3'; if (s.indexOf('B') >= 0) return 'B';
    if (s.indexOf('C') >= 0) return 'C1'; if (s.indexOf('A') >= 0) return 'A'; return '';
  }
  const distNum = v => { const m = String(v || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : NA; };
  function stdTime(C, dist, cls, cond) {
    let v = C.std_time[dist + '|' + cls + '|' + cond];
    if (v === undefined) v = C.std_time_k2[dist + '|' + cond];
    if (v === undefined) v = C.std_time_k1[String(dist)];
    return v === undefined ? NA : v;
  }

  /** 過去走1本の派生量。⛔fuku/win は着順が無くても 0（Python の (chaku<=3).astype(float) と同じ）。*/
  function runMetrics(run, ctx) {
    const st = ctx.raceStatOf(run.babaCode, run.raceDate, run.raceNo) || {};
    const sec = num(run.sec), ag = num(run.agari), ch = num(run.chaku), fn = num(st.fieldN), c1 = num(run.c1);
    const o = {};
    o.time_z = (ok(sec) && ok(st.secMean) && st.secSd > 0) ? -(sec - st.secMean) / st.secSd : NA;
    o.agari_z = (ok(ag) && ok(st.agariMean) && st.agariSd > 0) ? -(ag - st.agariMean) / st.agariSd : NA;
    o.chaku_rel = (ok(ch) && fn > 1) ? 1 - (ch - 1) / (fn - 1) : NA;
    o.pos1 = (ok(c1) && fn > 1) ? (c1 - 1) / (fn - 1) : NA;
    o.fuku = (ok(ch) && ch <= 3) ? 1 : 0;
    o.win = (ok(ch) && ch === 1) ? 1 : 0;
    o.ten = (ok(run.f3) && ok(st.f3Mean)) ? -(run.f3 - st.f3Mean) : NA;
    o.ninki = num(run.ninki);
    // ⛔基準タイムは「そのレース時点までの平均」(as-of)。同梱の全期間表を使うとPythonとズレる
    const sd = ctx.stdTimeOf(run.babaCode, run.raceDate, run.raceNo);
    const db = ctx.dayBiasOf(run.raceDate);
    let ta = (ok(sec) && ok(sd) && ok(db)) ? -((sec - sd) - db) : NA;
    if (ok(ta) && Math.abs(ta) > 8) ta = NA;
    o.time_abs = ta;
    return o;
  }

  const COLS = ['time_z', 'agari_z', 'chaku_rel', 'pos1', 'fuku', 'win', 'ten', 'time_abs', 'ninki'];

  function horseCore(hist, ent, info, ctx) {
    const C = ctx.constants;
    const m = hist.map(r => runMetrics(r, ctx));
    const av = {};
    COLS.forEach(c => { av[c] = []; });
    for (let i = 0; i < m.length; i++) {
      COLS.forEach(c => { if (ok(m[i][c]) && av[c].length < HIST_CAP) av[c].push(m[i][c]); });
    }
    const o = {};
    COLS.forEach(c => { o['w_' + c] = wavg(av[c]); });
    o.best_time_z = av.time_z.length ? Math.max.apply(null, av.time_z.slice(0, 5)) : NA;
    o.best_time_abs = av.time_abs.length ? Math.max.apply(null, av.time_abs.slice(0, 5)) : NA;
    o.n_time_z = av.time_z.length;
    o.std_time_z = NA;
    if (av.time_z.length >= 2) {
      const a = av.time_z.slice(0, 5), mu = a.reduce((x, y) => x + y, 0) / a.length;
      o.std_time_z = Math.sqrt(a.reduce((x, y) => x + (y - mu) * (y - mu), 0) / (a.length - 1));
    }
    const at = (c, i) => (av[c].length >= i ? av[c][i - 1] : NA);
    o.p1_time_z = at('time_z', 1); o.p2_time_z = at('time_z', 2); o.p3_time_z = at('time_z', 3);
    o.p1_chaku_rel = at('chaku_rel', 1); o.p2_chaku_rel = at('chaku_rel', 2); o.p3_chaku_rel = at('chaku_rel', 3);
    o.p1_agari_z = at('agari_z', 1);
    o.p1_pos1 = at('pos1', 1); o.p2_pos1 = at('pos1', 2);
    o.p1_ninki = at('ninki', 1); o.p2_ninki = at('ninki', 2); o.p3_ninki = at('ninki', 3);
    o.p1_time_abs = at('time_abs', 1);

    const prev = hist[0] || null;
    o.rest = prev ? ctx.dayDiff(info.raceDate, prev.raceDate) : NA;
    o.starts = hist.length;
    const y = String(info.raceDate).slice(0, 4);
    o.runs_year = hist.filter(r => String(r.raceDate).slice(0, 4) === y).length;
    o.age = num((String(ent.sexAge || '').match(/(\d+)/) || [])[1]);
    const sx = String(ent.sexAge || '').slice(0, 1);
    o.sex_c = C.cat.sex[sx] !== undefined ? C.cat.sex[sx] : -1;
    o.kinryo = num(ent.kinryo);
    o.kinryo_diff = prev ? o.kinryo - num(prev.kinryo) : NA;
    o.bataiju = num(String(ent.weight || '').split('(')[0]);
    o.bw_diff = prev ? o.bataiju - num(String(prev.weight || '').split('(')[0]) : NA;
    const dist = distNum(info.distance), cls = effClass(info.raceClass);
    o.dist = dist;
    o.dist_change = prev ? dist - distNum(prev.distance) : NA;
    o.cls_c = C.cat.cls[cls] !== undefined ? C.cat.cls[cls] : -1;
    o.class_diff = (prev && CLSR[cls] && CLSR[effClass(prev.raceClass)])
      ? CLSR[cls] - CLSR[effClass(prev.raceClass)] : NA;
    o.cond_c = C.cat.cond[info.trackCond] !== undefined ? C.cat.cond[info.trackCond] : -1;
    // ⛔fuku は着順が無くても0なので、距離別・馬場別は「過去走を全部」数える
    const dh = hist.filter(r => distNum(r.distance) === dist);
    o.dist_n = dh.length;
    o.dist_fuku = dh.length ? dh.filter(r => num(r.chaku) <= 3).length / dh.length : NA;
    const ch2 = hist.filter(r => (r.trackCond || '') === (info.trackCond || ''));
    o.cond_n = ch2.length;
    o.cond_fuku = ch2.length ? ch2.filter(r => num(r.chaku) <= 3).length / ch2.length : NA;
    const kj = ctx.kishuOf(String(ent.jockey || ''), info.raceDate, info.raceNo);
    o.kishu_fuku = kj[0]; o.kishu_n = kj[1];
    o.pair_fuku = ctx.pairOf(String(ent.jockey || '') + '|' + String(ent.trainer || ''),
                             info.raceDate, info.raceNo)[0];
    o.norikae = prev ? ((String(ent.jockey || '') !== String(prev.jockey || '')) ? 1 : 0) : NA;
    o.waku = num(ent.wakuBan); o.uma_ban = num(ent.umaBan);
    return o;
  }

  function scoreRace(ctx) {
    const info = ctx.raceInfo, F = ctx.model.features;
    const rows = ctx.entrants.map(ent => {
      const core = horseCore(ctx.historyOf(ent.horseName, info.raceDate, info.raceNo) || [], ent, info, ctx);
      core._ent = ent;
      core._prev = (ctx.historyOf(ent.horseName, info.raceDate, info.raceNo) || [])[0] || null;
      return core;
    });
    const n = rows.length;
    rows.forEach(r => { r.field_n = n; r.bias30 = ctx.bias30Of(info.raceDate); });
    [['w_time_z', 'r_w_time_z'], ['best_time_z', 'r_best_time_z'], ['w_chaku_rel', 'r_w_chaku_rel'],
     ['w_fuku', 'r_w_fuku'], ['w_agari_z', 'r_w_agari_z'], ['w_pos1', 'r_w_pos1'],
     ['p1_time_z', 'r_p1_time_z'], ['kishu_fuku', 'r_kishu_fuku'], ['dist_fuku', 'r_dist_fuku'],
     ['w_time_abs', 'r_w_time_abs'], ['best_time_abs', 'r_best_time_abs']].forEach(p => {
      const v = rankPct(rows.map(r => r[p[0]]));
      rows.forEach((r, i) => { r[p[1]] = v[i]; });
    });
    const agg = (k, f) => { const v = rows.map(r => r[k]).filter(ok); return v.length ? f(v) : NA; };
    const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
    const oppStr = agg('w_time_z', mean), oppBest = agg('w_time_z', v => Math.max.apply(null, v));
    const oppAbs = agg('w_time_abs', mean), maxAbs = agg('w_time_abs', v => Math.max.apply(null, v));
    const nFront = rows.filter(r => ok(r.w_pos1) && r.w_pos1 <= 0.3).length;
    rows.forEach(r => {
      r.opp_str = oppStr; r.opp_best = oppBest; r.gap_top = oppBest - r.w_time_z;
      r.opp_abs = oppAbs; r.gap_abs = maxAbs - r.w_time_abs;
      r.ten_press = nFront / n;
      r.relief = NA;
      if (r._prev && ctx.oppStrOf) {
        const po = ctx.oppStrOf(r._prev.babaCode, r._prev.raceDate, r._prev.raceNo);
        if (ok(po)) r.relief = po - oppStr;
      }
      r.score = ctx.scoreOf(r._ent.umaBan);
    });
    const sc = rows.map(r => r.score), scv = sc.filter(ok);
    const mu = scv.length ? mean(scv) : NA;
    const sd = scv.length > 1 ? Math.sqrt(scv.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (scv.length - 1)) : NA;
    const ps = rankPct(sc);
    rows.forEach((r, i) => {
      r.score_pct = ps[i];
      r.score_z = (ok(r.score) && sd > 0) ? (r.score - mu) / sd : 0;
    });
    return rows.map(r => {
      const x = F.map(k => (ok(r[k]) ? r[k] : NaN));
      return { umaBan: r._ent.umaBan, horseName: r._ent.horseName, x: x,
               pWin: evalTrees(ctx.model.trees, x),
               pTop3: ctx.modelTop3 ? evalTrees(ctx.modelTop3.trees, x) : NA };
    }).sort((a, b) => b.pWin - a.pWin);
  }

  /** レースの相手強度（reliefで前走ぶんを引くのに使う。同じ手順を過去レースへ当てるだけ）。*/
  function oppStrOfRace(ctx, entrants, info) {
    const v = entrants.map(e => horseCore(ctx.historyOf(e.horseName, info.raceDate, info.raceNo) || [],
                                          e, info, ctx).w_time_z).filter(ok);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NA;
  }

  return { contract: CONTRACT, evalTrees, scoreRace, oppStrOfRace,
           _internals: { wavg, rankPct, horseCore, runMetrics } };
});

/* ── 本番配線（forward shadow）───────────────────────────────────────────
 * 印は一切変えない。毎レース「現行の◎○▲」と「v3の◎○▲」を並べて記録するだけ。
 * ⛔特徴の定義は research/viewer-ai-v2/phase3_rebuild.py と1:1（parity_test.js で確認済み）。
 */
(function (root) {
  'use strict';
  const V3 = root && root.KvViewerAiV3;
  if (!V3) return;
  const MARKS = ['◎', '○', '▲', '△', '×', '×'];
  const LOCAL_PREFIX = 'shadow_viewer_ai_v3';
  const okv = v => v === v && v !== null && v !== undefined;
  const numv = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };
  const ordOf = (d, n) => Number(String(d).replace(/\D/g, '')) * 100 + Number(n);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sdev = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };
  function timeSec(t) {
    t = String(t || '').trim();
    const m = t.match(/^(\d+)[:.](\d+)\.(\d+)$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseFloat('0.' + m[3]);
    const v = parseFloat(t);
    return (Number.isFinite(v) && v >= 40 && v <= 200) ? v : NaN;
  }
  const effClass = s => {
    s = String(s || '');
    if (s.indexOf('C1') >= 0) return 'C1'; if (s.indexOf('C2') >= 0) return 'C2';
    if (s.indexOf('C3') >= 0) return 'C3'; if (s.indexOf('B') >= 0) return 'B';
    if (s.indexOf('C') >= 0) return 'C1'; if (s.indexOf('A') >= 0) return 'A'; return '';
  };
  const distNum = v => { const m = String(v || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : NaN; };

  /** lsRead を1回だけ舐めて必要な索引をまとめて作る（重いので必ずキャッシュする）。 */
  function buildIndex() {
    if (typeof root.lsRead !== 'function') return null;
    const ls = root.lsRead();
    // ⛔件数が変わったら作り直す。キャッシュが空/古いまま固定される事故が過去2回ある
    const stamp = Object.keys(ls).length;
    if (root._kvAiV3Index && root._kvAiV3Index._stamp === stamp) return root._kvAiV3Index;
    const raceMeta = {}, byRace = {}, byHorse = {};
    for (const k in ls) {
      const v = ls[k];
      if (v && v.type === 'race' && (v.baba_code === '31' || v.babaCode === '31')) {
        raceMeta[(v.race_date || '') + '_' + Number(v.race_no)] = v;
      }
    }
    for (const k in ls) {
      const v = ls[k];
      if (!v || v.type !== 'horse') continue;
      const p = k.split('_');
      if (p.length < 4 || p[0] !== '31') continue;
      const date = p[1], rno = Number(p[2]), uma = Number(p[3]);
      const key = date + '_' + rno, ri = raceMeta[key] || {};
      const ch = numv(v.chakujun), f3 = numv(v.first3f), ag = numv(v.agari3f);
      const run = {
        raceDate: date, raceNo: rno, babaCode: '31', ord: ordOf(date, rno), umaBan: uma,
        sec: timeSec(v.time), agari: (ag >= 30 && ag <= 55) ? ag : NaN,
        chaku: (ch >= 1 && ch <= 18) ? ch : NaN,
        c1: numv(String(v.corner || '').split('-')[0]), ninki: numv(v.ninki),
        f3: (f3 >= 20 && f3 <= 60) ? f3 : NaN,
        kinryo: v.kinryo, weight: v.weight, jockey: v.jockey || '', trainer: v.trainer || '',
        horseName: v.horseName || '', wakuBan: v.wakuBan, sexAge: v.sexAge,
        distance: ri.distance, raceClass: ri.race_class, trackCond: ri.track_cond || '',
      };
      (byRace[key] = byRace[key] || []).push(run);
      if (run.horseName) (byHorse[run.horseName] = byHorse[run.horseName] || []).push(run);
    }
    for (const n in byHorse) byHorse[n].sort((a, b) => a.ord - b.ord || a.umaBan - b.umaBan);

    const rstat = {};
    for (const k in byRace) {
      const rows = byRace[k];
      const sec = rows.map(r => r.sec).filter(okv), ag = rows.map(r => r.agari).filter(okv);
      const f3 = rows.map(r => r.f3).filter(okv);
      rstat[k] = { fieldN: rows.length,
        secMean: sec.length >= 4 ? mean(sec) : NaN, secSd: sec.length >= 4 ? sdev(sec) : NaN,
        agariMean: ag.length >= 4 ? mean(ag) : NaN, agariSd: ag.length >= 4 ? sdev(ag) : NaN,
        f3Mean: f3.length >= 3 ? mean(f3) : NaN };
    }
    // 基準タイム(as-of)。⛔距離だけのフォールバックに件数条件は付けない（学習側と揃える）
    const stdOf = {}, keys = Object.keys(byRace).sort(
      (a, b) => ordOf(a.split('_')[0], a.split('_')[1]) - ordOf(b.split('_')[0], b.split('_')[1]));
    const acc = { k3: {}, k2: {}, k1: {} };
    const upd = (m, k, v) => { const e = m[k] || (m[k] = { s: 0, n: 0 }); e.s += v; e.n++; };
    const get = (m, k, minn) => { const e = m[k]; return (e && e.n >= minn) ? e.s / e.n : undefined; };
    keys.forEach(k => {
      const ri = raceMeta[k] || {};
      const d = distNum(ri.distance), m3 = d + '|' + effClass(ri.race_class) + '|' + (ri.track_cond || '');
      const m2 = d + '|' + (ri.track_cond || ''), m1 = String(d);
      let v = get(acc.k3, m3, 20);
      if (v === undefined) v = get(acc.k2, m2, 20);
      if (v === undefined) v = get(acc.k1, m1, 1);
      stdOf[k] = (v === undefined) ? NaN : v;
      const sec = byRace[k].map(r => r.sec).filter(okv);
      if (sec.length) { const sm = mean(sec); upd(acc.k3, m3, sm); upd(acc.k2, m2, sm); upd(acc.k1, m1, sm); }
    });
    const dayNorm = {}, dayBias = {};
    for (const k in byRace) {
      const st = stdOf[k];
      byRace[k].forEach(r => {
        if (!okv(r.sec) || !okv(st)) return;
        (dayNorm[r.raceDate] = dayNorm[r.raceDate] || []).push(r.sec - st);
      });
    }
    for (const d in dayNorm) dayBias[d] = mean(dayNorm[d]);
    const uniqDays = Array.from(new Set(Object.keys(byRace).map(k => k.split('_')[0]))).sort();
    const fr = {}; uniqDays.forEach(d => { fr[d] = { n: 0, w: 0 }; });
    for (const k in byRace) {
      const d = k.split('_')[0], fn = rstat[k].fieldN;
      byRace[k].forEach(r => {
        if (!okv(r.c1) || fn <= 1) return;
        fr[d].n++; if (r.chaku === 1 && (r.c1 - 1) / (fn - 1) <= 0.3) fr[d].w++;
      });
    }
    const bias30 = {};
    uniqDays.forEach((d, i) => {
      const prev = uniqDays.slice(Math.max(0, i - 10), i)
        .map(x => (fr[x].n ? fr[x].w / fr[x].n : NaN)).filter(okv);
      bias30[d] = prev.length >= 3 ? mean(prev) : NaN;
    });
    const mkRate = keyFn => {
      const m = {};
      for (const k in byRace) {
        byRace[k].forEach(r => {
          const kk = keyFn(r);
          (m[kk] = m[kk] || []).push({ ord: r.ord, f: (r.chaku >= 1 && r.chaku <= 3) ? 1 : 0 });
        });
      }
      for (const kk in m) {
        m[kk].sort((a, b) => a.ord - b.ord);
        let s = 0; m[kk].forEach(e => { e.cum = s; s += e.f; });
      }
      return m;
    };
    const KJ = mkRate(r => r.jockey), PR = mkRate(r => r.jockey + '|' + r.trainer);
    root._kvAiV3Index = { _stamp: stamp, raceMeta, byRace, byHorse, rstat, stdOf, dayBias, bias30, KJ, PR };
    return root._kvAiV3Index;
  }
  function rateOf(map, key, date, raceNo, minn) {
    const a = map[key];
    if (!a) return [NaN, 0];
    const t = ordOf(date, raceNo);
    let lo = 0, hi = a.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid].ord < t) lo = mid + 1; else hi = mid; }
    const n = lo, sum = n ? a[n - 1].cum + a[n - 1].f : 0;
    return [n >= minn ? sum / n : NaN, n];
  }

  function makeCtx(idx, model, modelTop3, constants) {
    const oppCache = {};
    const ctx = {
      constants: constants, model: model, modelTop3: modelTop3,
      raceStatOf: (b, d, n) => idx.rstat[d + '_' + n],
      stdTimeOf: (b, d, n) => { const v = idx.stdOf[d + '_' + n]; return v === undefined ? NaN : v; },
      dayBiasOf: d => (d in idx.dayBias ? idx.dayBias[d] : NaN),
      bias30Of: d => (d in idx.bias30 ? idx.bias30[d] : NaN),
      dayDiff: (a, b) => Math.round((Date.parse(String(a).replace(/\//g, '-'))
        - Date.parse(String(b).replace(/\//g, '-'))) / 86400000),
      historyOf: (name, date, raceNo) => {
        const a = idx.byHorse[name] || [], t = ordOf(date, raceNo), out = [];
        for (let i = a.length - 1; i >= 0; i--) if (a[i].ord < t) out.push(a[i]);
        return out;
      },
      kishuOf: (j, d, n) => rateOf(idx.KJ, j, d, n, 50),
      pairOf: (p, d, n) => rateOf(idx.PR, p, d, n, 30),
      oppStrOf: (b, d, n) => {
        const k = d + '_' + n;
        if (k in oppCache) return oppCache[k];
        const rows = idx.byRace[k];
        if (!rows) { oppCache[k] = NaN; return NaN; }
        const ri = idx.raceMeta[k] || {};
        oppCache[k] = V3.oppStrOfRace(ctx, rows, { raceDate: d, raceNo: n,
          distance: ri.distance, raceClass: ri.race_class, trackCond: ri.track_cond || '' });
        return oppCache[k];
      },
      scoreOf: () => NaN, entrants: [], raceInfo: {},
    };
    return ctx;
  }

  let _assets = null;
  function ensureAssets() {
    if (_assets) return Promise.resolve(_assets);
    const j = p => fetch(p, { cache: 'force-cache' }).then(r => r.json());
    return Promise.all([j('data/kochi-ai-v3-win.json'), j('data/kochi-ai-v3-p3.json'),
                        j('data/kochi-ai-v3-constants.json')])
      .then(a => { _assets = { win: a[0], p3: a[1], cst: a[2] }; return _assets; });
  }

  /** 現行 scored（totalScore降順）から v3 の並びを作る。⛔印は変えない。 */
  function computeLive(raceNo, scored) {
    const data = (root.allRacesData || {})[raceNo];
    if (!data || !data.raceInfo || !Array.isArray(data.horses)) return Promise.resolve(null);
    const idx = buildIndex();
    if (!idx) return Promise.resolve(null);
    return ensureAssets().then(A => {
      const ctx = makeCtx(idx, A.win, A.p3, A.cst);
      const info = data.raceInfo;
      ctx.raceInfo = { raceDate: info.raceDate, raceNo: Number(raceNo), distance: info.distance,
                       raceClass: info.raceClass, trackCond: info.trackCond || '' };
      ctx.entrants = data.horses.map(h => ({
        umaBan: Number(h.umaBan), horseName: h.horseName || '', jockey: h.jockey || '',
        trainer: h.trainer || '', kinryo: h.kinryo, weight: h.weight,
        wakuBan: h.wakuBan, sexAge: h.sexAge }));
      const sm = new Map();
      (scored || []).forEach(s => { if (s && s.horse) sm.set(Number(s.horse.umaBan), s.totalScore); });
      ctx.scoreOf = u => { const v = numv(sm.get(Number(u))); return okv(v) ? v : NaN; };
      const ranked = V3.scoreRace(ctx);
      return {
        contract: V3.contract, raceDate: info.raceDate, raceNo: Number(raceNo),
        ranked: ranked.map((r, i) => ({ u: r.umaBan, name: r.horseName, rank: i + 1,
          mark: MARKS[i] || '', pWin: +r.pWin.toFixed(6), pTop3: +(r.pTop3 || 0).toFixed(6) })),
        baseline: (scored || []).map((s, i) => ({ u: Number(s.horse.umaBan), rank: i + 1,
          mark: s.totalScore == null ? '' : (MARKS[i] || ''), score: s.totalScore })),
      };
    });
  }

  /** 発走前に1回だけ、新旧の印を並べて保存する（印そのものは変えない）。 */
  function recordLive(raceNo, scored) {
    try {
      if (typeof root.isAdminMode !== 'function' || !root.isAdminMode()) {
        return Promise.resolve({ saved: false, reason: 'NOT_ADMIN' });
      }
      if (typeof root.lsWrite !== 'function' || typeof root.lsRead !== 'function') {
        return Promise.resolve({ saved: false, reason: 'NO_STORAGE' });
      }
      const data = (root.allRacesData || {})[raceNo];
      if (!data || !data.raceInfo) return Promise.resolve({ saved: false, reason: 'NO_RACE' });
      if ((data.horses || []).some(h => /^\d+$/.test(String(h.chakujun || '')))) {
        return Promise.resolve({ saved: false, reason: 'HAS_RESULT' });
      }
      const key = LOCAL_PREFIX + '|31|' + String(data.raceInfo.raceDate).replace(/\D/g, '')
        + '|' + String(Number(raceNo)).padStart(2, '0');
      if (root.lsRead()[key]) return Promise.resolve({ saved: false, reason: 'DUPLICATE', key });
      return computeLive(raceNo, scored).then(res => {
        if (!res) return { saved: false, reason: 'MODEL_INPUT_UNAVAILABLE' };
        root.lsWrite(key, { type: 'shadow_ai_v3', model: 'kochi-viewer-ai-v3',
          trained_through: (_assets && _assets.win && _assets.win.trained_through) || '',
          payload: res, savedAt: new Date().toISOString() });
        return { saved: true, key };
      });
    } catch (e) {
      console.warn('[viewer-ai-v3 shadow]', e);
      return Promise.resolve({ saved: false, reason: 'ERROR' });
    }
  }

  /** 印の並びに使えるか（同期判定）。computeYosoScored は同期なので事前に prepare() が要る。 */
  function isReady() { return !!(_assets && root._kvAiV3Index); }

  /** モデルと索引を先に読み込む。終わったら予想のキャッシュを捨てて描き直させる。 */
  function prepare() {
    if (isReady()) return Promise.resolve(true);
    return ensureAssets().then(() => {
      buildIndex();
      if (!isReady()) return false;
      if (typeof root.kvInvalidateYosoCache === 'function') root.kvInvalidateYosoCache();
      return true;
    }).catch(e => { console.warn('[viewerAiV3 prepare]', e); return false; });
  }

  /** ⛔印の並びだけを差し替える（totalScore は変更しない）。
   *  ◎＝勝ちモデルの1位／以降＝複勝モデル順。準備前や失敗時は null を返して現行の並びを保つ。 */
  function applyMarkOrder(raceNo, scored) {
    if (root.KV_AI_V3_MARKS === false || !isReady()) return null;
    const data = (root.allRacesData || {})[raceNo];
    if (!data || !data.raceInfo || !Array.isArray(scored) || !scored.length) return null;
    const idx = root._kvAiV3Index;
    const ctx = makeCtx(idx, _assets.win, _assets.p3, _assets.cst);
    const info = data.raceInfo;
    ctx.raceInfo = { raceDate: info.raceDate, raceNo: Number(raceNo), distance: info.distance,
                     raceClass: info.raceClass, trackCond: info.trackCond || '' };
    const withScore = scored.filter(s => s && s.horse && s.totalScore != null);
    const nulls = scored.filter(s => !(s && s.horse && s.totalScore != null));
    if (withScore.length < 2) return null;
    ctx.entrants = withScore.map(s => ({
      umaBan: Number(s.horse.umaBan), horseName: s.horse.horseName || '', jockey: s.horse.jockey || '',
      trainer: s.horse.trainer || '', kinryo: s.horse.kinryo, weight: s.horse.weight,
      wakuBan: s.horse.wakuBan, sexAge: s.horse.sexAge }));
    const sm = new Map();
    withScore.forEach(s => sm.set(Number(s.horse.umaBan), numv(s.totalScore)));
    ctx.scoreOf = u => { const v = sm.get(Number(u)); return okv(v) ? v : NaN; };
    const ranked = V3.scoreRace(ctx);          // pWin降順
    if (!ranked || ranked.length !== withScore.length) return null;
    const byUma = new Map();
    withScore.forEach(s => byUma.set(Number(s.horse.umaBan), s));
    const head = ranked[0];                    // ◎＝勝ちモデルの1位
    const rest = ranked.slice(1).sort((a, b) => (b.pTop3 || 0) - (a.pTop3 || 0));
    const out = [];
    [head].concat(rest).forEach(r => {
      const s = byUma.get(Number(r.umaBan));
      if (!s) return;
      s.aiV3 = { pWin: r.pWin, pTop3: r.pTop3 };
      out.push(s);
    });
    if (out.length !== withScore.length) return null;
    return out.concat(nulls);
  }

  V3.buildIndex = buildIndex;
  V3.computeLive = computeLive;
  V3.recordLive = recordLive;
  V3.isReady = isReady;
  V3.prepare = prepare;
  V3.applyMarkOrder = applyMarkOrder;
  root.kvComputeViewerAiV3 = computeLive;
  root.kvCaptureViewerAiV3 = recordLive;
  root.kvPrepareViewerAiV3 = prepare;
})(typeof window !== 'undefined' ? window : this);

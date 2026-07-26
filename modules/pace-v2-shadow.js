/* 高知ペース適性v2: 現行印を変更しない、オッズ非依存のforward shadow。 */
(function(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KvPaceV2Shadow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  const CONTRACT = Object.freeze({
    id:'kochi-pace-match-shadow-v2', version:'2.0.0', family:'pace-pressure-match-shadow',
    status:'forward_shadow_only', productionMarksAllowed:false, valueBetAdviceAllowed:false,
    marketInputs:[], currentRaceFirst3fAllowed:false, currentRaceCornersAllowed:false,
    baseline:'rolling-540d-source-weighted-partial-pooling-v2',
    pressureDefinition:'median normalized first-corner position over last 6; front<=0.25; 3+ fronts=high',
    featurePipelineVersion:'kochi-pace-profile-asof-v2',
  });
  const MARKS = Object.freeze(['◎','○','▲','△','×','×']);

  const finite = value => {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const integer = value => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const dateKey = value => String(value || '').replace(/\D/g, '').slice(0, 8);
  const before = (date, raceNo, asOfDate, asOfRaceNo) => {
    const left = dateKey(date), right = dateKey(asOfDate);
    if (!left || !right) return false;
    if (left !== right) return left < right;
    return (integer(raceNo) || 0) < (integer(asOfRaceNo) || 0);
  };
  const median = values => {
    if (!values.length) return null;
    const ordered = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  };
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function normalizeDistance(value) {
    const match = String(value || '').match(/(1300|1400)/);
    return match ? Number(match[1]) : null;
  }
  function normalizeCondition(value) {
    const text = String(value || '');
    return ['良','稍重','重','不良'].find(condition => text.includes(condition)) || '';
  }
  function normalizeClass(value) {
    const text = String(value || '').toUpperCase().replace(/\s/g, '');
    if (text.includes('2歳')) return '2歳';
    if (text.includes('3歳')) return '3歳';
    if (/C1/.test(text)) return 'C1';
    if (/C2/.test(text)) return 'C2';
    if (/C3/.test(text)) return 'C3';
    if (/(^|[^A-Z])A([^A-Z]|$)/.test(text) || text.startsWith('A')) return 'A';
    if (/(^|[^A-Z])B([^A-Z]|$)/.test(text) || text.startsWith('B')) return 'B';
    return '';
  }
  function entryLookup(data, mode) {
    const source = mode === 'holdout_2026' ? data && data.holdout_2026 && data.holdout_2026.entries : data && data.entries;
    const map = new Map();
    (Array.isArray(source) ? source : []).forEach(entry => {
      map.set(`${entry.distance}|${entry.class}|${entry.condition}`, entry);
    });
    return map;
  }
  function baselineEntry(data, distance, raceClass, condition, mode) {
    const key = `${normalizeDistance(distance)}|${normalizeClass(raceClass)}|${normalizeCondition(condition)}`;
    return entryLookup(data, mode).get(key) || null;
  }
  function classify(first3f, entry) {
    const value = finite(first3f);
    if (value == null || !entry) return null;
    if (value <= Number(entry.high_max)) return 'high';
    if (value >= Number(entry.slow_min)) return 'slow';
    return 'middle';
  }

  function historyRaceKey(history) {
    return `${String(history.babaCode || history.baba_code || '')}|${String(history.raceDate || history.race_date || '')}|${integer(history.raceNo || history.race_no) || 0}`;
  }
  function buildFieldSizes(store) {
    const sizes = new Map();
    for (const [key, value] of Object.entries(store || {})) {
      if (!value || value.type !== 'horse') continue;
      const finish = integer(value.chakujun);
      if (finish == null || finish <= 0) continue;
      const parts = key.split('_');
      const baba = String(value.babaCode || value.baba_code || parts[0] || '');
      const date = String(value.raceDate || value.race_date || parts[1] || '');
      const raceNo = integer(value.raceNo || value.race_no || parts[2]);
      if (!baba || !date || raceNo == null) continue;
      const raceKey = `${baba}|${date}|${raceNo}`;
      sizes.set(raceKey, (sizes.get(raceKey) || 0) + 1);
    }
    return sizes;
  }
  function firstCorner(value) {
    const match = String(value || '').match(/\d+/);
    return match ? Number(match[0]) : null;
  }
  function normalizedCorner(history, fieldSizes) {
    const corner = firstCorner(history && history.corner);
    const size = fieldSizes && fieldSizes.get(historyRaceKey(history || {}));
    if (corner == null || !size || size < 2) return null;
    return Math.max(0, Math.min(1, (corner - 1) / (size - 1)));
  }
  function raceRecord(store, history) {
    const baba = String(history.babaCode || history.baba_code || '31');
    const date = String(history.raceDate || history.race_date || '');
    const raceNo = integer(history.raceNo || history.race_no);
    if (!date || raceNo == null) return null;
    return (store || {})[`race_${baba}_${date}_${raceNo}`] || null;
  }
  function profileHistory(options) {
    const history = Array.isArray(options && options.history) ? options.history : [];
    const asOfDate = options && options.asOfDate;
    const asOfRaceNo = options && options.asOfRaceNo;
    const fieldSizes = options && options.fieldSizes || buildFieldSizes(options && options.store);
    const prior = history.filter(run => {
      const baba = String(run.babaCode || run.baba_code || '');
      return baba === '31' && before(run.raceDate || run.race_date, run.raceNo || run.race_no, asOfDate, asOfRaceNo);
    }).sort((a, b) => {
      const d = dateKey(b.raceDate || b.race_date).localeCompare(dateKey(a.raceDate || a.race_date));
      return d || ((integer(b.raceNo || b.race_no) || 0) - (integer(a.raceNo || a.race_no) || 0));
    });
    const recent = prior.map(run => ({ run, norm:normalizedCorner(run, fieldSizes) })).filter(row => row.norm != null).slice(0, 6);
    const styleMedian = median(recent.map(row => row.norm));
    const style = styleMedian == null || recent.length < 2 ? 'unknown'
      : styleMedian <= 0.25 ? 'front' : styleMedian >= 0.55 ? 'closer' : 'middle';
    const evidence = { highFrontN:0, highFrontTop3:0, highCloserN:0, highCloserTop3:0, slowFrontN:0, slowFrontTop3:0 };
    for (const row of recent) {
      const record = raceRecord(options && options.store, row.run);
      if (!record) continue;
      const entry = baselineEntry(options.baseline, record.distance, record.race_class || record.raceClass, record.track_cond || record.trackCond, options.mode);
      const pace = classify(record.first3f, entry);
      const finish = integer(row.run.chakujun);
      if (finish == null) continue;
      if (pace === 'high' && row.norm <= 0.25) { evidence.highFrontN++; if (finish <= 3) evidence.highFrontTop3++; }
      if (pace === 'high' && row.norm >= 0.55) { evidence.highCloserN++; if (finish <= 3) evidence.highCloserTop3++; }
      if (pace === 'slow' && row.norm <= 0.25) { evidence.slowFrontN++; if (finish <= 3) evidence.slowFrontTop3++; }
    }
    return { style, styleMedian, historyCount:recent.length, ...evidence };
  }

  function deltaFor(profile, pressure, score, raceMedian) {
    if (!profile || profile.style === 'unknown') return { delta:0, reason:'脚質履歴不足' };
    if (pressure === 'high_3plus' && profile.style === 'front') {
      const rate = profile.highFrontN ? profile.highFrontTop3 / profile.highFrontN : null;
      if (profile.highFrontN >= 2 && rate >= 0.5) return { delta:0, reason:'ハイ先行耐性あり' };
      return { delta:-0.55, reason:'先行競合・ハイ耐性未確認' };
    }
    if (pressure === 'high_3plus' && profile.style === 'closer') {
      const rate = profile.highCloserN ? profile.highCloserTop3 / profile.highCloserN : null;
      if (score >= raceMedian && profile.highCloserN >= 2 && rate >= 0.4) return { delta:0.2, reason:'能力上位かつハイ差し実績' };
      return { delta:0, reason:'差し一律加点なし' };
    }
    if (pressure === 'low_0_1' && profile.style === 'front') return { delta:0.35, reason:'単騎・前残り想定' };
    if (pressure === 'low_0_1' && profile.style === 'closer') return { delta:-0.2, reason:'スロー差し届かず警戒' };
    return { delta:0, reason:'展開補正なし' };
  }
  function scoreRace(options) {
    const runners = Array.isArray(options && options.runners) ? options.runners : [];
    if (runners.length < 4) return { ok:false, reason:'INSUFFICIENT_RUNNERS' };
    const covered = runners.filter(row => row.profile && row.profile.style !== 'unknown');
    const minCovered = Math.max(3, Math.ceil(runners.length * 0.5));
    if (covered.length < minCovered) return { ok:false, reason:'INSUFFICIENT_STYLE_COVERAGE', covered:covered.length, required:minCovered };
    const frontCount = covered.filter(row => row.profile.style === 'front').length;
    const pressure = frontCount >= 3 ? 'high_3plus' : frontCount === 2 ? 'middle_2' : 'low_0_1';
    const scores = runners.map(row => finite(row.currentScore)).filter(value => value != null);
    if (scores.length !== runners.length) return { ok:false, reason:'MISSING_CURRENT_SCORE' };
    const raceMedian = median(scores);
    const ranked = runners.map((row, index) => {
      const adjustment = deltaFor(row.profile, pressure, Number(row.currentScore), raceMedian);
      return {
        u:integer(row.u), name:String(row.name || ''), baselineRank:index + 1,
        baselineMark:MARKS[index] || '', currentScore:Number(row.currentScore),
        paceDelta:adjustment.delta, reason:adjustment.reason, profile:row.profile,
        shadowScore:Number((Number(row.currentScore) + adjustment.delta).toFixed(3)),
      };
    }).sort((a, b) => b.shadowScore - a.shadowScore || a.baselineRank - b.baselineRank)
      .map((row, index) => ({ ...row, rank:index + 1, mark:MARKS[index] || '' }));
    return {
      ok:true, status:'forward_shadow_only', exactEv:false, model:CONTRACT,
      pace:{ pressure, frontCount, covered:covered.length, fieldSize:runners.length }, ranked,
      changed:ranked.some(row => row.rank !== row.baselineRank),
    };
  }
  function computeLive(options) {
    const scored = Array.isArray(options && options.scored) ? options.scored : [];
    const raceInfo = options && options.raceInfo || {};
    const fieldSizes = buildFieldSizes(options && options.store);
    const runners = scored.map(row => {
      const name = String(row && row.horse && row.horse.horseName || '');
      return {
        u:integer(row && row.horse && row.horse.umaBan), name, currentScore:finite(row && row.totalScore),
        profile:profileHistory({
          history:typeof options.getHistory === 'function' ? options.getHistory(name) : [],
          store:options.store, fieldSizes, baseline:options.baseline, mode:options.mode || 'live',
          asOfDate:raceInfo.raceDate, asOfRaceNo:raceInfo.raceNo,
        }),
      };
    });
    return scoreRace({ runners });
  }
  function buildAdminHtml(result) {
    if (!result || !result.ok) return '';
    const label = result.pace.pressure === 'high_3plus' ? 'ハイ想定' : result.pace.pressure === 'low_0_1' ? 'スロー想定' : 'ミドル想定';
    const changes = result.ranked.filter(row => row.rank !== row.baselineRank || row.paceDelta !== 0).slice(0, 5);
    const rows = changes.length ? changes.map(row =>
      `<span style="display:inline-block;margin:3px 10px 3px 0"><b>${escapeHtml(row.mark)} ${escapeHtml(row.u)} ${escapeHtml(row.name)}</b> ` +
      `<small>${row.paceDelta >= 0 ? '+' : ''}${row.paceDelta.toFixed(2)}｜${escapeHtml(row.reason)}</small></span>`
    ).join('') : '<span>順位変更なし</span>';
    return `<div class="admin-only" style="margin-bottom:10px;padding:10px 12px;border:1.5px dashed #0ea5e9;border-radius:9px;background:#f0f9ff;color:#0c4a6e;font-size:11px">` +
      `<b>🌊 ペース適性v2（影予想） ${label}</b>　先行型${result.pace.frontCount}頭／判定可能${result.pace.covered}/${result.pace.fieldSize}頭` +
      `<div style="margin-top:5px">${rows}</div><div style="margin-top:5px;color:#64748b">現行の印・期待値・買い目には未反映。現在レースの前半3F・コーナーは入力に使用しません。</div></div>`;
  }

  return Object.freeze({
    contract:CONTRACT, normalizeDistance, normalizeCondition, normalizeClass, baselineEntry, classify,
    buildFieldSizes, normalizedCorner, profileHistory, deltaFor, scoreRace, computeLive, buildAdminHtml,
  });
});

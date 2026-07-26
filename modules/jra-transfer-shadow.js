'use strict';

(function (root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KvJraTransferShadow = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const VERSION = 'jra-transfer-shadow-v2';
  const WORKER = 'https://keiba-proxydeploy.maguronagareboshi.workers.dev';
  const CLASS_ORDER = ['NEWCOMER', 'MAIDEN', '1WIN', '2WIN', '3WIN', 'OPEN', 'GRADE'];
  const ORIGIN_RANK = { NEWCOMER:1.5, MAIDEN:2.5, '1WIN':4, '2WIN':5.5, '3WIN':7, OPEN:8, GRADE:9 };
  const MARKS = ['◎', '○', '▲', '△', '×', '×'];
  const attempted = new Map();
  const pending = new Map();

  const contract = Object.freeze({
    id: VERSION,
    status: 'forward_shadow_only',
    productionMarksAllowed: false,
    marketInputs: [],
    classSource: 'keiba.go.jp HorseMarkInfo',
    shrinkage: 0.5,
    decayByKochiStart: [1, 0.5, 0.25, 0],
    validatedScope: 'first_start',
    laterStartsStatus: 'forward_shadow_monitoring',
  });

  function normalize(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  }

  function classifyJraClass(value) {
    const s = normalize(value);
    if (!s || /障害/.test(s)) return null;
    if (/JPN[123]|G[123IＩ]|重賞/.test(s)) return 'GRADE';
    if (/オープン|OPEN|リステッド|\bL\b|4勝/.test(s)) return 'OPEN';
    if (/3勝|1600万/.test(s)) return '3WIN';
    if (/2勝|1000万/.test(s)) return '2WIN';
    if (/1勝|500万/.test(s)) return '1WIN';
    if (/未勝利/.test(s)) return 'MAIDEN';
    if (/新馬/.test(s)) return 'NEWCOMER';
    return null;
  }

  function targetClass(value) {
    const s = normalize(value);
    if (/C1C2/.test(s)) return 'C1';
    if (/C2C3/.test(s)) return 'C2';
    for (const c of ['C3', 'C2', 'C1']) if (s.includes(c)) return c;
    if (/(^|[^A-Z])A([^A-Z]|$)/.test(s)) return 'A';
    if (/(^|[^A-Z])B([^A-Z]|$)/.test(s)) return 'B';
    return 'OTHER';
  }

  function isJraCourse(value) {
    return /^J[^0-9]/.test(normalize(value));
  }

  function isKochiCourse(value) {
    const s = normalize(value);
    return s === '高知' || s.startsWith('高知');
  }

  function dateKey(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
    return digits.length === 8 ? Number(digits) : 0;
  }

  function priorOfficialRaces(races, asOfDate) {
    const cutoff = dateKey(asOfDate) || 99999999;
    return (Array.isArray(races) ? races : [])
      .filter(r => dateKey(r.raceDate || r.date) && dateKey(r.raceDate || r.date) < cutoff)
      .slice().sort((a, b) => dateKey(a.raceDate || a.date) - dateKey(b.raceDate || b.date));
  }

  /**
   * 対象日時点の高知在籍状態を、直近の「高知以外→高知」サイクルで判定する。
   * localKochiRuns は公式キャッシュが発走前取得のまま古い場合を補完するためだけに使う。
   */
  function analyzeKochiEntryState(races, asOfDate, options = {}) {
    const known = options.historyKnown !== false && Array.isArray(races);
    const prior = priorOfficialRaces(races, asOfDate);
    if (!prior.length) return {
      status: known ? 'newcomer' : 'unknown', originCourse:null, originRace:null,
      originDate:0, kochiStartsSinceOrigin:0, officialPriorCount:0,
    };

    let originIndex = -1;
    for (let i = prior.length - 1; i >= 0; i--) {
      if (!isKochiCourse(prior[i].course)) { originIndex = i; break; }
    }
    if (originIndex < 0) return {
      status:'kochi_existing', originCourse:null, originRace:null, originDate:0,
      kochiStartsSinceOrigin:prior.filter(r => isKochiCourse(r.course)).length,
      officialPriorCount:prior.length,
    };

    const originRace = prior[originIndex];
    const originDate = dateKey(originRace.raceDate || originRace.date);
    const officialKochi = prior.slice(originIndex + 1).filter(r => isKochiCourse(r.course));
    // 1頭が同日に複数競走へ出ることはないため、公式側にraceNoがない場合も日付で重複排除できる。
    const localKeys = new Set(officialKochi.map(r => String(dateKey(r.raceDate || r.date))));
    for (const r of Array.isArray(options.localKochiRuns) ? options.localKochiRuns : []) {
      const d = dateKey(r.raceDate || r.race_date || r.date);
      if (d > originDate && d < (dateKey(asOfDate) || 99999999)) {
        localKeys.add(String(d));
      }
    }
    return {
      status:isJraCourse(originRace.course) ? 'jra_transfer' : 'nar_transfer',
      originCourse:String(originRace.course || ''), originRace, originDate,
      kochiStartsSinceOrigin:localKeys.size, officialPriorCount:prior.length,
    };
  }

  function analyzeHistory(races, asOfDate, options = {}) {
    const entryState = analyzeKochiEntryState(races, asOfDate, options);
    if (entryState.status !== 'jra_transfer') return null;
    const prior = priorOfficialRaces(races, asOfDate)
      .filter(r => dateKey(r.raceDate || r.date) <= entryState.originDate);
    const classified = prior.filter(r => isJraCourse(r.course)).map(r => ({
      row: r,
      cls: classifyJraClass([r.raceClassRaw, r.raceClass, r.raceName].filter(Boolean).join(' ')),
    })).filter(x => x.cls);
    if (!classified.length) return null;
    const recent = classified[classified.length - 1];
    const peak = classified.reduce((best, item) =>
      CLASS_ORDER.indexOf(item.cls) > CLASS_ORDER.indexOf(best.cls) ? item : best, classified[0]);
    return { recentClass:recent.cls, peakClass:peak.cls, recentRace:recent.row, peakRace:peak.row, entryState };
  }

  // Log-odds lifts measured in the 2019-2025 audit, deliberately broad and sparse.
  function empiricalLogitLift(origin, target) {
    const key = `${origin}|${target}`;
    const fixed = {
      '1WIN|C3':0.00, '2WIN|C3':0.62, '3WIN|C3':0.37, 'OPEN|C3':0.75,
      '2WIN|C1':0.14, '3WIN|C1':0.70, 'OPEN|C1':0.55,
      '2WIN|A':-0.64, '3WIN|A':0.10, 'OPEN|A':-0.15,
      '2WIN|B':0.00, '3WIN|B':0.20, 'OPEN|B':0.20,
      '2WIN|C2':-0.09, '3WIN|C2':0.10, 'OPEN|C2':0.10,
    };
    return Object.prototype.hasOwnProperty.call(fixed, key) ? fixed[key] : 0;
  }

  function scoreHorse(input) {
    const history = analyzeHistory(input.races, input.asOfDate, {
      historyKnown:input.historyKnown,
      localKochiRuns:input.localKochiRuns,
    });
    if (!history || !Number.isFinite(Number(input.baselineScore))) return null;
    const target = targetClass(input.targetClass);
    const starts = Array.isArray(input.localKochiRuns)
      ? history.entryState.kochiStartsSinceOrigin
      : Math.max(history.entryState.kochiStartsSinceOrigin, Math.max(0, Number(input.kochiStarts) || 0));
    const decay = starts === 0 ? 1 : starts === 1 ? 0.5 : starts === 2 ? 0.25 : 0;
    if (!decay) return null;
    const lift = empiricalLogitLift(history.recentClass, target);
    const empiricalDelta = 3 * contract.shrinkage * decay * lift;
    // The current fallback uses career peak. Correct only half of that gap in shadow.
    const peakCorrection = input.isEstimatedScore
      ? contract.shrinkage * ((ORIGIN_RANK[history.recentClass] || 3) - (ORIGIN_RANK[history.peakClass] || 3)) * 2.5
      : 0;
    const scoreDelta = Math.max(-4, Math.min(3, empiricalDelta + peakCorrection));
    return {
      schema: 'jra_transfer_factor/v1', model: VERSION, targetClass: target,
      recentClass: history.recentClass, peakClass: history.peakClass,
      entryStatus:history.entryState.status, originCourse:history.entryState.originCourse,
      originDate:history.entryState.originDate,
      kochiStarts: starts, decay, logitLift: lift, empiricalDelta:+empiricalDelta.toFixed(3),
      peakCorrection:+peakCorrection.toFixed(3), scoreDelta:+scoreDelta.toFixed(3),
      shadowScore:+(Number(input.baselineScore) + scoreDelta).toFixed(3),
      reason: `${history.recentClass}→${target}・高知${starts + 1}戦目`,
    };
  }

  function scoreRace(scored) {
    const rows = (Array.isArray(scored) ? scored : []).filter(s => Number.isFinite(Number(s.totalScore)))
      .map((s, currentRank) => ({
        horse:s.horse, currentRank:currentRank + 1, currentScore:Number(s.totalScore),
        shadowScore:s.transferShadow ? s.transferShadow.shadowScore : Number(s.totalScore),
        factor:s.transferShadow || null, entryState:s.transferEntryState || null,
      })).sort((a, b) => b.shadowScore - a.shadowScore || a.currentRank - b.currentRank)
      .map((r, i) => ({ ...r, shadowRank:i + 1, shadowMark:MARKS[i] || '' }));
    const currentTop = rows.slice().sort((a, b) => a.currentRank - b.currentRank)[0] || null;
    const shadowTop = rows[0] || null;
    return { schema:'jra_transfer_shadow_result/v1', model:contract, ranked:rows,
      currentTop, shadowTop, changedTop:!!(currentTop && shadowTop && currentTop.horse !== shadowTop.horse) };
  }

  function esc(value) {
    if (typeof root.escapeHTML === 'function') return root.escapeHTML(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function buildAdminHtml(result) {
    if (typeof root.isAdminMode === 'function' && !root.isAdminMode()) return '';
    if (!result) return '';
    const affected = result.ranked.filter(r => r.factor);
    const deferred = result.ranked.filter(r => !r.factor && ['nar_transfer', 'newcomer'].includes(r.entryState?.status));
    if (!affected.length && !deferred.length) return '';
    const evaluation = evaluateStored();
    return `<div class="jra-transfer-shadow-card" data-model="${VERSION}" style="margin:10px 0;padding:10px 12px;border:1px solid #38bdf855;border-radius:8px;background:#0c2030;color:#dbeafe;font-size:11px">
      <div style="font-weight:800;color:#67e8f9;margin-bottom:6px">転入前能力・影予想（未採用）</div>
      <div>現行◎ <b>${esc(result.currentTop?.horse?.horseName || '—')}</b> ／ 転入補正◎ <b>${esc(result.shadowTop?.horse?.horseName || '—')}</b>${result.changedTop ? ' <span style="color:#fbbf24">変更あり</span>' : ''}</div>
      ${affected.map(r => `<div style="margin-top:4px;color:#bae6fd">${esc(r.horse?.horseName || '')}: ${esc(r.factor.reason)}、補正 ${r.factor.scoreDelta >= 0 ? '+' : ''}${r.factor.scoreDelta.toFixed(2)}、影${r.shadowRank}位</div>`).join('')}
      ${deferred.map(r => `<div style="margin-top:4px;color:#fcd34d">${esc(r.horse?.horseName || '')}: ${r.entryState.status === 'nar_transfer' ? `${esc(r.entryState.originCourse || '他地区')}からの転入・換算係数未採用` : '公式の過去出走なし・新馬として判定保留'}</div>`).join('')}
      <div style="margin-top:6px;color:#7dd3fc">直近JRAクラス×高知編入クラス・50%縮約。初戦を主評価、2・3戦目は減衰監視。公開印と買い目には未反映。</div>
      <div style="margin-top:3px;color:#94a3b8">前向き保存 ${evaluation.snapshots || 0}R／結果確定 ${evaluation.settled || 0}R${evaluation.deltaPt == null ? '' : `／◎差 ${evaluation.deltaPt >= 0 ? '+' : ''}${evaluation.deltaPt.toFixed(2)}pt`}</div>
    </div>`;
  }

  function recordLive(raceNo, result) {
    if (typeof root.isAdminMode === 'function' && !root.isAdminMode()) return { saved:false, reason:'NOT_ADMIN' };
    if (!result?.ranked?.some(r => r.factor) || typeof root.lsRead !== 'function' || typeof root.lsWrite !== 'function') {
      return { saved:false, reason:'NO_FACTOR' };
    }
    const data = root.allRacesData?.[raceNo];
    const date = String(data?.raceInfo?.raceDate || data?.raceInfo?.race_date || root.currentDate || '');
    const horses = data?.horses || [];
    if (!date || horses.some(h => /^\d+$/.test(String(h.chakujun || '')))) return { saved:false, reason:'NOT_PRESTART' };
    const key = `jraTransferShadow_v1|31|${date.replace(/\D/g, '')}|${String(Number(raceNo)).padStart(2, '0')}|${VERSION}`;
    if (root.lsRead()[key]) return { saved:false, reason:'DUPLICATE' };
    const rowFor = r => ({ u:Number(r.horse?.umaBan), name:String(r.horse?.horseName || ''),
      rank:r.currentRank, shadowRank:r.shadowRank, score:r.currentScore, shadowScore:r.shadowScore,
      factor:r.factor ? { recentClass:r.factor.recentClass, peakClass:r.factor.peakClass,
        targetClass:r.factor.targetClass, entryStatus:r.factor.entryStatus,
        originCourse:r.factor.originCourse, originDate:r.factor.originDate,
        kochiStarts:r.factor.kochiStarts, scoreDelta:r.factor.scoreDelta } : null });
    const snapshot = { type:'jraTransferShadowSnapshot', schema:'jra_transfer_shadow_snapshot/v1',
      model:VERSION, status:'shadow_unadopted', savedAt:new Date().toISOString(),
      babaCode:'31', raceDate:date, raceNo:Number(raceNo),
      baselineTop:Number(result.currentTop?.horse?.umaBan), challengerTop:Number(result.shadowTop?.horse?.umaBan),
      changedTop:result.changedTop, runners:result.ranked.map(rowFor) };
    root.lsWrite(key, snapshot);
    return { saved:true, key, snapshot };
  }

  function evaluateStored() {
    if (typeof root.lsRead !== 'function') return { settled:0, baselineHits:0, challengerHits:0, deltaPt:null };
    const store = root.lsRead();
    const snapshots = Object.values(store).filter(v => v?.type === 'jraTransferShadowSnapshot' && v.model === VERSION);
    let settled = 0, baselineHits = 0, challengerHits = 0;
    for (const s of snapshots) {
      const prefix = `31_${s.raceDate}_${s.raceNo}_`;
      const winner = Object.entries(store).find(([k, v]) => k.startsWith(prefix) && v?.type === 'horse' && Number(v.chakujun) === 1);
      if (!winner) continue;
      const uma = Number(winner[0].slice(prefix.length));
      settled++;
      if (uma === Number(s.baselineTop)) baselineHits++;
      if (uma === Number(s.challengerTop)) challengerHits++;
    }
    return { snapshots:snapshots.length, settled, baselineHits, challengerHits,
      baselineRate:settled ? baselineHits / settled : null, challengerRate:settled ? challengerHits / settled : null,
      deltaPt:settled ? 100 * (challengerHits - baselineHits) / settled : null };
  }

  function cacheOfficial(lineage, horseName, payload) {
    if (!payload || !Array.isArray(payload.races) || !payload.races.length || typeof root.lsWrite !== 'function') return false;
    root.lsWrite(`official_${lineage}`, { type:'official', lineageCode:String(lineage),
      horseName:horseName || payload.horse_name || '', races:payload.races,
      basicInfo:payload.basic_info || {}, savedAt:payload.fetched_at || new Date().toISOString(), source:'server-history' });
    return true;
  }

  async function fetchServerHistory(lineage, horseName) {
    const code = String(lineage || '');
    if (!/^\d{8,14}$/.test(code)) return false;
    if (pending.has(code)) return pending.get(code);
    const task = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const url = `${WORKER}/horse-history?lineage=${encodeURIComponent(code)}&horse=${encodeURIComponent(horseName || '')}`;
        const res = await fetch(url, { signal:controller.signal, cache:'no-store' });
        if (!res.ok) return false;
        return cacheOfficial(code, horseName, await res.json());
      } catch (_) { return false; }
      finally { clearTimeout(timer); pending.delete(code); }
    })();
    pending.set(code, task);
    return task;
  }

  async function ensureRaceHistories(raceNo) {
    const data = root.allRacesData?.[raceNo];
    const raceDate = data?.raceInfo?.raceDate || data?.raceInfo?.race_date || root.currentDate;
    if (!data?.horses?.length || !raceDate || typeof root.lsRead !== 'function') return false;
    const raceKey = `${raceDate}|${raceNo}`;
    const lastAttempt = attempted.get(raceKey) || 0;
    if (Date.now() - lastAttempt < 30000) return false;
    attempted.set(raceKey, Date.now());
    const local = root.lsRead();
    const wanted = data.horses.filter(h => {
      const code = String(h.lineageLoginCode || h.lineage_login_code || '');
      if (!/^\d{8,14}$/.test(code) || local[`official_${code}`]?.races?.length) return false;
      const hist = typeof root.getHorseHistoryBefore === 'function'
        ? root.getHorseHistoryBefore(h.horseName || '', raceDate, raceNo) : [];
      return hist.filter(r => r.babaCode === '31').length <= 2;
    });
    let changed = false;
    for (let i = 0; i < wanted.length; i += 3) {
      const batch = await Promise.all(wanted.slice(i, i + 3).map(h =>
        fetchServerHistory(h.lineageLoginCode || h.lineage_login_code, h.horseName || '')));
      if (batch.some(Boolean)) changed = true;
    }
    return changed;
  }

  return { contract, classifyJraClass, targetClass, isJraCourse, isKochiCourse,
    analyzeKochiEntryState, analyzeHistory, empiricalLogitLift,
    scoreHorse, scoreRace, buildAdminHtml, recordLive, evaluateStored, fetchServerHistory, ensureRaceHistories };
});

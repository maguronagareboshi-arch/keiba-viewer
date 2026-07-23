/* 高知競馬 年度ドリフトv3: 現行AIを変更しない全順位forward shadow。 */
(function (root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KvEraDriftShadow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const FEATURES = Object.freeze(["legacy_score","history_quality","history_quality_missing","recent_quality3","recent_quality3_missing","recent_top3","recent_top3_missing","career_top3_shrunk","career_top3_missing","kinryo_relative","body_weight_change","body_weight_change_missing","log_prior_starts","first_asof","same_distance_top3_shrunk","same_distance_missing","same_distance_low","same_condition_top3_shrunk","same_condition_missing","same_condition_low","front4_rate","front4_missing","jockey_top3_shrunk","jockey_missing","trainer_top3_shrunk","trainer_missing","combo_top3_shrunk","combo_missing","prior_1_2","prior_3_9","prior_10_19","prior_20_plus"]);
  const WEIGHTS = Object.freeze([1.390968961192102,-0.05146375146557793,-0.0024001307506312346,0.1486600954757521,-0.0024001307506312346,0.09082465567557844,-0.0024001307506312346,0.0742939046448232,-0.0024001307506312346,-0.023148300657042188,-0.10756552887536844,-0.0024001307506312346,-0.15538312752260852,-0.0024001307506312346,-0.001926860282738064,-0.0348661600658001,-0.042045229679194634,0.06778549693088645,-0.008693418344303974,-0.027015664351865067,0.0412384475293701,0.022263170075842085,0.12553725030618063,-0.01804449016663596,-0.01270083160356425,0.007863322984928985,-0.13576559252449913,-0.0025640258376172943,0.013659398762693129,0.046793955237662575,-0.0018379729056287163,-0.046315899336774005]);
  const MEDIANS = Object.freeze([38.91593124,0.5270310250000001,0,0.5238095199999999,0,0.2,0,0.32,0,0.2727272727272734,0,0,2.833213344056216,0,0.30434782652173914,0,0,0.3,0,0,0.2,0,0.27272727129870133,0,0.2871494393260779,0,0.2874015742519685,0,0,0,0,0]);
  const MEANS = Object.freeze([38.961825487688834,0.5269653439636514,0.0008253152390802436,0.5208343978335996,0.0008253152390802436,0.33143580475047385,0.0008253152390802436,0.3261862603156202,0.0008253152390802436,-1.4326505991548285e-17,0.007720353945320254,0.0008253152390802436,2.776571222795622,0.0008253152390802436,0.31010934635819903,0.07931383917844569,0.21210601644362262,0.3082590764981211,0.10565079763061397,0.18998965744194063,0.32824911287322067,0.0008566563241086073,0.29472280798624834,0.0017551007615883663,0.3008807933004527,4.178811337115158e-05,0.3097043186501499,0.012964762173399777,0.07496787538784593,0.24734384304384618,0.24761546578075866,0.429247500548469]);
  const SDS = Object.freeze([13.64281297488104,0.22442770028515674,0.028716442917541943,0.24145145721046177,0.028716442917541943,0.31159137174693363,0.028716442917541943,0.10460878401486909,0.028716442917541943,1.2157106640873006,4.466595316001613,0.028716442917541943,0.9723805729891103,0.028716442917541943,0.08265562571095746,0.27022796689701367,0.40879952817045484,0.07356033312149268,0.3073901536983638,0.3922927319067169,0.3250609183374336,0.029256152584565858,0.13470223225768868,0.041857142555479725,0.09294999060141729,0.006464237551686021,0.13693289461332053,0.11312239882185023,0.2633395014948396,0.43146826807085564,0.4316272082326232,0.4949687705514619]);
  const MARKS = Object.freeze(['◎','○','▲','△','×','×']);
  const RESULT_SCHEMA = 'era_drift_shadow_result/v1';
  const SNAPSHOT_SCHEMA = 'era_drift_shadow_snapshot/v1';
  const LOCAL_PREFIX = 'aiEraDriftShadow_v1';
  const SERVER_TABLE = 'keiba_ai_predictions';
  const serverPublishes = new Set();
  const serverSnapshots = new Map();
  let serverHydration = null;

  const stableStringify = value => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  };
  const fingerprint = value => {
    const text = typeof value === 'string' ? value : stableStringify(value);
    try {
      let hash = 0xcbf29ce484222325n;
      for (let i = 0; i < text.length; i++) {
        hash ^= BigInt(text.charCodeAt(i));
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
      }
      return hash.toString(16).padStart(16, '0');
    } catch (_) {
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
      return (hash >>> 0).toString(16).padStart(8, '0');
    }
  };
  const CONTRACT = Object.freeze({
    id:'kochi-era-drift-anchor-shadow-v1', version:'1.0.0', family:'annual-drift-anchor-ranking-shadow',
    status:'forward_shadow_only', productionMarksAllowed:false, valueBetAdviceAllowed:false,
    target:'all-runner-ranking-and-marks', marketInputs:[], trainingYears:'2014-2025', trainingRaces:9518,
    trainingMethod:'expanding annual walk-forward; conditional logit; L2=0.01',
    liveAnchor:'actual-ui-totalScore supplied through legacy_score interface',
    featurePipelineVersion:'complete-v3-asof-stable-v1',
    datasetSha256:'699f63e95dfa47f1fdc5f6ff0c0db8fa5d005f11c11a012a2df9e75b89bbc0ec',
    protocolSha256:'ec5a3536456a71b801ed7069986e6ec42ba9b0942a652b60e9e6ce086625f5f1',
    evaluationTarget:500,
  });
  const MODEL_FINGERPRINT = fingerprint({ contract:CONTRACT, features:FEATURES, weights:WEIGHTS, medians:MEDIANS, means:MEANS, sds:SDS });

  const finite = value => {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const missing = (raw, key) => raw[key] == null ? 1 : 0;
  const shrink = (rate, count, prior) => {
    const value = finite(rate), n0 = finite(count), n = n0 == null ? 0 : Math.max(0, n0);
    return value == null ? prior : (value * n + prior * 20) / (n + 20);
  };

  function deriveRaceFeatures(runners) {
    if (!Array.isArray(runners) || runners.length < 4) return null;
    const prior = Math.min(3, runners.length) / runners.length;
    const kinryo = runners.map(row => finite(row.raw && row.raw.current_kinryo)).filter(value => value != null);
    const kinMean = kinryo.length ? kinryo.reduce((sum, value) => sum + value, 0) / kinryo.length : 0;
    return runners.map(row => {
      const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
      const priorCount = Math.max(0, Number.parseInt(raw.prior_start_count, 10) || 0);
      const meanPct3 = finite(raw.mean_finish_percentile_last3);
      const currentKinryo = finite(raw.current_kinryo);
      let weightChange = finite(raw.body_weight_change);
      if (weightChange != null) weightChange = Math.max(-40, Math.min(40, weightChange));
      const distCount = Math.max(0, Number.parseInt(raw.same_distance_start_count, 10) || 0);
      const distRate = finite(raw.same_distance_top3_rate);
      const condCount = Math.max(0, Number.parseInt(raw.same_condition_start_count, 10) || 0);
      const condRate = finite(raw.same_condition_top3_rate);
      const jockeyCount = Math.max(0, Number.parseInt(raw.jockey_prior_start_count, 10) || 0);
      const trainerCount = Math.max(0, Number.parseInt(raw.trainer_prior_start_count, 10) || 0);
      const comboCount = Math.max(0, Number.parseInt(raw.jockey_trainer_prior_start_count, 10) || 0);
      const front4 = finite(raw.front4_rate_last5);
      return [
        finite(row.currentScore), finite(raw.history_finish_quality_proxy), missing(raw,'history_finish_quality_proxy'),
        meanPct3 == null ? null : 1 - meanPct3, missing(raw,'mean_finish_percentile_last3'),
        finite(raw.top3_rate_last5), missing(raw,'top3_rate_last5'),
        shrink(raw.career_top3_rate, priorCount, prior), missing(raw,'career_top3_rate'),
        currentKinryo == null ? 0 : currentKinryo - kinMean, weightChange, missing(raw,'body_weight_change'),
        Math.log1p(priorCount), Number(priorCount === 0),
        shrink(distRate, distCount, prior), Number(distRate == null), Number(distCount >= 3 && distRate != null && distRate < 0.20),
        shrink(condRate, condCount, prior), Number(condRate == null), Number(condCount >= 3 && condRate != null && condRate < 0.20),
        front4, Number(front4 == null),
        shrink(raw.jockey_prior_top3_rate, jockeyCount, prior), missing(raw,'jockey_prior_top3_rate'),
        shrink(raw.trainer_prior_top3_rate, trainerCount, prior), missing(raw,'trainer_prior_top3_rate'),
        shrink(raw.jockey_trainer_prior_top3_rate, comboCount, prior), missing(raw,'jockey_trainer_prior_top3_rate'),
        Number(priorCount >= 1 && priorCount <= 2), Number(priorCount >= 3 && priorCount <= 9),
        Number(priorCount >= 10 && priorCount <= 19), Number(priorCount >= 20),
      ];
    });
  }

  function scoreRace(runners) {
    if (!Array.isArray(runners) || runners.length < 4 || runners.some(row => !Number.isInteger(Number(row.u)))) {
      return { ok:false, reason:'INVALID_RUNNERS' };
    }
    const matrix = deriveRaceFeatures(runners);
    if (!matrix || matrix.some(row => row[0] == null)) return { ok:false, reason:'MISSING_CURRENT_SCORE' };
    const rows = matrix.map((values, index) => {
      let linear = 0;
      for (let i = 0; i < FEATURES.length; i++) {
        const value = finite(values[i]);
        const imputed = value == null ? MEDIANS[i] : value;
        linear += WEIGHTS[i] * ((imputed - MEANS[i]) / SDS[i]);
      }
      return { index, u:Number(runners[index].u), name:String(runners[index].name || ''), linear };
    });
    rows.sort((a, b) => b.linear - a.linear || a.index - b.index);
    const maximum = Math.max(...rows.map(row => row.linear));
    const denominator = rows.reduce((sum, row) => sum + Math.exp(row.linear - maximum), 0);
    const ranked = rows.map((row, index) => ({
      u:row.u, name:row.name, rank:index + 1, mark:MARKS[index] || '',
      score:Number(row.linear.toFixed(8)), probability:Math.exp(row.linear - maximum) / denominator,
      baselineRank:row.index + 1, baselineMark:MARKS[row.index] || '',
    }));
    return {
      ok:true, schema:RESULT_SCHEMA, status:'forward_shadow_only', exactEv:false,
      model:{ ...CONTRACT, fingerprint:MODEL_FINGERPRINT },
      inputFingerprint:fingerprint(runners.map(row => [row.u, row.currentScore, row.raw])), ranked,
    };
  }

  function computeLive(raceNo, scored) {
    if (typeof root.isAdminMode === 'function' && !root.isAdminMode()) return null;
    if (!Array.isArray(scored) || typeof root.kvVnextRawForScored !== 'function') return null;
    const runners = scored.map(row => ({
      u:Number.parseInt(row && row.horse && row.horse.umaBan, 10),
      name:String(row && row.horse && row.horse.horseName || ''),
      currentScore:finite(row && row.totalScore), raw:root.kvVnextRawForScored(raceNo, row),
    }));
    if (runners.some(row => !row.raw)) return null;
    const result = scoreRace(runners);
    return result.ok ? result : null;
  }

  function liveRaces() {
    try { return typeof allRacesData !== 'undefined' ? allRacesData : (root.allRacesData || {}); }
    catch (_) { return root.allRacesData || {}; }
  }
  function liveDate() {
    try { return typeof currentDate !== 'undefined' ? currentDate : String(root.currentDate || ''); }
    catch (_) { return String(root.currentDate || ''); }
  }
  function liveBaba() {
    try { return typeof currentBaba !== 'undefined' ? currentBaba : String(root.currentBaba || '31'); }
    catch (_) { return String(root.currentBaba || '31'); }
  }

  function listSnapshots() {
    const local = typeof root.lsRead === 'function'
      ? Object.entries(root.lsRead()).filter(([, value]) => value && value.type === 'eraDriftShadowSnapshot')
        .map(([key, value]) => ({ key, ...value })) : [];
    const merged = new Map();
    [...serverSnapshots.values(), ...local].forEach(value => {
      const key = `${value.raceDate}|${value.raceNo}|${value.inputFingerprint || value.outputFingerprint || ''}`;
      merged.set(key, value);
    });
    return [...merged.values()].sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
  }

  function hydrateServerSnapshots() {
    if (serverHydration) return serverHydration;
    serverHydration = (async () => {
      if (typeof root.isAdminMode !== 'function' || !root.isAdminMode() || typeof root.fetch !== 'function' ||
          typeof root.kvSupabaseReadConfig !== 'function') return { ok:false, reason:'UNAVAILABLE', count:serverSnapshots.size };
      const config = root.kvSupabaseReadConfig();
      if (!config || !config.url || !config.headers) return { ok:false, reason:'UNAVAILABLE', count:serverSnapshots.size };
      const url = `${config.url}/rest/v1/${SERVER_TABLE}?select=id,payload&model_fingerprint=eq.${encodeURIComponent(MODEL_FINGERPRINT)}&order=race_date.asc&limit=1000`;
      try {
        const response = await root.fetch(url, { headers:config.headers, signal:root.AbortSignal?.timeout?.(12000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = await response.json();
        (Array.isArray(rows) ? rows : []).forEach(row => {
          const value = row && row.payload;
          if (value && value.schema === SNAPSHOT_SCHEMA && value.model?.fingerprint === MODEL_FINGERPRINT) {
            serverSnapshots.set(String(row.id || `${value.raceDate}|${value.raceNo}|${value.inputFingerprint}`), value);
          }
        });
        return { ok:true, count:serverSnapshots.size };
      } catch (error) {
        console.warn('[era drift shadow hydrate]', error);
        serverHydration = null;
        return { ok:false, reason:'FETCH_FAILED', count:serverSnapshots.size };
      }
    })();
    return serverHydration;
  }

  function publishServer(snapshot) {
    if (!snapshot || typeof root.apiUpsert !== 'function' || typeof root.getWriteToken !== 'function' || !root.getWriteToken()) return;
    const dateKey = String(snapshot.raceDate || '').replace(/\D/g, '');
    const id = `era_shadow_31_${dateKey}_${String(snapshot.raceNo).padStart(2,'0')}_${MODEL_FINGERPRINT}`;
    const signature = `${id}|${snapshot.inputFingerprint}|${snapshot.outputFingerprint}`;
    if (serverPublishes.has(signature)) return;
    serverPublishes.add(signature);
    Promise.resolve(root.apiUpsert(SERVER_TABLE, id, {
      baba_code:'31', race_date:snapshot.raceDate, race_no:snapshot.raceNo,
      model_fingerprint:MODEL_FINGERPRINT, runner_signature:snapshot.runnerSetFingerprint,
      output_fingerprint:snapshot.outputFingerprint, computed_at:snapshot.capturedAt, payload:snapshot,
    })).catch(error => { serverPublishes.delete(signature); console.warn('[era drift shadow server]', error); });
  }

  function recordLive(raceNo, scored) {
    try {
      if (typeof root.isAdminMode !== 'function' || !root.isAdminMode()) return { saved:false, reason:'NOT_ADMIN' };
      if (typeof root.lsRead !== 'function' || typeof root.lsWrite !== 'function') return { saved:false, reason:'STORAGE_UNAVAILABLE' };
      const data = liveRaces()[raceNo];
      if (!data || !data.raceInfo || !Array.isArray(data.horses)) return { saved:false, reason:'NO_RACE' };
      const baba = String(data.raceInfo.babaCode || liveBaba() || '31');
      const raceDate = String(data.raceInfo.raceDate || liveDate() || '');
      if (baba !== '31' || raceDate !== liveDate()) return { saved:false, reason:'NOT_CURRENT_KOCHI' };
      if (data.horses.some(horse => /^\d+$/.test(String(horse.chakujun || '')))) return { saved:false, reason:'HAS_RESULT' };
      const resultPrefix = `${baba}_${raceDate}_${Number.parseInt(raceNo,10)}_`;
      if (Object.entries(root.lsRead()).some(([key, value]) => key.startsWith(resultPrefix) &&
          value && value.type === 'horse' && /^\d+$/.test(String(value.chakujun || '')))) {
        return { saved:false, reason:'HAS_SAVED_RESULT' };
      }
      const timing = typeof root._aiPredictionTimeMeta === 'function' ? root._aiPredictionTimeMeta(raceDate, raceNo, baba) : null;
      if (!timing) return { saved:false, reason:'NOT_PRESTART' };
      const result = computeLive(raceNo, scored);
      if (!result) return { saved:false, reason:'MODEL_INPUT_UNAVAILABLE' };
      const baseline = scored.map((row, index) => ({
        u:Number.parseInt(row.horse && row.horse.umaBan, 10), name:String(row.horse && row.horse.horseName || ''),
        rank:index + 1, mark:MARKS[index] || '', score:finite(row.totalScore),
      }));
      const runnerSetFingerprint = fingerprint(baseline.map(row => row.u).slice().sort((a, b) => a - b));
      const outputFingerprint = fingerprint(result.ranked.map(row => [row.u, row.rank, row.score]));
      const inputFingerprint = fingerprint({ model:MODEL_FINGERPRINT, baseline, featureInput:result.inputFingerprint });
      const dateKey = raceDate.replace(/\D/g, '');
      const key = `${LOCAL_PREFIX}|31|${dateKey}|${String(Number.parseInt(raceNo,10)).padStart(2,'0')}|${MODEL_FINGERPRINT}|${inputFingerprint}`;
      const prior = root.lsRead()[key];
      if (prior) { publishServer(prior); return { saved:false, reason:'DUPLICATE', key }; }
      const snapshot = {
        type:'eraDriftShadowSnapshot', schema:SNAPSHOT_SCHEMA, status:'forward_shadow_only', exactEv:false,
        capturePolicy:'distinct-input-prestart-market-free', babaCode:'31', raceDate,
        raceNo:Number.parseInt(raceNo,10), capturedAt:new Date().toISOString(),
        scheduledStartAt:timing.scheduledStartAt || null, minutesBeforeStart:timing.minutesBeforeStart,
        timing:timing.timing, model:{ ...CONTRACT, fingerprint:MODEL_FINGERPRINT },
        runnerSetFingerprint, inputFingerprint, outputFingerprint, baseline,
        challenger:result.ranked, baselineTop3:baseline.slice(0,3).map(row => row.u),
        challengerTop3:result.ranked.slice(0,3).map(row => row.u),
      };
      root.lsWrite(key, JSON.parse(JSON.stringify(snapshot)));
      publishServer(snapshot);
      return { saved:true, key, snapshot };
    } catch (error) {
      console.warn('[era drift shadow]', error);
      return { saved:false, reason:'WRITE_ERROR' };
    }
  }

  function evaluateSnapshots(snapshots, resultLookup) {
    const rows = Array.isArray(snapshots) ? snapshots : [];
    const lookup = typeof resultLookup === 'function' ? resultLookup : (() => null);
    const out = { schema:'era_drift_shadow_evaluation/v1', modelFingerprint:MODEL_FINGERPRINT,
      captured:rows.length, settled:0,
      baseline:{ top1Win:0, top1Top3:0, winnerInTop3:0, partner1Top3:0, partner2Top3:0, bothPartnersTop3:0, exactTop3:0 },
      challenger:{ top1Win:0, top1Top3:0, winnerInTop3:0, partner1Top3:0, partner2Top3:0, bothPartnersTop3:0, exactTop3:0 } };
    rows.forEach(snapshot => {
      const finishes = new Map((snapshot.baseline || []).map(row => [row.u, Number.parseInt(lookup(snapshot, row.u), 10)]));
      if ([...finishes.values()].filter(value => Number.isInteger(value) && value >= 1).length < 3) return;
      out.settled++;
      for (const key of ['baseline','challenger']) {
        const ranked = snapshot[key] || [], first = finishes.get(ranked[0] && ranked[0].u);
        out[key].top1Win += Number(first === 1);
        out[key].top1Top3 += Number(Number.isInteger(first) && first <= 3);
        out[key].winnerInTop3 += Number(ranked.slice(0,3).some(row => finishes.get(row.u) === 1));
        const p1 = finishes.get(ranked[1] && ranked[1].u), p2 = finishes.get(ranked[2] && ranked[2].u);
        out[key].partner1Top3 += Number(Number.isInteger(p1) && p1 <= 3);
        out[key].partner2Top3 += Number(Number.isInteger(p2) && p2 <= 3);
        out[key].bothPartnersTop3 += Number(Number.isInteger(p1) && p1 <= 3 && Number.isInteger(p2) && p2 <= 3);
        out[key].exactTop3 += Number(ranked.slice(0,3).every(row => finishes.get(row.u) <= 3));
      }
    });
    const metricKeys = Object.keys(out.baseline);
    out.rates = { baseline:{}, challenger:{}, deltaPt:{} };
    metricKeys.forEach(key => {
      out.rates.baseline[key] = out.settled ? 100 * out.baseline[key] / out.settled : null;
      out.rates.challenger[key] = out.settled ? 100 * out.challenger[key] / out.settled : null;
      out.rates.deltaPt[key] = out.settled ? out.rates.challenger[key] - out.rates.baseline[key] : null;
    });
    return out;
  }

  function storedResultLookup(snapshot, uma) {
    if (typeof root.lsRead !== 'function') return null;
    const store = root.lsRead();
    const date = String(snapshot.raceDate || '');
    const raceNo = Number.parseInt(snapshot.raceNo, 10);
    const exact = store[`31_${date}_${raceNo}_${Number.parseInt(uma,10)}`];
    if (exact && exact.type === 'horse') return exact.chakujun;
    const normalized = date.replace(/-/g, '/');
    for (const value of Object.values(store)) {
      if (!value || value.type !== 'horse') continue;
      if (String(value.babaCode || value.baba_code || '31') !== '31') continue;
      if (String(value.raceDate || '').replace(/-/g, '/') !== normalized) continue;
      if (Number.parseInt(value.raceNo,10) === raceNo && Number.parseInt(value.umaBan,10) === Number.parseInt(uma,10)) return value.chakujun;
    }
    return null;
  }

  function evaluateStored() {
    return evaluateSnapshots(listSnapshots(), storedResultLookup);
  }

  function promotionDecision(evaluation) {
    const settled = Math.max(0, Number.parseInt(evaluation?.settled, 10) || 0);
    const delta = evaluation?.rates?.deltaPt || {};
    const keys = ['top1Win','top1Top3','winnerInTop3','partner1Top3','partner2Top3'];
    const values = keys.map(key => finite(delta[key]));
    const averageDeltaPt = values.every(value => value != null)
      ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const reasons = [];
    if (settled < CONTRACT.evaluationTarget) reasons.push(`確定${settled}/${CONTRACT.evaluationTarget}R`);
    if (averageDeltaPt == null || averageDeltaPt <= 0) reasons.push('主要5指標の平均差が未達');
    for (const key of ['top1Win','top1Top3','winnerInTop3']) {
      if (finite(delta[key]) == null || finite(delta[key]) < -0.30) reasons.push(`${key}が下限未達`);
    }
    return Object.freeze({ eligible:reasons.length === 0, settled, target:CONTRACT.evaluationTarget,
      remaining:Math.max(0, CONTRACT.evaluationTarget - settled), averageDeltaPt, reasons });
  }

  function buildAdminHtml(result, evaluation) {
    if (typeof root.isAdminMode !== 'function' || !root.isAdminMode()) return '';
    const gate = promotionDecision(evaluation || evaluateStored());
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    })[char]);
    const changes = result?.ok ? result.ranked.filter(row => row.rank <= 3 && row.rank !== row.baselineRank)
      .map(row => `${row.mark}${row.u} ${esc(row.name)}（現行${row.baselineRank}位→補正${row.rank}位）`).join(' / ') : '';
    const evalText = gate.settled
      ? `確定${gate.settled}/${gate.target}R・主要差 ${gate.averageDeltaPt == null ? '—' : `${gate.averageDeltaPt >= 0 ? '+' : ''}${gate.averageDeltaPt.toFixed(2)}pt`}`
      : `発走前保存0/${gate.target}R`;
    return `<div class="era-drift-shadow-card admin-only" data-era-promotion="${gate.eligible ? 'eligible' : 'collecting'}" data-model-fingerprint="${MODEL_FINGERPRINT}" style="margin:0 0 10px;padding:10px 12px;border:1.5px dashed #0f766e;border-radius:9px;background:#f0fdfa;color:#134e4a;font-size:11px">
      <div style="font-weight:800">🗓️ 年度ドリフト補正・影予想 <span style="font-size:10px;color:#0f766e">${gate.eligible ? '採用条件合格・要承認' : '収集中・公開印未変更'}</span></div>
      <div style="margin-top:5px">${changes || '現在の上位3印に変更なし'}</div>
      <div style="margin-top:4px;color:#64748b">${evalText} / 残り${gate.remaining}R。オッズ・人気不使用。500R合格までは自動昇格しません。</div>
    </div>`;
  }

  root.kvComputeEraDriftShadow = computeLive;
  root.kvCaptureEraDriftShadow = recordLive;
  root.kvListEraDriftShadowSnapshots = listSnapshots;
  root.kvEvaluateEraDriftShadowSnapshots = evaluateSnapshots;
  root.kvEvaluateStoredEraDriftShadow = evaluateStored;
  root.kvHydrateEraDriftShadowSnapshots = hydrateServerSnapshots;
  root.kvEraDriftShadowModelFingerprint = MODEL_FINGERPRINT;
  return Object.freeze({ contract:CONTRACT, modelFingerprint:MODEL_FINGERPRINT, features:FEATURES,
    deriveRaceFeatures, scoreRace, computeLive, recordLive, listSnapshots, hydrateServerSnapshots,
    evaluateSnapshots, evaluateStored, promotionDecision, buildAdminHtml });
});

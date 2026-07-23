(function (root) {
  'use strict';

  const SCHEMA = 'kochi_probability_calibration/v1';
  const SNAPSHOT_SCHEMA = 'kochi_probability_calibration_snapshot/v1';
  const WIN_TEMPERATURE = 8.109006095724466;
  const TOP3_TEMPERATURE = 10.193083;
  const EPS = 1e-12;
  const CONTRACT = Object.freeze({
    id:'kochi-current-score-probability-calibration-v1', version:'1.0.0', status:'forward_shadow_only',
    scoreInput:'production_totalScore', rankingChanged:false, marketInputs:[],
    win:{ method:'race_softmax', temperature:WIN_TEMPERATURE, sumPerRace:1 },
    top3:{ method:'plackett_luce_ordered_top3_marginal', temperature:TOP3_TEMPERATURE, sumPerRace:3 },
    developmentYears:[2020,2021,2022,2023,2024], holdoutYears:[2025,2026],
    productionAdviceAllowed:false, valueBetAdviceAllowed:false,
  });

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function hash(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  const MODEL = Object.freeze({ ...CONTRACT, fingerprint:`fnv1a32-${hash(CONTRACT)}` });

  function softmax(scores, temperature) {
    const maximum = Math.max(...scores);
    const weights = scores.map(score => Math.exp((score - maximum) / temperature));
    const total = weights.reduce((sum, value) => sum + value, 0);
    return weights.map(value => value / total);
  }

  function top3Marginal(scores, temperature) {
    const maximum = Math.max(...scores);
    const weights = scores.map(score => Math.exp((score - maximum) / temperature));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const out = scores.map(() => 0);
    for (let first = 0; first < scores.length; first += 1) {
      const p1 = weights[first] / total;
      const remaining1 = total - weights[first];
      for (let second = 0; second < scores.length; second += 1) {
        if (second === first) continue;
        const p2 = p1 * weights[second] / remaining1;
        const remaining2 = remaining1 - weights[second];
        for (let third = 0; third < scores.length; third += 1) {
          if (third === first || third === second) continue;
          const ordered = p2 * weights[third] / remaining2;
          out[first] += ordered;
          out[second] += ordered;
          out[third] += ordered;
        }
      }
    }
    return out.map(value => Math.min(1, Math.max(EPS, value)));
  }

  function calibrateScored(scored) {
    if (!Array.isArray(scored) || scored.length < 3) return null;
    const rows = scored.map((row, index) => ({
      u:Number.parseInt(row?.horse?.umaBan, 10), name:String(row?.horse?.horseName || ''),
      score:finite(row?.totalScore), sourceIndex:index,
      isTransfer:row?.isTransfer === true, isEstimatedScore:row?.isEstimatedScore === true,
    }));
    if (rows.some(row => !Number.isInteger(row.u) || row.u <= 0 || row.score == null) ||
        new Set(rows.map(row => row.u)).size !== rows.length) return null;
    rows.sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex || a.u - b.u);
    const scores = rows.map(row => row.score);
    const win = softmax(scores, WIN_TEMPERATURE);
    const top3 = top3Marginal(scores, TOP3_TEMPERATURE);
    const resultRows = rows.map((row, index) => ({
      u:row.u, name:row.name, rank:index + 1, totalScore:row.score,
      winProbability:win[index], top3Probability:top3[index],
      isTransfer:row.isTransfer, isEstimatedScore:row.isEstimatedScore,
    }));
    return {
      schema:SCHEMA, status:'forward_shadow_only', model:MODEL,
      inputFingerprint:`fnv1a32-${hash(resultRows.map(row => [row.u,row.totalScore,row.isTransfer,row.isEstimatedScore]))}`,
      sums:{ win:win.reduce((a,b)=>a+b,0), top3:top3.reduce((a,b)=>a+b,0) }, rows:resultRows,
    };
  }

  function captureForward(raceNo, scored) {
    try {
      if (typeof root.isAdminMode !== 'function' || !root.isAdminMode()) return { saved:false, reason:'NOT_ADMIN' };
      const races = typeof allRacesData !== 'undefined' ? allRacesData : root.allRacesData;
      const activeDate = typeof currentDate !== 'undefined' ? currentDate : root.currentDate;
      const activeBaba = typeof currentBaba !== 'undefined' ? currentBaba : root.currentBaba;
      const data = races?.[raceNo];
      if (!data?.raceInfo || !Array.isArray(data.horses)) return { saved:false, reason:'NO_RACE' };
      const raceDate = String(data.raceInfo.raceDate || activeDate || '');
      const baba = String(data.raceInfo.babaCode || activeBaba || '31');
      if (baba !== '31' || raceDate !== String(activeDate || '')) return { saved:false, reason:'NOT_CURRENT_KOCHI' };
      if (data.horses.some(horse => /^\d+$/.test(String(horse.chakujun || '')))) return { saved:false, reason:'HAS_RESULT' };
      const timing = typeof root._aiPredictionTimeMeta === 'function'
        ? root._aiPredictionTimeMeta(raceDate, raceNo, baba) : null;
      if (!timing || timing.timing !== 'verified_prestart' || !Number.isFinite(Number(timing.minutesBeforeStart))) {
        return { saved:false, reason:'UNVERIFIED_PRESTART' };
      }
      const calibrated = calibrateScored(scored);
      if (!calibrated) return { saved:false, reason:'INVALID_SCORES' };
      const store = typeof root.lsRead === 'function' ? root.lsRead() : {};
      const key = `aiProbabilityCalibration_v1|31|${raceDate.replace(/\D/g,'')}|${String(Number.parseInt(raceNo,10)).padStart(2,'0')}|${MODEL.fingerprint}|${calibrated.inputFingerprint}`;
      if (store[key]) return { saved:false, reason:'DUPLICATE', key };
      const ranking = typeof root.buildRankingModelIdentity === 'function' ? root.buildRankingModelIdentity() : null;
      root.lsWrite(key, {
        type:'probabilityCalibrationSnapshot', schema:SNAPSHOT_SCHEMA, status:'forward_shadow_only',
        babaCode:'31', raceDate, raceNo:Number.parseInt(raceNo,10), capturedAt:new Date().toISOString(),
        scheduledStartAt:timing.scheduledStartAt || null, minutesBeforeStart:Number(timing.minutesBeforeStart),
        timing:timing.timing, model:JSON.parse(JSON.stringify(MODEL)), rankingModelFingerprint:ranking?.fingerprint || null,
        inputFingerprint:calibrated.inputFingerprint, sums:{...calibrated.sums}, rows:calibrated.rows.map(row=>({...row})),
      });
      return { saved:true, key };
    } catch (error) {
      console.warn('[probabilityCalibration capture]', error);
      return { saved:false, reason:'WRITE_ERROR' };
    }
  }

  function listSnapshots() {
    const store = typeof root.lsRead === 'function' ? root.lsRead() : {};
    return Object.entries(store).filter(([,row]) => row?.type === 'probabilityCalibrationSnapshot')
      .map(([key,row]) => ({ key, ...row })).sort((a,b)=>String(a.capturedAt).localeCompare(String(b.capturedAt)));
  }

  function outcome(row) {
    if (!row || typeof row !== 'object') return { settled:false, status:'missing' };
    const finish = Number.parseInt(row.chakujun, 10);
    if (Number.isFinite(finish) && finish >= 1 && finish <= 20) {
      return { settled:true, status:'finished', win:finish === 1, top3:finish <= 3 };
    }
    const text = `${row.chakujun || ''} ${row.diff || ''}`;
    if (/中止|失格/.test(text)) return { settled:true, status:'nonfinish', win:false, top3:false };
    if (/取消|除外/.test(text)) return { settled:true, status:'void', win:false, top3:false };
    return { settled:false, status:'pending' };
  }

  function metric(rows, probabilityKey, outcomeKey) {
    if (!rows.length) return null;
    let loss = 0, brier = 0, predicted = 0, observed = 0;
    const bins = Array.from({length:10},()=>({ n:0, p:0, y:0 }));
    rows.forEach(row => {
      const p = Math.min(1-EPS, Math.max(EPS, Number(row[probabilityKey]))), y = row[outcomeKey] ? 1 : 0;
      loss += -(y*Math.log(p)+(1-y)*Math.log(1-p)); brier += (p-y)**2; predicted += p; observed += y;
      const bin = bins[Math.min(9, Math.floor(p*10))]; bin.n++; bin.p += p; bin.y += y;
    });
    const ece = bins.reduce((sum,bin)=>sum+(bin.n/rows.length)*Math.abs((bin.p/bin.n||0)-(bin.y/bin.n||0)),0);
    return { n:rows.length, meanPredicted:predicted/rows.length, observed:observed/rows.length,
      gap:(predicted-observed)/rows.length, logLoss:loss/rows.length, brier:brier/rows.length, ece10:ece };
  }

  function evaluateForward() {
    const store = typeof root.lsRead === 'function' ? root.lsRead() : {};
    const selected = new Map();
    listSnapshots().filter(row => row.model?.fingerprint === MODEL.fingerprint && row.timing === 'verified_prestart' &&
      Number.isFinite(Number(row.minutesBeforeStart)) && Number(row.minutesBeforeStart) >= 0).forEach(row => {
        const raceKey = `${row.babaCode}|${row.raceDate}|${row.raceNo}`;
        const prior = selected.get(raceKey);
        if (!prior || Number(row.minutesBeforeStart) < Number(prior.minutesBeforeStart)) selected.set(raceKey,row);
      });
    const counts = { snapshots:listSnapshots().length, selected:selected.size, settled:0, pending:0, void:0, invalid:0 };
    const all = [], top = [];
    selected.forEach(snapshot => {
      if (!Array.isArray(snapshot.rows) || snapshot.rows.length < 3 || new Set(snapshot.rows.map(row=>row.u)).size !== snapshot.rows.length) {
        counts.invalid++; return;
      }
      const joined = snapshot.rows.map(row => ({ row, result:outcome(store[`${snapshot.babaCode}_${snapshot.raceDate}_${snapshot.raceNo}_${row.u}`]) }));
      if (joined.some(item => item.result.status === 'void')) { counts.void++; return; }
      if (joined.some(item => !item.result.settled)) { counts.pending++; return; }
      const winners = joined.filter(item => item.result.win).length;
      const podium = joined.filter(item => item.result.top3).length;
      if (winners !== 1 || podium !== 3) { counts.invalid++; return; }
      joined.forEach(item => {
        const row = { ...item.row, win:item.result.win, top3:item.result.top3 };
        all.push(row); if (item.row.rank === 1) top.push(row);
      });
      counts.settled++;
    });
    const reliable = all.filter(row => !row.isTransfer && !row.isEstimatedScore);
    return { schema:'kochi_probability_calibration_forward_evaluation/v1', model:MODEL, counts,
      diagnostics:{ transferRows:all.filter(row=>row.isTransfer).length,
        estimatedRows:all.filter(row=>row.isEstimatedScore).length, reliableRows:reliable.length },
      metrics:{ winAll:metric(all,'winProbability','win'), top3All:metric(all,'top3Probability','top3'),
        topPickWin:metric(top,'winProbability','win'), topPickTop3:metric(top,'top3Probability','top3'),
        winReliable:metric(reliable,'winProbability','win'), top3Reliable:metric(reliable,'top3Probability','top3') } };
  }

  root.KvProbabilityCalibration = Object.freeze({ contract:MODEL, calibrateScored, captureForward, listSnapshots, evaluateForward });
})(typeof window !== 'undefined' ? window : globalThis);

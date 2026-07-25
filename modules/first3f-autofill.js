'use strict';

const FIRST3F_SOURCE = Object.freeze({
  MANUAL: 'manual',
  LAP_SUM: 'auto:lap_sum_v1',
  FORMULA_1400: 'auto:formula_1400_v1',
  ESTIMATE_1300_DETAIL: 'auto:estimate_1300_agari3f_v1',
  ESTIMATE_1300_AGARI4F: 'auto:estimate_1300_agari4f_v1',
  ESTIMATE_1600: 'auto:estimate_1600_v1',
});

function _isAutoFirst3fSource(source) {
  return String(source || '').startsWith('auto:');
}

function _first3fAutoRank(source) {
  return source === FIRST3F_SOURCE.LAP_SUM ? 40
    : source === FIRST3F_SOURCE.FORMULA_1400 ? 30
      : source === FIRST3F_SOURCE.ESTIMATE_1300_DETAIL ? 20
        : _isAutoFirst3fSource(source) ? 10 : 0;
}

/** Keep unsaved manual edits, but let a server manual/legacy value beat an old auto estimate. */
function _mergeFirst3fInfo(previous, incoming) {
  if (!previous || !incoming) return incoming;
  const pv = String(previous.first3f || '').trim(), nv = String(incoming.first3f || '').trim();
  if (!pv) return incoming;
  const ps = String(previous.first3fSource || ''), ns = String(incoming.first3fSource || '');
  const keepPrevious = !nv || !_isAutoFirst3fSource(ps)
    || (_isAutoFirst3fSource(ns) && _first3fAutoRank(ps) > _first3fAutoRank(ns));
  if (keepPrevious) { incoming.first3f = previous.first3f; incoming.first3fSource = ps; }
  return incoming;
}

function _first3fSourceBadgeHtml(source, first3f) {
  if (!String(first3f || '').trim()) return '';
  const s = String(source || '');
  if (_isAutoFirst3fSource(s)) {
    const detail = s === FIRST3F_SOURCE.FORMULA_1400
      ? '決着時計－上がり4Fで逆算。手入力で置き換えられます'
      : s === FIRST3F_SOURCE.ESTIMATE_1300_DETAIL
        ? '決着時計・上がり4F・上がり3Fから推定。手入力で置き換えられます'
        : s === FIRST3F_SOURCE.ESTIMATE_1300_AGARI4F
          ? '決着時計と上がり4Fの平均区間から推定。手入力で置き換えられます'
          : '区間値から自動計算。手入力で置き換えられます';
    return `<span style="display:inline-block;margin-left:3px;padding:1px 5px;border-radius:8px;background:#dbeafe;color:#1d4ed8;font-size:8px;font-weight:800;letter-spacing:0" title="${detail}">自動入力</span>`;
  }
  if (s === FIRST3F_SOURCE.MANUAL) {
    return '<span style="display:inline-block;margin-left:3px;padding:1px 5px;border-radius:8px;background:#ecfdf5;color:#047857;font-size:8px;font-weight:800;letter-spacing:0" title="手入力値（自動計算では上書きしません）">手入力</span>';
  }
  return '';
}

function _updateFirst3fSourceBadge(raceNo) {
  const el = document.getElementById(`first3f-source-${raceNo}`);
  const info = allRacesData[raceNo]?.raceInfo;
  if (el && info) el.innerHTML = _first3fSourceBadgeHtml(info.first3fSource, info.first3f);
}

/** 距離・決着時計・上がりから、レース全体の前半3F候補を返す。 */
function calculateRaceFirst3f(distance, winnerTime, agari4f, agari3fRace, trackCond) {
  const dist = String(distance || '').replace(/[^\d]/g, '');
  const winnerTimeSec = typeof winnerTime === 'number' ? winnerTime : raceTimeToSec(String(winnerTime || ''));
  const ag4Sec = parseFloat(agari4f || '');
  if (!winnerTimeSec || !Number.isFinite(ag4Sec) || ag4Sec <= 0) return null;

  let first3f = null, source = '';
  if (dist === '1400') {
    first3f = winnerTimeSec - ag4Sec;
    source = FIRST3F_SOURCE.FORMULA_1400;
  } else if (dist === '1300') {
    const ag3Sec = parseFloat(agari3fRace || '');
    const midF = ag4Sec - ag3Sec;
    if (Number.isFinite(ag3Sec) && ag3Sec > 0 && midF >= 10 && midF <= 20) {
      first3f = winnerTimeSec - (ag4Sec + ag3Sec) / 2;
      source = FIRST3F_SOURCE.ESTIMATE_1300_DETAIL;
    } else {
      first3f = winnerTimeSec - ag4Sec * 0.875;
      source = FIRST3F_SOURCE.ESTIMATE_1300_AGARI4F;
    }
  } else if (dist === '1600') {
    const a4 = { '良':14.5, '稍重':14.2, '重':13.8, '不良':13.5 }[trackCond || ''];
    if (a4 == null) return null;
    first3f = winnerTimeSec - ag4Sec - a4;
    source = FIRST3F_SOURCE.ESTIMATE_1600;
  } else {
    return null;
  }

  first3f = +first3f.toFixed(1);
  if (first3f < 33 || first3f > 46) return null;
  return { value:first3f.toFixed(1), source };
}

/** レースデータを補完。既存の手入力・旧データは一切上書きしない。 */
function _autofillFirst3fInData(data, options) {
  if (!data) return false;
  const info = data.raceInfo || {};
  const existing = String(info.first3f || '').trim();
  const replaceAuto = !!options?.replaceAuto;
  if (existing && info.first3fSource === FIRST3F_SOURCE.LAP_SUM) return false;
  if (existing && !(replaceAuto && _isAutoFirst3fSource(info.first3fSource))) return false;
  const winner = (data.horses || []).find(h => String(h.chakujun) === '1');
  const calc = winner?.time && calculateRaceFirst3f(info.distance, winner.time, info.agari4f, info.agari3f_race, info.trackCond);
  if (!calc) {
    if (existing && replaceAuto && options?.clearInvalid) { info.first3f = ''; info.first3fSource = ''; return true; }
    return false;
  }
  info.first3f = calc.value;
  info.first3fSource = calc.source;
  return true;
}

/** 表示中レースを補完し、入力欄と出所バッジを同期する。 */
function _applyFirst3fAutofillToRace(raceNo, options) {
  const data = allRacesData[raceNo]; if (!data) return false;
  const changed = _autofillFirst3fInData(data, options);
  if (!changed) return false;
  const info = data.raceInfo;
  const input = document.getElementById(`race-first3f-${raceNo}`);
  if (input) input.value = info.first3f;
  updateRacePace(raceNo);
  _updateFirst3fSourceBadge(raceNo);
  return true;
}

function onRaceFirst3fInput(input, raceNo) {
  const info = allRacesData[raceNo]?.raceInfo; if (!info) return;
  info.first3f = input.value;
  info.first3fSource = String(input.value || '').trim() ? FIRST3F_SOURCE.MANUAL : '';
  updateRacePace(raceNo);
  _updateFirst3fSourceBadge(raceNo);
}

function onRaceAgari3fInput(input, raceNo) {
  const info = allRacesData[raceNo]?.raceInfo; if (!info) return;
  info.agari3f_race = input.value;
  updateRacePace(raceNo);
  _applyFirst3fAutofillToRace(raceNo, { replaceAuto:true, clearInvalid:true });
}

function onRaceAgari4fInput(input, raceNo) {
  const info = allRacesData[raceNo]?.raceInfo; if (!info) return;
  info.agari4f = input.value;
  _applyFirst3fAutofillToRace(raceNo, { replaceAuto:true, clearInvalid:true });
}

function _roundFirst3fInput(input) {
  if (input.value && Number.isFinite(parseFloat(input.value))) input.value = parseFloat(input.value).toFixed(1);
}

function onRaceFirst3fBlur(input, raceNo) {
  _roundFirst3fInput(input);
  const info = allRacesData[raceNo]?.raceInfo; if (!info) return;
  info.first3f = input.value;
  if (!input.value) { info.first3fSource = ''; _applyFirst3fAutofillToRace(raceNo); }
  updateRacePace(raceNo); _updateFirst3fSourceBadge(raceNo);
}
function onRaceAgari3fBlur(input, raceNo) { _roundFirst3fInput(input); onRaceAgari3fInput(input, raceNo); }
function onRaceAgari4fBlur(input, raceNo) { _roundFirst3fInput(input); onRaceAgari4fInput(input, raceNo); }

function _syncRacePaceUi(raceNo, pace, manual) {
  const info = allRacesData[raceNo]?.raceInfo; if (!info) return;
  info.paceType = pace || ''; info.manualPace = !!(manual && pace);
  const badge = document.getElementById(`pace-badge-${raceNo}`);
  if (badge) {
    badge.textContent = info.paceType || '－';
    badge.className = info.paceType && typeof getPaceBadgeClass === 'function'
      ? `pace-badge ${getPaceBadgeClass(info.paceType)}` : 'pace-badge pace-none';
  }
  document.querySelectorAll(`#race-section-${raceNo} .pace-btn`).forEach(button => {
    button.classList.toggle('active', button.textContent.trim() === info.paceType);
  });
  const f3 = parseFloat(document.getElementById(`race-first3f-${raceNo}`)?.value);
  const ag3 = parseFloat(document.getElementById(`race-agari3f-${raceNo}`)?.value);
  if (typeof _updateRqsStrip === 'function') _updateRqsStrip(raceNo, f3, ag3, info.paceType);
  if (raceNo === currentRaceNo && typeof updateRaceSummaryBar === 'function') updateRaceSummaryBar(raceNo);
}

/** Apply the DB-authoritative value after conflict protection/backfill. */
function _applyFirst3fSaveResult(saved, raceRow, info, raceNo) {
  const body = Array.isArray(saved?.result) ? saved.result[0] : saved?.result;
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'first3f')) return false;
  const value = body.first3f == null ? '' : String(body.first3f);
  const source = body.first3f_source == null ? '' : String(body.first3f_source);
  const hasPace = Object.prototype.hasOwnProperty.call(body, 'pace_type');
  raceRow.first3f = value; raceRow.first3f_source = source;
  if (info) { info.first3f = value; info.first3fSource = source; }
  if (hasPace) {
    raceRow.pace_type = body.pace_type == null ? '' : String(body.pace_type);
    if (info) info.paceType = raceRow.pace_type;
  }
  if (raceNo != null) {
    const input = document.getElementById(`race-first3f-${raceNo}`);
    if (input) input.value = value;
    _updateFirst3fSourceBadge(raceNo);
    if (typeof updateRacePace === 'function') updateRacePace(raceNo);
    if (hasPace) _syncRacePaceUi(raceNo, raceRow.pace_type, true);
  }
  return true;
}

/** Local cache backfill. Shared DB writes go through the blank-only RPC. */
function backfillFirst3fFrom1400m() {
  const lsData = lsRead();
  const winTime = {};
  for (const [hk, hv] of Object.entries(lsData)) {
    if (!hv || hv.type !== 'horse' || hv.fromOfficial || String(hv.chakujun) !== '1') continue;
    const t = raceTimeToSec(hv.time);
    if (!t) continue;
    const p = hk.split('_');
    if (p.length >= 4) winTime[`${p[0]}_${p[1]}_${p[2]}`] = t;
  }
  const count = { 1300:0, 1400:0, 1600:0 };
  for (const [key, race] of Object.entries(lsData)) {
    if (!key.startsWith('race_')) continue;
    const dist = String(race.distance || race.dist || '').replace(/[^\d]/g, '');
    if (!Object.prototype.hasOwnProperty.call(count, dist) || String(race.first3f || '').trim()) continue;
    const raceNo = String(race.race_no || '');
    const win = winTime[`${race.baba_code}_${race.race_date}_${raceNo}`];
    if (!race.baba_code || !race.race_date || !raceNo || !win) continue;
    const calc = calculateRaceFirst3f(dist, win, race.agari4f, race.agari3f_race, race.track_cond);
    if (!calc) continue;
    lsWrite(key, { ...race, first3f:calc.value, first3fSource:calc.source });
    count[dist]++;
  }
  const total = count[1300] + count[1400] + count[1600];
  if (total) console.log(`[backfillF3] 前半3F補完: 1300m=${count[1300]} / 1400m=${count[1400]} / 1600m=${count[1600]}`);
  return total;
}

let _first3fServerBackfillPromise = null;
let _first3fServerBackfillDone = false;

/** Shared DB backfill; the SQL RPC atomically updates blank race values only. */
async function apiBackfillFirst3f(options) {
  if (_first3fServerBackfillDone && !options?.force) return { skipped:true };
  if (_first3fServerBackfillPromise) return _first3fServerBackfillPromise;
  const token = getWriteToken();
  if (!token) throw new Error('管理者認証がありません');
  _first3fServerBackfillPromise = (async () => {
    let response;
    try {
      response = await fetch(`${WORKER_URL}/rpc/backfill-keiba-first3f`, {
        method:'POST',
        headers:{'Content-Type':'application/json','X-Write-Token':token},
        body:'{}',
        signal:AbortSignal.timeout(30000),
      });
    } catch (cause) {
      throw new Error('前半3Fの共有DB補完に失敗しました', { cause });
    }
    const raw = await response.text();
    if (!response.ok) throw new Error(`前半3Fの共有DB補完に失敗しました（HTTP ${response.status}）${raw ? `: ${raw.slice(0, 240)}` : ''}`);
    _first3fServerBackfillDone = true;
    try { return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; }
  })().finally(() => { _first3fServerBackfillPromise = null; });
  return _first3fServerBackfillPromise;
}

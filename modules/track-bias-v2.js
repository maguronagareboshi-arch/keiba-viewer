/* 高知・馬場差v2。画面用の純時計値とAI用の展開補正値を同じ材料から生成する。 */
const TRACK_BIAS_TOP3_CENTER_SEC = 0.32;
// 1秒以上の圧勝は、勝ち馬の能力差を馬場の速さとして取り込まない。
// C3 7,196R監査: 1秒以上=15.5%、通常の上位3頭平均を約0.50秒押し上げた。
const TRACK_BIAS_RUNAWAY_MARGIN_SEC = 1.0;
const TRACK_BIAS_ERA_OFFSET = Object.freeze({
  2014:0.50,2015:0.50,2016:0.23,2017:0.28,2018:0.24,2019:0.28,2020:0.24,
  2021:0.24,2022:0.21,2023:-0.13,2024:-0.13,2025:-0.13,2026:-0.58,
});
if (!window._dayBiasRowsCache) window._dayBiasRowsCache = {};
if (!window._dayBiasMetaCache) window._dayBiasMetaCache = {};
if (!window._dayBiasCache) window._dayBiasCache = {};

function _trimmedBiasMedian(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  if (valid.length < 4) return calcMedian(valid);
  const med = calcMedian([...valid]);
  const trimmed = valid.filter(v => Math.abs(v - med) <= 2.0);
  return calcMedian(trimmed.length >= 2 ? trimmed : valid);
}

/**
 * 1レースの馬場差用代表時計。
 * 通常は上位3頭平均、1着が2着に1.0秒以上離した場合は2・3着平均を使う。
 * 圧勝馬が転入馬かどうかに依存させないことで、履歴不足や表記揺れでも補正漏れを防ぐ。
 */
function _raceBiasCenter(top3) {
  if (!Array.isArray(top3) || top3.length !== 3 || top3.some(h => !Number.isFinite(h.time))) {
    return { center:null, top3Avg:null, winMargin:null, runawayAdjusted:false };
  }
  const top3Avg = top3.reduce((sum,h) => sum + h.time,0) / 3;
  const winMargin = Math.max(0, top3[1].time - top3[0].time);
  const runawayAdjusted = winMargin >= TRACK_BIAS_RUNAWAY_MARGIN_SEC;
  const center = runawayAdjusted ? (top3[1].time + top3[2].time) / 2 : top3Avg;
  return {
    center:+center.toFixed(3), top3Avg:+top3Avg.toFixed(3),
    winMargin:+winMargin.toFixed(3), runawayAdjusted,
  };
}

// 表示・監査用の補助情報。判定自体は履歴の有無に依存させない。
function _isFirstKochiTransferWinner(horseName,babaCode,raceDate,raceNo) {
  if (String(babaCode) !== '31' || !horseName || typeof getHorseHistoryBefore !== 'function') return false;
  const prior = getHorseHistoryBefore(horseName,raceDate,raceNo);
  return prior.some(h => String(h.babaCode) !== '31') && !prior.some(h => String(h.babaCode) === '31');
}

function _collectDayBiasRows(babaCode, raceDate) {
  const cacheKey = `${babaCode}_${raceDate}`;
  if (window._dayBiasRowsCache[cacheKey]) return window._dayBiasRowsCache[cacheKey];
  const { raceInfoMap, horsesByRace } = _buildDayRaceData(babaCode, raceDate);
  const rows = [];
  for (const [rno, raceInfo] of raceInfoMap) {
    const rawClass = raceInfo.race_class || raceInfo.raceClass || '';
    if (is2yo(rawClass)) continue;
    const dist = getDistNum(raceInfo.distance);
    const effCls = getEffectiveClass(rawClass);
    const stdTime = dist && effCls ? STANDARD_TIMES[dist]?.[effCls] : null;
    if (stdTime == null) continue;
    const top3 = (horsesByRace.get(rno) || [])
      .map(v => ({
        chaku:parseInt(v.chakujun) || 999,
        time:raceTimeToSec(v.time),
        horseName:v.horseName || v.horse_name || '',
      }))
      .filter(h => h.chaku >= 1 && h.chaku <= 3 && h.time != null)
      .sort((a,b) => a.chaku - b.chaku).slice(0,3);
    if (top3.length !== 3) continue;
    const centerInfo = _raceBiasCenter(top3);
    const avg = centerInfo.center;
    const trackCond = raceInfo.track_cond || raceInfo.trackCond || '';
    const condStd = COND_STANDARDS[dist]?.[effCls]?.[trackCond];
    const first3f = parseFloat(raceInfo.first3f || '');
    const standardF3 = getStandardF3(dist,is3yo(rawClass) ? '3歳' : effCls,trackCond);
    const paceCorrection = isFinite(first3f) && first3f > 0 && standardF3 != null
      ? (first3f - standardF3) * PACE_BIAS_CORR_FACTOR : null;
    rows.push({
      raceNo:Number(rno),dist,effCls,trackCond,
      top3Avg:centerInfo.top3Avg,
      centerTime:centerInfo.center,
      winMargin:centerInfo.winMargin,
      runawayAdjusted:centerInfo.runawayAdjusted,
      transferWinner:centerInfo.runawayAdjusted
        ? _isFirstKochiTransferWinner(top3[0].horseName,babaCode,raceDate,rno) : false,
      rawDiff:+(avg - stdTime).toFixed(3),
      condDiff:condStd == null ? null : +(avg - condStd).toFixed(3),
      paceCorrection:paceCorrection == null ? null : +paceCorrection.toFixed(3),
      aiDiff:+(avg - stdTime + (paceCorrection || 0)).toFixed(3),
    });
  }
  window._dayBiasRowsCache[cacheKey] = rows;
  return rows;
}

function getTrackBiasEraOffset(raceDate) {
  const year = parseInt(String(raceDate || '').match(/\d{4}/)?.[0] || '',10);
  return Number.isFinite(year) ? (TRACK_BIAS_ERA_OFFSET[year] || 0) : 0;
}

function getDayBiasMeta(babaCode,raceDate,excludeRaceNo) {
  const excluded = Number.parseInt(excludeRaceNo,10) || 0;
  const cacheKey = `${babaCode}_${raceDate}_${excluded || 'all'}`;
  if (window._dayBiasMetaCache[cacheKey]) return window._dayBiasMetaCache[cacheKey];
  const rows = _collectDayBiasRows(babaCode,raceDate)
    .filter(r => !excluded || r.raceNo !== excluded);
  const bias = _trimmedBiasMedian(rows.map(r => r.rawDiff));
  const aiBias = _trimmedBiasMedian(rows.map(r => r.aiDiff));
  const conditions = {};
  rows.forEach(r => { if (r.trackCond) conditions[r.trackCond] = (conditions[r.trackCond] || 0) + 1; });
  const byDist = {};
  for (const dist of [...new Set(rows.map(r => r.dist))]) {
    const distRows = rows.filter(r => r.dist === dist);
    byDist[dist] = {
      bias:distRows.length >= 3 ? _trimmedBiasMedian(distRows.map(r => r.rawDiff)) : null,
      aiBias:distRows.length >= 3 ? _trimmedBiasMedian(distRows.map(r => r.aiDiff)) : null,
      n:distRows.length,
    };
  }
  const confidence = rows.length >= 6 ? 'high' : rows.length >= 3 ? 'medium' : 'low';
  const result = {
    bias,aiBias,count:rows.length,confidence,byDist,conditions,
    mixed:Object.keys(conditions).length > 1,
    excludeRaceNo:excluded || null,
    runawayAdjustedCount:rows.filter(r => r.runawayAdjusted).length,
    transferRunawayCount:rows.filter(r => r.transferWinner).length,
  };
  window._dayBiasMetaCache[cacheKey] = result;
  if (!excluded) window._dayBiasCache[`${babaCode}_${raceDate}`] = aiBias;
  return result;
}

function getDayBiasForDate(babaCode,raceDate,excludeRaceNo) {
  return getDayBiasMeta(babaCode,raceDate,excludeRaceNo).aiBias;
}

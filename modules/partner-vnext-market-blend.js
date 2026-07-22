/*
 * T10市場75% + vNext能力25%の固定相手ブレンド。
 * 純粋計算だけを持ち、公開印・totalScore・買い目・保存先には触れない。
 */
(function(factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.KvVnextMarketBlend = api;
})(function() {
  'use strict';

  const EPSILON = 1e-4;
  const CONTRACT = Object.freeze({
    schemaVersion:'kochi_partner_vnext_market_blend/browser_scorer_v1',
    modelId:'kochi-t10-vnext-blend-mainline-v1',
    status:'shadow_only',
    productionMarksAllowed:false,
    valueBetAdviceAllowed:false,
    marketWeight:0.75,
    abilityWeight:0.25,
    marketProbability:'clip(3*normalized_inverse_win_odds,1e-4,1-1e-4)',
    blend:'0.25*logit(vnext_top3_probability)+0.75*logit(market_probability)',
    tieBreak:'umaBan-asc',
  });

  const finite = value => {
    if (value == null || typeof value === 'boolean') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const clip = value => Math.min(1 - EPSILON, Math.max(EPSILON, value));
  const logit = probability => {
    const p = clip(probability);
    return Math.log(p / (1 - p));
  };
  const sigmoid = value => value >= 0
    ? 1 / (1 + Math.exp(-value))
    : Math.exp(value) / (1 + Math.exp(value));

  function scoreRace(runners, vnextApi) {
    if (!Array.isArray(runners) || runners.length < 4) return { ok:false, reason:'fewer_than_4' };
    if (!vnextApi || typeof vnextApi.scoreRace !== 'function') return { ok:false, reason:'vnext_unavailable' };
    const rows = runners.map(runner => ({
      u:Number.parseInt(runner && (runner.u ?? runner.umaBan), 10),
      name:String((runner && runner.name) || ''),
      currentScore:finite(runner && runner.currentScore),
      odds:finite(runner && runner.odds),
      raw:(runner && runner.raw && typeof runner.raw === 'object') ? runner.raw : null,
    }));
    if (rows.some(row => !Number.isInteger(row.u) || row.u <= 0)) return { ok:false, reason:'invalid_uma' };
    if (new Set(rows.map(row => row.u)).size !== rows.length) return { ok:false, reason:'duplicate_uma' };
    if (rows.some(row => row.currentScore === null)) return { ok:false, reason:'missing_current_score' };
    if (rows.some(row => row.odds === null || row.odds <= 0)) return { ok:false, reason:'incomplete_market' };
    if (rows.some(row => !row.raw)) return { ok:false, reason:'missing_vnext_features' };

    const ability = vnextApi.scoreRace(rows.map(row => ({
      u:row.u, name:row.name, currentScore:row.currentScore, raw:row.raw,
    })));
    if (!ability || !ability.ok || !ability.anchor) {
      return { ok:false, reason:`vnext_${ability && ability.reason || 'failed'}` };
    }
    const inverseTotal = rows.reduce((sum, row) => sum + 1 / row.odds, 0);
    if (!Number.isFinite(inverseTotal) || inverseTotal <= 0) return { ok:false, reason:'invalid_market_sum' };
    const marketByUma = new Map(rows.map(row => [row.u, clip(3 * (1 / row.odds) / inverseTotal)]));
    const ranked = ability.ranked.map(row => {
      const marketProbability = marketByUma.get(row.u);
      const abilityProbability = finite(row.probability);
      if (abilityProbability === null) return null;
      const blendLinear = CONTRACT.abilityWeight * logit(abilityProbability) +
        CONTRACT.marketWeight * logit(marketProbability);
      return {
        u:row.u,
        name:row.name,
        probability:sigmoid(blendLinear),
        linear:blendLinear,
        abilityProbability,
        marketProbability,
      };
    });
    if (ranked.some(row => !row)) return { ok:false, reason:'invalid_vnext_probability' };
    ranked.sort((a, b) => b.linear - a.linear || a.u - b.u);
    return {
      ok:true,
      status:'shadow_only',
      productionMarksAllowed:false,
      valueBetAdviceAllowed:false,
      anchor:{ u:ability.anchor.u, name:ability.anchor.name },
      ranked,
      top3:[ability.anchor.u, ...ranked.slice(0, 2).map(row => row.u)],
    };
  }

  return Object.freeze({ contract:CONTRACT, scoreRace });
});

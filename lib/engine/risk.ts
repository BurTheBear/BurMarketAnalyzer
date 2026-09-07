export interface RiskInput { account: number; riskPercent: number; entry: number; stop: number; target: number; side: 'BUY' | 'SELL'; costBps: number; step: number }
/** Cash-capped position sizing with explicit fees/slippage and quantity rounding. */
export function calculateRisk(p: RiskInput) {
  if (!Object.values(p).filter(x => typeof x === 'number').every(x => Number.isFinite(x)) || p.account <= 0 || p.entry <= 0 || p.stop <= 0 || p.target <= 0 || p.riskPercent <= 0 || p.riskPercent > 100 || p.step <= 0 || p.costBps < 0 || p.costBps > 1000) throw new Error('Enter positive prices, account size, and risk between 0 and 100%.');
  const direction = p.side === 'BUY' ? 1 : -1;
  const perUnit = (p.entry - p.stop) * direction, grossReward = (p.target - p.entry) * direction;
  if (perUnit <= 0 || grossReward <= 0) throw new Error(p.side === 'BUY' ? 'For a BUY: stop < entry < target.' : 'For a SELL: target < entry < stop.');
  const cost = p.entry * p.costBps / 10000, budget = p.account * p.riskPercent / 100;
  const raw = Math.min(budget / (perUnit + cost), p.account / (p.entry + cost));
  const quantity = Math.floor((raw + Number.EPSILON) / p.step) * p.step;
  return { quantity, notional: quantity * p.entry, loss: quantity * (perUnit + cost), profit: quantity * (grossReward - cost), fees: quantity * cost, ratio: (grossReward - cost) / (perUnit + cost), budget, cashCapped: raw < budget / (perUnit + cost) };
}

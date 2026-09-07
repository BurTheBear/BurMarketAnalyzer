import type { Symbol, Book } from '../market/types';
export interface Position { quantity: number; cost: number }
export interface PaperAccount { cash: number; realized: number; fees: number; positions: Partial<Record<Symbol,Position>> }
// Quote balances use integer micro-USDT; quantities use 1e-8 base units. BigInt intermediates avoid multiplication loss.
export const QUOTE = 1_000_000, BASE = 100_000_000;
export const initialAccount = (): PaperAccount => ({ cash: 100_000 * QUOTE, realized: 0, fees: 0, positions: {} });
export function quoteCost(price: number, units: number): number { return Number((BigInt(Math.round(price * QUOTE)) * BigInt(units) + BigInt(BASE / 2)) / BigInt(BASE)); }
export function simulateFill(book: Book, side: 'BUY'|'SELL', quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new Error('Invalid order quantity');
  if (Date.now() - book.time > 5000) throw new Error('Market quote is stale');
  let remaining = Math.round(quantity * BASE), cost = 0; const units = remaining;
  for (const [price, size] of side === 'BUY' ? book.asks : book.bids) {
    const taken = Math.min(remaining, Math.floor(size * BASE)); cost += quoteCost(price, taken); remaining -= taken; if (!remaining) break;
  }
  if (remaining) throw new Error('Not enough visible depth to simulate this order');
  const average = cost / QUOTE / (units / BASE);
  // One basis point adverse slippage plus 10 bps taker fee, both explicit in the order review.
  const slippedCost = Math.round(cost * (side === 'BUY' ? 1.0001 : .9999)), fee = Math.ceil(slippedCost * .001);
  return { units, cost: slippedCost, fee, price: slippedCost / QUOTE / (units / BASE), bookPrice: average, time: book.time };
}
export function applyFill(account: PaperAccount, symbol: Symbol, side: 'BUY'|'SELL', fill: ReturnType<typeof simulateFill>): PaperAccount {
  const next = structuredClone(account), position = next.positions[symbol] ?? { quantity: 0, cost: 0 };
  if (side === 'BUY') {
    if (fill.cost + fill.fee > next.cash) throw new Error('Insufficient paper cash');
    next.cash -= fill.cost + fill.fee; position.quantity += fill.units; position.cost += fill.cost + fill.fee;
  } else {
    if (position.quantity < fill.units) throw new Error('Insufficient holdings. Spot SELL orders close owned inventory.');
    const allocated = Number(BigInt(position.cost) * BigInt(fill.units) / BigInt(position.quantity));
    position.quantity -= fill.units; position.cost -= allocated; next.cash += fill.cost - fill.fee; next.realized += fill.cost - fill.fee - allocated;
  }
  next.fees += fill.fee; next.positions[symbol] = position; return next;
}

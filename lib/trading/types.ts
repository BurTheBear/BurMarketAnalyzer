import type { DecisionEvidence } from '../engine/evidence';
import type { Symbol } from '../market/types';
import type { Estimate } from '../engine/signals';
export type Target = 'paper' | 'binance';
export interface Proposal { id: string; symbol: Symbol; side: 'BUY'|'SELL'; quantity: number; target: Target; referencePrice: number; estimatedNotional: number; estimatedFee: number; maxSlippage: number; expiresAt: number; bot: boolean; reason: string; estimate?: Estimate; evidence?:DecisionEvidence; status: string; fill?: { price: number; quantity: number; fee: number }; exchange?: { orderId: number; status: string; executedQty: string; cummulativeQuoteQty: string }; error?: string }

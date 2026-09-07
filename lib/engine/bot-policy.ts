import { STRATEGY } from './signals';
import type { Signal } from './pipeline';
export interface BotParameters { minimumReliability: number; minimumSamples: number }
export const DEFAULT_BOT_PARAMETERS: BotParameters = { minimumReliability: 60, minimumSamples: 30 };
/** This estimate measures the defined target-before-stop outcome, not certainty of a price rise. */
export function botEligibility(signal: Signal | null | undefined, parameters: BotParameters): { allowed: boolean; reason: string } {
  if (!signal || signal.action === 'HOLD') return { allowed: false, reason: 'HOLD · waiting for aligned factors on a completed candle.' };
  const { percent, samples } = signal.estimate;
  if (percent === null || !Number.isFinite(percent)) return { allowed: false, reason: 'Waiting for resolved historical trials. No reliability estimate is available.' };
  if (samples < parameters.minimumSamples) return { allowed: false, reason: `Learning · ${samples}/${parameters.minimumSamples} required trials. Estimate ${percent.toFixed(1)}%.` };
  if (percent < parameters.minimumReliability) return { allowed: false, reason: `Filtered · ${percent.toFixed(1)}% estimated success is below your ${parameters.minimumReliability}% minimum.` };
  if(Math.abs(signal.target-signal.entry)/signal.entry<=STRATEGY.costBps/10000)return {allowed:false,reason:'Filtered · the planned target does not cover estimated round-trip costs.'};
  return { allowed: true, reason: `${signal.action} · ${percent.toFixed(1)}% estimated success · ${samples} resolved trials.` };
}
export function validBotParameters(value: unknown): value is BotParameters {
  if (!value || typeof value !== 'object') return false;
  const p = value as BotParameters;
  return Number.isFinite(p.minimumReliability) && p.minimumReliability >= 0 && p.minimumReliability <= 100 && Number.isInteger(p.minimumSamples) && p.minimumSamples >= 1 && p.minimumSamples <= 300;
}

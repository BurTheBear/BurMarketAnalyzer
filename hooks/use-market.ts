'use client';
import { useEffect, useState } from 'react';
import MarketWorker from '../workers/market.worker.ts?worker';
import type { Source } from '@/lib/market/alternate';
import { mergeUpdate, type MarketUpdate } from '@/lib/market/wire';
import type { Snapshot } from '@/lib/engine/pipeline';
import { SYMBOLS, type Interval, type Mode, type Symbol } from '@/lib/market/types';
export function useMarket(source: Source, interval: Interval, revision: number) {
  const mode:Mode=source==='replay'?'replay':'live';
  const [markets, setMarkets] = useState<Partial<Record<Symbol, Snapshot>>>({});
  useEffect(() => {
    setMarkets({});
    const worker = new MarketWorker();
    worker.onmessage = ({ data }: MessageEvent<MarketUpdate>) => setMarkets(current => ({ ...current, [data.data.symbol]: mergeUpdate(current[data.data.symbol],data) }));
    worker.onerror = () => setMarkets(current => Object.fromEntries(SYMBOLS.map(symbol => [symbol, { ...current[symbol], symbol, mode, interval, points: [], current: null, book: null, signal: null, signals: [], updatedAt: Date.now(), status: 'error', error: 'Analysis worker could not start. Reload the page.' }])));
    worker.postMessage({ source, interval, origin: window.location.origin });
    return () => worker.terminate();
  }, [source, interval, revision]);
  return markets;
}

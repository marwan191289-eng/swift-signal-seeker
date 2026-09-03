import { useEffect, useRef, useState } from "react";

export type FeedStatus = "connecting" | "live" | "simulated";

export type LiveState = {
  price: number | null;
  prev: number | null;
  status: FeedStatus;
  source: string;
  updatedAt: number | null;
  ticks: { t: number; p: number }[];
};

const SYMBOLS = ["R_80", "1HZ80V", "R_75", "R_100"];

/**
 * Live price for the Volatility 80 index.
 * Tries the public Deriv tick stream from the browser; if the feed is not
 * reachable (region blocked / offline) it falls back to a volatility-matched
 * local simulation anchored on the last historical close, clearly flagged.
 */
export function useLiveTicks(baseline: number | null, sigmaPct: number) {
  const [state, setState] = useState<LiveState>({
    price: null,
    prev: null,
    status: "connecting",
    source: "…",
    updatedAt: null,
    ticks: [],
  });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (baseline == null) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let gotLive = false;
    let symbolIdx = 0;

    const push = (p: number, status: FeedStatus, source: string) =>
      setState((s) => ({
        price: p,
        prev: s.price,
        status,
        source,
        updatedAt: Date.now(),
        ticks: [...s.ticks, { t: Date.now(), p }].slice(-180),
      }));

    const startSim = () => {
      if (closed || timer.current) return;
      let p = state.price ?? baseline;
      const sigma = Math.max(sigmaPct, 0.02) / 100;
      timer.current = setInterval(() => {
        p = p * (1 + (Math.random() * 2 - 1) * sigma * 0.9);
        push(p, "simulated", "محاكاة محلية (تقلب مطابق للبيانات)");
      }, 1000);
      push(baseline, "simulated", "محاكاة محلية (تقلب مطابق للبيانات)");
    };

    const trySymbol = () => {
      if (closed || symbolIdx >= SYMBOLS.length) {
        startSim();
        return;
      }
      const symbol = SYMBOLS[symbolIdx++];
      try {
        ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
      } catch {
        startSim();
        return;
      }
      const guard = setTimeout(() => {
        if (!gotLive) {
          ws?.close();
          trySymbol();
        }
      }, 6000);
      ws.onopen = () => ws?.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data as string);
        if (d.error) {
          clearTimeout(guard);
          ws?.close();
          trySymbol();
          return;
        }
        if (d.tick?.quote != null) {
          gotLive = true;
          clearTimeout(guard);
          push(Number(d.tick.quote), "live", `Deriv · ${symbol}`);
        }
      };
      ws.onerror = () => {
        clearTimeout(guard);
        ws?.close();
        trySymbol();
      };
      ws.onclose = () => {
        clearTimeout(guard);
        if (gotLive && !closed) {
          gotLive = false;
          symbolIdx = 0;
          setTimeout(trySymbol, 2000);
        }
      };
    };

    trySymbol();
    return () => {
      closed = true;
      ws?.close();
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline]);

  return state;
}

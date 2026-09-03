export type Candle = {
  time: string;
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SignalKind = "Buy" | "Sell" | "Hold";

export type Row = Candle & {
  ema9: number | null;
  ema21: number | null;
  rsi: number | null;
  atr: number | null;
  sticky: SignalKind;
  cross: SignalKind; // only the first candle where the condition flips
};

export const TIMEFRAMES = ["M1", "M5", "M30", "H1", "Weekly"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TF_LABEL: Record<Timeframe, string> = {
  M1: "دقيقة",
  M5: "٥ دقائق",
  M30: "٣٠ دقيقة",
  H1: "ساعة",
  Weekly: "أسبوعي",
};

/** MetaTrader export rows: [time, open, high, low, close, volume] */
export type RawRow = [string, number, number, number, number, number];

function parseTime(s: string): number {
  // "2026.09.03 04:35" or "2026.08.30"
  const [d, t = "00:00"] = s.split(" ");
  const [y, mo, da] = d.split(".").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return Date.UTC(y, (mo ?? 1) - 1, da ?? 1, h ?? 0, mi ?? 0);
}

export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(values.length).fill(null);
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI, same as TA-Lib. */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** Wilder's ATR, same as TA-Lib. */
export function atr(
  high: number[],
  low: number[],
  close: number[],
  period = 14,
): (number | null)[] {
  const out: (number | null)[] = new Array(close.length).fill(null);
  if (close.length <= period) return out;
  const tr: number[] = [high[0] - low[0]];
  for (let i = 1; i < close.length; i++) {
    tr.push(
      Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1]),
      ),
    );
  }
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < close.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function stickySignal(
  e9: number | null,
  e21: number | null,
  r: number | null,
): SignalKind {
  if (e9 == null || e21 == null || r == null) return "Hold";
  if (e9 > e21 && r > 55) return "Buy";
  if (e9 < e21 && r < 45) return "Sell";
  return "Hold";
}

export function buildRows(raw: RawRow[]): Row[] {
  const close = raw.map((r) => r[4]);
  const high = raw.map((r) => r[2]);
  const low = raw.map((r) => r[3]);
  const e9 = ema(close, 9);
  const e21 = ema(close, 21);
  const r14 = rsi(close, 14);
  const a14 = atr(high, low, close, 14);

  let prevState: SignalKind = "Hold";
  return raw.map((r, i) => {
    const sticky = stickySignal(e9[i], e21[i], r14[i]);
    const cross: SignalKind = sticky !== prevState && sticky !== "Hold" ? sticky : "Hold";
    prevState = sticky;
    return {
      time: r[0],
      t: parseTime(r[0]),
      open: r[1],
      high: r[2],
      low: r[3],
      close: r[4],
      volume: r[5] ?? 0,
      ema9: e9[i],
      ema21: e21[i],
      rsi: r14[i],
      atr: a14[i],
      sticky,
      cross,
    };
  });
}

export type Counts = { buy: number; sell: number; hold: number; total: number };

export function countSignals(rows: Row[], mode: "sticky" | "cross"): Counts {
  const c: Counts = { buy: 0, sell: 0, hold: 0, total: rows.length };
  for (const r of rows) {
    const s = mode === "sticky" ? r.sticky : r.cross;
    if (s === "Buy") c.buy++;
    else if (s === "Sell") c.sell++;
    else c.hold++;
  }
  return c;
}

export type Stats = {
  avgRange: number;
  avgRangePct: number;
  volatility: number; // stdev of candle returns, %
  atr: number;
  lastClose: number;
  changePct: number;
};

export function computeStats(rows: Row[]): Stats {
  const n = rows.length;
  if (!n)
    return {
      avgRange: 0,
      avgRangePct: 0,
      volatility: 0,
      atr: 0,
      lastClose: 0,
      changePct: 0,
    };
  const window = rows.slice(-500);
  let range = 0;
  const rets: number[] = [];
  for (let i = 0; i < window.length; i++) {
    range += window[i].high - window[i].low;
    if (i > 0) rets.push((window[i].close / window[i - 1].close - 1) * 100);
  }
  const avgRange = range / window.length;
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance =
    rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
  const last = rows[n - 1];
  return {
    avgRange,
    avgRangePct: (avgRange / last.close) * 100,
    volatility: Math.sqrt(variance),
    atr: last.atr ?? 0,
    lastClose: last.close,
    changePct: (last.close / window[0].close - 1) * 100,
  };
}

export type Trade = {
  side: "Buy" | "Sell";
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  pnlPct: number;
  equity: number;
};

export type Backtest = {
  trades: Trade[];
  equityCurve: { t: number; time: string; equity: number }[];
  finalEquity: number;
  returnPct: number;
  winRate: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
};

/**
 * Always-in-the-market reversal backtest:
 * open a position on a crossover signal, close it when the opposite signal fires.
 */
export function backtest(
  rows: Row[],
  opts: { capital: number; feePct: number; mode: "sticky" | "cross" },
): Backtest {
  const { capital, feePct, mode } = opts;
  let equity = capital;
  let peak = capital;
  let maxDrawdown = 0;
  const trades: Trade[] = [];
  const equityCurve: { t: number; time: string; equity: number }[] = [];
  let open: { side: "Buy" | "Sell"; price: number; time: string } | null = null;

  for (const r of rows) {
    const sig = mode === "cross" ? r.cross : r.sticky;
    if (sig !== "Hold" && (!open || open.side !== sig)) {
      if (open) {
        const gross =
          open.side === "Buy"
            ? (r.close / open.price - 1) * 100
            : (open.price / r.close - 1) * 100;
        const pnlPct = gross - feePct * 2;
        equity *= 1 + pnlPct / 100;
        trades.push({
          side: open.side,
          entryTime: open.time,
          exitTime: r.time,
          entry: open.price,
          exit: r.close,
          pnlPct,
          equity,
        });
      }
      open = { side: sig, price: r.close, time: r.time };
    }
    const mark = open
      ? equity *
        (1 +
          ((open.side === "Buy"
            ? (r.close / open.price - 1) * 100
            : (open.price / r.close - 1) * 100) -
            feePct) /
            100)
      : equity;
    peak = Math.max(peak, mark);
    maxDrawdown = Math.max(maxDrawdown, ((peak - mark) / peak) * 100);
    equityCurve.push({ t: r.t, time: r.time, equity: mark });
  }

  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct <= 0);
  const grossWin = wins.reduce((a, b) => a + b.pnlPct, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnlPct, 0));
  return {
    trades,
    equityCurve,
    finalEquity: equity,
    returnPct: (equity / capital - 1) * 100,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    wins: wins.length,
    losses: losses.length,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxDrawdown,
  };
}

export const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

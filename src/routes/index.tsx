import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { toast, Toaster } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CandleChart } from "@/components/CandleChart";
import { useLiveTicks } from "@/hooks/useLiveTicks";
import {
  backtest,
  buildRows,
  computeStats,
  countSignals,
  fmt,
  TF_LABEL,
  TIMEFRAMES,
  type RawRow,
  type Row,
  type Timeframe,
} from "@/lib/indicators";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VOL 80 · لوحة إشارات السكالبينج المباشرة" },
      {
        name: "description",
        content:
          "لوحة تحكم تفاعلية لمؤشر VOL 80: شموع يابانية، إشارات EMA/RSI/ATR لحظة التقاطع، باك-تيست حقيقي، وسعر السوق المباشر.",
      },
      { property: "og:title", content: "VOL 80 · لوحة إشارات السكالبينج المباشرة" },
      {
        property: "og:description",
        content:
          "شموع يابانية وإشارات تقاطع EMA مع باك-تيست ومنحنى رأس المال وسعر مباشر لكل فريم زمني.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

async function loadTf(tf: Timeframe): Promise<Row[]> {
  const res = await fetch(`/data/${tf}.json`);
  const raw = (await res.json()) as RawRow[];
  return buildRows(raw);
}

const MODES = [
  { id: "cross", label: "لحظة التقاطع فقط" },
  { id: "sticky", label: "الإشارة العادية (مستمرة)" },
] as const;

function Card({
  title,
  extra,
  children,
  className = "",
}: {
  title?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-card p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] ${className}`}
    >
      {(title || extra) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2>
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  sub,
}: {
  label: string;
  value: string;
  tone?: "default" | "bull" | "bear" | "primary";
  sub?: string;
}) {
  const color =
    tone === "bull"
      ? "text-bull"
      : tone === "bear"
        ? "text-bear"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`font-mono text-lg font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Ratio({ buy, sell, hold }: { buy: number; sell: number; hold: number }) {
  const total = Math.max(buy + sell + hold, 1);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="bg-bull" style={{ width: `${(buy / total) * 100}%` }} />
      <div className="bg-bear" style={{ width: `${(sell / total) * 100}%` }} />
      <div className="bg-neutral/40" style={{ width: `${(hold / total) * 100}%` }} />
    </div>
  );
}

function Dashboard() {
  const [tf, setTf] = useState<Timeframe>("M5");
  const [mode, setMode] = useState<"cross" | "sticky">("cross");
  const [candles, setCandles] = useState(180);
  const [capital, setCapital] = useState(1000);
  const [feePct, setFeePct] = useState(0.02);
  const [notify, setNotify] = useState(true);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["tf", tf],
    queryFn: () => loadTf(tf),
    staleTime: Infinity,
  });

  const allTf = useQueries({
    queries: TIMEFRAMES.map((f) => ({
      queryKey: ["tf", f],
      queryFn: () => loadTf(f),
      staleTime: Infinity,
    })),
  });

  const stats = useMemo(() => (rows ? computeStats(rows) : null), [rows]);
  const crossCounts = useMemo(() => (rows ? countSignals(rows, "cross") : null), [rows]);
  const stickyCounts = useMemo(
    () => (rows ? countSignals(rows, "sticky") : null),
    [rows],
  );
  const bt = useMemo(
    () => (rows ? backtest(rows, { capital, feePct, mode }) : null),
    [rows, capital, feePct, mode],
  );

  const live = useLiveTicks(stats?.lastClose ?? null, stats?.volatility ?? 0.05);

  const lastSignalRow = useMemo(() => {
    if (!rows) return null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const s = mode === "cross" ? rows[i].cross : rows[i].sticky;
      if (s !== "Hold") return rows[i];
    }
    return null;
  }, [rows, mode]);

  const currentSignal = lastSignalRow
    ? mode === "cross"
      ? lastSignalRow.cross
      : lastSignalRow.sticky
    : "Hold";

  // notify on signal change
  const prevSig = useRef<string | null>(null);
  useEffect(() => {
    const key = `${tf}:${mode}:${lastSignalRow?.time}:${currentSignal}`;
    if (prevSig.current && prevSig.current !== key && currentSignal !== "Hold") {
      if (notify) {
        toast[currentSignal === "Buy" ? "success" : "error"](
          `إشارة جديدة: ${currentSignal === "Buy" ? "شراء" : "بيع"} على ${TF_LABEL[tf]}`,
          { description: `عند ${fmt(lastSignalRow?.close ?? 0, 0)} — ${lastSignalRow?.time}` },
        );
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(`VOL 80 — ${currentSignal}`, {
            body: `${TF_LABEL[tf]} @ ${fmt(lastSignalRow?.close ?? 0, 0)}`,
          });
        }
      }
    }
    prevSig.current = key;
  }, [tf, mode, currentSignal, lastSignalRow, notify]);

  const visible = useMemo(() => (rows ? rows.slice(-candles) : []), [rows, candles]);
  const equitySample = useMemo(() => {
    if (!bt) return [];
    const step = Math.max(1, Math.floor(bt.equityCurve.length / 600));
    return bt.equityCurve.filter((_, i) => i % step === 0);
  }, [bt]);

  const drift =
    live.price != null && stats ? ((live.price / stats.lastClose - 1) * 100) : null;

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <Toaster position="top-left" richColors dir="rtl" />

      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h1 className="font-mono text-lg font-bold tracking-tight text-primary">
              VOL&nbsp;80
            </h1>
            <span className="text-xs text-muted-foreground">لوحة السكالبينج · EMA9/EMA21 · RSI · ATR</span>
          </div>

          <div className="ms-auto flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                live.status === "live"
                  ? "animate-pulse bg-bull"
                  : live.status === "simulated"
                    ? "bg-primary"
                    : "bg-neutral"
              }`}
            />
            <span className="font-mono text-sm">
              {live.price != null ? fmt(live.price, 2) : "—"}
            </span>
            {drift != null && (
              <span
                className={`font-mono text-xs ${drift >= 0 ? "text-bull" : "text-bear"}`}
              >
                {drift >= 0 ? "▲" : "▼"} {fmt(Math.abs(drift), 3)}%
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">{live.source}</span>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-4 pb-3">
          <div className="flex rounded-lg border border-border p-0.5">
            {TIMEFRAMES.map((f) => (
              <button
                key={f}
                onClick={() => setTf(f)}
                className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
                  tf === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-border p-0.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  mode === m.id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            عدد الشموع
            <input
              type="range"
              min={60}
              max={600}
              step={20}
              value={candles}
              onChange={(e) => setCandles(Number(e.target.value))}
              className="accent-[var(--primary)]"
            />
            <span className="font-mono text-foreground">{candles}</span>
          </label>

          <button
            onClick={async () => {
              setNotify((v) => !v);
              if (!notify && typeof Notification !== "undefined")
                await Notification.requestPermission();
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              notify
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {notify ? "الإشعارات مفعّلة" : "الإشعارات متوقفة"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-4">
        {isLoading || !rows || !stats || !bt || !crossCounts || !stickyCounts ? (
          <div className="py-24 text-center text-sm text-muted-foreground">
            جاري تحميل بيانات {TF_LABEL[tf]}…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Stat
                label="الإشارة الحالية"
                value={
                  currentSignal === "Buy"
                    ? "شراء"
                    : currentSignal === "Sell"
                      ? "بيع"
                      : "انتظار"
                }
                tone={
                  currentSignal === "Buy" ? "bull" : currentSignal === "Sell" ? "bear" : "default"
                }
                sub={lastSignalRow?.time}
              />
              <Stat
                label="سعر الإغلاق الأخير"
                value={fmt(stats.lastClose, 0)}
                sub={rows[rows.length - 1].time}
              />
              <Stat
                label="السعر المباشر"
                value={live.price != null ? fmt(live.price, 2) : "—"}
                tone={drift != null && drift >= 0 ? "bull" : "bear"}
                sub={
                  live.status === "live"
                    ? "متصل بالسوق"
                    : live.status === "simulated"
                      ? "محاكاة (الفيد غير متاح)"
                      : "جاري الاتصال"
                }
              />
              <Stat label="RSI" value={fmt(rows[rows.length - 1].rsi ?? 0, 1)} tone="primary" />
              <Stat
                label="متوسط المدى (500 شمعة)"
                value={fmt(stats.avgRange, 0)}
                sub={`${fmt(stats.avgRangePct, 2)}% من السعر`}
              />
              <Stat
                label="التقلب لكل شمعة"
                value={`${fmt(stats.volatility, 3)}%`}
                sub={`ATR ${fmt(stats.atr, 0)}`}
              />
            </div>

            <Card
              title={`الشموع اليابانية — ${TF_LABEL[tf]} · آخر ${visible.length} شمعة`}
              extra={
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <i className="inline-block h-0.5 w-4 bg-primary" /> EMA9
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="inline-block h-0.5 w-4 bg-chart-4" /> EMA21
                  </span>
                  <span className="text-bull">▲ شراء</span>
                  <span className="text-bear">▼ بيع</span>
                </div>
              }
            >
              <CandleChart rows={visible} mode={mode} livePrice={live.price} />
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="مقارنة: لحظة التقاطع مقابل الإشارة العادية">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 text-start font-normal">النوع</th>
                      <th className="py-1 text-start font-normal">شراء</th>
                      <th className="py-1 text-start font-normal">بيع</th>
                      <th className="py-1 text-start font-normal">انتظار</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {(
                      [
                        ["لحظة التقاطع", crossCounts],
                        ["العادية", stickyCounts],
                      ] as const
                    ).map(([label, c]) => (
                      <tr key={label} className="border-t border-border">
                        <td className="py-2 font-sans">{label}</td>
                        <td className="py-2 text-bull">
                          {c.buy} <span className="text-[10px] text-muted-foreground">
                            {fmt((c.buy / c.total) * 100, 1)}%
                          </span>
                        </td>
                        <td className="py-2 text-bear">
                          {c.sell}{" "}
                          <span className="text-[10px] text-muted-foreground">
                            {fmt((c.sell / c.total) * 100, 1)}%
                          </span>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {c.hold}{" "}
                          <span className="text-[10px]">
                            {fmt((c.hold / c.total) * 100, 1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 space-y-2">
                  <Ratio {...crossCounts} />
                  <Ratio {...stickyCounts} />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  الإشارة العادية تبقى مفعّلة طول فترة تحقق الشرط، فتضخّم عدد الإشارات؛
                  أما لحظة التقاطع فتسجّل أول شمعة فقط — عددها أقل بكثير وهي الأساس
                  الصحيح لحساب الصفقات.
                </p>
              </Card>

              <Card title="نسب الإشارات لكل فريم" className="lg:col-span-2">
                <div className="space-y-3">
                  {TIMEFRAMES.map((f, i) => {
                    const d = allTf[i].data;
                    if (!d)
                      return (
                        <div key={f} className="text-xs text-muted-foreground">
                          {f} — تحميل…
                        </div>
                      );
                    const c = countSignals(d, mode);
                    const s = computeStats(d);
                    const last = d[d.length - 1];
                    const bias = c.buy === c.sell ? "متوازن" : c.buy > c.sell ? "صاعد" : "هابط";
                    return (
                      <button
                        key={f}
                        onClick={() => setTf(f)}
                        className={`w-full rounded-lg border p-3 text-start transition-colors ${
                          tf === f ? "border-primary/60 bg-primary/5" : "border-border hover:bg-accent/40"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className="w-16 font-mono font-semibold">{f}</span>
                          <span className="text-bull">شراء {c.buy}</span>
                          <span className="text-bear">بيع {c.sell}</span>
                          <span className="text-muted-foreground">
                            مدى {fmt(s.avgRange, 0)} ({fmt(s.avgRangePct, 2)}%)
                          </span>
                          <span className="text-muted-foreground">
                            تقلب {fmt(s.volatility, 3)}%
                          </span>
                          <span className="text-muted-foreground">
                            ATR {fmt(s.atr, 0)}
                          </span>
                          <span
                            className={`ms-auto rounded px-2 py-0.5 text-[11px] ${
                              (last.ema9 ?? 0) > (last.ema21 ?? 0)
                                ? "bg-bull/15 text-bull"
                                : "bg-bear/15 text-bear"
                            }`}
                          >
                            الاتجاه {bias}
                          </span>
                        </div>
                        <div className="mt-2">
                          <Ratio {...c} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>

            <Card
              title="باك-تيست — منحنى رأس المال"
              extra={
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <label className="flex items-center gap-1">
                    رأس المال
                    <input
                      type="number"
                      value={capital}
                      min={10}
                      onChange={(e) => setCapital(Number(e.target.value) || 1000)}
                      className="w-24 rounded border border-input bg-background px-2 py-1 font-mono text-foreground"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    العمولة %
                    <input
                      type="number"
                      step={0.01}
                      value={feePct}
                      onChange={(e) => setFeePct(Number(e.target.value) || 0)}
                      className="w-20 rounded border border-input bg-background px-2 py-1 font-mono text-foreground"
                    />
                  </label>
                </div>
              }
            >
              <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                <Stat
                  label="رأس المال النهائي"
                  value={fmt(bt.finalEquity, 0)}
                  tone={bt.returnPct >= 0 ? "bull" : "bear"}
                  sub={`${bt.returnPct >= 0 ? "+" : ""}${fmt(bt.returnPct, 1)}%`}
                />
                <Stat label="عدد الصفقات" value={String(bt.trades.length)} />
                <Stat
                  label="نسبة الربح"
                  value={`${fmt(bt.winRate, 1)}%`}
                  tone={bt.winRate >= 50 ? "bull" : "bear"}
                  sub={`${bt.wins} ربح / ${bt.losses} خسارة`}
                />
                <Stat label="متوسط الربح" value={`${fmt(bt.avgWin, 2)}%`} tone="bull" />
                <Stat label="متوسط الخسارة" value={`${fmt(bt.avgLoss, 2)}%`} tone="bear" />
                <Stat
                  label="معامل الربح"
                  value={Number.isFinite(bt.profitFactor) ? fmt(bt.profitFactor, 2) : "∞"}
                  tone={bt.profitFactor >= 1 ? "bull" : "bear"}
                />
                <Stat label="أقصى تراجع" value={`${fmt(bt.maxDrawdown, 1)}%`} tone="bear" />
              </div>

              <div dir="ltr" className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equitySample}>
                    <defs>
                      <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      minTickGap={60}
                    />
                    <YAxis
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      domain={["auto", "auto"]}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                      formatter={(v: number) => [fmt(v, 2), "رأس المال"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="var(--primary)"
                      strokeWidth={1.6}
                      fill="url(#eq)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="آخر الصفقات">
                <div className="max-h-[320px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card text-muted-foreground">
                      <tr>
                        <th className="py-1 text-start font-normal">الاتجاه</th>
                        <th className="py-1 text-start font-normal">الدخول</th>
                        <th className="py-1 text-start font-normal">الخروج</th>
                        <th className="py-1 text-start font-normal">النتيجة</th>
                        <th className="py-1 text-start font-normal">رأس المال</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {bt.trades
                        .slice(-40)
                        .reverse()
                        .map((t, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className={t.side === "Buy" ? "py-1.5 text-bull" : "py-1.5 text-bear"}>
                              {t.side === "Buy" ? "شراء" : "بيع"}
                            </td>
                            <td className="py-1.5">{fmt(t.entry, 0)}</td>
                            <td className="py-1.5">{fmt(t.exit, 0)}</td>
                            <td className={t.pnlPct >= 0 ? "py-1.5 text-bull" : "py-1.5 text-bear"}>
                              {t.pnlPct >= 0 ? "+" : ""}
                              {fmt(t.pnlPct, 2)}%
                            </td>
                            <td className="py-1.5">{fmt(t.equity, 0)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card
                title="السعر المباشر مقابل الإشارة"
                extra={
                  <span className="text-[11px] text-muted-foreground">{live.source}</span>
                }
              >
                <div className="grid grid-cols-2 gap-3">
                  <Stat
                    label="السعر الآن"
                    value={live.price != null ? fmt(live.price, 2) : "—"}
                    tone={
                      live.prev != null && live.price != null && live.price >= live.prev
                        ? "bull"
                        : "bear"
                    }
                  />
                  <Stat
                    label="الفارق عن إغلاق الشمعة"
                    value={drift != null ? `${drift >= 0 ? "+" : ""}${fmt(drift, 3)}%` : "—"}
                    tone={drift != null && drift >= 0 ? "bull" : "bear"}
                  />
                  <Stat
                    label="سعر دخول الإشارة"
                    value={lastSignalRow ? fmt(lastSignalRow.close, 0) : "—"}
                    sub={lastSignalRow?.time}
                  />
                  <Stat
                    label="ربح الصفقة المفتوحة"
                    value={
                      lastSignalRow && live.price != null
                        ? `${fmt(
                            currentSignal === "Buy"
                              ? (live.price / lastSignalRow.close - 1) * 100
                              : (lastSignalRow.close / live.price - 1) * 100,
                            3,
                          )}%`
                        : "—"
                    }
                    tone={
                      lastSignalRow && live.price != null
                        ? (currentSignal === "Buy"
                            ? live.price > lastSignalRow.close
                            : live.price < lastSignalRow.close)
                          ? "bull"
                          : "bear"
                        : "default"
                    }
                  />
                </div>
                <div dir="ltr" className="mt-3 h-[150px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={live.ticks}>
                      <defs>
                        <linearGradient id="tick" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--bull)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--bull)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                        width={60}
                      />
                      <XAxis hide dataKey="t" />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => [fmt(v, 2), "السعر"]}
                        labelFormatter={() => ""}
                      />
                      <Area
                        type="monotone"
                        dataKey="p"
                        stroke="var(--bull)"
                        strokeWidth={1.5}
                        fill="url(#tick)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {live.status === "simulated" && (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    فيد Deriv المباشر غير متاح من هذا الاتصال، فتم تشغيل محاكاة سعرية
                    بنفس تقلب بياناتك انطلاقاً من آخر إغلاق. كل الحسابات والإشارات مبنية
                    على بياناتك الحقيقية.
                  </p>
                )}
              </Card>
            </div>

            <Card title={`آخر ٢٠ شمعة — ${TF_LABEL[tf]}`}>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      {["الوقت", "الإغلاق", "EMA9", "EMA21", "RSI", "ATR", "الإشارة"].map(
                        (h) => (
                          <th key={h} className="py-1 text-start font-normal">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {rows
                      .slice(-20)
                      .reverse()
                      .map((r) => {
                        const s = mode === "cross" ? r.cross : r.sticky;
                        return (
                          <tr key={r.time} className="border-t border-border">
                            <td className="py-1.5">{r.time}</td>
                            <td className="py-1.5">{fmt(r.close, 0)}</td>
                            <td className="py-1.5">{r.ema9 ? fmt(r.ema9, 0) : "-"}</td>
                            <td className="py-1.5">{r.ema21 ? fmt(r.ema21, 0) : "-"}</td>
                            <td className="py-1.5">{r.rsi ? fmt(r.rsi, 1) : "-"}</td>
                            <td className="py-1.5">{r.atr ? fmt(r.atr, 0) : "-"}</td>
                            <td
                              className={`py-1.5 ${
                                s === "Buy"
                                  ? "text-bull"
                                  : s === "Sell"
                                    ? "text-bear"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {s === "Buy" ? "شراء" : s === "Sell" ? "بيع" : "انتظار"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

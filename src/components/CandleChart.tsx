import { useMemo, useState } from "react";
import type { Row, SignalKind } from "@/lib/indicators";
import { fmt } from "@/lib/indicators";

type Props = {
  rows: Row[];
  mode: "sticky" | "cross";
  livePrice?: number | null;
  height?: number;
};

export function CandleChart({ rows, mode, livePrice, height = 420 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = height;
  const padL = 8;
  const padR = 78;
  const padT = 14;
  const padB = 26;

  const view = useMemo(() => {
    const prices = rows.flatMap((r) => [r.high, r.low]);
    if (livePrice) prices.push(livePrice);
    let min = Math.min(...prices);
    let max = Math.max(...prices);
    const pad = (max - min) * 0.08 || 1;
    min -= pad;
    max += pad;
    const x = (i: number) =>
      padL + ((i + 0.5) * (W - padL - padR)) / Math.max(rows.length, 1);
    const y = (p: number) => padT + ((max - p) / (max - min)) * (H - padT - padB);
    const cw = Math.max(1.2, ((W - padL - padR) / Math.max(rows.length, 1)) * 0.62);
    return { min, max, x, y, cw };
  }, [rows, livePrice, H]);

  const { x, y, cw, min, max } = view;
  const line = (key: "ema9" | "ema21") =>
    rows
      .map((r, i) => (r[key] == null ? null : `${x(i)},${y(r[key]!)}`))
      .filter(Boolean)
      .join(" ");

  const gridLines = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const hovered = hover != null ? rows[hover] : null;

  return (
    <div className="relative w-full" dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const idx = Math.round(
            ((px - padL) / (W - padL - padR)) * rows.length - 0.5,
          );
          setHover(idx >= 0 && idx < rows.length ? idx : null);
        }}
      >
        {gridLines.map((p, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(p)}
              y2={y(p)}
              stroke="var(--grid)"
              strokeWidth={0.6}
            />
            <text
              x={W - padR + 6}
              y={y(p) + 3.5}
              fill="var(--muted-foreground)"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              {fmt(p, 0)}
            </text>
          </g>
        ))}

        {rows.map((r, i) => {
          const up = r.close >= r.open;
          const color = up ? "var(--bull)" : "var(--bear)";
          const top = y(Math.max(r.open, r.close));
          const bot = y(Math.min(r.open, r.close));
          return (
            <g key={i}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(r.high)}
                y2={y(r.low)}
                stroke={color}
                strokeWidth={Math.min(1.1, cw / 3)}
              />
              <rect
                x={x(i) - cw / 2}
                y={top}
                width={cw}
                height={Math.max(0.8, bot - top)}
                fill={color}
                opacity={0.95}
              />
            </g>
          );
        })}

        <polyline
          points={line("ema9")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.4}
        />
        <polyline
          points={line("ema21")}
          fill="none"
          stroke="var(--chart-4)"
          strokeWidth={1.4}
        />

        {rows.map((r, i) => {
          const s: SignalKind = mode === "cross" ? r.cross : r.sticky;
          if (s === "Hold") return null;
          if (mode === "sticky" && i % 3 !== 0) return null;
          const buy = s === "Buy";
          const py = buy ? y(r.low) + 12 : y(r.high) - 12;
          const c = buy ? "var(--bull)" : "var(--bear)";
          const size = mode === "cross" ? 6 : 3.4;
          return (
            <polygon
              key={`s${i}`}
              points={
                buy
                  ? `${x(i)},${py - size} ${x(i) - size},${py + size} ${x(i) + size},${py + size}`
                  : `${x(i)},${py + size} ${x(i) - size},${py - size} ${x(i) + size},${py - size}`
              }
              fill={c}
              opacity={mode === "cross" ? 1 : 0.65}
            />
          );
        })}

        {livePrice != null && (
          <g>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(livePrice)}
              y2={y(livePrice)}
              stroke="var(--primary)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <rect
              x={W - padR + 2}
              y={y(livePrice) - 8}
              width={70}
              height={16}
              rx={3}
              fill="var(--primary)"
            />
            <text
              x={W - padR + 8}
              y={y(livePrice) + 4}
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="var(--primary-foreground)"
            >
              {fmt(livePrice, 0)}
            </text>
          </g>
        )}

        {hovered && (
          <line
            x1={x(hover!)}
            x2={x(hover!)}
            y1={padT}
            y2={H - padB}
            stroke="var(--muted-foreground)"
            strokeWidth={0.6}
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {hovered && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-border bg-popover/95 px-3 py-2 font-mono text-[11px] leading-relaxed text-popover-foreground shadow-lg">
          <div>{hovered.time}</div>
          <div>
            O {fmt(hovered.open, 0)} H {fmt(hovered.high, 0)} L {fmt(hovered.low, 0)} C{" "}
            {fmt(hovered.close, 0)}
          </div>
          <div>
            RSI {hovered.rsi ? fmt(hovered.rsi, 1) : "-"} · ATR{" "}
            {hovered.atr ? fmt(hovered.atr, 0) : "-"} ·{" "}
            {mode === "cross" ? hovered.cross : hovered.sticky}
          </div>
        </div>
      )}
    </div>
  );
}

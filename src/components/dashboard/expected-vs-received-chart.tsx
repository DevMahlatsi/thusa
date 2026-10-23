"use client";

import { useEffect, useRef, useState } from "react";
import type { WeekBucket } from "@/lib/dashboard";
import { formatRand, formatRandAxis } from "@/lib/money";

// Validated with the dataviz palette script: ΔE 57 between the two (CVD-safe). Expected is below 3:1
// on white, so values are also reachable via tooltip, direct label and the table view.
const EXPECTED = "#A8A29E";
const RECEIVED = "#0C0A09";
const ACCENT = "#A3E635";

const M = { top: 24, right: 8, bottom: 28, left: 48 };
const MAX_BAR = 24;
const GAP = 2;
const NICE_STEPS = [25_000, 50_000, 100_000, 200_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000];

function niceScale(max: number) {
  const step = NICE_STEPS.find((s) => max / s <= 4) ?? NICE_STEPS[NICE_STEPS.length - 1]!;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

// Square at the baseline, 4px rounded data-end.
function columnPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function ExpectedVsReceivedChart({ weeks }: { weeks: WeekBucket[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setReady(true);
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Taller on desktop so the panel sits level with "Who's paid" beside it.
  const HEIGHT = width >= 560 ? 360 : 220;
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const { top, ticks } = niceScale(Math.max(...weeks.map((w) => Math.max(w.expectedCents, w.receivedCents)), 1));
  const y = (cents: number) => M.top + plotH - (cents / top) * plotH;
  const band = plotW / weeks.length;
  const barW = Math.min(MAX_BAR, Math.floor((band * 0.6 - GAP) / 2));

  // "15–21 Oct" needs ~64px; on phones drop the month (the panel subtitle names it).
  const useShortLabels = band < 72;

  const groupX = (i: number) => M.left + band * i + band / 2;
  const activeWeek = active === null ? null : weeks[active];

  return (
    <div className="chart" ref={ref} data-ready={ready || undefined}>
      <div className="legend" aria-hidden="true">
        <span>
          <i style={{ background: EXPECTED }} />
          Expected
        </span>
        <span>
          <i style={{ background: RECEIVED }} />
          Received
        </span>
        <span>
          <i style={{ background: ACCENT }} />
          This week
        </span>
      </div>

      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="group"
        aria-label="Expected versus received per week. Use Tab to move between weeks."
      >
        {weeks.map((w, i) =>
          w.isCurrent ? (
            <rect key="current" x={M.left + band * i + 4} y={M.top - 8} width={band - 8} height={plotH + 8} rx={8} fill={ACCENT} opacity={0.3} />
          ) : null,
        )}

        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="#E7E5E4" strokeWidth={1} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {formatRandAxis(t)}
            </text>
          </g>
        ))}

        {weeks.map((w, i) => {
          const cx = groupX(i);
          const ex = cx - barW - GAP / 2;
          const rx = cx + GAP / 2;
          return (
            <g key={w.label} className={`bar-group${active !== null && active !== i ? " dim" : ""}`}>
              <path className="bar" d={columnPath(ex, y(w.expectedCents), barW, M.top + plotH - y(w.expectedCents))} fill={EXPECTED} />
              <path className="bar" d={columnPath(rx, y(w.receivedCents), barW, M.top + plotH - y(w.receivedCents))} fill={RECEIVED} />
              <text x={cx} y={HEIGHT - 8} textAnchor="middle" style={w.isCurrent ? { fontWeight: 600, fill: "#0C0A09" } : undefined}>
                {useShortLabels ? w.shortLabel : w.label}
              </text>
              {w.isCurrent && w.receivedCents > 0 && (
                // Sits above the taller of the pair so it never overlaps the Expected column.
                <text className="value-label" x={cx} y={y(Math.max(w.expectedCents, w.receivedCents)) - 8} textAnchor="middle">
                  {formatRand(w.receivedCents)} in
                </text>
              )}
              <rect
                className="hit"
                x={M.left + band * i}
                y={M.top}
                width={band}
                height={plotH}
                tabIndex={0}
                aria-label={`${w.label}: received ${formatRand(w.receivedCents)} of ${formatRand(w.expectedCents)} expected`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}

        <line x1={M.left} x2={width - M.right} y1={M.top + plotH} y2={M.top + plotH} stroke="#D6D3D1" strokeWidth={1} />
      </svg>

      {activeWeek && active !== null && (
        <div
          className="tooltip"
          style={{
            left: Math.min(Math.max(groupX(active), 90), width - 90),
            top: y(Math.max(activeWeek.expectedCents, activeWeek.receivedCents)) + 20,
          }}
          role="status"
        >
          <p className="small muted" style={{ marginBottom: 4 }}>
            {activeWeek.label}
            {activeWeek.isCurrent ? " · this week" : ""}
          </p>
          <div className="row">
            <span className="key">
              <i style={{ background: RECEIVED }} />
              Received
            </span>
            <strong>{formatRand(activeWeek.receivedCents)}</strong>
          </div>
          <div className="row">
            <span className="key">
              <i style={{ background: EXPECTED }} />
              Expected
            </span>
            <strong>{formatRand(activeWeek.expectedCents)}</strong>
          </div>
        </div>
      )}

      <details className="table-view">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Expected</th>
              <th scope="col">Received</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.label}>
                <td>{w.label}</td>
                <td>{formatRand(w.expectedCents)}</td>
                <td>{formatRand(w.receivedCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

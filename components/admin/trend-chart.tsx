"use client";
// One trend line: daily unique visitors over 30 days. Single series, so no legend (the title says
// what is plotted). Mark specs: 2px line, 10% area wash, hairline solid gridlines, end label,
// crosshair + tooltip on hover and on keyboard focus (arrow keys), data table behind <details>.
// Series colour #2a78d6 validated against the white surface (scripts/validate_palette.js: pass).
import { useId, useMemo, useRef, useState } from "react";

export interface TrendPoint {
  day: string;
  visitors: number;
  pageViews: number;
}

const W = 720;
const H = 200;
const PAD = { top: 16, right: 56, bottom: 26, left: 36 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  const steps = [1, 2, 2.5, 5, 10].map((m) => m * mag);
  return steps.find((s) => s >= v) ?? 10 * mag;
}
const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString("zh-CN"));
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const titleId = useId();
  const max = niceMax(Math.max(1, ...points.map((p) => p.visitors)));
  const ticks = [0, max / 2, max];
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = useMemo(() => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.visitors).toFixed(1)}`).join(" "), [points, max]); // eslint-disable-line react-hooks/exhaustive-deps
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const last = points[points.length - 1];

  const pick = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * W;
    const i = Math.round(((sx - PAD.left) / innerW) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  };

  const a = active !== null ? points[active] : null;
  const tipLeft = active !== null ? (x(active) / W) * 100 : 0;

  return (
    <figure className="m-0">
      <figcaption id={titleId} className="text-[13.5px] font-semibold text-zinc-900">
        每日访客（近 30 天）
      </figcaption>
      <div className="relative mt-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20"
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onFocus={() => setActive(points.length - 1)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
            if (e.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
            if (e.key === "Escape") setActive(null);
          }}
        >
          {/* gridlines + y ticks (hairline, solid, recessive) */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e4e4e7" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#71717a">
                {fmt(t)}
              </text>
            </g>
          ))}
          {/* x labels: first, middle, last */}
          {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize={11} fill="#71717a">
              {md(points[i].day)}
            </text>
          ))}
          <path d={area} fill="#2a78d6" fillOpacity={0.1} />
          <path d={line} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* end marker + direct label (value at the end of the line) */}
          <circle cx={x(points.length - 1)} cy={y(last.visitors)} r={4} fill="#2a78d6" stroke="#ffffff" strokeWidth={2} />
          <text x={x(points.length - 1) + 8} y={y(last.visitors)} dy="0.32em" fontSize={12} fill="#18181b" fontWeight={600}>
            {fmt(last.visitors)}
          </text>
          {/* crosshair */}
          {a && active !== null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} stroke="#a1a1aa" strokeWidth={1} />
              <circle cx={x(active)} cy={y(a.visitors)} r={4.5} fill="#2a78d6" stroke="#ffffff" strokeWidth={2} />
            </g>
          )}
        </svg>
        {a && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] shadow-sm"
            style={{ left: `${Math.min(88, Math.max(12, tipLeft))}%` }}
          >
            <div className="font-medium text-zinc-900">{a.day}</div>
            <div className="text-zinc-600">
              访客 <span className="font-semibold text-zinc-900">{a.visitors.toLocaleString("zh-CN")}</span> · 浏览 {a.pageViews.toLocaleString("zh-CN")}
            </div>
          </div>
        )}
      </div>
      <details className="mt-2 text-[12.5px] text-zinc-600">
        <summary className="cursor-pointer select-none text-zinc-500">查看数据表</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-zinc-200">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-1.5 font-medium">日期</th>
                <th className="px-3 py-1.5 text-right font-medium">访客</th>
                <th className="px-3 py-1.5 text-right font-medium">浏览</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day} className="border-t border-zinc-100">
                  <td className="px-3 py-1 tabular-nums">{p.day}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{p.visitors.toLocaleString("zh-CN")}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{p.pageViews.toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

import Link from "next/link";
import { ERAS, MILESTONES, type Era } from "@/lib/ai-timeline";
import { TimelineScroller } from "./timeline-scroller";

const TONE: Record<Era["tone"], { wash: string; ink: string }> = {
  gold: { wash: "oklch(86% 0.07 84 / 0.35)", ink: "var(--color-gold-deep)" },
  zinc: { wash: "oklch(90% 0 0 / 0.45)", ink: "var(--color-zinc-500)" },
  patina: { wash: "oklch(82% 0.07 188 / 0.28)", ink: "var(--color-patina-deep)" },
  ink: { wash: "oklch(85% 0 0 / 0.35)", ink: "var(--color-ink)" },
  vermilion: { wash: "oklch(90% 0.04 40 / 0.55)", ink: "var(--color-vermilion)" },
};

const COL = 212; // px per milestone

/**
 * "人工智能简史": an ink-on-paper timeline that flows past a fixed viewpoint.
 *
 * The track is rendered twice so the flow can wrap without a seam: the scroller advances it at a
 * constant speed and, once one full copy has passed, subtracts that width. The duplicate is
 * aria-hidden so screen readers hear each milestone once.
 *
 * Server-rendered and readable without JavaScript (native horizontal scroll); the scroller only
 * adds the motion and the playback controls.
 */
export function AiTimeline() {
  const eraCols = ERAS.map((e) => ({ era: e, count: MILESTONES.filter((m) => m.era === e.key).length }));
  const width = MILESTONES.length * COL + COL; // + the "you are here" column
  // a gently wavering brush line across the whole track
  const wave = Array.from({ length: Math.ceil(width / 80) + 1 }, (_, i) => `${i * 80},${50 + Math.sin(i * 1.7) * 2.2 + Math.cos(i * 0.6) * 1.4}`).join(" ");

  const Track = ({ mirror = false }: { mirror?: boolean }) => (
    <div
      className="relative shrink-0"
      style={{ width, height: 430 }}
      data-tl-copy={mirror ? undefined : ""}
      aria-hidden={mirror || undefined}
    >
      {/* era washes */}
      <div aria-hidden className="absolute inset-y-6 left-0 flex">
        {eraCols.map(({ era, count }) => (
          <div key={era.key} className="relative h-full" style={{ width: count * COL }}>
            <div className="absolute inset-0 rounded-[2px]" style={{ background: `linear-gradient(180deg, transparent, ${TONE[era.tone].wash} 30%, ${TONE[era.tone].wash} 70%, transparent)` }} />
            <div className="absolute bottom-0 left-3 font-mono text-[10.5px] tracking-[0.16em] text-zinc-500">
              {era.name} · {era.span}
            </div>
          </div>
        ))}
      </div>

      {/* the axis: an ink line */}
      <svg aria-hidden className="absolute left-0 top-[165px]" width={width} height="100" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
        <polyline points={wave} fill="none" stroke="oklch(13% 0 0 / 0.85)" strokeWidth="1.6" strokeLinecap="round" className={mirror ? undefined : "timeline-draw"} />
      </svg>

      <ol className="absolute inset-0 flex">
        {MILESTONES.map((m, i) => {
          const up = i % 2 === 0;
          const era = ERAS.find((e) => e.key === m.era)!;
          const tone = TONE[era.tone];
          return (
            <li
              key={`${m.year}-${m.title}`}
              data-tl-item
              data-year={m.year}
              data-title={m.title}
              className="relative h-full shrink-0"
              style={{ width: COL }}
            >
              {/* dot on the axis */}
              <span
                aria-hidden
                className="tl-dot absolute left-6 top-[211px] -translate-x-1/2 rounded-full ring-4 ring-paper"
                style={{ width: m.major ? 13 : 8, height: m.major ? 13 : 8, background: tone.ink }}
              />
              {/* stem */}
              <span aria-hidden className="absolute left-6 w-px bg-zinc-300" style={up ? { top: 150, height: 58 } : { top: 222, height: 52 }} />
              <div className={`absolute left-2 right-3 ${up ? "top-[34px]" : "top-[280px]"}`}>
                <div className="font-display leading-none" style={{ color: tone.ink, fontSize: m.major ? 40 : 30, fontVariantNumeric: "oldstyle-nums" }}>
                  {m.year}
                </div>
                <h3 className={`mt-2 text-[14.5px] leading-snug text-zinc-900 ${m.major ? "font-semibold" : "font-medium"}`}>{m.title}</h3>
                <p className="mt-1 line-clamp-3 text-[12.5px] font-light leading-[1.65] text-zinc-600">{m.note}</p>
              </div>
            </li>
          );
        })}
        <li data-tl-item data-year="今天" data-title="轮到你了" className="relative h-full shrink-0" style={{ width: COL }}>
          <span aria-hidden className="tl-dot absolute left-6 top-[208px] h-3.5 w-3.5 -translate-x-1/2 rotate-45 bg-vermilion ring-4 ring-paper" />
          <div className="absolute left-2 right-3 top-[34px]">
            <div className="font-display text-[40px] leading-none text-vermilion">今天</div>
            <h3 className="mt-2 text-[14.5px] font-semibold text-zinc-900">轮到你了</h3>
            <p className="mt-1 text-[12.5px] font-light leading-[1.65] text-zinc-600">把这些工具用在你自己的研究里。</p>
            <Link href="/skills/" className="link-line mt-2 inline-block text-[13px]">
              从 Skills 开始 →
            </Link>
          </div>
        </li>
      </ol>
    </div>
  );

  return (
    <section aria-labelledby="timeline-h" className="relative overflow-hidden border-b border-rule">
      {/* graph paper */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(oklch(13% 0 0 / 0.045) 1px, transparent 1px), linear-gradient(90deg, oklch(13% 0 0 / 0.045) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "linear-gradient(to bottom, black 55%, transparent)",
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="tag-gold">A Brief History · 1943—2025</span>
            <h2 id="timeline-h" className="display mt-5 text-[36px] sm:text-[52px]">
              人工智能，一部简史
            </h2>
            <p className="mt-3 max-w-2xl text-[15.5px] font-light leading-[1.8] text-zinc-700">
              从一个神经元的数学模型，到能读文献、写代码、按技能包完成科研流程的智能体。八十年里，每一步都站在前人的论文上。
            </p>
          </div>
          <ol className="flex flex-wrap gap-x-4 gap-y-2" aria-label="时代">
            {eraCols.map(({ era }) => (
              <li key={era.key} className="flex items-center gap-1.5 text-[12px] text-zinc-600">
                <span aria-hidden className="h-2.5 w-2.5 rounded-[1px]" style={{ background: TONE[era.tone].ink }} />
                {era.name}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <TimelineScroller
        label="人工智能发展时间线，持续流动，可横向滚动"
        count={MILESTONES.length + 1}
        step={COL}
      >
        <div className="flex">
          <Track />
          <Track mirror />
        </div>
      </TimelineScroller>
    </section>
  );
}

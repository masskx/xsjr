import Link from "next/link";
import { TYPE_LABEL, type Resource } from "@/lib/types";

/** 卡片只需要这些字段，服务端与客户端组件可共用 */
export interface CardData {
  slug: string;
  type: Resource["type"];
  title: string;
  summary: string;
  tags: string[];
  category: string;
  license: string;
  updatedAt: string;
  tier: string;
}

const TYPE_STYLE: Record<string, string> = {
  PROMPT: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  SKILL: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  MODULE: "bg-amber-50 text-amber-700 ring-amber-100",
  SITE: "bg-sky-50 text-sky-700 ring-sky-100",
};

const TYPE_HREF: Record<string, string> = {
  PROMPT: "/prompts",
  SKILL: "/skills",
  MODULE: "/modules",
  SITE: "/directory",
};

export function TypeBadge({ type }: { type: Resource["type"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TYPE_STYLE[type]}`}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}

/** Membership badge for members-only resources ("EI", "SCI"); nothing for free ones. */
export function TierBadge({ tier }: { tier: string }) {
  if (tier === "FREE") return null;
  return (
    <span title={`${tier} 会员内容`} className="inline-flex items-center rounded-md bg-zinc-900 px-1.5 py-0.5 text-[11px] font-medium text-white">
      <span aria-hidden>🔒 </span>
      {tier}
      <span className="sr-only"> 会员内容</span>
    </span>
  );
}

export function ResourceCard({ resource }: { resource: CardData }) {
  return (
    <Link
      href={`${TYPE_HREF[resource.type]}/${resource.slug}/`}
      className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 no-underline transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)]"
    >
      <div className="flex items-center gap-1.5">
        <TypeBadge type={resource.type} />
        <TierBadge tier={resource.tier} />
        <span className="ml-auto shrink-0 text-[11px] text-zinc-400">
          {resource.updatedAt}
        </span>
      </div>

      <h3 className="mt-2.5 text-[15px] font-semibold leading-6 text-zinc-900 group-hover:text-indigo-700">
        {resource.title}
      </h3>

      <p className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-zinc-500">
        {resource.summary}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {resource.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-2.5 text-[11px] text-zinc-400">
        <span className="truncate">{resource.category}</span>
        <span aria-hidden>·</span>
        <span className="truncate">{resource.license}</span>
      </div>
    </Link>
  );
}

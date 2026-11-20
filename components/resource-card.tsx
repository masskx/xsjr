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

/** each type keeps a small colour key, the label itself stays neutral */
const TYPE_KEY: Record<string, string> = {
  PROMPT: "bg-gold",
  SKILL: "bg-patina",
  MODULE: "bg-gold-deep",
  SITE: "bg-zinc-400",
};

const TYPE_HREF: Record<string, string> = {
  PROMPT: "/prompts",
  SKILL: "/skills",
  MODULE: "/modules",
  SITE: "/directory",
};

export function TypeBadge({ type }: { type: Resource["type"] }) {
  return (
    <span className="tag-mono">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-[1px] ${TYPE_KEY[type]}`} />
      {TYPE_LABEL[type]}
    </span>
  );
}

/** Membership badge for members-only resources ("EI", "SCI"); nothing for free ones. */
export function TierBadge({ tier }: { tier: string }) {
  if (tier === "FREE") return null;
  return (
    <span title={`${tier} 会员内容`} className="inline-flex items-center gap-1 rounded-[2px] bg-ink px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wider text-white">
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
      className="surface group flex flex-col p-4 no-underline transition-shadow duration-200 hover:shadow-md"
    >
      <div className="flex items-center gap-1.5">
        <TypeBadge type={resource.type} />
        <TierBadge tier={resource.tier} />
        <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">
          {resource.updatedAt}
        </span>
      </div>

      <h3 className="mt-3 text-[16px] font-semibold leading-6 text-zinc-900 decoration-gold decoration-1 underline-offset-4 group-hover:underline">
        {resource.title}
      </h3>

      <p className="mt-1.5 line-clamp-2 text-[13.5px] font-light leading-6 text-zinc-600">
        {resource.summary}
      </p>

      <div className="mt-3 flex flex-1 flex-wrap content-start gap-1.5">
        {resource.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="inline-flex items-center rounded-[2px] border border-rule px-1.5 py-0.5 text-[11.5px] text-zinc-600"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-rule pt-2.5 font-mono text-[11px] text-zinc-500">
        <span className="truncate">{resource.category}</span>
        <span aria-hidden>·</span>
        <span className="truncate">{resource.license}</span>
      </div>
    </Link>
  );
}

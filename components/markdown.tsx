import { renderMarkdown } from "@/lib/markdown";

/** 把 {{var}} 在渲染后的 HTML 里高亮出来（文本节点内的字面量替换，安全） */
function highlightVars(html: string) {
  return html.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m, key: string) =>
      `<span class="mx-0.5 inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 align-baseline font-mono text-[12px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">{{${key}}}</span>`,
  );
}

export function Markdown({
  source,
  highlight = false,
  className = "",
}: {
  source: string;
  highlight?: boolean;
  className?: string;
}) {
  const html = renderMarkdown(source);
  return (
    <div
      className={`md ${className}`}
      dangerouslySetInnerHTML={{
        __html: highlight ? highlightVars(html) : html,
      }}
    />
  );
}

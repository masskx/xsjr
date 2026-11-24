import hljs from "highlight.js/lib/common";
import MarkdownIt from "markdown-it";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * html: false —— 正文中的原始 HTML 一律按文本转义。
 * 这样即使将来接入第三方投稿，也不会引入 Markdown XSS（见 TDD §17）。
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
  highlight: (str, lang) => {
    const language = lang?.trim().toLowerCase();
    try {
      const value = language && hljs.getLanguage(language)
        ? hljs.highlight(str, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(str).value;
      const className = language && hljs.getLanguage(language) ? `language-${language.replace(/[^a-z0-9+#-]/g, "")}` : "language-plaintext";
      return `<pre class="hljs"><code class="${className}">${value}</code></pre>`;
    } catch {
      return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
    }
  },
});

// 外链统一加 rel，避免反向 tabnabbing
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = String(tokens[idx].attrGet("href") ?? "");
  if (/^https?:\/\//.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// 正文里的一级标题降为二级：页面本身已有 h1（资源标题），
// 否则同一页出现两个 h1，既重复又不利于 SEO。
const demoteH1 = (
  tokens: { tag: string }[],
  idx: number,
  options: unknown,
  _env: unknown,
  self: { renderToken: (t: unknown, i: number, o: unknown) => string },
) => {
  if (tokens[idx].tag === "h1") tokens[idx].tag = "h2";
  return self.renderToken(tokens, idx, options);
};

const rules = md.renderer.rules as unknown as Record<string, unknown>;
rules.heading_open = demoteH1;
rules.heading_close = demoteH1;

export function renderMarkdown(source: string): string {
  return md.render(source);
}

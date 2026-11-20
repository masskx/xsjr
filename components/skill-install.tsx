import { CodeBlock } from "./code-block";
import { GENERIC_TOOL, guideFor, installCommands } from "@/lib/skills/install";
import type { SkillResource } from "@/lib/types";

/**
 * Tool-by-tool installation instructions, driven by the skill's compat array (meta.json order).
 * Verified tools get directories and commands; unverified ones are labelled 未验证 and show only
 * what the resource author wrote.
 */
export function SkillInstall({ resource, skillDir, zipUrl }: { resource: SkillResource; skillDir: string; zipUrl: string | null }) {
  const rows = resource.compat.length ? resource.compat : [];
  return (
    <section className="mt-10" aria-labelledby="install-h">
      <h2 id="install-h" className="headline text-[28px]">
        安装到你的工具
      </h2>
      <p className="mt-2 text-[14px] font-light leading-7 text-zinc-700">
        {zipUrl
          ? <>下载 ZIP 后解压到对应目录即可；Skill 文件夹名为 <code className="tag-mono">{skillDir}</code>。下面的路径和命令来自各工具的官方文档。</>
          : "这个 Skill 仅做索引，本站不提供原文下载。请从来源获取 SKILL.md，再按下面的目录放置。"}
      </p>

      <div className="mt-5 space-y-4">
        {rows.map((c) => {
          const g = guideFor(c.tool);
          const authorNote = [c.supportedRange && `适用：${c.supportedRange}`, c.note].filter(Boolean).join("；");
          if (c.tool === GENERIC_TOOL) {
            return (
              <div key={c.tool} className="surface p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-zinc-900">通用（任意对话模型）</h3>
                  <span className="tag-mono">无需安装</span>
                </div>
                <p className="mt-2 text-[14px] font-light leading-7 text-zinc-700">把 SKILL.md 的正文复制下来，作为系统提示或第一条消息发给任意对话模型。</p>
                {authorNote && <p className="mt-1 text-[12.5px] text-zinc-500">资源作者备注：{authorNote}</p>}
              </div>
            );
          }
          if (!g.verified) {
            return (
              <div key={c.tool} className="surface border-dashed p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-zinc-900">{g.label}</h3>
                  <span className="inline-flex items-center rounded-[2px] border border-zinc-300 px-1.5 py-0.5 font-mono text-[11px] tracking-wider text-zinc-600">未验证</span>
                </div>
                <p className="mt-2 text-[14px] font-light leading-7 text-zinc-700">
                  本站尚未核实 {g.label} 的 Skill 安装目录和命令，因此不给出路径。请以 {g.label} 官方文档为准。
                </p>
                {(authorNote || c.installPath) && (
                  <p className="mt-1 text-[12.5px] text-zinc-500">
                    资源作者备注：{[authorNote, c.installPath && c.installPath !== "—" ? `路径 ${c.installPath}` : ""].filter(Boolean).join("；")}
                  </p>
                )}
              </div>
            );
          }
          const personal = `${g.personal}/${skillDir}`;
          const project = `${g.project}/${skillDir}`;
          const cmd = zipUrl ? installCommands(g.personal!, zipUrl, skillDir) : null;
          return (
            <div key={c.tool} className="surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[16px] font-semibold text-zinc-900">{g.label}</h3>
                <span className="inline-flex items-center gap-1.5 rounded-[2px] bg-paper-deep px-1.5 py-0.5 font-mono text-[11px] tracking-wider text-zinc-700">
                  <span aria-hidden className="dot" />
                  已核实
                </span>
              </div>
              <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-[13.5px] sm:grid-cols-[6rem_minmax(0,1fr)]">
                <dt className="text-zinc-500">个人目录</dt>
                <dd className="min-w-0 break-all font-mono text-[13px] text-zinc-900">{personal}/SKILL.md</dd>
                <dt className="text-zinc-500">项目目录</dt>
                <dd className="min-w-0 break-all font-mono text-[13px] text-zinc-900">{project}/SKILL.md</dd>
              </dl>
              {g.notes?.map((n) => (
                <p key={n} className="mt-2 text-[13px] font-light leading-6 text-zinc-700">{n}</p>
              ))}
              {authorNote && <p className="mt-1 text-[12.5px] text-zinc-500">资源作者备注：{authorNote}</p>}
              {cmd && (
                <div className="mt-4 grid gap-3">
                  <CodeBlock code={cmd.posix} filename="macOS / Linux（安装到个人目录）" maxHeight="12rem" />
                  <CodeBlock code={cmd.windows} filename="Windows PowerShell（安装到个人目录）" maxHeight="12rem" />
                </div>
              )}
              {g.source && (
                <p className="mt-3 text-[12px] text-zinc-500">
                  依据：
                  <a href={g.source.url} target="_blank" rel="noopener noreferrer" className="link-line text-zinc-700">
                    {g.source.title}
                  </a>
                </p>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-[14px] text-zinc-600">资源作者没有注明适用的工具。</p>}
      </div>
    </section>
  );
}

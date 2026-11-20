import type { Metadata } from "next";
import { Notice, btn, fmtDateTime } from "@/components/admin/ui";
import { ApiTokenForm } from "@/components/admin/api-token-form";
import { adminContext, adminData } from "@/lib/admin/server";
import { SITE_URL } from "@/lib/site";
import { revokeApiTokenAction } from "../actions";

export const metadata: Metadata = { title: "API 令牌" };

export default async function ApiPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { viewer } = await adminContext();
  const [tokens, sp] = await Promise.all([adminData.apiTokens(viewer.userId), searchParams]);
  const curl = `curl -X POST "${SITE_URL}/api/admin/bulk/?apply=1" \\
  -H "Authorization: Bearer rhk_你的令牌" \\
  -H "Content-Type: application/zip" \\
  --data-binary @batch.zip`;
  const ps = `Invoke-RestMethod -Method Post -Uri "${SITE_URL}/api/admin/bulk/?apply=1" \`
  -Headers @{ Authorization = "Bearer rhk_你的令牌" } \`
  -ContentType "application/zip" -InFile batch.zip`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">API 令牌与批量上传接口</h1>
        <p className="mt-1 text-[13.5px] leading-6 text-zinc-500">
          用令牌通过 HTTPS 批量上传模块、Skills 和提示词。ZIP 内的目录结构与 <code>infra/bulk.ps1</code> 相同（运维手册第 15、16 节）。不带 <code>apply=1</code> 时只检查、不保存。令牌只显示一次，服务器只保存它的散列；属于你本人，你不再是管理员时自动失效。
        </p>
      </div>
      {sp.msg === "revoked" && <Notice tone="ok">令牌已撤销，立即失效。</Notice>}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-900">新建令牌</h2>
        <p className="mb-3 text-[12.5px] text-zinc-500">创建令牌需要在 10 分钟内验证过两步验证码，否则会先跳转到验证页。</p>
        <ApiTokenForm />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-zinc-900">调用方法</h2>
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-[13px] text-zinc-700 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-zinc-500">地址</dt><dd className="font-mono">POST {SITE_URL}/api/admin/bulk/</dd>
          <dt className="text-zinc-500">参数</dt><dd><code>apply=1</code> 保存为草稿 · <code>publish=1</code> 同时发布 · <code>update=1</code> 覆盖同名资源</dd>
          <dt className="text-zinc-500">请求体</dt><dd>ZIP（≤ 30 MB），内含 <code>modules/</code>、<code>skills/</code>、<code>prompts/</code> 和可选的 <code>清单.csv</code></dd>
          <dt className="text-zinc-500">返回</dt><dd>JSON：每一项的检查结果或保存结果，以及与 bulk.ps1 相同的中文报告</dd>
          <dt className="text-zinc-500">限制</dt><dd>每个令牌每小时 30 次；有任何一项不合格时整批不保存</dd>
        </dl>
        <p className="mt-4 text-[12.5px] font-medium text-zinc-700">macOS / Linux</p>
        <pre className="mt-1 overflow-x-auto rounded-[3px] bg-zinc-900 p-3 font-mono text-[12px] text-zinc-100">{curl}</pre>
        <p className="mt-3 text-[12.5px] font-medium text-zinc-700">Windows PowerShell</p>
        <pre className="mt-1 overflow-x-auto rounded-[3px] bg-zinc-900 p-3 font-mono text-[12px] text-zinc-100">{ps}</pre>
      </section>

      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {tokens.length === 0 && <li className="p-6 text-center text-[13px] text-zinc-500">还没有令牌。</li>}
        {tokens.map((t) => {
          const expired = t.expiresAt && t.expiresAt.getTime() <= Date.now();
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
              <span className="font-medium text-zinc-900">{t.name}</span>
              <code className="font-mono text-[12px] text-zinc-500">{t.prefix}…</code>
              <span className="text-zinc-500">
                创建于 {fmtDateTime.format(t.createdAt)}
                {t.lastUsedAt ? ` · 最近使用 ${fmtDateTime.format(t.lastUsedAt)}` : " · 未使用"}
                {t.expiresAt ? ` · ${expired ? "已过期" : `到期 ${fmtDateTime.format(t.expiresAt)}`}` : " · 不过期"}
              </span>
              {t.revokedAt ? (
                <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] text-zinc-500">已撤销</span>
              ) : (
                <form action={revokeApiTokenAction} className="ml-auto">
                  <input type="hidden" name="id" value={t.id} />
                  <button className={btn.danger}>撤销</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

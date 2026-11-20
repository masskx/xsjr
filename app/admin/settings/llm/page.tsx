import type { Metadata } from "next";
import { Notice, btn, fmtDateTime } from "@/components/admin/ui";
import { LlmPresetPicker } from "@/components/admin/llm-presets";
import { adminData } from "@/lib/admin/server";
import { saveLlmSettingsAction } from "../../actions";

export const metadata: Metadata = { title: "模型服务设置" };

const input = "block w-full rounded-[3px] border border-zinc-300 bg-white px-3 py-2 text-[13.5px] text-zinc-900 outline-none focus:border-zinc-900";

const SOURCE_LABEL = {
  database: "后台配置（数据库）",
  environment: "服务器环境变量",
  none: "未配置",
} as const;

export default async function LlmSettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await adminData.llmSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">模型服务设置</h1>
        <p className="mt-1 text-[13.5px] leading-6 text-zinc-500">
          这里的配置供「导入」功能调用：把抓取到的网页正文交给模型抽取成 Skill 草稿。任何兼容 OpenAI
          <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 font-mono text-[12px]">/chat/completions</code>
          的服务都能用——DeepSeek 官方接口、opencode GO 这类编码套餐、OpenRouter、硅基流动或自建网关，只需填对 Base URL 与模型名。
        </p>
      </div>

      {sp.msg === "saved" && <Notice tone="ok">已保存，导入功能立即按新配置运行。</Notice>}
      {sp.err && <Notice tone="error">{sp.err}</Notice>}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-[13px] sm:p-5">
        <h2 className="text-[15px] font-semibold text-zinc-900">当前生效</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">来源</dt>
            <dd className="text-zinc-900">{SOURCE_LABEL[s.activeSource]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">服务</dt>
            <dd className="text-zinc-900">{s.activeLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">状态</dt>
            <dd className={s.activeSource === "none" ? "text-amber-700" : "text-emerald-700"}>
              {s.activeSource === "none" ? "未启用——导入功能不可用" : "可用"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">已存密钥</dt>
            <dd className="font-mono text-zinc-900">{s.keyHint ?? "无"}</dd>
          </div>
        </dl>
        {s.activeSource === "environment" && (
          <p className="mt-3 rounded-[3px] bg-zinc-50 px-3 py-2 text-[12.5px] leading-6 text-zinc-600">
            当前用的是服务器环境变量里的 DEEPSEEK_API_KEY。一旦在下面保存并启用，这里的配置会优先生效。
          </p>
        )}
        {!s.canStore && (
          <p className="mt-3 rounded-[3px] bg-amber-50 px-3 py-2 text-[12.5px] leading-6 text-amber-800">
            服务器缺少 AUTH_SECRET，无法安全地加密保存密钥。请先在服务器 .env 里配置至少 32 个字符的 AUTH_SECRET。
          </p>
        )}
        {s.updatedAt && <p className="mt-3 text-[12px] text-zinc-400">最后修改：{fmtDateTime.format(s.updatedAt)}</p>}
      </div>

      <form action={saveLlmSettingsAction} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-zinc-900">配置</h2>

        <LlmPresetPicker />

        <label className="block text-[12.5px] font-medium text-zinc-700">
          显示名称
          <input name="label" required maxLength={40} defaultValue={s.label} className={`mt-1 ${input}`} />
          <span className="mt-1 block text-[11.5px] font-normal text-zinc-500">只用于你自己辨认，例如「DeepSeek 官方」「opencode GO」。</span>
        </label>

        <label className="block text-[12.5px] font-medium text-zinc-700">
          Base URL
          <input name="baseUrl" required defaultValue={s.baseUrl} placeholder="https://api.deepseek.com" className={`mt-1 font-mono ${input}`} />
          <span className="mt-1 block text-[11.5px] font-normal text-zinc-500">
            不带 /chat/completions 后缀。DeepSeek 官方是 https://api.deepseek.com；OpenAI 兼容服务通常以 /v1 结尾。
          </span>
        </label>

        <label className="block text-[12.5px] font-medium text-zinc-700">
          模型名
          <input name="model" required defaultValue={s.model} placeholder="deepseek-chat" className={`mt-1 font-mono ${input}`} />
        </label>

        <label className="block text-[12.5px] font-medium text-zinc-700">
          API Key
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder={s.keyHint ? `已保存（${s.keyHint}），留空表示不修改` : "粘贴服务商提供的密钥"}
            className={`mt-1 font-mono ${input}`}
          />
          <span className="mt-1 block text-[11.5px] font-normal text-zinc-500">
            密钥用 AUTH_SECRET 派生的密钥加密后存入数据库，页面上只显示首尾各 4 位，任何接口都不会返回明文。
          </span>
        </label>

        <label className="flex items-center gap-2 text-[12.5px] text-zinc-700">
          <input type="checkbox" name="clearKey" />
          清除已保存的密钥（停用导入）
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-[12.5px] font-medium text-zinc-700">
            每日令牌上限
            <input name="dailyTokenLimit" type="number" min={0} step={10000} defaultValue={s.dailyTokenLimit} className={`mt-1 ${input}`} />
            <span className="mt-1 block text-[11.5px] font-normal text-zinc-500">当天用量达到上限后自动暂停，次日 0 点（北京时间）继续。</span>
          </label>
          <label className="flex items-start gap-2 pt-6 text-[12.5px] text-zinc-700">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="mt-0.5" />
            <span>
              启用
              <span className="mt-1 block text-[11.5px] text-zinc-500">未启用时导入功能隐藏，「导入」页会提示未配置。</span>
            </span>
          </label>
        </div>

        <button className={btn.primary}>保存设置</button>
      </form>

      <p className="text-[12.5px] leading-6 text-zinc-500">
        说明：这里只影响「导入」用哪个模型解析网页。抓取规则、许可证判定、草稿必须人工审核这些约束不受影响——模型给出的内容永远只是草稿，不会自动发布。
      </p>
    </div>
  );
}

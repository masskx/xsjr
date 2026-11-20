"use client";

/**
 * Preset picker for the LLM settings form. It only fills the base-URL and model inputs; the admin
 * can always override them, which is what makes any OpenAI-compatible endpoint usable here
 * (DeepSeek official, a coding-plan subscription such as opencode GO, a self-hosted gateway…).
 */
const PRESETS = [
  { label: "DeepSeek 官方", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "deepseek/deepseek-chat" },
  { label: "硅基流动 SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3" },
  { label: "其他 OpenAI 兼容服务（opencode GO、编码套餐、自建网关…）", baseUrl: "", model: "" },
];

export function LlmPresetPicker({ defaultIndex = -1 }: { defaultIndex?: number }) {
  const apply = (index: number) => {
    const preset = PRESETS[index];
    if (!preset) return;
    const baseUrl = document.querySelector<HTMLInputElement>('input[name="baseUrl"]');
    const model = document.querySelector<HTMLInputElement>('input[name="model"]');
    if (baseUrl && preset.baseUrl) baseUrl.value = preset.baseUrl;
    if (model && preset.model) model.value = preset.model;
  };

  return (
    <label className="block text-[12.5px] font-medium text-zinc-700">
      快速填入
      <select
        defaultValue={defaultIndex >= 0 ? String(defaultIndex) : ""}
        onChange={(e) => apply(Number(e.target.value))}
        className="mt-1 block w-full rounded-[3px] border border-zinc-300 bg-white px-3 py-2 text-[13.5px] text-zinc-900 outline-none focus:border-zinc-900"
      >
        <option value="">选择预设（会覆盖下面的地址与模型）</option>
        {PRESETS.map((p, i) => (
          <option key={p.label} value={i}>
            {p.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[11.5px] font-normal text-zinc-500">
        任何兼容 OpenAI /chat/completions 的服务都可以，包括 opencode GO 这类编码套餐——填它的 Base URL 与模型名即可。
      </span>
    </label>
  );
}

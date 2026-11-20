// Admin-side handling of the LLM provider row. The API key never leaves the server: it is sealed
// with a key derived from AUTH_SECRET, and the page only ever sees a masked hint.
import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { maskSecret, openSecret, sealSecret, secretsAvailable } from "../crypto/secret-box";
import { llmConfig, type LlmSource } from "../ingest/llm";

export const LLM_ROW_ID = 1;

export interface LlmSettingsView {
  /** false when the server has no AUTH_SECRET to derive an encryption key from */
  canStore: boolean;
  enabled: boolean;
  label: string;
  baseUrl: string;
  model: string;
  dailyTokenLimit: number;
  /** "sk-a1••••z9" or null when no key is stored */
  keyHint: string | null;
  storedInDb: boolean;
  /** what the ingestion worker will actually use right now */
  activeLabel: string;
  activeSource: LlmSource;
  updatedAt: Date | null;
}

const DEFAULTS = {
  label: "DeepSeek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  dailyTokenLimit: 2_000_000,
};

export async function readLlmSettings(db: Db): Promise<LlmSettingsView> {
  const [row] = await db.select().from(s.llmProvider).where(eq(s.llmProvider.id, LLM_ROW_ID)).limit(1);
  const active = await llmConfig();
  const opened = row?.apiKeySealed ? openSecret(row.apiKeySealed) : null;
  return {
    canStore: secretsAvailable(),
    enabled: row?.enabled ?? false,
    label: row?.label ?? DEFAULTS.label,
    baseUrl: row?.baseUrl ?? DEFAULTS.baseUrl,
    model: row?.model ?? DEFAULTS.model,
    dailyTokenLimit: row?.dailyTokenLimit ?? DEFAULTS.dailyTokenLimit,
    keyHint: opened ? maskSecret(opened) : null,
    storedInDb: !!row,
    activeLabel: active.label,
    activeSource: active.source,
    updatedAt: row?.updatedAt ?? null,
  };
}

export interface SaveLlmInput {
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  dailyTokenLimit: number;
  enabled: boolean;
  clearKey: boolean;
}

export type SaveLlmResult = { ok: true } | { ok: false; error: string };

export async function saveLlmSettings(db: Db, actorId: number, input: SaveLlmInput): Promise<SaveLlmResult> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const model = input.model.trim();
  const label = input.label.trim() || "自定义服务";

  if (!/^https?:\/\//i.test(baseUrl)) return { ok: false, error: "接口地址必须以 http:// 或 https:// 开头" };
  if (!model) return { ok: false, error: "请填写模型名，例如 deepseek-chat" };
  if (!Number.isFinite(input.dailyTokenLimit) || input.dailyTokenLimit < 0) return { ok: false, error: "每日令牌上限必须是非负整数" };

  const [existing] = await db.select().from(s.llmProvider).where(eq(s.llmProvider.id, LLM_ROW_ID)).limit(1);
  let sealed = existing?.apiKeySealed ?? null;
  let keyChanged = false;

  if (input.clearKey) {
    sealed = null;
    keyChanged = true;
  } else if (input.apiKey.trim()) {
    if (!secretsAvailable()) return { ok: false, error: "服务器缺少 AUTH_SECRET（至少 32 个字符），无法安全保存密钥" };
    sealed = sealSecret(input.apiKey.trim());
    keyChanged = true;
  }

  if (input.enabled && !sealed) return { ok: false, error: "启用前需要先保存一个 API Key" };

  const values = {
    id: LLM_ROW_ID,
    label,
    baseUrl,
    model,
    apiKeySealed: sealed,
    dailyTokenLimit: Math.trunc(input.dailyTokenLimit),
    enabled: input.enabled,
    updatedBy: actorId,
    updatedAt: new Date(),
  };

  await db
    .insert(s.llmProvider)
    .values(values)
    .onConflictDoUpdate({
      target: s.llmProvider.id,
      set: {
        label: values.label,
        baseUrl: values.baseUrl,
        model: values.model,
        apiKeySealed: values.apiKeySealed,
        dailyTokenLimit: values.dailyTokenLimit,
        enabled: values.enabled,
        updatedBy: values.updatedBy,
        updatedAt: values.updatedAt,
      },
    });

  // Never record the key itself, only whether it changed.
  await db.insert(s.adminAuditLog).values({
    actorId,
    action: "llm.provider.save",
    targetType: "llm_provider",
    targetId: LLM_ROW_ID,
    diff: { label, baseUrl, model, enabled: input.enabled, dailyTokenLimit: values.dailyTokenLimit, keyChanged },
  });

  return { ok: true };
}

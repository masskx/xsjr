"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PromptVariable } from "@/lib/types";
import { CopyButton } from "./copy-button";

function fill(
  template: string,
  values: Record<string, string>,
  variables: PromptVariable[],
) {
  const labels = new Map(variables.map((v) => [v.key, v.label]));
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m, key: string) => {
      const v = (values[key] ?? "").trim();
      if (v) return v;
      return `〔${labels.get(key) ?? key}：待填写〕`;
    },
  );
}

export function PromptPlayground({
  template,
  variables,
  canCopy = true,
  loginHref = "/login/",
}: {
  template: string;
  variables: PromptVariable[];
  canCopy?: boolean;
  loginHref?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      variables
        .filter((v) => v.default)
        .map((v) => [v.key, String(v.default)]),
    ),
  );

  const missing = useMemo(
    () =>
      variables.filter(
        (v) => v.required && !(values[v.key] ?? "").trim().length,
      ),
    [variables, values],
  );

  const filled = useMemo(
    () => fill(template, values, variables),
    [template, values, variables],
  );

  const set = (k: string, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* 变量表单 */}
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-900">填写变量</h3>
          <span className="text-[11px] text-zinc-400">
            {variables.length} 个变量
          </span>
        </div>
        <div className="space-y-4 p-4">
          {variables.map((v) => (
            <div key={v.key}>
              <label
                htmlFor={`var-${v.key}`}
                className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-medium text-zinc-700"
              >
                {v.label}
                {v.required && <span className="text-rose-500">*</span>}
                <code className="ml-auto font-mono text-[11px] font-normal text-zinc-400">
                  {`{{${v.key}}}`}
                </code>
              </label>

              {v.type === "textarea" ? (
                <textarea
                  id={`var-${v.key}`}
                  rows={4}
                  value={values[v.key] ?? ""}
                  onChange={(e) => set(v.key, e.target.value)}
                  placeholder={v.help}
                  className="w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                />
              ) : v.type === "select" ? (
                <select
                  id={`var-${v.key}`}
                  value={values[v.key] ?? ""}
                  onChange={(e) => set(v.key, e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-800 outline-none focus:border-zinc-400"
                >
                  <option value="">请选择…</option>
                  {(v.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : v.type === "boolean" ? (
                <label className="flex items-center gap-2 text-[13px] text-zinc-600">
                  <input
                    id={`var-${v.key}`}
                    type="checkbox"
                    checked={values[v.key] === "是"}
                    onChange={(e) => set(v.key, e.target.checked ? "是" : "否")}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  启用
                </label>
              ) : (
                <input
                  id={`var-${v.key}`}
                  type="text"
                  value={values[v.key] ?? ""}
                  onChange={(e) => set(v.key, e.target.value)}
                  placeholder={v.help}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                />
              )}

              {v.type !== "boolean" && v.help && (
                <p className="mt-1 text-[11px] leading-5 text-zinc-400">
                  {v.help}
                </p>
              )}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
            {canCopy ? (
              <>
                <CopyButton text={filled} label="复制当前提示词" />
                <CopyButton
                  text={template}
                  label="复制原始模板"
                  variant="ghost"
                />
              </>
            ) : (
              <Link
                href={loginHref}
                className="inline-flex h-9 items-center rounded-[3px] bg-zinc-900 px-3 text-[13px] font-medium text-white no-underline hover:bg-zinc-700"
              >
                登录后复制完整提示词
              </Link>
            )}
          </div>

          {missing.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-700">
              还有必填变量未填：{missing.map((m) => m.label).join("、")}
              。可以先复制原始模板，填好后再自行替换。
            </p>
          )}
        </div>
      </div>

      {/* 实时预览 */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-900">最终文本预览</h3>
          <span className="text-[11px] text-zinc-400">
            {filled.length} 字符
          </span>
        </div>
        <pre className="thin-scroll m-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-zinc-50/60 p-4 font-mono text-[12.5px] leading-6 text-zinc-800">
          {filled}
        </pre>
      </div>
    </div>
  );
}

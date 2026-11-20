"use client";
import { ActionForm, Field, Submit, TextAreaField } from "@/components/auth/form";
import { createQueryJobAction, createUrlJobAction } from "@/app/admin/actions";

export function UrlJobForm({ max }: { max: number }) {
  return (
    <ActionForm action={createUrlJobAction}>
      <TextAreaField
        name="urls"
        label="来源网址"
        rows={5}
        placeholder={"https://github.com/owner/repo/tree/main/skills/paper-review\nhttps://example.com/skills/literature-search"}
        hint={`每行一个，最多 ${max} 个。GitHub 目录会读取其中的 SKILL.md 和 LICENSE；其他网页提取正文。`}
      />
      <Submit>开始导入</Submit>
    </ActionForm>
  );
}

export function QueryJobForm({ max }: { max: number }) {
  return (
    <ActionForm action={createQueryJobAction}>
      <Field name="query" label="搜索词" maxLength={100} hint="例如：Claude skill 文献综述 SKILL.md" />
      <Field name="domains" label="允许的域名" maxLength={2000} hint="只导入这些域名（含子域名）下的结果，用逗号或空格分隔，例如 github.com" />
      <Field name="limit" label="最多导入条数" inputMode="numeric" defaultValue="5" maxLength={2} hint={`1–${max}`} />
      <Submit>搜索并导入</Submit>
    </ActionForm>
  );
}

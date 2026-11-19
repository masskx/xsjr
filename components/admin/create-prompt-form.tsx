"use client";
import { ActionForm, Field, Submit } from "@/components/auth/form";
import { createPromptAction } from "@/app/admin/actions";

export function CreatePromptForm({ categories }: { categories: string[] }) {
  return (
    <ActionForm action={createPromptAction}>
      <Field name="title" label="标题" maxLength={80} />
      <Field name="slug" label="网址标识" maxLength={60} hint="小写字母、数字和连字符，例如 methods-writer。发布后不能再改。" />
      <Field name="summary" label="摘要" maxLength={110} hint="20–110 字，显示在卡片和搜索结果里。" />
      <Field name="category" label="分类" maxLength={20} hint={categories.length ? `已有分类：${categories.join("、")}` : undefined} />
      <Submit>创建草稿</Submit>
    </ActionForm>
  );
}

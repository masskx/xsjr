"use server";
// Admin actions. Each one starts with adminContext() (admin role + TOTP-verified session);
// destructive ones also require a recent re-authentication.
import { redirect } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown";
import { safeNextPath } from "@/lib/auth/next-path";
import { markViewerSession, requestCtx } from "@/lib/auth/server";
import { checkTotp, issueAccountLink } from "@/lib/auth/service";
import { adminContext, requireRecentReauth } from "@/lib/admin/server";
import * as prompts from "@/lib/admin/prompts";
import { auditUserAction } from "@/lib/admin/users";
import * as members from "@/lib/admin/members";

export interface AdminFormState {
  ok?: boolean;
  error?: string;
  field?: string;
  message?: string;
  values?: Record<string, string>;
  /** a link to show once (verification / reset) */
  link?: string;
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const idOf = (fd: FormData) => {
  const n = Number(str(fd, "id"));
  if (!Number.isInteger(n) || n <= 0) throw new Error("bad id");
  return n;
};
const back = (id: number, q: string) => redirect(`/admin/prompts/${id}/?${q}`);

// ── prompts ──

export async function createPromptAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const { ctx } = await adminContext();
  const values = { title: str(fd, "title"), slug: str(fd, "slug"), summary: str(fd, "summary"), category: str(fd, "category") };
  const r = await prompts.createPromptDraft(ctx, values);
  if (!r.ok) {
    const [field, error] = Object.entries(r.errors)[0];
    return { error, field, values };
  }
  redirect(`/admin/prompts/${r.id}/?created=1`);
}

export type SaveResult = { ok: true; version: string } | { ok: false; errors: Record<string, string>; conflict?: boolean };

/** Called by the editor (client component) with the full structured input. */
export async function savePromptAction(id: number, input: unknown, version: string): Promise<SaveResult> {
  const { ctx } = await adminContext();
  return prompts.savePrompt(ctx, id, input, version);
}

export async function previewMarkdownAction(source: string): Promise<string> {
  await adminContext();
  return renderMarkdown(source.slice(0, 50_000)); // html:false: raw HTML is escaped
}

export async function publishPromptAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  const r = await prompts.publishPrompt(ctx, id);
  if (!r.ok) back(id, `err=${encodeURIComponent(Object.values(r.errors).join("；"))}`);
  back(id, "msg=published");
}

export async function unpublishPromptAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  const r = await prompts.unpublishPrompt(ctx, id);
  if (!r.ok) back(id, `err=${encodeURIComponent(Object.values(r.errors).join("；"))}`);
  back(id, "msg=unpublished");
}

export async function archivePromptAction(fd: FormData): Promise<void> {
  const { viewer, ctx } = await adminContext();
  const id = idOf(fd);
  requireRecentReauth(viewer, `/admin/prompts/${id}/`);
  const r = await prompts.archivePrompt(ctx, id);
  if (!r.ok) back(id, `err=${encodeURIComponent(Object.values(r.errors).join("；"))}`);
  redirect("/admin/prompts/?msg=archived");
}

export async function restorePromptAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  const r = await prompts.restorePrompt(ctx, id);
  if (!r.ok) back(id, `err=${encodeURIComponent(Object.values(r.errors).join("；"))}`);
  back(id, "msg=restored");
}

export async function movePromptAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  const dir = str(fd, "dir") === "up" ? "up" : "down";
  const r = await prompts.movePrompt(ctx, id, dir);
  const qs = str(fd, "qs");
  const keep = qs && /^[\w%=&.\-]*$/.test(qs) ? `&${qs}` : "";
  if (!r.ok) redirect(`/admin/prompts/?err=${encodeURIComponent(Object.values(r.errors).join("；"))}${keep}#p-${id}`);
  redirect(`/admin/prompts/?moved=${id}${keep}#p-${id}`);
}

// ── users ──

export async function issueLinkAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const { viewer, ctx } = await adminContext();
  const userId = Number(str(fd, "userId"));
  const purpose = str(fd, "purpose") === "PASSWORD_RESET" ? "PASSWORD_RESET" : "EMAIL_VERIFY";
  // a reset link is an account takeover capability: re-authenticate first
  if (purpose === "PASSWORD_RESET") requireRecentReauth(viewer, `/admin/users/${userId}/`);
  const r = await issueAccountLink(await requestCtx(), userId, purpose, viewer.userId);
  if (!r) return { error: "用户不存在" };
  await auditUserAction(ctx.db, viewer.userId, purpose === "PASSWORD_RESET" ? "user.issue_reset_link" : "user.issue_verify_link", userId);
  return {
    ok: true,
    link: r.link,
    message: purpose === "PASSWORD_RESET" ? "重置链接（1 小时内有效，只显示这一次）：" : "验证链接（24 小时内有效，只显示这一次）：",
  };
}

// ── re-authentication ──

export async function reauthAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const { viewer } = await adminContext();
  const r = await checkTotp(await requestCtx(), viewer.userId, str(fd, "code"));
  if (!r.ok) return { error: r.error, field: r.field ?? "code" };
  await markViewerSession(viewer, "reauth");
  redirect(safeNextPath(str(fd, "next"), "/admin/"));
}

// ── memberships ──

const DAY_MS = 24 * 3600_000;

/** Duration choices from the grant form -> expiry instant (null = no expiry). */
function expiryFrom(fd: FormData, now: Date): Date | null | "invalid" {
  const choice = str(fd, "duration");
  if (choice === "forever") return null;
  if (choice === "date") {
    const d = str(fd, "until");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "invalid";
    const end = new Date(`${d}T23:59:59+08:00`); // end of that day, Beijing time
    return Number.isNaN(end.getTime()) ? "invalid" : end;
  }
  const days = Number(choice);
  if (![30, 90, 180, 365].includes(days)) return "invalid";
  return new Date(now.getTime() + days * DAY_MS);
}

export async function grantTierAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const { ctx } = await adminContext();
  const userId = Number(str(fd, "userId"));
  const endsAt = expiryFrom(fd, new Date());
  if (endsAt === "invalid") return { error: "请选择有效期", field: "duration" };
  const r = await members.grantTier(ctx, userId, { tier: str(fd, "tier"), endsAt, note: str(fd, "note") });
  if (!r.ok) return { error: r.error };
  redirect(`/admin/users/${userId}/?msg=granted`);
}

export async function revokeTierAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const userId = Number(str(fd, "userId"));
  const r = await members.revokeTier(ctx, userId, str(fd, "note"));
  redirect(`/admin/users/${userId}/?${r.ok ? "msg=revoked" : `err=${encodeURIComponent(r.error)}`}`);
}

export async function setModuleTierAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  const r = await members.setModuleTier(ctx, id, str(fd, "tier"));
  redirect(`/admin/modules/?${r.ok ? `saved=${id}` : `err=${encodeURIComponent(r.error)}`}#m-${id}`);
}

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
import * as R from "@/lib/admin/resources";
import { moduleAdapter, removeDiagram, setDiagram } from "@/lib/admin/modules";
import { skillAdapter } from "@/lib/admin/skills";
import { siteAdapter } from "@/lib/admin/sites";
import * as ingest from "@/lib/ingest/jobs";
import * as announcements from "@/lib/announcements";
import * as apiTokens from "@/lib/admin/api-tokens";
import { invalidateAnnouncement } from "@/lib/repo";

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

// ── modules and skills (shared lifecycle in lib/admin/resources.ts) ──

type Kind = "MODULE" | "SKILL" | "SITE";
const ADAPTER = { MODULE: moduleAdapter, SKILL: skillAdapter, SITE: siteAdapter } as const;
const BASE: Record<Kind, string> = { MODULE: "modules", SKILL: "skills", SITE: "sites" };
const backTo = (kind: Kind, id: number, q: string) => redirect(`/admin/${BASE[kind]}/${id}/?${q}`);
const errQ = (errors: Record<string, string>) => `err=${encodeURIComponent(Object.values(errors).join("；"))}`;

async function createOf(kind: Kind, fd: FormData): Promise<AdminFormState> {
  const { ctx } = await adminContext();
  const values = { title: str(fd, "title"), slug: str(fd, "slug"), summary: str(fd, "summary"), category: str(fd, "category") };
  const r = await R.createDraft(ctx, ADAPTER[kind] as R.Adapter<R.CommonInput>, values);
  if (!r.ok) {
    const [field, error] = Object.entries(r.errors)[0];
    return { error, field, values };
  }
  redirect(`/admin/${BASE[kind]}/${r.id}/?created=1`);
}
async function publishOf(kind: Kind, fd: FormData) {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  const r = await R.publishResource(ctx, ADAPTER[kind] as R.Adapter<R.CommonInput>, id);
  backTo(kind, id, r.ok ? "msg=published" : errQ(r.errors));
}
async function statusOf(kind: Kind, fd: FormData, op: "unpublish" | "archive" | "restore") {
  const { viewer, ctx } = await adminContext();
  const id = idOf(fd);
  if (op === "archive") requireRecentReauth(viewer, `/admin/${BASE[kind]}/${id}/`);
  const r = await R[op](ctx, kind, id);
  if (!r.ok) backTo(kind, id, errQ(r.errors));
  if (op === "archive") redirect(`/admin/${BASE[kind]}/?msg=archived`);
  backTo(kind, id, op === "unpublish" ? "msg=unpublished" : "msg=restored");
}
async function moveOf(kind: Kind, fd: FormData) {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  const r = await R.move(ctx, kind, id, str(fd, "dir") === "up" ? "up" : "down");
  redirect(`/admin/${BASE[kind]}/?${r.ok ? `moved=${id}` : errQ(r.errors)}#p-${id}`);
}

export async function createModuleAction(_: AdminFormState, fd: FormData) { return createOf("MODULE", fd); }
export async function createSkillAction(_: AdminFormState, fd: FormData) { return createOf("SKILL", fd); }
export async function saveModuleAction(id: number, input: unknown, version: string): Promise<SaveResult> {
  const { ctx } = await adminContext();
  return R.saveResource(ctx, moduleAdapter, id, input, version);
}
export async function saveSkillAction(id: number, input: unknown, version: string): Promise<SaveResult> {
  const { ctx } = await adminContext();
  return R.saveResource(ctx, skillAdapter, id, input, version);
}
export async function publishModuleAction(fd: FormData) { await publishOf("MODULE", fd); }
export async function publishSkillAction(fd: FormData) { await publishOf("SKILL", fd); }
export async function unpublishModuleAction(fd: FormData) { await statusOf("MODULE", fd, "unpublish"); }
export async function unpublishSkillAction(fd: FormData) { await statusOf("SKILL", fd, "unpublish"); }
export async function archiveModuleAction(fd: FormData) { await statusOf("MODULE", fd, "archive"); }
export async function archiveSkillAction(fd: FormData) { await statusOf("SKILL", fd, "archive"); }
export async function restoreModuleAction(fd: FormData) { await statusOf("MODULE", fd, "restore"); }
export async function restoreSkillAction(fd: FormData) { await statusOf("SKILL", fd, "restore"); }
export async function moveModuleAction(fd: FormData) { await moveOf("MODULE", fd); }
export async function moveSkillAction(fd: FormData) { await moveOf("SKILL", fd); }

// ── structure diagrams ──

export async function uploadDiagramAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "请选择图片文件" };
  if (file.size > 2 * 1024 * 1024) return { error: "图片不能超过 2 MB" };
  const alt = str(fd, "alt").trim();
  if (!alt) return { error: "请填写图片说明（替代文字），方便读屏用户理解结构图" };
  const r = await setDiagram(ctx, id, Buffer.from(await file.arrayBuffer()), alt);
  if (!r.ok) return { error: r.error };
  redirect(`/admin/modules/${id}/?msg=diagram`);
}

export async function removeDiagramAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  await removeDiagram(ctx, id);
  redirect(`/admin/modules/${id}/?msg=diagram-removed`);
}

// ── ingestion (slice 7) ──

export async function createUrlJobAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const { ctx } = await adminContext();
  const values = { urls: str(fd, "urls").slice(0, 20_000) };
  const r = await ingest.createUrlJob(ctx.db, ctx.actorId, values.urls);
  if (!r.ok) {
    const [field, error] = Object.entries(r.errors)[0];
    return { error, field: field === "_form" ? undefined : field, values };
  }
  redirect(`/admin/ingest/${r.jobId}/?created=${r.queued}&skipped=${r.skipped.length}`);
}

export async function createQueryJobAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const { ctx } = await adminContext();
  const values = { query: str(fd, "query").slice(0, 200), domains: str(fd, "domains").slice(0, 2000), limit: str(fd, "limit") };
  const r = await ingest.createQueryJob(ctx.db, ctx.actorId, { query: values.query, domains: values.domains, limit: Number(values.limit) });
  if (!r.ok) {
    const [field, error] = Object.entries(r.errors)[0];
    return { error, field: field === "_form" ? undefined : field, values };
  }
  redirect(`/admin/ingest/${r.jobId}/?created=query`);
}

export async function retryIngestItemAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const itemId = idOf(fd);
  const jobId = Number(str(fd, "job"));
  const r = await ingest.retryItem(ctx.db, ctx.actorId, itemId);
  const q = r.ok ? "msg=retry" : `err=${encodeURIComponent(Object.values(r.errors).join("；"))}`;
  redirect(`/admin/ingest/${Number.isInteger(jobId) && jobId > 0 ? `${jobId}/` : ""}?${q}`);
}

// ── announcements ──

function parseLocal(v: string): Date | null {
  // <input type="datetime-local"> gives "YYYY-MM-DDTHH:mm" in Beijing time
  if (!v) return null;
  const d = new Date(`${v}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function saveAnnouncementAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const id = Number(str(fd, "id")) || null;
  const r = await announcements.saveAnnouncement(ctx.db, ctx.actorId, id, {
    title: str(fd, "title"),
    bodyMd: str(fd, "bodyMd"),
    isActive: fd.get("isActive") === "on",
    startsAt: parseLocal(str(fd, "startsAt")),
    endsAt: parseLocal(str(fd, "endsAt")),
  });
  invalidateAnnouncement();
  redirect(r.ok ? `/admin/announcements/?msg=saved` : `/admin/announcements/${id ? `?edit=${id}&` : "?"}err=${encodeURIComponent(r.error)}`);
}

export async function deleteAnnouncementAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  await announcements.deleteAnnouncement(ctx.db, ctx.actorId, idOf(fd));
  invalidateAnnouncement();
  redirect(`/admin/announcements/?msg=deleted`);
}

// ── research-navigation sites ──

export async function createSiteAction(_: AdminFormState, fd: FormData) { return createOf("SITE", fd); }
export async function saveSiteAction(id: number, input: unknown, version: string): Promise<SaveResult> {
  const { ctx } = await adminContext();
  return R.saveResource(ctx, siteAdapter, id, input, version);
}
export async function publishSiteAction(fd: FormData) { await publishOf("SITE", fd); }
export async function unpublishSiteAction(fd: FormData) { await statusOf("SITE", fd, "unpublish"); }
export async function archiveSiteAction(fd: FormData) { await statusOf("SITE", fd, "archive"); }
export async function restoreSiteAction(fd: FormData) { await statusOf("SITE", fd, "restore"); }
export async function moveSiteAction(fd: FormData) { await moveOf("SITE", fd); }

export async function uploadSiteIconAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "请选择图片文件" };
  if (file.size > 2 * 1024 * 1024) return { error: "图片不能超过 2 MB" };
  const alt = str(fd, "alt").trim() || "站点图标";
  const r = await setDiagram(ctx, id, Buffer.from(await file.arrayBuffer()), alt);
  if (!r.ok) return { error: r.error };
  redirect(`/admin/sites/${id}/?msg=icon`);
}

export async function removeSiteIconAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  const id = idOf(fd);
  await removeDiagram(ctx, id);
  redirect(`/admin/sites/${id}/?msg=icon-removed`);
}

// ── API tokens ──

export async function createApiTokenAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const { viewer, ctx } = await adminContext();
  requireRecentReauth(viewer, "/admin/api/");
  const days = Number(str(fd, "days"));
  const r = await apiTokens.createApiToken(ctx.db, ctx.actorId, str(fd, "name"), days > 0 ? days : null);
  if (!r.ok) return { error: r.error, field: "name", values: { name: str(fd, "name") } };
  return { ok: true, message: "令牌已创建。它只显示这一次，请立即复制保存。", link: r.token };
}

export async function revokeApiTokenAction(fd: FormData): Promise<void> {
  const { ctx } = await adminContext();
  await apiTokens.revokeApiToken(ctx.db, ctx.actorId, idOf(fd));
  redirect("/admin/api/?msg=revoked");
}

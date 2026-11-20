"use server";
// Form actions for accounts. Every action re-checks that accounts are enabled: server actions are
// reachable by POST even when their pages answer 404. Next.js verifies the Origin header of every
// server action (CSRF), and the session cookie is SameSite=Lax.
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/next-path";
import {
  authConfig,
  clearSessionCookie,
  getViewer,
  markViewerSession,
  requestCtx,
  revokeOtherViewerSessions,
  revokeViewerSession,
  setSessionCookie,
} from "@/lib/auth/server";
import * as svc from "@/lib/auth/service";
import { recordAccountEvent } from "@/lib/analytics/server";

export interface FormState {
  ok?: boolean;
  error?: string;
  field?: string;
  message?: string;
  /** non-secret values echoed back so the form keeps them after a failed submit */
  values?: Record<string, string>;
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

function guard() {
  if (!authConfig().available) throw new Error("accounts are disabled");
}

function failed(r: { error: string; field?: string; retryAfter?: number }, values?: Record<string, string>): FormState {
  const wait = r.retryAfter && r.retryAfter > 60 ? `（约 ${Math.ceil(r.retryAfter / 60)} 分钟后）` : "";
  return { error: r.error + wait, field: r.field, values };
}

async function signedIn() {
  guard();
  const viewer = await getViewer();
  if (!viewer) redirect("/login/");
  return viewer;
}

// ── sign in / sign up / sign out ──

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  guard();
  const next = safeNextPath(str(fd, "next"));
  const r = await svc.login(await requestCtx(), { email: str(fd, "email"), password: str(fd, "password") });
  if (!r.ok) return failed(r, { email: str(fd, "email") });
  await setSessionCookie(r.token, r.expiresAt);
  await recordAccountEvent("login", r.userId, "/login/");
  if (r.next === "mfa") redirect(`/login/mfa/?next=${encodeURIComponent(next)}`);
  if (r.next === "mfa-setup") redirect(`/account/mfa/?next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  guard();
  const ctx = await requestCtx();
  const email = str(fd, "email");
  const password = str(fd, "password");
  const values = { email, displayName: str(fd, "displayName") };
  if (password !== str(fd, "password2")) return { error: "两次输入的密码不一致", field: "password2", values };
  const r = await svc.register(ctx, { email, password, displayName: values.displayName, consent: fd.get("consent") === "on" });
  if (!r.ok) return failed(r, values);
  await recordAccountEvent("register", r.userId, "/register/");
  const session = await svc.login(ctx, { email, password });
  if (!session.ok) redirect("/login/");
  await setSessionCookie(session.token, session.expiresAt);
  redirect("/account/?welcome=1");
}

export async function logoutAction(): Promise<void> {
  guard();
  const viewer = await getViewer();
  if (viewer) await revokeViewerSession(viewer, viewer.id);
  await clearSessionCookie();
  redirect("/");
}

// ── email verification and password reset ──

export async function resendVerificationAction(): Promise<FormState> {
  const viewer = await signedIn();
  const r = await svc.resendVerification(await requestCtx(), viewer.userId);
  if (!r.ok) return failed(r);
  return {
    ok: true,
    message: r.mail === "held" ? "验证邮件已生成，但邮件服务尚未开通，请联系管理员完成验证。" : "验证邮件已发送，请查收（也看看垃圾邮件箱）。",
  };
}

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  guard();
  const r = await svc.requestPasswordReset(await requestCtx(), str(fd, "email"));
  if (!r.ok) return failed(r, { email: str(fd, "email") });
  return { ok: true, message: "如果该邮箱已注册，你会在几分钟内收到重置链接（1 小时内有效）。" };
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  guard();
  if (str(fd, "password") !== str(fd, "password2")) return { error: "两次输入的密码不一致", field: "password2" };
  const r = await svc.resetPassword(await requestCtx(), str(fd, "token"), str(fd, "password"));
  if (!r.ok) return failed(r);
  await clearSessionCookie();
  redirect("/login/?reset=1");
}

// ── account page ──

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const viewer = await signedIn();
  const r = await svc.updateProfile(await requestCtx(), viewer.userId, str(fd, "displayName"));
  if (!r.ok) return failed(r, { displayName: str(fd, "displayName") });
  return { ok: true, message: "已保存", values: { displayName: str(fd, "displayName").trim() } };
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const viewer = await signedIn();
  if (str(fd, "password") !== str(fd, "password2")) return { error: "两次输入的新密码不一致", field: "password2" };
  const r = await svc.changePassword(await requestCtx(), viewer.userId, viewer.id, str(fd, "current"), str(fd, "password"));
  if (!r.ok) return failed(r);
  return { ok: true, message: r.revoked ? `密码已更新，其他 ${r.revoked} 个设备已退出登录。` : "密码已更新。" };
}

export async function revokeSessionAction(fd: FormData): Promise<void> {
  const viewer = await signedIn();
  const id = Number(str(fd, "sessionId"));
  if (Number.isInteger(id) && id > 0 && id !== viewer.id) await revokeViewerSession(viewer, id);
  redirect("/account/#security");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const viewer = await signedIn();
  await revokeOtherViewerSessions(viewer);
  redirect("/account/#security");
}

export async function deleteAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const viewer = await signedIn();
  if (str(fd, "confirm") !== "注销") return { error: "请输入“注销”两个字确认", field: "confirm" };
  const r = await svc.deleteAccount(await requestCtx(), viewer.userId, str(fd, "password"));
  if (!r.ok) return failed(r);
  await clearSessionCookie();
  redirect("/?account-deleted=1");
}

// ── two-step verification (admins) ──

export async function totpAction(_: FormState, fd: FormData): Promise<FormState> {
  const viewer = await signedIn();
  const r = await svc.checkTotp(await requestCtx(), viewer.userId, str(fd, "code"));
  if (!r.ok) return failed(r);
  await markViewerSession(viewer, "mfa");
  redirect(safeNextPath(str(fd, "next"), viewer.user.role === "ADMIN" ? "/admin/" : "/account/"));
}

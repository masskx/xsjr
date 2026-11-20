import type { Metadata } from "next";
import { Notice, btn, fmtDateTime } from "@/components/admin/ui";
import { adminData } from "@/lib/admin/server";
import { deleteAnnouncementAction, saveAnnouncementAction } from "../actions";

export const metadata: Metadata = { title: "公告" };

const local = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(d).replace(" ", "T") : "";

const input = "block w-full rounded-[3px] border border-zinc-300 bg-white px-3 py-2 text-[13.5px] text-zinc-900 outline-none focus:border-zinc-900";

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; edit?: string }> }) {
  const sp = await searchParams;
  const rows = await adminData.announcements();
  const editing = rows.find((r) => r.id === Number(sp.edit)) ?? null;
  const now = Date.now();
  const live = rows.find((r) => r.isActive && (!r.startsAt || r.startsAt.getTime() <= now) && (!r.endsAt || r.endsAt.getTime() > now));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">公告</h1>
        <p className="mt-1 text-[13.5px] leading-6 text-zinc-500">
          访客每天第一次打开网站时看到当前公告（同一浏览器一天一次；修改公告后当天会再显示一次）。同时只显示一条：启用中、在时间范围内、最近修改的那条。正文支持 Markdown（不支持 HTML）。
        </p>
      </div>
      {sp.msg === "saved" && <Notice tone="ok">已保存。网站上一分钟内生效。</Notice>}
      {sp.msg === "deleted" && <Notice tone="ok">已删除。</Notice>}
      {sp.err && <Notice tone="error">{sp.err}</Notice>}
      <p className="text-[13px] text-zinc-600">当前显示：{live ? <b className="text-zinc-900">{live.title}</b> : "没有（访客不会看到弹窗）"}</p>

      <form action={saveAnnouncementAction} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-zinc-900">{editing ? `编辑：${editing.title}` : "新建公告"}</h2>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <label className="block text-[12.5px] font-medium text-zinc-700">
          标题
          <input name="title" required maxLength={60} defaultValue={editing?.title ?? ""} className={`mt-1 ${input}`} />
        </label>
        <label className="block text-[12.5px] font-medium text-zinc-700">
          正文（Markdown，可留空）
          <textarea name="bodyMd" rows={6} maxLength={2000} defaultValue={editing?.bodyMd ?? ""} className={`mt-1 font-mono ${input}`} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-[12.5px] font-medium text-zinc-700">
            开始时间（北京时间，可留空）
            <input type="datetime-local" name="startsAt" defaultValue={local(editing?.startsAt ?? null)} className={`mt-1 ${input}`} />
          </label>
          <label className="block text-[12.5px] font-medium text-zinc-700">
            结束时间（可留空）
            <input type="datetime-local" name="endsAt" defaultValue={local(editing?.endsAt ?? null)} className={`mt-1 ${input}`} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-zinc-800">
          <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} />
          启用
        </label>
        <div className="flex gap-2">
          <button className={btn.primary}>{editing ? "保存修改" : "发布公告"}</button>
          {editing && (
            <a href="/admin/announcements/" className={btn.secondary}>
              取消编辑
            </a>
          )}
        </div>
      </form>

      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {rows.length === 0 && <li className="p-6 text-center text-[13px] text-zinc-500">还没有公告。</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className={`rounded-full px-2 py-0.5 text-[12px] ${r === live ? "bg-emerald-100 text-emerald-800" : r.isActive ? "bg-zinc-100 text-zinc-700" : "bg-zinc-50 text-zinc-500"}`}>
              {r === live ? "显示中" : r.isActive ? "已启用（不在时间范围）" : "未启用"}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-900">{r.title}</span>
            <span className="text-[12px] text-zinc-500">{fmtDateTime.format(r.updatedAt)}</span>
            <a href={`/admin/announcements/?edit=${r.id}`} className={btn.secondary}>
              编辑
            </a>
            <form action={deleteAnnouncementAction}>
              <input type="hidden" name="id" value={r.id} />
              <button className={btn.danger}>删除</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

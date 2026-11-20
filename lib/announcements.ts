// Site announcements: written in the back office, shown to each visitor once per day (the
// "seen today" flag lives in the visitor's browser). At most one is shown: the newest active one
// whose time window contains now.
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db/client";
import * as s from "./db/schema";

export const announcementSchema = z
  .object({
    title: z.string().trim().min(1, "请填写标题").max(60, "标题不能超过 60 个字"),
    bodyMd: z.string().trim().max(2000, "正文不能超过 2000 个字"),
    isActive: z.boolean(),
    startsAt: z.date().nullable(),
    endsAt: z.date().nullable(),
  })
  .refine((a) => !a.startsAt || !a.endsAt || a.endsAt > a.startsAt, { message: "结束时间必须晚于开始时间", path: ["endsAt"] });
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export async function activeAnnouncement(db: Db, now = new Date()) {
  const [row] = await db
    .select()
    .from(s.announcements)
    .where(
      and(
        eq(s.announcements.isActive, true),
        or(isNull(s.announcements.startsAt), lte(s.announcements.startsAt, now)),
        or(isNull(s.announcements.endsAt), gt(s.announcements.endsAt, now)),
      ),
    )
    .orderBy(desc(s.announcements.updatedAt))
    .limit(1);
  return row ?? null;
}

export const listAnnouncements = (db: Db) => db.select().from(s.announcements).orderBy(desc(s.announcements.updatedAt)).limit(100);

async function audit(db: Db, actorId: number, action: string, id: number, diff?: unknown) {
  await db.insert(s.adminAuditLog).values({ actorId, action, targetType: "announcement", targetId: id, diff: diff ?? null });
}

export async function saveAnnouncement(db: Db, actorId: number, id: number | null, raw: unknown): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const parsed = announcementSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const now = new Date();
  if (id) {
    const rows = await db.update(s.announcements).set({ ...v, updatedBy: actorId, updatedAt: now }).where(eq(s.announcements.id, id)).returning({ id: s.announcements.id });
    if (!rows.length) return { ok: false, error: "公告不存在" };
    await audit(db, actorId, "announcement.update", id, { title: v.title, isActive: v.isActive });
    return { ok: true, id };
  }
  const [row] = await db.insert(s.announcements).values({ ...v, createdBy: actorId, updatedBy: actorId }).returning({ id: s.announcements.id });
  await audit(db, actorId, "announcement.create", row.id, { title: v.title, isActive: v.isActive });
  return { ok: true, id: row.id };
}

export async function deleteAnnouncement(db: Db, actorId: number, id: number) {
  await db.delete(s.announcements).where(eq(s.announcements.id, id));
  await audit(db, actorId, "announcement.delete", id);
}

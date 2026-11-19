// Outbound mail through the mail_outbox table. Every message is recorded first, then delivered by
// the configured driver:
//   smtp  real delivery (SMTP_URL, MAIL_FROM). Tencent Cloud blocks port 25: use 465/587.
//   log   development: prints the message (including links) to the server log
//   hold  no provider yet: messages stay in the outbox with status "held"; self-service flows
//         that depend on mail arriving (password reset) are disabled, and nothing that relies on
//         a verified email is trusted. An admin can issue links instead (slice 3).
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import type { MailDriver } from "./config";

export type Template = "verify_email" | "password_reset";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export function render(template: Template, payload: { link: string; siteName: string }): Omit<MailMessage, "to"> {
  switch (template) {
    case "verify_email":
      return {
        subject: `【${payload.siteName}】请验证你的邮箱`,
        text: `你好！\n\n请在 24 小时内打开下面的链接，完成邮箱验证：\n\n${payload.link}\n\n如果不是你本人注册，请忽略这封邮件。\n\n—— ${payload.siteName}`,
      };
    case "password_reset":
      return {
        subject: `【${payload.siteName}】重置密码`,
        text: `你好！\n\n我们收到了重置密码的请求。请在 1 小时内打开下面的链接设置新密码：\n\n${payload.link}\n\n如果不是你本人操作，请忽略这封邮件，你的密码不会改变。\n\n—— ${payload.siteName}`,
      };
  }
}

export interface Mailer {
  driver: MailDriver;
  send(message: MailMessage): Promise<void>;
}

export function createMailer(driver: MailDriver, env: Record<string, string | undefined> = process.env): Mailer {
  if (driver === "smtp") {
    return {
      driver,
      async send(message) {
        const nodemailer = await import("nodemailer");
        const transport = nodemailer.createTransport(env.SMTP_URL);
        await transport.sendMail({ from: env.MAIL_FROM, ...message });
      },
    };
  }
  if (driver === "log") {
    return {
      driver,
      async send(message) {
        console.log(`[mail:log] to=${message.to} subject=${message.subject}\n${message.text}`);
      },
    };
  }
  return {
    driver,
    async send() {
      /* hold: nothing leaves the server */
    },
  };
}

/** Record a message and try to deliver it. Never throws for delivery problems (they are recorded). */
export async function enqueueMail(db: Db, mailer: Mailer, to: string, template: Template, payload: { link: string; siteName: string }) {
  const [row] = await db
    .insert(s.mailOutbox)
    .values({ toEmail: to, template, payload, status: mailer.driver === "hold" ? "held" : "pending" })
    .returning({ id: s.mailOutbox.id });
  if (mailer.driver === "hold") return { id: row.id, status: "held" as const };
  try {
    await mailer.send({ to, ...render(template, payload) });
    await db.update(s.mailOutbox).set({ status: "sent", sentAt: new Date(), attempts: sql`attempts + 1` }).where(eq(s.mailOutbox.id, row.id));
    return { id: row.id, status: "sent" as const };
  } catch (err) {
    await db
      .update(s.mailOutbox)
      .set({ status: "failed", lastError: String((err as Error).message ?? err).slice(0, 500), attempts: sql`attempts + 1` })
      .where(eq(s.mailOutbox.id, row.id));
    return { id: row.id, status: "failed" as const };
  }
}

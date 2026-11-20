import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONSENT_VERSION } from "@/lib/auth/service";
import { authConfig } from "@/lib/auth/server";
import { OPERATOR, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "隐私政策" };

// DRAFT for legal review before accounts go live (see docs/RUNBOOK.md). Content mirrors what the
// code actually does; if the code changes what it collects, this page must change with it.
export default function PrivacyPage() {
  if (!authConfig().available) notFound();
  return (
    <article className="prose-doc mx-auto w-full max-w-3xl px-4 py-10 text-[14px] leading-7 text-zinc-700 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">隐私政策</h1>
      <p className="mt-2 text-[13px] text-zinc-500">版本 {CONSENT_VERSION}</p>

      <Section title="一、我们是谁">
        <p>
          本站（{SITE_NAME}，科研 AI 资源工作台）由 {OPERATOR.name} 运营。个人信息相关问题请联系：{OPERATOR.contact}。
        </p>
      </Section>

      <Section title="二、不登录时">
        <p>浏览、搜索和复制免费资源不需要注册。本站不使用任何第三方统计、广告或跟踪代码，不设置跟踪类 Cookie。服务器访问日志记录访问路径、浏览器信息和截断后的 IP 地址（只保留前三段），用于排查故障和防范攻击，随日志轮换自动删除。</p>
        <p className="mt-2">
          为了解哪些资源有用，本站自行记录匿名的使用统计：打开了哪个页面、点击了“复制”、搜索了什么词，以及来源网站（只记录域名）。统计不使用 Cookie，也不保存 IP 地址：IP 与浏览器标识会与每天更换、两天后删除的随机值一起做不可逆散列，只用来计算当天的独立访客数，无法关联到你本人，也无法跨天追踪。这些记录不与账户关联，保留 13 个月。浏览器开启“请勿追踪（DNT）”或“全球隐私控制（GPC）”时，本站不记录这些统计。
        </p>
      </Section>

      <Section title="三、注册账户后我们收集的信息">
        <ul className="list-disc space-y-1 pl-5">
          <li>邮箱地址：用于登录、找回密码和发送账户通知（必要）。</li>
          <li>密码：只保存经 Argon2id 单向加密后的结果，任何人（包括我们）都无法看到原密码。</li>
          <li>昵称：可选，由你填写。</li>
          <li>登录记录：每个登录设备的登录时间、最近活动时间和浏览器标识（User-Agent），用于在“安全”页展示并让你退出可疑设备；注册与登录事件（时间、账户）用于安全审计与统计注册人数。</li>
          <li>会员信息：会员等级与到期时间。</li>
          <li>同意记录：你同意本政策的时间与版本。</li>
        </ul>
        <p className="mt-2">账户数据中不保存你的 IP 地址。为防止暴力破解，登录、注册等操作的频率限制使用经加密散列处理后的 IP 标识，最多保留 2 天。</p>
      </Section>

      <Section title="四、Cookie">
        <p>登录后，本站设置一个名为 <code>__Host-rh_s</code> 的会话 Cookie，仅用于识别你的登录状态。它只能通过 HTTPS 传输、无法被网页脚本读取，退出登录或到期（普通用户 30 天，管理员 12 小时）后失效。</p>
      </Section>

      <Section title="五、信息的使用、共享与存储">
        <ul className="list-disc space-y-1 pl-5">
          <li>以上信息只用于提供账户与会员服务、保障账户安全。</li>
          <li>我们不出售、不出租你的个人信息，也不与第三方共享；法律法规要求的情形除外。</li>
          <li>发送邮件时，你的邮箱地址会交给邮件服务商用于投递。</li>
          <li>数据存储在中华人民共和国境内的服务器上，不向境外传输。</li>
          <li>账户存续期间保存你的信息；注销后立即删除账户、登录记录与收藏；数据库备份中的副本随备份轮换删除，最长保留 8 周。</li>
        </ul>
      </Section>

      <Section title="六、你的权利">
        <ul className="list-disc space-y-1 pl-5">
          <li>查阅与更正：在“我的账户”页查看邮箱、昵称、会员与登录设备，并修改昵称和密码。</li>
          <li>删除：在“我的账户”页可随时自助注销账户。</li>
          <li>撤回同意：注销账户即撤回同意；撤回不影响此前基于同意已进行的处理。</li>
          <li>其他请求或投诉，请联系 {OPERATOR.contact}，我们会在 15 个工作日内答复。</li>
        </ul>
      </Section>

      <Section title="七、未成年人">
        <p>本站面向科研人员。不满 14 周岁的未成年人请勿注册。</p>
      </Section>

      <Section title="八、政策更新">
        <p>本政策更新时，我们会在本页公布新版本；涉及收集范围或用途的实质变化，会在你下次登录时请你重新确认。</p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-[16px] font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}

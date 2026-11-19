import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CONSENT_VERSION } from "@/lib/auth/service";
import { authConfig } from "@/lib/auth/server";
import { OPERATOR } from "@/lib/site";

export const metadata: Metadata = { title: "用户协议" };

// DRAFT for legal review before accounts go live (see docs/RUNBOOK.md).
export default function TermsPage() {
  if (!authConfig().available) notFound();
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 text-[14px] leading-7 text-zinc-700 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">用户协议</h1>
      <p className="mt-2 text-[13px] text-zinc-500">版本 {CONSENT_VERSION}</p>

      <ol className="mt-8 list-decimal space-y-4 pl-5">
        <li>
          <strong className="text-zinc-900">服务内容。</strong>本站由 {OPERATOR.name} 运营，提供科研相关的提示词、Agent Skills、代码模块与网站导航。本站不内置大模型，不代你执行任何代码；资源在你自己的工具中使用，使用结果由你自行判断。
        </li>
        <li>
          <strong className="text-zinc-900">账户。</strong>请使用真实可用的邮箱注册并妥善保管密码。账户仅限本人使用，不得出借、转让或共享。发现账户被盗用请立即修改密码并在“我的账户”中退出其他设备。
        </li>
        <li>
          <strong className="text-zinc-900">许可。</strong>各资源按其页面标注的许可证提供。第三方资源的版权归原作者所有，本站仅提供索引与链接。会员资源仅供会员本人在科研、学习中使用，未经许可不得公开再分发。
        </li>
        <li>
          <strong className="text-zinc-900">禁止行为。</strong>不得以自动化方式批量抓取会员内容，不得尝试绕过访问控制、攻击或干扰本站服务，不得利用本站从事违法活动。
        </li>
        <li>
          <strong className="text-zinc-900">会员。</strong>会员等级及有效期以“我的账户”页显示为准。在线支付开通后，价格与退款规则将另行公布。
        </li>
        <li>
          <strong className="text-zinc-900">免责。</strong>资源按现状提供，本站尽力审核但不保证其适用于你的特定研究，对使用结果不承担责任。
        </li>
        <li>
          <strong className="text-zinc-900">终止。</strong>你可以随时注销账户。违反本协议的，本站可暂停或终止服务。
        </li>
        <li>
          <strong className="text-zinc-900">个人信息。</strong>见{" "}
          <Link href="/privacy/" className="font-medium text-zinc-900">
            《隐私政策》
          </Link>
          。
        </li>
        <li>
          <strong className="text-zinc-900">联系方式与适用法律。</strong>问题与投诉请联系 {OPERATOR.contact}。本协议适用中华人民共和国法律。
        </li>
      </ol>
    </article>
  );
}

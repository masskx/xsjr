/** Truncated server-rendered previews for anonymous visitors. Never pass the full source to the
 * client when this is used. The 40% cut makes even short snippets visibly incomplete. */
export function truncateCode(code: string, max = 1200) {
  if (!code) return code;
  const keep = Math.min(max, Math.max(1, Math.floor(code.length * 0.4)));
  return `${code.slice(0, keep).trimEnd()}\n\n… 登录后查看完整内容 …`;
}

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseAttachmentPath } from "@/lib/content-files";
import { normaliseSourceUrl } from "@/lib/url";

describe("normaliseSourceUrl", () => {
  it.each([
    ["https://www.arxiv.org/", "arxiv.org"],
    ["http://arxiv.org", "arxiv.org"],
    ["https://Example.com/a/b/index.html?utm_source=x&b=2&a=1#frag", "example.com/a/b?a=1&b=2"],
    ["https://github.com/Org/Repo/blob/main/skills/x/SKILL.md", "github.com/org/repo/skills/x/skill.md"],
    ["https://github.com/org/repo/tree/v2/skills/x/SKILL.md", "github.com/org/repo/skills/x/skill.md"],
    ["https://example.com:8443/x/", "example.com:8443/x"],
  ])("%s -> %s", (input, expected) => {
    expect(normaliseSourceUrl(input)).toBe(expected);
  });

  it("rejects non-http schemes and garbage", () => {
    expect(normaliseSourceUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseSourceUrl("file:///etc/passwd")).toBeNull();
    expect(normaliseSourceUrl("not a url")).toBeNull();
  });
});

describe("normaliseAttachmentPath", () => {
  it.each([
    ["stat_tests.py", "stat_tests.py"],
    ["files/stat_tests.py", "stat_tests.py"],
    ["./stat_tests.py", "stat_tests.py"],
    ["/stat_tests.py", "stat_tests.py"],
    ["sub/dir/x.py", "sub/dir/x.py"],
  ])("%s -> %s", (input, expected) => expect(normaliseAttachmentPath(input)).toBe(expected));

  it.each(["../x", "a/../../x", "files/../meta.json", "a//b", "C:/x", "a\\b", ""])("rejects %j", (input) =>
    expect(normaliseAttachmentPath(input)).toBeNull(),
  );
});

describe("architecture", () => {
  const root = path.resolve(__dirname, "..");
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : [],
    );

  it("pages and components never talk to the database directly", () => {
    const offenders = [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))].filter((f) =>
      /from\s+["'](@\/lib\/db|@\/lib\/repo\/store|@\/lib\/content-files|pg|drizzle-orm[^"']*)["']/.test(
        fs.readFileSync(f, "utf8"),
      ),
    );
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("client components never import server data modules", () => {
    const offenders = walk(path.join(root, "components")).filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      // `import type` is erased at compile time and ships nothing, so it is allowed
      return src.startsWith('"use client"') && /^import\s+(?!type\b)[^;]*from\s+["']@\/lib\/(repo|db|search)["']/m.test(src);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});

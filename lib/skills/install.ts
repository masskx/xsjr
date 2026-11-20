// Install locations of Agent Skills per tool. ONLY facts confirmed from each tool's official
// documentation are marked verified (checked 2026-11-20, source URLs below). A tool that a
// skill's compat array names but that is not verified here is shown as "未验证" with no paths
// or commands: we do not invent them.
//
// To verify another tool: read its official docs, add personal/project directories and the
// source URL here, set verified: true.

export interface ToolGuide {
  key: string;
  label: string;
  verified: boolean;
  /** user-level skills directory (POSIX form, ~ = home) */
  personal?: string;
  /** project-level skills directory, relative to the repository root */
  project?: string;
  /** extra facts worth knowing, from the same official source */
  notes?: string[];
  source?: { title: string; url: string };
}

export const TOOL_GUIDES: Record<string, ToolGuide> = {
  "claude-code": {
    key: "claude-code",
    label: "Claude Code",
    verified: true,
    personal: "~/.claude/skills",
    project: ".claude/skills",
    notes: ["个人目录对你的所有项目生效；项目目录可以提交到仓库，团队成员共享。"],
    source: { title: "Claude Code 文档 · Skills", url: "https://code.claude.com/docs/en/skills" },
  },
  codex: {
    key: "codex",
    label: "Codex",
    verified: true,
    personal: "~/.agents/skills",
    project: ".agents/skills",
    notes: ["在 Codex CLI 或 IDE 插件里输入 /skills 查看，或用 $技能名 显式调用。"],
    source: { title: "OpenAI 文档 · Build skills", url: "https://developers.openai.com/codex/skills" },
  },
  cursor: {
    key: "cursor",
    label: "Cursor",
    verified: true,
    personal: "~/.cursor/skills",
    project: ".cursor/skills",
    notes: ["Cursor 也会读取 .agents/skills/ 和 .claude/skills/，在 Agent 对话中输入 / 可手动调用。"],
    source: { title: "Cursor 文档 · Agent Skills", url: "https://cursor.com/docs/skills" },
  },
  "gemini-cli": {
    key: "gemini-cli",
    label: "Gemini CLI",
    verified: true,
    personal: "~/.gemini/skills",
    project: ".gemini/skills",
    notes: ["Agent Skills 在 Gemini CLI 中仍是实验功能，需要先在设置中开启；会话内用 /skills list 查看。"],
    source: { title: "Gemini CLI 文档 · Agent Skills", url: "https://geminicli.com/docs/cli/using-agent-skills/" },
  },
  trae: { key: "trae", label: "Trae", verified: false },
  windsurf: { key: "windsurf", label: "Windsurf", verified: false },
  cline: { key: "cline", label: "Cline", verified: false },
  copilot: { key: "copilot", label: "GitHub Copilot", verified: false },
  "claude-desktop": { key: "claude-desktop", label: "Claude 桌面版", verified: false },
};

/** "generic" in compat = paste SKILL.md into any chat model; not a directory install. */
export const GENERIC_TOOL = "generic";

export function guideFor(tool: string): ToolGuide {
  return TOOL_GUIDES[tool] ?? { key: tool, label: tool, verified: false };
}

const winPath = (posix: string) => posix.replace(/^~\//, "$HOME\\").replace(/\//g, "\\");

/** Shell commands that download the ZIP and unpack it into a skills directory. */
export function installCommands(dir: string, zipUrl: string, skillDir: string): { posix: string; windows: string } {
  return {
    posix: [`mkdir -p ${dir}`, `curl -fL -o /tmp/${skillDir}.zip "${zipUrl}"`, `unzip -o /tmp/${skillDir}.zip -d ${dir}/`].join("\n"),
    windows: [
      `New-Item -ItemType Directory -Force "${winPath(dir)}" | Out-Null`,
      `Invoke-WebRequest "${zipUrl}" -OutFile "$env:TEMP\\${skillDir}.zip"`,
      `Expand-Archive "$env:TEMP\\${skillDir}.zip" -DestinationPath "${winPath(dir)}" -Force`,
    ].join("\n"),
  };
}

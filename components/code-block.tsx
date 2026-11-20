import { CopyButton } from "./copy-button";

export function CodeBlock({
  code,
  filename,
  language,
  maxHeight = "32rem",
}: {
  code: string;
  filename?: string;
  language?: string;
  maxHeight?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[3px] border border-zinc-800 bg-[oklch(17%_0_0)] shadow-md">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="truncate font-mono text-[11.5px] text-zinc-400">
          {filename ?? language ?? "code"}
        </span>
        <CopyButton
          text={code}
          label="复制"
          variant="ghost"
          className="!border-zinc-700 !bg-transparent !px-2 !py-1 !text-[11.5px] !text-zinc-300 hover:!bg-zinc-800"
        />
      </div>
      <pre
        className="thin-scroll m-0 overflow-auto p-4 font-mono text-[12.5px] leading-6 text-zinc-200"
        style={{ maxHeight }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

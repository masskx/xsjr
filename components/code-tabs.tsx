"use client";
// One tab per file, each with its own copy button (CodeBlock). Only rendered when the server has
// decided the viewer may see the code: the files arrive as props from an entitled render only.
import { useId, useRef, useState } from "react";
import { CodeBlock } from "./code-block";

export interface CodeFile {
  path: string;
  language: string;
  content: string;
}

export function CodeTabs({ files, maxHeight = "40rem", allowCopy = true }: { files: CodeFile[]; maxHeight?: string; allowCopy?: boolean }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  if (files.length === 1) return <CodeBlock code={files[0].content} filename={files[0].path} language={files[0].language} maxHeight={maxHeight} allowCopy={allowCopy} />;

  const focus = (i: number) => {
    const n = (i + files.length) % files.length;
    setActive(n);
    tabs.current[n]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="代码文件" className="flex gap-1 overflow-x-auto border-b border-zinc-200">
        {files.map((f, i) => (
          <button
            key={f.path}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={active === i}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") focus(i + 1);
              if (e.key === "ArrowLeft") focus(i - 1);
              if (e.key === "Home") focus(0);
              if (e.key === "End") focus(files.length - 1);
            }}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 font-mono text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 ${
              active === i ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {f.path}
          </button>
        ))}
      </div>
      {files.map((f, i) => (
        <div key={f.path} role="tabpanel" id={`${base}-panel-${i}`} aria-labelledby={`${base}-tab-${i}`} hidden={active !== i} className="mt-3">
          <CodeBlock code={f.content} filename={f.path} language={f.language} maxHeight={maxHeight} allowCopy={allowCopy} />
        </div>
      ))}
    </div>
  );
}

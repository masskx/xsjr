// Server-rendered file-structure diagram: the fallback "structure diagram" for modules without an
// uploaded image, and the thumbnail on gallery cards. Built from file NAMES only (never contents),
// so it is safe to show on members-only modules.

export interface TreeFile {
  path: string;
  sizeBytes?: number;
  note?: string;
  isEntry?: boolean;
}

interface Node {
  name: string;
  file?: TreeFile;
  children: Map<string, Node>;
}

function build(files: TreeFile[]): Node {
  const root: Node = { name: "", children: new Map() };
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      if (!node.children.has(part)) node.children.set(part, { name: part, children: new Map() });
      node = node.children.get(part)!;
      if (i === parts.length - 1) node.file = f;
    });
  }
  return root;
}

const fmtSize = (n?: number) => (n === undefined ? "" : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);

function Rows({ node, depth, compact }: { node: Node; depth: number; compact: boolean }) {
  const entries = [...node.children.values()].sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name, "en"));
  return (
    <>
      {entries.map((n) => (
        <div key={n.name}>
          <div className="flex items-baseline gap-2 whitespace-nowrap" style={{ paddingLeft: `${depth * 1.1}rem` }}>
            <span aria-hidden className="text-zinc-400">
              {n.file ? "📄" : "📁"}
            </span>
            <span className={`truncate ${n.file?.isEntry ? "font-semibold text-zinc-900" : "text-zinc-700"}`}>
              {n.name}
              {!n.file && "/"}
            </span>
            {!compact && n.file?.isEntry && <span className="rounded bg-indigo-50 px-1 text-[10.5px] text-indigo-700">入口</span>}
            {!compact && n.file?.sizeBytes !== undefined && <span className="text-[11px] text-zinc-400">{fmtSize(n.file.sizeBytes)}</span>}
            {!compact && n.file?.note && <span className="truncate text-[11.5px] text-zinc-500">— {n.file.note}</span>}
          </div>
          {!n.file && <Rows node={n} depth={depth + 1} compact={compact} />}
        </div>
      ))}
    </>
  );
}

export function FileTree({ files, root, compact = false }: { files: TreeFile[]; root?: string; compact?: boolean }) {
  if (!files.length) return null;
  return (
    <div className={`font-mono ${compact ? "text-[11px] leading-5" : "text-[12.5px] leading-6"}`} role="tree" aria-label="文件结构">
      {root && (
        <div className="flex items-baseline gap-2 text-zinc-800">
          <span aria-hidden className="text-zinc-400">
            📦
          </span>
          {root}/
        </div>
      )}
      <Rows node={build(files)} depth={root ? 1 : 0} compact={compact} />
    </div>
  );
}

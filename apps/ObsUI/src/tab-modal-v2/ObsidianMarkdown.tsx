import { useEffect, useId, useRef, useState, isValidElement } from "react";
import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import "katex/dist/katex.min.css";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type ObsidianMarkdownProps = {
  content: string;
  vaultPath: string;
  relativePath: string;
};

type AssetResponse = { relativePath: string; dataUrl: string; message?: unknown };

let mermaidPromise: Promise<(typeof import("mermaid"))["default"]> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark", fontFamily: "inherit" });
      return mermaid;
    });
  }
  return mermaidPromise;
}

function prepareObsidianLinks(source: string) {
  let fence: { marker: "`" | "~"; length: number } | null = null;
  return source.split(/\r?\n/).map((line) => {
    const fenceLine = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceLine) {
      const marker = fenceLine[1][0] as "`" | "~";
      if (!fence) fence = { marker, length: fenceLine[1].length };
      else if (fence.marker === marker && fenceLine[1].length >= fence.length) fence = null;
      return line;
    }
    if (fence) return line;

    const inlineCode: string[] = [];
    let prepared = line.replace(/(`+).*?\1/g, (code) => {
      const index = inlineCode.push(code) - 1;
      return `\u0000${index}\u0000`;
    });
    prepared = prepared.replace(/!\[\[([^\]]+)\]\]/g, (_match, value: string) => {
      const [rawTarget, ...options] = value.split("|");
      const target = rawTarget.trim().split("#", 1)[0];
      if (!target) return _match;
      const width = options.map((option) => option.trim().match(/^(\d{2,4})(?:x\d{2,4})?$/i)?.[1]).find(Boolean);
      const encodedTarget = encodeURIComponent(target);
      return `![${target}](obsidian-asset:${encodedTarget}?kind=wiki${width ? `&width=${width}` : ""})`;
    });
    prepared = prepared.replace(/(?<!!)\[\[([^\]]+)\]\]/g, (_match, value: string) => {
      const [targetValue, labelValue] = value.split("|");
      const target = targetValue.split("#", 1)[0].trim();
      const label = (labelValue?.trim() || target).replace(/\]/g, "\\]");
      return `[${label}](obsidian-note:${encodeURIComponent(target)})`;
    });
    return prepared.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => inlineCode[Number(index)] ?? "");
  }).join("\n");
}

function parseAssetSource(source: string) {
  if (!source.startsWith("obsidian-asset:")) return { target: source, kind: "markdown", width: undefined as number | undefined };
  const [encodedTarget, query = ""] = source.slice("obsidian-asset:".length).split("?", 2);
  let target = encodedTarget;
  try { target = decodeURIComponent(encodedTarget); } catch { /* Keep the literal source for a useful error message. */ }
  const parameters = new URLSearchParams(query);
  const requestedWidth = Number(parameters.get("width"));
  return {
    target,
    kind: parameters.get("kind") === "wiki" ? "wiki" : "markdown",
    width: Number.isFinite(requestedWidth) && requestedWidth >= 20 && requestedWidth <= 2_400 ? requestedWidth : undefined,
  };
}

function VaultImage({ source, alt, title, vaultPath, relativePath }: {
  source: string;
  alt: string;
  title?: string;
  vaultPath: string;
  relativePath: string;
}) {
  const frame = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [asset, setAsset] = useState<AssetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assetSource = parseAssetSource(source);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setAsset(null);
    setError(null);
    if (!visible) return;
    const controller = new AbortController();
    void fetch("/api/repositories/obsidian/asset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: vaultPath, relativePath, target: assetSource.target, kind: assetSource.kind }),
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => null) as AssetResponse | null;
      if (!response.ok || !payload || typeof payload.dataUrl !== "string") {
        throw new Error(typeof payload?.message === "string" ? payload.message : "图片无法读取。");
      }
      setAsset(payload);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "图片无法读取。");
    });
    return () => controller.abort();
  }, [assetSource.kind, assetSource.target, relativePath, vaultPath, visible]);

  return <span ref={frame} className="tab-modal-v2__obsidian-image-frame">
    {asset ? <img src={asset.dataUrl} alt={alt || asset.relativePath} title={title} loading="lazy" style={{ width: assetSource.width ? `${assetSource.width}px` : undefined }} /> :
      error ? <span className="tab-modal-v2__obsidian-image-error" role="img" aria-label={`图片无法读取：${alt || assetSource.target}`} title={error}>图片无法读取：{alt || assetSource.target}</span> :
        <span className="tab-modal-v2__obsidian-image-loading" role="status">{visible ? "正在加载插图…" : "插图"}</span>}
  </span>;
}

function MermaidDiagram({ source }: { source: string }) {
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSvg("");
    setError(false);
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        const result = await mermaid.render(`obsui-mermaid-${generatedId}`, source);
        if (!cancelled) setSvg(result.svg);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [generatedId, source]);

  if (error) return <figure className="tab-modal-v2__obsidian-mermaid-error"><figcaption>图表语法无法解析，原始内容保留如下。</figcaption><pre><code>{source}</code></pre></figure>;
  if (!svg) return <div className="tab-modal-v2__obsidian-mermaid-loading" role="status">正在绘制图表…</div>;
  return <div className="tab-modal-v2__obsidian-mermaid" role="img" aria-label="Mermaid 图表" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function ObsidianMarkdown({ content, vaultPath, relativePath }: ObsidianMarkdownProps) {
  const components: Components = {
    a({ href, children, ...props }) {
      if (href?.startsWith("obsidian-note:")) return <span className="tab-modal-v2__obsidian-wikilink" title={decodeURIComponent(href.slice("obsidian-note:".length))}>{children}</span>;
      if (href && /^https?:\/\//i.test(href)) return <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>;
      return <a {...props} href={href}>{children}</a>;
    },
    img({ src, alt = "", title }) {
      if (!src) return null;
      if (/^https?:\/\//i.test(src)) return <img src={src} alt={alt} title={title} loading="lazy" referrerPolicy="no-referrer" />;
      return <VaultImage source={src} alt={alt} title={title} vaultPath={vaultPath} relativePath={relativePath} />;
    },
    code({ className, children, ...props }) {
      if (className?.split(/\s+/).includes("language-mermaid")) return <MermaidDiagram source={String(children).replace(/\n$/, "")} />;
      return <code className={className} {...props}>{children}</code>;
    },
    pre({ children }) {
      if (isValidElement(children) && children.type === MermaidDiagram) return children;
      return <pre>{children}</pre>;
    },
  };
  const urlTransform = (url: string) => /^(?:obsidian-asset|obsidian-note):/.test(url) ? url : defaultUrlTransform(url);
  return <div className="tab-modal-v2__obsidian-markdown">
    <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components} urlTransform={urlTransform}>
      {prepareObsidianLinks(content)}
    </Markdown>
  </div>;
}

import { type ReactNode, type RefObject } from "react";
import { ContentViewport } from "./ContentViewport";
import { TabModalShell } from "./TabModalShell";
import { defaultV2NavForView, type V2BusinessContext, type V2TabKey, type V2ViewKey } from "./model";
import { HddPageV2 } from "./HddPageV2";
import { LocalPage } from "./V2Pages";
import { TargetV1 } from "../target-v1/TargetV1";
import "./tab-modal-v2.css";
import "./tab-modal-v1-shell.css";

export function TabModalV2({
  activeTab,
  activeView,
  context,
  onTabChange,
  onClose,
  dialogRef,
  closeRef,
}: {
  activeTab: V2TabKey;
  activeView: V2ViewKey | string;
  context: V2BusinessContext;
  onTabChange: (tab: V2TabKey) => void;
  onClose: () => void;
  dialogRef?: RefObject<HTMLElement>;
  closeRef?: RefObject<HTMLButtonElement>;
}) {
  return <TabModalShell activeTab={activeTab} onTabChange={onTabChange} onClose={onClose} dialogRef={dialogRef} closeRef={closeRef}>
    <ContentViewport activeTab={activeTab}>
      <div key={activeTab} className="obsui-v1__page-swap">
        <PhaseOnePlaceholder tab={activeTab} view={activeView} context={context} />
      </div>
    </ContentViewport>
  </TabModalShell>;
}

function PhaseOnePlaceholder({ tab, view, context }: { tab: V2TabKey; view: V2ViewKey | string; context: V2BusinessContext }) {
  if (tab === "target") return <TargetV1 context={context} />;
  if (tab === "local") return <LocalPage nav="overview" context={context} />;
  if (tab === "storage") return <StoragePlaceholder />;
  if (tab === "literature") return <LiteraturePlaceholder />;
  return <HddPageV2 nav={defaultV2NavForView(tab, view)} context={context} />;
}

function StoragePlaceholder() {
  return <PhaseOnePage className="obsui-v1__page--storage" label="仓库">
    <div className="obsui-v1__storage-layout">
      <div className="obsui-v1__category-slot"><strong>分类</strong><i>全部</i><i>Obsidian</i><i>Git</i><i>素材</i></div>
      <div className="obsui-v1__storage-main">
        <div className="obsui-v1__toolbar-slot"><b>搜索</b><b>添加</b><b>概览</b></div>
        <RegionSlot className="obsui-v1__resource-list" eyebrow="中央" title="资源列表" />
      </div>
    </div>
  </PhaseOnePage>;
}

function LiteraturePlaceholder() {
  return <PhaseOnePage className="obsui-v1__page--literature" label="文献">
    <div className="obsui-v1__literature-layout">
      <RegionSlot className="obsui-v1__literature-category" eyebrow="左侧" title="分类" />
      <div className="obsui-v1__literature-middle">
        <RegionSlot className="obsui-v1__literature-search" eyebrow="中间上方" title="搜索" />
        <RegionSlot className="obsui-v1__literature-list" eyebrow="中间下方" title="文献列表" />
      </div>
      <RegionSlot className="obsui-v1__literature-detail" eyebrow="右侧" title="文献详情" />
    </div>
  </PhaseOnePage>;
}

function HddPlaceholder() {
  return <PhaseOnePage className="obsui-v1__page--hdd" label="H.D.D">
    <div className="obsui-v1__hdd-layout">
      <RegionSlot className="obsui-v1__hdd-history" eyebrow="左侧" title="会话" />
      <div className="obsui-v1__hdd-middle">
        <RegionSlot className="obsui-v1__hdd-chat" eyebrow="中间" title="对话" />
        <RegionSlot className="obsui-v1__hdd-input" eyebrow="底部" title="输入" />
      </div>
      <RegionSlot className="obsui-v1__hdd-context" eyebrow="右侧" title="预览" />
    </div>
  </PhaseOnePage>;
}

function PhaseOnePage({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  return <section className={`obsui-v1__page ${className}`} aria-label={`${label}页面结构占位`}>
    <div className="obsui-v1__page-content">{children}</div>
  </section>;
}

function RegionSlot({ className, eyebrow, title, detail }: { className: string; eyebrow: string; title: string; detail?: string }) {
  return <div className={`obsui-v1__region-slot ${className}`}>
    <strong>{title}</strong>
    {detail && <small>{detail}</small>}
    <i aria-hidden="true" />
  </div>;
}

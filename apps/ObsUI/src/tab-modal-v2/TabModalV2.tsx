import { lazy, Suspense, type RefObject } from "react";
import { ContentViewport } from "./ContentViewport";
import { TabModalShell } from "./TabModalShell";
import { defaultV2NavForView, type V2BusinessContext, type V2TabKey, type V2ViewKey } from "./model";
import "./tab-modal-v2.css";
import "./tab-modal-v1-shell.css";
import "./functional-theme.css";

const TargetV1 = lazy(() => import("../target-v1/TargetV1").then(({ TargetV1 }) => ({ default: TargetV1 })));
const LocalPage = lazy(() => import("./V2Pages").then(({ LocalPage }) => ({ default: LocalPage })));
const RepositoryPageV2 = lazy(() => import("./RepositoryPageV2").then(({ RepositoryPageV2 }) => ({ default: RepositoryPageV2 })));
const LiteraturePageV2 = lazy(() => import("./LiteraturePageV2").then(({ LiteraturePageV2 }) => ({ default: LiteraturePageV2 })));
const HddPageV2 = lazy(() => import("./HddPageV2").then(({ HddPageV2 }) => ({ default: HddPageV2 })));

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
      <Suspense fallback={<div className="obsui-v1__page-swap" role="status" aria-live="polite">正在加载页面…</div>}>
        <div key={activeTab} className="obsui-v1__page-swap">
          <V2PageContent tab={activeTab} view={activeView} context={context} />
        </div>
      </Suspense>
    </ContentViewport>
  </TabModalShell>;
}
function V2PageContent({ tab, view, context }: { tab: V2TabKey; view: V2ViewKey | string; context: V2BusinessContext }) {
  if (tab === "target") return <TargetV1 context={context} />;
  if (tab === "local") return <LocalPage nav="overview" context={context} />;
  if (tab === "storage") return <RepositoryPageV2 context={context} />;
  if (tab === "literature") return <LiteraturePageV2 startupRuntime={context.literatureStartup.runtime} startupItems={context.literatureStartup.items} settings={context.workbenchSettings} />;
  return <HddPageV2 nav={defaultV2NavForView(tab, view)} context={context} />;
}

import type { RefObject } from "react";
import { ContentViewport } from "./ContentViewport";
import { TabModalShell } from "./TabModalShell";
import { defaultV2NavForView, type V2BusinessContext, type V2TabKey, type V2ViewKey } from "./model";
import { HddPageV2 } from "./HddPageV2";
import { LocalPage } from "./V2Pages";
import { LiteraturePageV2 } from "./LiteraturePageV2";
import { TargetV1 } from "../target-v1/TargetV1";
import { RepositoryPageV2 } from "./RepositoryPageV2";
import "./tab-modal-v2.css";
import "./tab-modal-v1-shell.css";
import "./functional-theme.css";

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
        <V2PageContent tab={activeTab} view={activeView} context={context} />
      </div>
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

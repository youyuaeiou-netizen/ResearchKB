import type { ReactNode } from "react";
import { getV2Tab, type V2TabKey } from "./model";

export function ContentViewport({ activeTab, children }: { activeTab: V2TabKey; children: ReactNode }) {
  const tab = getV2Tab(activeTab);
  return <main id={"tab-modal-v2-panel-" + activeTab} className="tab-modal-v2__content-viewport obsui-v1__content-viewport" role="tabpanel" aria-label={tab.label + "公共内容区域"}>
    <div className="tab-modal-v2__content-body obsui-v1__content-body">{children}</div>
  </main>;
}

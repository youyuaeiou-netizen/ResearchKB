import type { RefObject, ReactNode } from "react";
import { IoCloseOutline } from "react-icons/io5";
import iconUrl from "../../assets/obsui.ico";
import { getV2Tab, type V2TabKey } from "./model";
import { TopTabs } from "./TopTabs";

export function TabModalShell({
  activeTab,
  onTabChange,
  onClose,
  dialogRef,
  closeRef,
  children,
  }: {
  activeTab: V2TabKey;
  onTabChange: (tab: V2TabKey) => void;
  onClose: () => void;
  dialogRef?: RefObject<HTMLElement>;
  closeRef?: RefObject<HTMLButtonElement>;
  children: ReactNode;
}) {
  const tabLabel = getV2Tab(activeTab).label;

  return <div className="tab-modal-v2__overlay obsui-v1-overlay">
    <section ref={dialogRef} className="tab-modal-v2__dialog obsui-v1-shell" role="dialog" aria-modal="true" aria-label={`${tabLabel}功能面板`}>
      <div className="obsui-v1__frame">
        <div className="tab-modal-v2__topbar obsui-v1__topbar">
          <div className="tab-modal-v2__brand obsui-v1__brand" aria-label="ObsUI"><img className="tab-modal-v2__brand-mark" src={iconUrl} alt="" /><b>ObsUI</b></div>
          <TopTabs activeTab={activeTab} onChange={onTabChange} />
          <button ref={closeRef} type="button" className="tab-modal-v2__close obsui-v1__close" onClick={onClose} aria-label="关闭功能面板" title="关闭功能面板"><IoCloseOutline aria-hidden="true" /></button>
        </div>
        <div className="tab-modal-v2__body obsui-v1__body">{children}</div>
      </div>
    </section>
  </div>;
}

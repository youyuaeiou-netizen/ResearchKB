import { V2_TABS, type V2TabKey } from "./model";

export function TopTabs({ activeTab, onChange }: { activeTab: V2TabKey; onChange: (tab: V2TabKey) => void }) {
  return <div className="tab-modal-v2__tab-track obsui-v1__tab-track" role="tablist" aria-label="ObsUI 五项功能切换">
    {V2_TABS.map((tab, index) => {
      const selected = tab.key === activeTab;
      return <button
        key={tab.key}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={`tab-modal-v2-panel-${tab.key}`}
        tabIndex={selected ? 0 : -1}
        data-v2-tab={tab.key}
        className={"tab-modal-v2__top-tab obsui-v1__top-tab" + (selected ? " is-selected" : "")}
        onClick={() => onChange(tab.key)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const nextIndex = (index + (event.key === "ArrowRight" ? 1 : -1) + V2_TABS.length) % V2_TABS.length;
          onChange(V2_TABS[nextIndex]!.key);
          window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-v2-tab="${V2_TABS[nextIndex]!.key}"]`)?.focus());
        }}
      >
        <span>{tab.label}</span>
      </button>;
    })}
  </div>;
}

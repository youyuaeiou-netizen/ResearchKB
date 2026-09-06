import { getV2Tab, type V2TabKey } from "./model";

export function LeftNavPanel({ activeTab, activeNav, onChange }: { activeTab: V2TabKey; activeNav: string; onChange: (id: string) => void }) {
  const tab = getV2Tab(activeTab);
  return <aside className="tab-modal-v2__left-nav obsui-v1__left-nav" aria-label={tab.label + "公共侧栏"}>
    <div className="tab-modal-v2__left-nav-heading obsui-v1__left-nav-heading">
      <strong>{tab.label}</strong>
    </div>
    <nav className="tab-modal-v2__nav-list obsui-v1__nav-list">
      {tab.nav.map((item) => {
        const selected = item.id === activeNav;
        return <button
          key={item.id}
          type="button"
          className={"tab-modal-v2__nav-item obsui-v1__nav-item" + (selected ? " is-selected" : "")}
          aria-current={selected ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          <span className="tab-modal-v2__nav-copy"><b>{item.label}</b></span>
        </button>;
      })}
    </nav>
  </aside>;
}

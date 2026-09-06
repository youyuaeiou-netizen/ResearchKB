import { createRoot, type Root } from "react-dom/client";
import { act, useState, type ReactNode } from "react";
import { describe, expect, it, afterEach } from "vitest";
import { CardRail } from "../src/tab-modal-v2/CardRail";
import { TopTabs } from "../src/tab-modal-v2/TopTabs";
import { V2_TABS, V2_TAB_ORDER, v2TabFromView, v2ViewForTab } from "../src/tab-modal-v2/model";

const mounts: { host: HTMLDivElement; root: Root }[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounts.push({ host, root });
  act(() => root.render(node));
  return host;
}

afterEach(() => {
  for (const { host, root } of mounts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

describe("TabModalV2 configuration", () => {
  it("keeps the five-tab order and maps business views to the requested tabs", () => {
    expect(V2_TAB_ORDER).toEqual(["target", "local", "storage", "literature", "hdd"]);
    expect(V2_TABS.map((tab) => tab.label)).toEqual(["目标", "本机", "仓库", "文献", "H.D.D"]);
    expect(v2TabFromView("planner")).toBe("target");
    expect(v2TabFromView("automation")).toBe("target");
    expect(v2TabFromView("monitor")).toBe("local");
    expect(v2TabFromView("repository")).toBe("storage");
    expect(v2TabFromView("library")).toBe("literature");
    expect(v2TabFromView("hdd")).toBe("hdd");
    expect(v2ViewForTab("storage")).toBe("repository");
  });
});

describe("TabModalV2 controls", () => {
  it("exposes exactly one selected top tab and changes it without remounting the tab rail", () => {
    const host = mount(<TabHarness />);
    expect(host.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
    const track = host.querySelector(".tab-modal-v2__tab-track");
    const third = host.querySelector<HTMLButtonElement>('[data-v2-tab="storage"]');
    expect(track).not.toBeNull();
    act(() => third?.click());
    expect(host.querySelector('[data-v2-tab="storage"]')?.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector(".tab-modal-v2__tab-track")).toBe(track);
  });

  it("moves the real scrollLeft and exposes disabled arrow boundaries", () => {
    const host = mount(<CardRail title="测试轨道"><div style={{ width: "220px", flex: "0 0 220px" }}>A</div><div style={{ width: "220px", flex: "0 0 220px" }}>B</div><div style={{ width: "220px", flex: "0 0 220px" }}>C</div></CardRail>);
    const rail = host.querySelector<HTMLElement>("[data-v2-rail]")!;
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 220 },
      scrollWidth: { configurable: true, value: 680 },
    });
    act(() => rail.dispatchEvent(new Event("scroll")));
    const next = host.querySelector<HTMLButtonElement>('button[aria-label="测试轨道向右滚动"]')!;
    const previous = host.querySelector<HTMLButtonElement>('button[aria-label="测试轨道向左滚动"]')!;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    act(() => next.click());
    expect(rail.scrollLeft).toBeGreaterThan(0);
    act(() => rail.dispatchEvent(new Event("scroll")));
    expect(previous.disabled).toBe(false);
    act(() => { rail.scrollLeft = 460; rail.dispatchEvent(new Event("scroll")); });
    expect(next.disabled).toBe(true);
  });
});

function TabHarness() {
  const [active, setActive] = useState<import("../src/tab-modal-v2/model").V2TabKey>("local");
  return <TopTabs activeTab={active} onChange={setActive} />;
}

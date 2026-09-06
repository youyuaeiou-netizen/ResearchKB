import frameLeftUrl from "../../assets/tab-modal-v2/pieces/shared/frame-left.png?url";
import frameRightUrl from "../../assets/tab-modal-v2/pieces/shared/frame-right.png?url";
import frameBottomUrl from "../../assets/tab-modal-v2/pieces/shared/frame-bottom.png?url";
import tabActiveUrl from "../../assets/tab-modal-v2/pieces/shared/tab-active.png?url";
import tabIdleUrl from "../../assets/tab-modal-v2/pieces/shared/tab-idle.png?url";
import closeButtonUrl from "../../assets/tab-modal-v2/pieces/shared/close-button.png?url";
import selectedNavUrl from "../../assets/tab-modal-v2/pieces/shared/selected-nav.png?url";
import actionButtonUrl from "../../assets/tab-modal-v2/pieces/shared/action-button.png?url";
import arrowUrl from "../../assets/tab-modal-v2/pieces/shared/arrow.png?url";
import progressCheckUrl from "../../assets/tab-modal-v2/pieces/shared/progress-check.png?url";
import cardMaterialUrl from "../../assets/tab-modal-v2/pieces/shared/card-material.png?url";
import targetLeftPanelUrl from "../../assets/tab-modal-v2/pieces/target/left-panel.png?url";
import targetProgressUrl from "../../assets/tab-modal-v2/pieces/target/progress-track.png?url";
import targetCardUrl from "../../assets/tab-modal-v2/pieces/target/card.png?url";
import localOrangeStripUrl from "../../assets/tab-modal-v2/pieces/local/orange-strip.png?url";
import localDeviceUrl from "../../assets/tab-modal-v2/pieces/local/device.png?url";
import localProgressUrl from "../../assets/tab-modal-v2/pieces/local/activity-progress.png?url";
import localCardUrl from "../../assets/tab-modal-v2/pieces/local/daily-card.png?url";
import storageLeftPanelUrl from "../../assets/tab-modal-v2/pieces/storage/left-panel.png?url";
import storageCardUrl from "../../assets/tab-modal-v2/pieces/storage/card.png?url";
import storageBottomUrl from "../../assets/tab-modal-v2/pieces/storage/bottom-action.png?url";
import literatureLeftPanelUrl from "../../assets/tab-modal-v2/pieces/literature/left-panel.png?url";
import literatureProgressUrl from "../../assets/tab-modal-v2/pieces/literature/progress-track.png?url";
import literatureRowUrl from "../../assets/tab-modal-v2/pieces/literature/row.png?url";
import hddLeftPanelUrl from "../../assets/tab-modal-v2/pieces/hdd/left-panel.png?url";
import hddHeaderUrl from "../../assets/tab-modal-v2/pieces/hdd/header.png?url";
import hddCardUrl from "../../assets/tab-modal-v2/pieces/hdd/card.png?url";

// Legacy game-material catalog kept for reference only. The generic V2
// runtime does not import this module.
type V2GameVariant = "target" | "local" | "storage" | "literature" | "hdd";

export const GAME_UI = {
  shared: {
    frameLeft: frameLeftUrl,
    frameRight: frameRightUrl,
    frameBottom: frameBottomUrl,
    tabActive: tabActiveUrl,
    tabIdle: tabIdleUrl,
    closeButton: closeButtonUrl,
    selectedNav: selectedNavUrl,
    actionButton: actionButtonUrl,
    arrow: arrowUrl,
    progressCheck: progressCheckUrl,
    cardMaterial: cardMaterialUrl,
  },
  target: {
    leftPanel: targetLeftPanelUrl,
    progress: targetProgressUrl,
    card: targetCardUrl,
  },
  local: {
    orangeStrip: localOrangeStripUrl,
    device: localDeviceUrl,
    progress: localProgressUrl,
    card: localCardUrl,
  },
  storage: {
    leftPanel: storageLeftPanelUrl,
    card: storageCardUrl,
    bottomAction: storageBottomUrl,
  },
  literature: {
    leftPanel: literatureLeftPanelUrl,
    progress: literatureProgressUrl,
    row: literatureRowUrl,
  },
  hdd: {
    leftPanel: hddLeftPanelUrl,
    header: hddHeaderUrl,
    card: hddCardUrl,
  },
} as const;

export const GAME_VARIANT_ATTR: Record<V2GameVariant, string> = {
  target: "goal-grid",
  local: "daily-rail",
  storage: "training-rail",
  literature: "combat-list",
  hdd: "tactics-rail",
};

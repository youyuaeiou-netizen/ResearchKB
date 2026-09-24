export type LiteratureCollectionKind = "library" | "system" | "collection";

export type LiteratureCollection = {
  id: string;
  label: string;
  kind: LiteratureCollectionKind;
  parentId?: string;
};

export type LiteratureItem = {
  id: string;
  title: string;
  translationTitle?: string;
  authors: string;
  year: number | null;
  journal: string;
  abstract: string;
  collectionIds: string[];
  language: "en" | "zh";
  attachmentCount: number;
  doi?: string;
  url?: string;
  pdfPath?: string;
  impactFactor?: number;
  impactFactorYear?: number;
  recent?: boolean;
}

export const LITERATURE_COLLECTIONS: LiteratureCollection[] = [
  { id: "library", label: "我的文库", kind: "library" },
  { id: "recent", label: "最近阅读", kind: "system" },
  { id: "publications", label: "我的出版物", kind: "system" },
  { id: "duplicates", label: "重复条目", kind: "system" },
  { id: "unfiled", label: "未分类条目", kind: "system" },
  { id: "trash", label: "回收站", kind: "system" },
  { id: "lpbf", label: "LPBF nickel-based superalloy", kind: "collection" },
  { id: "physics-ml", label: "physics-enhanced ML", kind: "collection" },
  { id: "research-plan", label: "research_plan_260630", kind: "collection" },
  { id: "rkb-channel", label: "RKB-C thin wall/channel", kind: "collection" },
];

const demoAbstract = "静态布局演示条目。接入 Zotero 后，此处显示由主数据源提供的摘要；当前页面不会猜测或补写文献内容。";

export const LITERATURE_ITEMS: LiteratureItem[] = [
  {
    id: "demo-001",
    title: "A conceptual multi-laser integration technology for significantly reducing porosity and residual stress in Inconel 718 parts fabricated by laser powder bed fusion",
    translationTitle: "显著降低激光粉末床熔融 Inconel 718 构件孔隙率与残余应力的多激光集成技术",
    authors: "Peng 等",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["lpbf", "research-plan"],
    language: "en",
    attachmentCount: 1,
    recent: true,
  },
  {
    id: "demo-002",
    title: "A novel method combining finite element analysis and computed tomography reconstruction to master mechanical properties of lattice structures processed by laser powder bed fusion",
    authors: "Chen 等",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["lpbf"],
    language: "en",
    attachmentCount: 1,
  },
  {
    id: "demo-003",
    title: "A numerical study on microstructural features evolved across the melt pool in additively manufactured IN718 alloy",
    authors: "Pandey 等",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["lpbf"],
    language: "en",
    attachmentCount: 0,
  },
  {
    id: "demo-004",
    title: "A physics-guided deep generative model for predicting melt pool behavior in laser powder bed fusion additive manufacturing",
    authors: "Kim 等",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["physics-ml", "research-plan"],
    language: "en",
    attachmentCount: 1,
  },
  {
    id: "demo-005",
    title: "A review on physics-informed machine learning for monitoring metal additive manufacturing process",
    authors: "Yang 等",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["physics-ml"],
    language: "en",
    attachmentCount: 1,
  },
  {
    id: "demo-006",
    title: "A review on the influence of process parameters and post-heat treatment on Inconel 718 alloy manufactured by laser powder bed fusion",
    authors: "Periyasamy 和 Srinivasan",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["lpbf"],
    language: "en",
    attachmentCount: 1,
  },
  {
    id: "demo-007",
    title: "Adaptation of a heat-treatment condition to a precipitation-hardened nickel-based superalloy produced by laser powder bed fusion",
    authors: "Li 等",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["lpbf"],
    language: "en",
    attachmentCount: 0,
  },
  {
    id: "demo-008",
    title: "Additive manufacturing of metals and alloys to achieve heterogeneous microstructures for exceptional mechanical properties",
    authors: "Chen 等",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["research-plan"],
    language: "en",
    attachmentCount: 1,
  },
  {
    id: "demo-009",
    title: "Advances in machine learning for material design and process optimization in the field of additive manufacturing",
    authors: "Zhou 等",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["physics-ml"],
    language: "en",
    attachmentCount: 1,
  },
  {
    id: "demo-010",
    title: "An alloy-agnostic machine learning framework for process mapping in laser powder bed fusion",
    authors: "Wilkinson 等",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["physics-ml", "rkb-channel"],
    language: "en",
    attachmentCount: 1,
  },
  {
    id: "demo-011",
    title: "Build Surface Roughness and Internal Oxide Concentration for Laser Powder Bed Fusion of IN718",
    authors: "Smith 和 Pistorius",
    year: null,
    journal: "期刊待同步",
    abstract: demoAbstract,
    collectionIds: ["lpbf", "rkb-channel"],
    language: "en",
    attachmentCount: 1,
  },
  {
    id: "demo-012",
    title: "激光粉末床熔融制备 Inconel 718 的工艺参数与热处理影响综述",
    authors: "文献译名待同步",
    year: null,
    journal: "中文译名 / 期刊待同步",
    abstract: demoAbstract,
    collectionIds: [],
    language: "zh",
    attachmentCount: 0,
  },
];

export function filterLiterature(items: readonly LiteratureItem[], collectionId: string, query: string): LiteratureItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const inCollection = collectionId === "library"
      || collectionId === "recent" && item.recent
      || collectionId === "unfiled" && item.collectionIds.length === 0
      || collectionId === "publications" && false
      || collectionId === "duplicates" && false
      || collectionId === "trash" && false
      || item.collectionIds.includes(collectionId);
    if (!inCollection) return false;
    if (!normalizedQuery) return true;
    return [item.title, item.translationTitle, item.authors, item.journal].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedQuery);
  });
}

export function countLiterature(items: readonly LiteratureItem[], collectionId: string): number {
  return filterLiterature(items, collectionId, "").length;
}

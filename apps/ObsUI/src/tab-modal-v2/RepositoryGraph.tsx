import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type ForceLink,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
  type Simulation,
} from "d3-force";
import { IoAlertCircleOutline, IoChevronDownOutline, IoCloseOutline, IoDocumentTextOutline, IoFolderOutline, IoGitBranchOutline, IoLayersOutline, IoLinkOutline, IoRefreshOutline, IoSearchOutline } from "react-icons/io5";
import type { ObsidianGraph, RepositoryEntry, RepositoryFolderEntry, RepositoryRelation } from "../repositories";
import type { V2BusinessContext } from "./model";
import { ActionButton } from "./ActionButton";

type RepositoryGraphProps = {
  context: V2BusinessContext;
  onClose: () => void;
  onOpenRepository: (repository: RepositoryEntry) => void;
  onOpenVault: (vaultId: string) => void;
  onOpenNote: (vaultId: string, relativePath: string) => void;
};

type SourceGroup = "git" | "material" | "obsidian";
type GraphNodeKind = "git" | "material" | "vault" | "folder" | "note";
type GraphLevel = "sources" | "folders" | "notes";
type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  group: SourceGroup;
  label: string;
  detail: string;
  radius: number;
  repository?: RepositoryEntry;
  parentId?: string;
  vaultId?: string;
  relativePath?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};
type GraphEdge = {
  key: string;
  a: string;
  b: string;
  noteLink: boolean;
  membership: boolean;
  relationId?: string;
};
type GraphSnapshot = { folders: GraphNode[]; notes: GraphNode[]; noteEdges: Array<{ a: string; b: string }>; truncated: boolean; errors: string[] };
type GraphPoint = { x: number; y: number; radius: number; degree: number };
type SimulationNode = GraphNode & SimulationNodeDatum & { x: number; y: number; vx: number; vy: number };
type SimulationLink = SimulationLinkDatum<SimulationNode> & { kind: "note" | "manual" | "membership" };
type Viewport = { x: number; y: number; scale: number };
type PointerGesture =
  | { kind: "pan"; pointerId: number; startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean }
  | { kind: "node"; pointerId: number; nodeId: string; moved: boolean };

const maxVisibleGraphNotes = 1_200;
const emptyRepositories: RepositoryEntry[] = [];
const emptyRelations: RepositoryRelation[] = [];
const emptyNoteEdges: GraphSnapshot["noteEdges"] = [];
const emptyNotesById = new Map<string, GraphNode>();
const groupLabels: Record<SourceGroup, string> = { git: "Git 仓库", material: "素材文件夹", obsidian: "Obsidian 知识库" };
const nodeLabels: Record<GraphNodeKind, string> = { git: "Git 仓库", material: "素材文件夹", vault: "Obsidian 知识库", folder: "下级文件夹", note: "Obsidian 笔记" };
const graphLevelOptions: Array<{ value: GraphLevel; label: string; description: string }> = [
  { value: "sources", label: "来源入口", description: "只显示 Git 仓库、素材目录和知识库入口。" },
  { value: "folders", label: "目录结构", description: "展开所选来源下的一级文件夹。" },
  { value: "notes", label: "笔记关系", description: "展开知识库笔记及笔记之间的链接。" },
];
const graphLevelLabels: Record<GraphLevel, string> = { sources: "来源入口", folders: "目录结构", notes: "笔记关系" };
const relationKey = (a: string, b: string) => [a, b].sort((left, right) => left.localeCompare(right, "en")).join("\0");
const repositoryNodeId = (repositoryId: string) => `repository:${repositoryId}`;
const directoryNodeId = (repositoryId: string, relativePath: string) => `directory:${repositoryId}:${relativePath}`;
const noteNodeId = (vaultId: string, relativePath: string) => `note:${vaultId}:${relativePath}`;

async function readJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const payload = await response.json().catch(() => null) as (T & { message?: unknown }) | null;
  if (!response.ok || !payload) throw new Error(typeof payload?.message === "string" ? payload.message : "无法读取关系图谱数据。");
  return payload;
}

function seededPoint(id: string, index: number, count: number) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const jitter = ((hash >>> 0) % 10_000) / 10_000;
  const angle = index * 2.399963229728653 + jitter * 0.58;
  const radius = Math.min(400, 34 + Math.sqrt(index + 1) * Math.min(34, 520 / Math.sqrt(Math.max(1, count))));
  return { x: 500 + Math.cos(angle) * radius, y: 350 + Math.sin(angle) * radius * 0.78 };
}

function svgPoint(svg: SVGSVGElement | null, clientX: number, clientY: number) {
  if (!svg) return null;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}

export function RepositoryGraph({ context, onClose, onOpenRepository, onOpenVault, onOpenNote }: RepositoryGraphProps) {
  const repositories = context.state.repositories ?? emptyRepositories;
  const relations = context.state.repositoryRelations ?? emptyRelations;
  const [snapshot, setSnapshot] = useState<GraphSnapshot>({ folders: [], notes: [], noteEdges: [], truncated: false, errors: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"local" | "global">("global");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkStart, setLinkStart] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [level, setLevel] = useState<GraphLevel>("sources");
  const [hierarchyOpen, setHierarchyOpen] = useState(false);
  const [attractionDistance, setAttractionDistance] = useState(220);
  const attractionDistanceRef = useRef(attractionDistance);
  attractionDistanceRef.current = attractionDistance;
  const [groups, setGroups] = useState<Record<SourceGroup, boolean>>({ git: true, material: true, obsidian: true });
  const [childGroups, setChildGroups] = useState<Record<SourceGroup, boolean>>({ git: true, material: true, obsidian: true });
  const [positions, setPositions] = useState<Map<string, GraphPoint>>(() => new Map());
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const hierarchyMenuRef = useRef<HTMLDivElement>(null);
  const gestures = useRef<PointerGesture | null>(null);
  const suppressClick = useRef(false);
  const suppressCanvasClick = useRef(false);
  const simulationRef = useRef<Simulation<SimulationNode, SimulationLink> | null>(null);
  const simulationNodesRef = useRef(new Map<string, SimulationNode>());
  const positionsRef = useRef(new Map<string, GraphPoint>());
  const nodeElementsRef = useRef(new Map<string, SVGGElement>());
  const edgeElementsRef = useRef(new Map<string, SVGLineElement>());
  const nodeRefCallbacks = useRef(new Map<string, (element: SVGGElement | null) => void>());
  const edgeRefCallbacks = useRef(new Map<string, (element: SVGLineElement | null) => void>());

  useEffect(() => {
    if (!hierarchyOpen) return;
    const closeOnOutsidePointer = (event: Event) => {
      if (event.target instanceof Node && !hierarchyMenuRef.current?.contains(event.target)) setHierarchyOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHierarchyOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [hierarchyOpen]);

  const nodeElementRef = (id: string) => {
    let callback = nodeRefCallbacks.current.get(id);
    if (!callback) {
      callback = (element) => { if (element) nodeElementsRef.current.set(id, element); else nodeElementsRef.current.delete(id); };
      nodeRefCallbacks.current.set(id, callback);
    }
    return callback;
  };
  const edgeElementRef = (id: string) => {
    let callback = edgeRefCallbacks.current.get(id);
    if (!callback) {
      callback = (element) => { if (element) edgeElementsRef.current.set(id, element); else edgeElementsRef.current.delete(id); };
      edgeRefCallbacks.current.set(id, callback);
    }
    return callback;
  };

  const syncSimulationSvg = useCallback((simulationNodes: Iterable<SimulationNode>, graphEdges: readonly GraphEdge[]) => {
    const byId = new Map<string, SimulationNode>();
    for (const node of simulationNodes) {
      byId.set(node.id, node);
      nodeElementsRef.current.get(node.id)?.setAttribute("transform", `translate(${node.x} ${node.y})`);
    }
    for (const edge of graphEdges) {
      const source = byId.get(edge.a);
      const target = byId.get(edge.b);
      const element = edgeElementsRef.current.get(edge.key);
      if (!source || !target || !element) continue;
      element.setAttribute("x1", String(source.x));
      element.setAttribute("y1", String(source.y));
      element.setAttribute("x2", String(target.x));
      element.setAttribute("y2", String(target.y));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(refreshKey > 0);
    void (async () => {
      const folders: GraphNode[] = [];
      const notes: GraphNode[] = [];
      const noteEdges: GraphSnapshot["noteEdges"] = [];
      const errors: string[] = [];
      let truncated = false;
      await Promise.all(repositories.map(async (repository) => {
        try {
          const result = await readJson<{ folders: RepositoryFolderEntry[] }>("/api/repositories/folders", { path: repository.localPath, kind: repository.kind });
          for (const folder of result.folders) {
            folders.push({
              id: directoryNodeId(repository.id, folder.relativePath),
              kind: "folder",
              group: repository.kind === "obsidian" ? "obsidian" : repository.kind,
              label: folder.name,
              detail: `${repository.name} / ${folder.relativePath}`,
              radius: 7,
              parentId: repositoryNodeId(repository.id),
            });
          }
        } catch (error) {
          errors.push(`${repository.name} 文件夹：${error instanceof Error ? error.message : "读取失败"}`);
        }
      }));
      folders.sort((left, right) => left.id.localeCompare(right.id, "zh-CN"));
      const vaults = repositories.filter((repository) => repository.kind === "obsidian");
      for (const vault of vaults) {
        if (cancelled) break;
        if (notes.length >= maxVisibleGraphNotes) { truncated = true; break; }
        try {
          const graph = await readJson<ObsidianGraph>("/api/repositories/obsidian/graph", { path: vault.localPath });
          const allowance = maxVisibleGraphNotes - notes.length;
          const included = graph.nodes.slice(0, allowance);
          const includedIds = new Set(included.map((node) => node.id));
          for (const node of included) {
            const parentPath = node.relativePath.includes("/") ? node.relativePath.slice(0, node.relativePath.indexOf("/")) : "";
            notes.push({ id: noteNodeId(vault.id, node.relativePath), kind: "note", group: "obsidian", label: node.label, detail: `${vault.name} / ${node.relativePath}`, radius: 5, parentId: parentPath ? directoryNodeId(vault.id, parentPath) : repositoryNodeId(vault.id), vaultId: vault.id, relativePath: node.relativePath });
          }
          for (const edge of graph.edges) {
            if (!includedIds.has(edge.source) || !includedIds.has(edge.target)) continue;
            noteEdges.push({ a: noteNodeId(vault.id, edge.source), b: noteNodeId(vault.id, edge.target) });
          }
          truncated ||= graph.truncated || graph.nodes.length > included.length;
        } catch (error) {
          errors.push(`${vault.name}：${error instanceof Error ? error.message : "关系读取失败"}`);
        }
      }
      if (!cancelled) setSnapshot({ folders, notes, noteEdges, truncated, errors });
    })().finally(() => {
      if (!cancelled) setRefreshing(false);
    });
    return () => { cancelled = true; };
  }, [refreshKey, repositories]);

  const sourceNodes = useMemo<GraphNode[]>(() => [
    ...repositories.map((repository) => ({
      id: repositoryNodeId(repository.id),
      kind: repository.kind === "obsidian" ? "vault" as const : repository.kind,
      group: repository.kind === "obsidian" ? "obsidian" as const : repository.kind,
      label: repository.name,
      detail: repository.localPath,
      radius: repository.kind === "obsidian" ? 12 : 9,
      repository,
      vaultId: repository.kind === "obsidian" ? repository.id : undefined,
    })),
  ], [repositories]);
  const enabledFolderNodes = useMemo(() => snapshot.folders.filter((node) => childGroups[node.group]), [childGroups.git, childGroups.material, childGroups.obsidian, snapshot.folders]);
  const enabledNoteNodes = useMemo(() => childGroups.obsidian ? snapshot.notes : [], [childGroups.obsidian, snapshot.notes]);
  const folderLevelNodes = useMemo(() => [...sourceNodes, ...enabledFolderNodes], [enabledFolderNodes, sourceNodes]);
  const noteLevelNodes = useMemo(() => [...folderLevelNodes, ...enabledNoteNodes], [enabledNoteNodes, folderLevelNodes]);
  const baseNodes = level === "sources" ? sourceNodes : level === "folders" ? folderLevelNodes : noteLevelNodes;
  const baseNodeById = useMemo(() => new Map(baseNodes.map((node) => [node.id, node] as const)), [baseNodes]);
  const allNotesById = useMemo(() => new Map(snapshot.notes.map((node) => [node.id, node] as const)), [snapshot.notes]);
  const noteEdgesForLevel = level === "sources" ? emptyNoteEdges : snapshot.noteEdges;
  const noteParentsForLevel = level === "folders" ? allNotesById : emptyNotesById;
  const edges = useMemo<GraphEdge[]>(() => {
    const byPair = new Map<string, GraphEdge>();
    const getOrCreate = (a: string, b: string) => {
      const key = relationKey(a, b);
      const existing = byPair.get(key);
      if (existing) return existing;
      const edge: GraphEdge = { key, a, b, noteLink: false, membership: false };
      byPair.set(key, edge);
      return edge;
    };
    for (const node of baseNodes) {
      if (node.parentId && baseNodeById.has(node.parentId)) getOrCreate(node.parentId, node.id).membership = true;
    }
    for (const edge of noteEdgesForLevel) {
      if (level === "notes" && baseNodeById.has(edge.a) && baseNodeById.has(edge.b)) {
        getOrCreate(edge.a, edge.b).noteLink = true;
      } else if (level === "folders") {
        const sourceParent = noteParentsForLevel.get(edge.a)?.parentId;
        const targetParent = noteParentsForLevel.get(edge.b)?.parentId;
        if (sourceParent && targetParent && sourceParent !== targetParent && baseNodeById.has(sourceParent) && baseNodeById.has(targetParent)) {
          getOrCreate(sourceParent, targetParent).noteLink = true;
        }
      }
    }
    for (const relation of relations) {
      if (baseNodeById.has(relation.a) && baseNodeById.has(relation.b)) getOrCreate(relation.a, relation.b).relationId = relation.id;
    }
    return [...byPair.values()];
  }, [baseNodeById, baseNodes, level, noteEdgesForLevel, noteParentsForLevel, relations]);
  const degrees = useMemo(() => {
    const counts = new Map<string, number>(baseNodes.map((node) => [node.id, 0]));
    for (const edge of edges) {
      counts.set(edge.a, (counts.get(edge.a) ?? 0) + 1);
      counts.set(edge.b, (counts.get(edge.b) ?? 0) + 1);
    }
    return counts;
  }, [baseNodes, edges]);
  const nodes = useMemo(() => baseNodes.map((node) => ({ ...node, radius: Math.min(18, node.radius + Math.sqrt(degrees.get(node.id) ?? 0) * 1.25) })), [baseNodes, degrees]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node] as const)), [nodes]);
  const queryKey = query.trim().toLocaleLowerCase();
  const matchesSearch = (node: GraphNode) => !queryKey || `${node.label} ${node.detail} ${nodeLabels[node.kind]} ${groupLabels[node.group]}`.toLocaleLowerCase().includes(queryKey);
  const groupCounts = useMemo(() => ({
    git: nodes.filter((node) => node.group === "git").length,
    material: nodes.filter((node) => node.group === "material").length,
    obsidian: nodes.filter((node) => node.group === "obsidian").length,
  }), [nodes]);
  const folderCounts = useMemo(() => ({
    git: snapshot.folders.filter((node) => node.group === "git").length,
    material: snapshot.folders.filter((node) => node.group === "material").length,
    obsidian: snapshot.folders.filter((node) => node.group === "obsidian").length,
  }), [snapshot.folders]);
  const groupNodes = useMemo(() => nodes.filter((node) => groups[node.group]), [groups, nodes]);
  const visibleNodeIds = useMemo(() => {
    const ids = new Set(groupNodes.map((node) => node.id));
    if (view === "local" && selectedId && ids.has(selectedId)) {
      const localIds = new Set([selectedId]);
      for (const edge of edges) {
        if (!ids.has(edge.a) || !ids.has(edge.b)) continue;
        if (edge.a === selectedId) localIds.add(edge.b);
        if (edge.b === selectedId) localIds.add(edge.a);
      }
      return localIds;
    }
    return ids;
  }, [edges, groupNodes, selectedId, view]);
  useEffect(() => {
    if (selectedId && !visibleNodeIds.has(selectedId)) setSelectedId(null);
    if (hoveredId && !visibleNodeIds.has(hoveredId)) setHoveredId(null);
    if (linkStart && !visibleNodeIds.has(linkStart)) {
      setLinkStart(null);
      setNotice("关系起点已隐藏，已取消本次选择。");
    }
  }, [hoveredId, linkStart, selectedId, visibleNodeIds]);
  const visibleNodes = useMemo(() => nodes.filter((node) => visibleNodeIds.has(node.id)), [nodes, visibleNodeIds]);
  const visibleEdges = useMemo(() => edges.filter((edge) => visibleNodeIds.has(edge.a) && visibleNodeIds.has(edge.b)), [edges, visibleNodeIds]);
  const current = selectedId ? nodeById.get(selectedId) ?? null : null;
  const connected = current ? edges
    .filter((edge) => edge.a === current.id || edge.b === current.id)
    .map((edge) => ({ edge, node: nodeById.get(edge.a === current.id ? edge.b : edge.a) }))
    .filter((item): item is { edge: GraphEdge; node: GraphNode } => Boolean(item.node)) : [];
  const focusId = hoveredId ?? selectedId;
  const focusNeighbors = useMemo(() => {
    if (!focusId) return null;
    const ids = new Set([focusId]);
    for (const edge of visibleEdges) {
      if (edge.a === focusId) ids.add(edge.b);
      if (edge.b === focusId) ids.add(edge.a);
    }
    return ids;
  }, [focusId, visibleEdges]);

  useEffect(() => {
    simulationRef.current?.stop();
    simulationRef.current = null;
    if (!visibleNodes.length) {
      simulationNodesRef.current.clear();
      return;
    }
    const simulationNodes: SimulationNode[] = visibleNodes.map((node, index) => {
      const existing = positionsRef.current.get(node.id);
      const seed = existing ?? seededPoint(node.id, index, visibleNodes.length);
      return { ...node, x: seed.x, y: seed.y, vx: 0, vy: 0 };
    });
    const byId = new Map(simulationNodes.map((node) => [node.id, node] as const));
    simulationNodesRef.current = byId;
    const simulationLinks: SimulationLink[] = visibleEdges.map((edge) => ({
      source: edge.a,
      target: edge.b,
      kind: edge.relationId ? "manual" : edge.membership ? "membership" : "note",
    }));
    let lastFrame = 0;
    const simulation = forceSimulation<SimulationNode, SimulationLink>(simulationNodes)
      .force("charge", forceManyBody<SimulationNode>().strength((node) => node.kind === "vault" ? -560 : visibleNodes.length > 400 ? -220 : -360).distanceMax(700))
      .force("link", forceLink<SimulationNode, SimulationLink>(simulationLinks)
        .id((node) => node.id)
        .distance(() => attractionDistanceRef.current)
        .strength((link) => link.kind === "membership" ? 0.12 : link.kind === "manual" ? 0.34 : 0.15))
      .force("collide", forceCollide<SimulationNode>().radius((node) => node.radius + 13).strength(0.95).iterations(2))
      .force("center", forceCenter<SimulationNode>(500, 350))
      .alpha(0.72)
      .alphaDecay(0.032)
      .velocityDecay(0.38)
      .on("tick", () => {
        const now = performance.now();
        if (now - lastFrame < 16) return;
        lastFrame = now;
        for (const node of simulationNodes) positionsRef.current.set(node.id, { x: node.x, y: node.y, radius: node.radius, degree: degrees.get(node.id) ?? 0 });
        syncSimulationSvg(simulationNodes, visibleEdges);
      });
    simulationRef.current = simulation;
    const firstFrame = new Map<string, GraphPoint>();
    for (const node of simulationNodes) firstFrame.set(node.id, { x: node.x, y: node.y, radius: node.radius, degree: degrees.get(node.id) ?? 0 });
    for (const [id, point] of firstFrame) positionsRef.current.set(id, point);
    setPositions(new Map(positionsRef.current));
    syncSimulationSvg(simulationNodes, visibleEdges);
    return () => {
      simulation.stop();
      if (simulationRef.current === simulation) simulationRef.current = null;
    };
  }, [degrees, syncSimulationSvg, visibleEdges, visibleNodes]);

  useEffect(() => {
    const simulation = simulationRef.current;
    const linkForce = simulation?.force<ForceLink<SimulationNode, SimulationLink>>("link");
    if (!simulation || !linkForce) return;
    linkForce.distance(() => attractionDistance);
    simulation.alpha(0.3).restart();
  }, [attractionDistance]);

  const graphPoint = (clientX: number, clientY: number) => {
    const point = svgPoint(svgRef.current, clientX, clientY);
    if (!point) return null;
    return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
  };
  const graphViewportPoint = (clientX: number, clientY: number) => svgPoint(svgRef.current, clientX, clientY);

  const chooseNode = (node: GraphNode) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!linking) { setSelectedId(node.id); setNotice(null); return; }
    if (!linkStart) {
      setLinkStart(node.id);
      setSelectedId(node.id);
      setNotice(`已选择起点：${node.label}。再选择一个目标建立关系。`);
      return;
    }
    if (linkStart === node.id) {
      setLinkStart(null);
      setNotice("已取消起点选择。");
      return;
    }
    const existing = edges.find((edge) => edge.key === relationKey(linkStart, node.id));
    if (existing?.relationId) {
      setNotice("这两个项目已经有手动关系。");
    } else if (!context.actions.addRepositoryRelation) {
      setNotice("当前页面没有连接关系保存操作。");
    } else {
      context.actions.addRepositoryRelation(linkStart, node.id);
      setNotice(`已建立「${nodeById.get(linkStart)?.label ?? "项目"}」与「${node.label}」的关系。`);
    }
    setLinkStart(null);
  };

  const startNodeDrag = (event: PointerEvent<SVGGElement>, node: GraphNode) => {
    event.preventDefault();
    event.stopPropagation();
    const point = graphPoint(event.clientX, event.clientY);
    const simulationNode = simulationNodesRef.current.get(node.id);
    if (!point || !simulationNode) return;
    suppressClick.current = false;
    suppressCanvasClick.current = false;
    gestures.current = { kind: "node", pointerId: event.pointerId, nodeId: node.id, moved: false };
    setSelectedId(node.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    simulationNode.fx = simulationNode.x;
    simulationNode.fy = simulationNode.y;
    simulationRef.current?.alphaTarget(0.22).restart();
  };

  const startPan = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = graphViewportPoint(event.clientX, event.clientY);
    if (!point) return;
    suppressClick.current = false;
    suppressCanvasClick.current = false;
    gestures.current = { kind: "pan", pointerId: event.pointerId, startX: point.x, startY: point.y, startPanX: viewport.x, startPanY: viewport.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: PointerEvent<SVGSVGElement>) => {
    const gesture = gestures.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === "pan") {
      const point = graphViewportPoint(event.clientX, event.clientY);
      if (!point) return;
      const dx = point.x - gesture.startX;
      const dy = point.y - gesture.startY;
      if (Math.hypot(dx, dy) > 2) gesture.moved = true;
      setViewport((current) => ({ ...current, x: gesture.startPanX + dx, y: gesture.startPanY + dy }));
      return;
    }
    const point = graphPoint(event.clientX, event.clientY);
    const simulationNode = simulationNodesRef.current.get(gesture.nodeId);
    if (!point || !simulationNode) return;
    if (Math.hypot(point.x - simulationNode.x, point.y - simulationNode.y) > 0.8) gesture.moved = true;
    simulationNode.fx = point.x;
    simulationNode.fy = point.y;
    positionsRef.current.set(gesture.nodeId, { x: point.x, y: point.y, radius: simulationNode.radius, degree: degrees.get(gesture.nodeId) ?? 0 });
    syncSimulationSvg(simulationNodesRef.current.values(), visibleEdges);
    simulationRef.current?.alphaTarget(0.2).restart();
  };

  const endPointer = (event: PointerEvent<SVGSVGElement>) => {
    const gesture = gestures.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === "node") {
      const simulationNode = simulationNodesRef.current.get(gesture.nodeId);
      if (simulationNode) { simulationNode.fx = null; simulationNode.fy = null; }
      simulationRef.current?.alphaTarget(0).alpha(0.24).restart();
    }
    // Only a dragged node can emit a click that should be swallowed. A blank-canvas
    // pan has no node click to suppress, so it must not eat the next real selection.
    suppressClick.current = gesture.kind === "node" && gesture.moved;
    suppressCanvasClick.current = gesture.kind === "pan" && gesture.moved;
    gestures.current = null;
  };

  const handleCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    const target = event.target;
    const isBlankCanvas = target === event.currentTarget || target instanceof SVGElement && target.classList.contains("tab-modal-v2__repository-graph-background");
    if (!isBlankCanvas) return;
    if (suppressCanvasClick.current) { suppressCanvasClick.current = false; return; }
    setSelectedId(null);
    setHoveredId(null);
    if (linkStart) {
      setLinkStart(null);
      setNotice("已取消关系起点选择。");
    } else {
      setNotice(null);
    }
  };

  const clearSelection = () => {
    setSelectedId(null);
    setHoveredId(null);
    setLinkStart(null);
    setNotice(null);
  };

  const handleNodeMouseEnter = (nodeId: string) => {
    // Nodes move during force settling. Ignore hover transitions caused only by
    // nodes passing beneath a stationary pointer, then restore hover once stable.
    if (!simulationRef.current || simulationRef.current.alpha() < 0.02) setHoveredId(nodeId);
  };

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const point = graphViewportPoint(event.clientX, event.clientY);
    if (!point) return;
    setViewport((current) => {
      const scale = Math.max(0.25, Math.min(2.6, current.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const worldX = (point.x - current.x) / current.scale;
      const worldY = (point.y - current.y) / current.scale;
      return { scale, x: point.x - worldX * scale, y: point.y - worldY * scale };
    });
  };

  const fitGraph = () => {
    const points = visibleNodes
      .map((node) => positionsRef.current.get(node.id))
      .filter((point): point is GraphPoint => Boolean(point));
    if (!points.length) { setViewport({ x: 0, y: 0, scale: 1 }); return; }
    const minX = Math.min(...points.map((point) => point.x - point.radius));
    const maxX = Math.max(...points.map((point) => point.x + point.radius));
    const minY = Math.min(...points.map((point) => point.y - point.radius));
    const maxY = Math.max(...points.map((point) => point.y + point.radius));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const scale = Math.max(0.25, Math.min(2.6, Math.min(900 / width, 600 / height)));
    setViewport({ x: 500 - ((minX + maxX) / 2) * scale, y: 350 - ((minY + maxY) / 2) * scale, scale });
  };

  const handleCanvasDoubleClick = (event: MouseEvent<SVGSVGElement>) => {
    const target = event.target;
    if (target === event.currentTarget || target instanceof SVGElement && target.classList.contains("tab-modal-v2__repository-graph-background")) fitGraph();
  };

  const closeLinking = () => { setLinking(false); setLinkStart(null); setNotice(null); };
  const refresh = () => setRefreshKey((value) => value + 1);

  return <section className="tab-modal-v2__repository-graph" aria-label="仓库关系图谱">
    <header className="tab-modal-v2__repository-graph-header">
      <div className="tab-modal-v2__repository-graph-title">
        <ActionButton type="button" aria-label="关闭关系图谱" onClick={onClose}><IoCloseOutline aria-hidden="true" />关闭</ActionButton>
      <div><span className="tab-modal-v2__micro-label">REPOSITORY GRAPH</span><h2>仓库知识图谱</h2><small>查看并整理仓库、素材目录与知识库之间的联系</small></div>
      </div>
      <div className="tab-modal-v2__repository-graph-toolbar">
        <div className="tab-modal-v2__repository-graph-hierarchy" ref={hierarchyMenuRef}>
          <button type="button" className="tab-modal-v2__repository-graph-hierarchy-trigger" aria-expanded={hierarchyOpen} onClick={() => setHierarchyOpen((open) => !open)}>
            <IoLayersOutline aria-hidden="true" /><span><small>图谱显示</small><b>{graphLevelLabels[level]}</b></span><IoChevronDownOutline className={hierarchyOpen ? "is-open" : ""} aria-hidden="true" />
          </button>
          {hierarchyOpen && <div id="repository-graph-hierarchy-menu" className="tab-modal-v2__repository-graph-hierarchy-menu" role="group" aria-label="图谱显示设置">
            <header><b>图谱显示</b><small>集中设置来源筛选、展开范围和下级内容</small></header>
            <div className="tab-modal-v2__repository-graph-hierarchy-sources" role="group" aria-label="显示来源">
              <div className="tab-modal-v2__repository-graph-hierarchy-section-title"><b>显示来源</b><small>控制图谱中包含哪些仓库资源</small></div>
              <div className="tab-modal-v2__repository-graph-filters">
                {(["git", "material", "obsidian"] as const).map((group) => <button key={group} type="button" className={`is-${group}${groups[group] ? " is-active" : ""}`} aria-pressed={groups[group]} onClick={() => setGroups((current) => ({ ...current, [group]: !current[group] }))}>
                  <i aria-hidden="true" /><span>{groupLabels[group]}</span><small>{groupCounts[group]}</small>
                </button>)}
              </div>
            </div>
            <div className="tab-modal-v2__repository-graph-hierarchy-levels" role="group" aria-label="展开范围">
              <div className="tab-modal-v2__repository-graph-hierarchy-section-title"><b>展开范围</b><small>选择图谱显示的内容层次</small></div>
              <div className="tab-modal-v2__repository-graph-hierarchy-options">
                {graphLevelOptions.map((option) => <button key={option.value} type="button" className={level === option.value ? "is-active" : ""} aria-pressed={level === option.value} onClick={() => { setLevel(option.value); setHierarchyOpen(false); }}>
                  <b>{option.label}</b><small>{option.description}</small>
                </button>)}
              </div>
            </div>
            <div className="tab-modal-v2__repository-graph-hierarchy-children" role="group" aria-label="来源下级内容">
              <div className="tab-modal-v2__repository-graph-hierarchy-children-title"><b>下级内容</b><small>仅在目录结构或笔记关系视图中生效</small></div>
              {(["git", "material", "obsidian"] as const).map((group) => {
                const label = group === "git" ? "Git 仓库目录" : group === "material" ? "素材子目录" : level === "notes" ? "知识库笔记" : "知识库文件夹";
                const count = group === "obsidian" && level === "notes" ? folderCounts[group] + snapshot.notes.length : folderCounts[group];
                return <button key={group} type="button" className={`is-${group}${childGroups[group] ? " is-active" : ""}`} aria-label={`显示${label}`} aria-pressed={childGroups[group]} onClick={() => setChildGroups((current) => ({ ...current, [group]: !current[group] }))}>
                  <i aria-hidden="true" /><span>{label}</span><small>{count}</small>
                </button>;
              })}
            </div>
            <div className="tab-modal-v2__repository-graph-hierarchy-attraction">
              <label htmlFor="repository-graph-attraction-distance"><span><b>节点吸引距离</b><small>增大数值会让有关联的节点更分散</small></span><output>{attractionDistance}</output></label>
              <input id="repository-graph-attraction-distance" type="range" min="100" max="420" step="10" value={attractionDistance} onChange={(event) => setAttractionDistance(Number(event.currentTarget.value))} />
              <div aria-hidden="true"><span>紧凑</span><span>分散</span></div>
            </div>
          </div>}
        </div>
        <div className="tab-modal-v2__repository-graph-tabs" role="tablist" aria-label="图谱范围">
          <button type="button" role="tab" aria-selected={view === "local"} className={view === "local" ? "is-active" : ""} onClick={() => setView("local")}>局部</button>
          <button type="button" role="tab" aria-selected={view === "global"} className={view === "global" ? "is-active" : ""} onClick={() => setView("global")}>全局</button>
        </div>
        <label className="tab-modal-v2__repository-graph-search"><IoSearchOutline aria-hidden="true" /><input aria-label="搜索图谱节点" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或路径" /></label>
        <ActionButton type="button" className={linking ? "is-linking" : ""} aria-pressed={linking} onClick={() => linking ? closeLinking() : (setLinking(true), setLinkStart(null), setNotice("依次选择两个节点即可建立手动关系。"))}><IoLinkOutline aria-hidden="true" />{linking ? "取消关联" : "建立关联"}</ActionButton>
        <ActionButton type="button" aria-label="刷新关系图谱" title="重新读取已登记目录和 Vault 笔记关系" onClick={refresh} disabled={refreshing}><IoRefreshOutline aria-hidden="true" />{refreshing ? "读取中" : "刷新"}</ActionButton>
      </div>
    </header>
    <div className="tab-modal-v2__repository-graph-body">
      <main className="tab-modal-v2__repository-graph-stage">
        <header><span>{visibleNodes.length} 个节点 · {visibleEdges.length} 条关系</span>{linking ? <b role="status">{linkStart ? "选第二个节点完成关联" : "点击节点选择关系起点"}</b> : <small>拖动画布平移 · 空白处取消选中</small>}</header>
        {notice && <div className="tab-modal-v2__repository-graph-notice" role="status">{notice}</div>}
        {(snapshot.truncated || snapshot.errors.length > 0) && <div className="tab-modal-v2__repository-graph-warning" role="status"><IoAlertCircleOutline aria-hidden="true" />{snapshot.errors.length ? `部分登记目录或 Obsidian Vault 无法读取：${snapshot.errors.join("；")}` : "图谱达到扫描上限，可能不完整。"}</div>}
        {visibleNodes.length ? <svg
          ref={svgRef}
          className={`tab-modal-v2__repository-graph-canvas${linking ? " is-linking" : ""}`}
          viewBox="0 0 1000 700"
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`当前显示 ${visibleNodes.length} 个节点和 ${visibleEdges.length} 条关系`}
          onPointerDown={startPan}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
          onWheel={handleWheel}
        >
          <rect className="tab-modal-v2__repository-graph-background" x="0" y="0" width="1000" height="700" />
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            <g className="tab-modal-v2__repository-graph-edges" aria-hidden="true">
              {visibleEdges.map((edge) => {
                const a = positions.get(edge.a); const b = positions.get(edge.b);
                if (!a || !b) return null;
                const highlighted = !focusNeighbors || focusNeighbors.has(edge.a) && focusNeighbors.has(edge.b);
                return <line key={edge.key} ref={edgeElementRef(edge.key)} className={`${edge.noteLink ? "is-note-link" : ""}${edge.membership ? " is-parent-membership" : ""}${edge.relationId ? " is-manual-link" : ""}${highlighted ? "" : " is-muted"}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
              })}
            </g>
            <g className="tab-modal-v2__repository-graph-nodes">
              {visibleNodes.map((node) => {
                const point = positions.get(node.id);
                if (!point) return null;
                const active = node.id === focusId;
                const related = !focusNeighbors || focusNeighbors.has(node.id);
                // Keep registered source roots discoverable; hide only low-degree
                // note labels when a large vault would otherwise overwhelm the view.
                const labelVisible = active || node.kind !== "note" || visibleNodes.length <= 60 || point.degree >= 4 || viewport.scale >= 1.5;
                return <g
                  key={node.id}
                  className={`tab-modal-v2__repository-graph-node is-${node.kind} is-group-${node.group}${node.id === selectedId ? " is-selected" : ""}${node.id === linkStart ? " is-link-start" : ""}${related ? "" : " is-muted"}${queryKey && !matchesSearch(node) ? " is-search-muted" : ""}`}
                  transform={`translate(${point.x} ${point.y})`}
                  ref={nodeElementRef(node.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${nodeLabels[node.kind]}：${node.label}`}
                  aria-pressed={node.id === selectedId}
                  onPointerDown={(event) => startNodeDrag(event, node)}
                  onClick={() => chooseNode(node)}
                  onDoubleClick={() => node.kind === "note" && node.vaultId && node.relativePath ? onOpenNote(node.vaultId, node.relativePath) : node.kind === "vault" && node.repository ? onOpenVault(node.repository.id) : undefined}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (node.kind === "note" && node.vaultId && node.relativePath) onOpenNote(node.vaultId, node.relativePath);
                      else if (node.kind === "vault" && node.repository) onOpenVault(node.repository.id);
                      else setSelectedId(node.id);
                    } else if (event.key === " ") { event.preventDefault(); chooseNode(node); }
                  }}
                  onFocus={() => setHoveredId(node.id)}
                  onBlur={() => setHoveredId(null)}
                  onMouseEnter={() => handleNodeMouseEnter(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <title>{nodeLabels[node.kind]} · {node.label} · {point.degree} 条关系 · {node.detail}</title>
                  <circle className="tab-modal-v2__repository-graph-node-halo" r={point.radius + (active ? 7 : 3)} />
                  <circle className="tab-modal-v2__repository-graph-node-dot" r={point.radius} />
                  {labelVisible && <text x={node.kind === "vault" ? 13 : 10} y="4" textAnchor="start">{node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label}</text>}
                </g>;
              })}
            </g>
          </g>
        </svg> : <div className="tab-modal-v2__repository-graph-empty"><IoGitBranchOutline aria-hidden="true" /><b>{nodes.length ? "当前筛选没有节点" : "还没有登记图谱来源"}</b><span>{nodes.length ? "打开上方分类筛选以显示节点。" : "登记素材文件夹、Git 仓库或 Obsidian Vault 后即可建立关系。"}</span></div>}
      </main>
      <aside className="tab-modal-v2__repository-graph-inspector" aria-label="关系详情">
        <header><div><span className="tab-modal-v2__micro-label">NODE INSPECTOR</span><b>{current?.label ?? "选择一个节点"}</b></div>{current && <><span className={`is-${current.group}`}>{nodeLabels[current.kind]}</span><ActionButton type="button" className="is-clear-selection" aria-label="取消选中" title="取消选中" onClick={clearSelection}>取消选中</ActionButton></>}</header>
        {current ? <>
          <div className="tab-modal-v2__repository-graph-node-detail" title={current.detail}>{current.detail}</div>
          {current.repository && current.kind !== "vault" && <ActionButton type="button" onClick={() => onOpenRepository(current.repository!)}><IoFolderOutline aria-hidden="true" />打开本地文件夹</ActionButton>}
          {current.kind === "vault" && current.repository && <ActionButton type="button" variant="primary" onClick={() => onOpenVault(current.repository!.id)}><IoDocumentTextOutline aria-hidden="true" />浏览知识库</ActionButton>}
          {current.kind === "note" && current.vaultId && current.relativePath && <ActionButton type="button" variant="primary" onClick={() => onOpenNote(current.vaultId!, current.relativePath!)}><IoDocumentTextOutline aria-hidden="true" />打开笔记</ActionButton>}
          <section className="tab-modal-v2__repository-graph-relations">
            <header><b>关联与反向链接</b><span>{connected.length}</span></header>
            {connected.length ? connected.map(({ edge, node }) => <article key={edge.key}>
              <button type="button" onClick={() => setSelectedId(node.id)}><small>{edge.relationId ? edge.noteLink ? "笔记双链 · 手动关系" : edge.membership ? "目录层级 · 手动关系" : "手动关系" : edge.noteLink ? level === "folders" ? "笔记关系汇总" : "Obsidian 笔记双链" : "目录层级"}</small><b>{node.label}</b><span>{nodeLabels[node.kind]}</span></button>
              {edge.relationId && <ActionButton type="button" variant="danger" title={`取消与${node.label}的手动关系`} aria-label={`取消与${node.label}的手动关系`} onClick={() => { context.actions.removeRepositoryRelation?.(edge.relationId!); setNotice(`已取消与「${node.label}」的手动关系。`); }}>取消</ActionButton>}
            </article>) : <p>暂无关系。使用上方“建立关联”，依次选择两个节点。</p>}
          </section>
        </> : <div className="tab-modal-v2__repository-graph-hint"><IoLinkOutline aria-hidden="true" /><b>{linking ? "建立手动关系" : "浏览项目关系"}</b><span>点击节点查看链接；拖动节点可调整位置。手动关系保存在本机，Obsidian 双链和 Vault 文档归属自动显示。</span></div>}
      </aside>
    </div>
  </section>;
}

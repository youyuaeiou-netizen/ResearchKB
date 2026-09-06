import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { HddModelId, HddReasoningEffort } from "./hdd-models";

export { HDD_MODELS, HDD_REASONING_EFFORTS } from "./hdd-models";
export type { HddModelId, HddReasoningEffort } from "./hdd-models";

export type HddCitation = { label: string; path: string };
export type HddMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string; citations?: HddCitation[]; stopped?: boolean };
export type HddConversation = { id: string; title: string; createdAt: string; updatedAt: string; messages: HddMessage[] };
export type ConversationSummary = Pick<HddConversation, "id" | "title" | "createdAt" | "updatedAt">;
export type HddStatus = { available: boolean; version: string | null; message: string };
export type HddGenerationOptions = { contextRoots?: string[]; model?: HddModelId; reasoningEffort?: HddReasoningEffort };

const now = () => new Date().toISOString();

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : `本机接口返回 ${response.status}`);
  return body as T;
}

export function parseHddCitations(content: string): HddCitation[] {
  const values: HddCitation[] = [];
  for (const match of content.matchAll(/(?:^|\n)\s*(?:source|来源)\s*[:：]\s*([^\n]+)/gi)) {
    const path = match[1]?.trim();
    if (path && !values.some((value) => value.path === path)) values.push({ path, label: path.split("/").pop() ?? path });
  }
  return values.slice(0, 12);
}

function conversationMessage(content: string, role: HddMessage["role"]): HddMessage {
  return { id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, content, createdAt: now(), citations: role === "assistant" ? parseHddCitations(content) : undefined };
}

export type HddChatController = {
  status: HddStatus | null;
  conversations: ConversationSummary[];
  active: HddConversation | null;
  draft: string;
  loading: boolean;
  loadingConversation: boolean;
  error: string;
  deleteCandidate: ConversationSummary | null;
  messagesRef: React.RefObject<HTMLDivElement>;
  lastCitations: HddCitation[];
  setDraft: (value: string) => void;
  openConversation: (id: string) => Promise<void>;
  createConversation: () => Promise<void>;
  sendMessage: (event?: FormEvent, options?: HddGenerationOptions) => Promise<void>;
  stopGeneration: () => void;
  requestDelete: (conversation?: ConversationSummary) => void;
  deleteConversation: () => Promise<void>;
  cancelDelete: () => void;
};

export function useHddChat(): HddChatController {
  const [status, setStatus] = useState<HddStatus | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [active, setActive] = useState<HddConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<ConversationSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const openConversation = async (id: string) => {
    setLoadingConversation(true);
    setError("");
    try {
      setActive(await jsonRequest<HddConversation>(`/api/hdd/conversations/${id}`, { headers: {} }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "会话读取失败。");
    } finally {
      setLoadingConversation(false);
    }
  };

  const refreshConversations = async (selectFirst = true) => {
    try {
      const response = await jsonRequest<{ conversations: ConversationSummary[] }>("/api/hdd/conversations", { headers: {} });
      setConversations(response.conversations);
      if (selectFirst && !active && response.conversations[0]) await openConversation(response.conversations[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "会话列表暂不可用。");
    }
  };

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      jsonRequest<HddStatus>("/api/hdd/status", { headers: {} }),
      jsonRequest<{ conversations: ConversationSummary[] }>("/api/hdd/conversations", { headers: {} }),
    ]).then(async ([nextStatus, list]) => {
      if (disposed) return;
      setStatus(nextStatus);
      setConversations(list.conversations);
      if (list.conversations[0]) await openConversation(list.conversations[0].id);
    }).catch((cause) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : "H.D.D 本机接口暂不可用。");
    });
    return () => { disposed = true; abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [active?.messages.length, loading]);

  const lastCitations = useMemo(() => {
    const latest = [...(active?.messages ?? [])].reverse().find((message) => message.role === "assistant" && message.content);
    return latest?.citations?.length ? latest.citations : latest ? parseHddCitations(latest.content) : [];
  }, [active?.messages]);

  const createConversation = async () => {
    setError("");
    try {
      const conversation = await jsonRequest<HddConversation>("/api/hdd/conversations", { method: "POST", body: "{}" });
      setActive(conversation);
      setConversations((current) => [{ id: conversation.id, title: conversation.title, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt }, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法创建会话。");
    }
  };

  const sendMessage = async (event?: FormEvent, options?: HddGenerationOptions) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || loading) return;
    if (!status?.available) {
      setError(status?.message ?? "正在检查本机 Codex CLI。");
      return;
    }
    setError("");
    let conversation = active;
    if (!conversation) {
      try {
        conversation = await jsonRequest<HddConversation>("/api/hdd/conversations", { method: "POST", body: "{}" });
        setActive(conversation);
        setConversations((current) => [{ id: conversation!.id, title: conversation!.title, createdAt: conversation!.createdAt, updatedAt: conversation!.updatedAt }, ...current]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "无法创建会话。");
        return;
      }
    }
    const userMessage = conversationMessage(content, "user");
    const assistantId = `stream-${Date.now()}`;
    setDraft("");
    setLoading(true);
    setActive((current) => current ? { ...current, messages: [...current.messages, userMessage, { id: assistantId, role: "assistant", content: "", createdAt: now() }] } : current);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/hdd/conversations/${conversation.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, ...(options?.contextRoots ? { contextRoots: options.contextRoots } : {}), ...(options?.model ? { model: options.model } : {}), ...(options?.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}) }), signal: controller.signal });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.message === "string" ? payload.message : "H.D.D 流式接口不可用。");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneStopped = false;
      const consume = (chunk: string) => {
        buffer += chunk;
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split(/\r?\n/).find((item) => item.startsWith("data:"));
          if (!line) continue;
          const payload = JSON.parse(line.slice(5).trim()) as { text?: string; message?: string; stopped?: boolean };
          if (payload.text && frame.includes("event: delta")) setActive((current) => current ? { ...current, messages: current.messages.map((message) => message.id === assistantId ? { ...message, content: `${message.content}${payload.text}` } : message) } : current);
          if (frame.includes("event: done")) doneStopped = Boolean(payload.stopped);
          if (frame.includes("event: error")) throw new Error(payload.message || "H.D.D 返回错误。");
        }
      };
      while (true) {
        const result = await reader.read();
        consume(decoder.decode(result.value ?? new Uint8Array(), { stream: !result.done }));
        if (result.done) break;
      }
      if (buffer) consume("\n\n");
      if (doneStopped) setError("已停止生成；已保留已收到的内容。");
      setActive(await jsonRequest<HddConversation>(`/api/hdd/conversations/${conversation.id}`, { headers: {} }));
      await refreshConversations(false);
    } catch (cause) {
      if (controller.signal.aborted) setError("已停止生成；已保留已收到的内容。");
      else setError(cause instanceof Error ? cause.message : "H.D.D 请求失败。");
      setActive((current) => current ? { ...current, messages: current.messages.filter((message) => message.id !== assistantId || message.content) } : current);
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const requestDelete = (conversation?: ConversationSummary) => {
    const candidate = conversation ?? (active ? { id: active.id, title: active.title, createdAt: active.createdAt, updatedAt: active.updatedAt } : null);
    if (candidate) setDeleteCandidate({ ...candidate });
  };

  const deleteConversation = async () => {
    if (!deleteCandidate) return;
    const id = deleteCandidate.id;
    try {
      await jsonRequest(`/api/hdd/conversations/${id}`, { method: "DELETE", body: "{}" });
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (active?.id === id) setActive(null);
      setDeleteCandidate(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除会话失败。");
    }
  };

  return { status, conversations, active, draft, loading, loadingConversation, error, deleteCandidate, messagesRef, lastCitations, setDraft, openConversation, createConversation, sendMessage, stopGeneration: () => abortRef.current?.abort(), requestDelete, deleteConversation, cancelDelete: () => setDeleteCandidate(null) };
}

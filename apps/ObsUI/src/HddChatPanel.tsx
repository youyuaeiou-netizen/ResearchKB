import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { IoAddOutline, IoChatbubbleEllipsesOutline, IoDocumentTextOutline, IoSendOutline, IoSettingsOutline, IoStopCircleOutline, IoTrashOutline } from "react-icons/io5";
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

export function HddChatPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const chat = useHddChat();
  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void chat.sendMessage();
    }
  };

  return <section className="page hdd-page">
    <aside className="hdd-sessions" aria-label="H.D.D 会话列表">
      <header><div><span className="eyebrow">H.D.D</span><h2>会话</h2></div><button type="button" className="hdd-icon-button" onClick={() => void chat.createConversation()} aria-label="新建会话" title="新建会话"><IoAddOutline /></button></header>
      <div className="hdd-session-list">{chat.conversations.map((conversation) => <button type="button" className={`hdd-session ${conversation.id === chat.active?.id ? "active" : ""}`} key={conversation.id} onClick={() => void chat.openConversation(conversation.id)}><IoChatbubbleEllipsesOutline /><span>{conversation.title}</span><small>{new Date(conversation.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></button>)}{!chat.conversations.length && <p className="hdd-muted">还没有会话</p>}</div>
      <button type="button" className="hdd-settings-button" onClick={onOpenSettings}><IoSettingsOutline /> H.D.D 设置</button>
    </aside>
    <section className="hdd-conversation" aria-label="H.D.D 对话">
      <header className="hdd-conversation-header"><div><span className="eyebrow">LOCAL CODEX</span><h2>{chat.active?.title ?? "新会话"}</h2></div><div className="hdd-conversation-actions">{chat.active && <button type="button" className="hdd-icon-button" onClick={() => chat.requestDelete()} aria-label="删除当前会话" title="删除当前会话"><IoTrashOutline /></button>}<div className={`hdd-status ${chat.status?.available ? "ready" : "offline"}`}><i />{chat.status?.available ? "在线" : chat.status ? "离线" : "检查中"}</div></div></header>
      <div className="hdd-messages" ref={chat.messagesRef}>{chat.loadingConversation && <p className="hdd-muted">正在读取会话…</p>}{chat.active?.messages.map((message) => <article className={`hdd-message ${message.role}`} key={message.id}><span className="hdd-message-role">{message.role === "user" ? "你" : "H.D.D"}</span><p>{message.content || (chat.loading ? "正在生成…" : "")}</p>{message.stopped && <small className="hdd-stopped">已停止</small>}</article>)}{!chat.loadingConversation && !chat.active && <div className="hdd-empty"><IoChatbubbleEllipsesOutline /><b>从一个问题开始</b><span>本机 Codex 只读回答，不会联网或修改文件。</span></div>}</div>
      {chat.error && <div className="hdd-error" role="status">{chat.error}</div>}
      <form className="hdd-composer" onSubmit={(event) => void chat.sendMessage(event)}><textarea value={chat.draft} onChange={(event) => chat.setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder={chat.status?.available ? "向 H.D.D 提问…" : "Codex CLI 离线时不会伪造回答"} disabled={chat.loading || !chat.status?.available} rows={2} aria-label="向 H.D.D 提问" />{chat.loading ? <button type="button" className="hdd-send stop" onClick={chat.stopGeneration} aria-label="停止生成"><IoStopCircleOutline /></button> : <button type="submit" className="hdd-send" disabled={!chat.draft.trim() || !chat.status?.available} aria-label="发送消息"><IoSendOutline /></button>}</form>
    </section>
    <aside className="hdd-sources" aria-label="来源与状态"><header><IoDocumentTextOutline /><div><span className="eyebrow">SOURCES</span><h2>来源</h2></div></header>{chat.lastCitations.length ? <ul>{chat.lastCitations.map((citation) => <li key={citation.path}><b>{citation.label}</b><small>{citation.path}</small></li>)}</ul> : <p className="hdd-muted">回答中的 Source 行会显示在这里。知识镜像仅包含六个知识目录里的 Markdown / TXT。</p>}<div className="hdd-boundary"><b>{chat.status?.version ?? "H.D.D"}</b><span>只读 · 本机保存</span></div></aside>
    {chat.deleteCandidate && <div className="hdd-delete-confirm" role="dialog" aria-modal="true"><b>删除这个会话？</b><span>历史 JSON 将被移除，且无法从 ObsUI 恢复。</span><div><button type="button" className="secondary" onClick={chat.cancelDelete}>取消</button><button type="button" className="danger-button" onClick={() => void chat.deleteConversation()}><IoTrashOutline /> 确认删除</button></div></div>}
  </section>;
}

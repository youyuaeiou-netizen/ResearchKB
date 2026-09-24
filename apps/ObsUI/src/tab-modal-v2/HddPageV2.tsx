import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { IoAddOutline, IoArrowUpOutline, IoChatbubbleEllipsesOutline, IoCheckmarkCircleOutline, IoChevronForwardOutline, IoCloseOutline, IoDocumentTextOutline, IoFolderOpenOutline, IoSearchOutline, IoSettingsOutline, IoStopCircleOutline, IoTrashOutline } from "react-icons/io5";
import { PiWaveform } from "react-icons/pi";
import { useHddChat, type ConversationSummary, type HddCitation } from "../HddChatPanel";
import { HDD_PROVIDERS, hddReasoningEfforts, hddRuntimeModelLabel, normalizeHddReasoningEffort, type HddModelId, type HddProviderId, type HddReasoningEffort } from "../hdd-models";
import { DEFAULT_WORKBENCH_SETTINGS } from "../workbench-settings";
import { ActionButton } from "./ActionButton";
import { ContentCard } from "./ContentCard";
import type { V2BusinessContext } from "./model";

const HDD_CONTEXT_ROOTS = [
  { id: "00-Ideas", label: "想法" },
  { id: "01-Projects", label: "项目" },
  { id: "02-Areas", label: "领域" },
  { id: "03-Resources", label: "资源" },
  { id: "04-Archive", label: "归档" },
  { id: "05-Skills", label: "技能" },
] as const;

function HddSourceList({ citations, selectedPath, onSelect, compact = false }: { citations: HddCitation[]; selectedPath: string | null; onSelect?: (path: string) => void; compact?: boolean }) {
  if (!citations.length) return <div className="tab-modal-v2__hdd-context-empty"><IoDocumentTextOutline aria-hidden="true" /><b>还没有来源</b><p>完成一次回答后，引用会出现在这里。</p></div>;
  return <div className="tab-modal-v2__hdd-context-list">{citations.map((citation) => <button type="button" className={`tab-modal-v2__hdd-context-item${citation.path === selectedPath ? " is-selected" : ""}`} key={citation.path} aria-pressed={citation.path === selectedPath} onClick={() => onSelect?.(citation.path)}><IoDocumentTextOutline aria-hidden="true" /><span><b>{citation.label}</b>{!compact && <small>{citation.path}</small>}</span></button>)}</div>;
}

function HddLibrarySettings({ contextRoots, onToggle, onSelectAll, onClose }: { contextRoots: string[]; onToggle: (id: string) => void; onSelectAll: () => void; onClose: () => void }) {
  const selectedCount = HDD_CONTEXT_ROOTS.filter((root) => contextRoots.includes(root.id)).length;
  return <section className="tab-modal-v2__hdd-library-settings" aria-label="项目库设置">
    <header className="tab-modal-v2__hdd-library-settings-header"><div><h2>项目库</h2><p>选择 H.D.D 回答时使用的知识目录</p></div><ActionButton aria-label="返回对话" title="返回对话" onClick={onClose}><IoCloseOutline aria-hidden="true" /></ActionButton></header>
    <div className="tab-modal-v2__hdd-library-settings-body">
      <section className="tab-modal-v2__hdd-library-card" aria-labelledby="hdd-library-title">
        <div className="tab-modal-v2__hdd-library-heading"><div><IoFolderOpenOutline aria-hidden="true" /><h3 id="hdd-library-title">项目库</h3></div><span>{selectedCount} / {HDD_CONTEXT_ROOTS.length}</span></div>
        <p>发送问题时，H.D.D 只读取已选项目库中的 Markdown / TXT 文件。</p>
        <div className="tab-modal-v2__hdd-library-grid" role="group" aria-label="项目库选择">{HDD_CONTEXT_ROOTS.map((root) => {
          const selected = contextRoots.includes(root.id);
          return <button type="button" key={root.id} aria-pressed={selected} aria-label={`${selected ? "取消选择" : "选择"}${root.label}项目库`} title={`${selected ? "取消选择" : "选择"}${root.label}项目库`} className={selected ? "is-selected" : ""} onClick={() => onToggle(root.id)}><IoFolderOpenOutline aria-hidden="true" /><b>{root.label}</b><span aria-hidden="true">{selected ? <IoCheckmarkCircleOutline /> : <IoAddOutline />}</span></button>;
        })}</div>
        <div className="tab-modal-v2__hdd-library-footer"><span>当前选择将在下次提问时生效。</span><ActionButton type="button" onClick={onSelectAll}>全部选择</ActionButton></div>
      </section>
    </div>
  </section>;
}

function HddConversationRow({ conversation, selected, onOpen, onDelete }: { conversation: ConversationSummary; selected: boolean; onOpen: () => void; onDelete: () => void }) {
  return <div className="tab-modal-v2__hdd-session-row">
    <button type="button" className={`tab-modal-v2__hdd-session${selected ? " is-selected" : ""}`} onClick={onOpen}>
      <IoChatbubbleEllipsesOutline aria-hidden="true" /><span>{conversation.title}</span>
    </button>
    <ActionButton type="button" className="tab-modal-v2__hdd-session-delete" aria-label={`删除会话：${conversation.title}`} title={`删除会话：${conversation.title}`} onClick={(event) => { event.stopPropagation(); onDelete(); }}><IoTrashOutline aria-hidden="true" /></ActionButton>
  </div>;
}

export function HddPageV2({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const hddSettings = context.hddSettings ?? DEFAULT_WORKBENCH_SETTINGS.hdd;
  const chat = useHddChat(context.hddSettings);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextRoots, setContextRoots] = useState<string[]>(() => HDD_CONTEXT_ROOTS.map((root) => root.id));
  const [sessionQuery, setSessionQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<"chat" | "settings">("chat");
  const [model, setModel] = useState<HddModelId>(hddSettings.model);
  const [reasoningEffort, setReasoningEffort] = useState<HddReasoningEffort>(hddSettings.reasoningEffort);
  const selectedCitation = chat.lastCitations.find((citation) => citation.path === selectedPath) ?? null;
  const normalizedSessionQuery = sessionQuery.trim().toLocaleLowerCase();
  const visibleConversations = normalizedSessionQuery ? chat.conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(normalizedSessionQuery)) : chat.conversations;
  const hasDraft = chat.draft.trim().length > 0;
  const selectedCliProfile = hddSettings.cliProfiles.find((profile) => profile.id === hddSettings.selectedCliProfileId) ?? hddSettings.cliProfiles[0] ?? null;
  const providerLabel = HDD_PROVIDERS.find((provider) => provider.id === hddSettings.provider)?.label ?? "Codex CLI";
  const codexModels = hddSettings.provider === "codex" ? chat.status?.modelOptions : undefined;
  const modelOptions = hddSettings.provider === "codex"
    ? codexModels?.length ? codexModels : [{ id: hddSettings.model, label: hddSettings.model }]
    : chat.status?.models?.length
      ? chat.status.models.map((item) => ({ id: item, label: hddRuntimeModelLabel(item) }))
      : hddSettings.model ? [{ id: hddSettings.model, label: hddSettings.model }] : [];
  const reasoningOptions = hddReasoningEfforts(hddSettings.provider, model, codexModels);
  const canSend = Boolean(chat.status?.available) && (hddSettings.provider !== "codex" || Boolean(codexModels?.some((item) => item.id === model)));

  useEffect(() => {
    setSelectedPath((current) => chat.lastCitations.some((citation) => citation.path === current) ? current : chat.lastCitations[0]?.path ?? null);
  }, [chat.lastCitations]);

  useEffect(() => {
    setModel(hddSettings.model);
    setReasoningEffort(normalizeHddReasoningEffort(hddSettings.provider, hddSettings.model, hddSettings.reasoningEffort));
  }, [hddSettings.model, hddSettings.provider, hddSettings.reasoningEffort]);

  useEffect(() => {
    if (hddSettings.provider !== "codex" || !codexModels?.length || codexModels.some((item) => item.id === model)) return;
    const nextModel = codexModels.find((item) => item.isDefault)?.id ?? codexModels[0].id;
    setModel(nextModel);
    setReasoningEffort(normalizeHddReasoningEffort("codex", nextModel, reasoningEffort, codexModels));
  }, [codexModels, hddSettings.provider, model, reasoningEffort]);

  const selectModel = (nextModel: HddModelId) => {
    setModel(nextModel);
    setReasoningEffort((current) => normalizeHddReasoningEffort(hddSettings.provider, nextModel, current, codexModels));
  };

  const generationOptions = {
    contextRoots,
    provider: hddSettings.provider,
    model,
    ...(reasoningOptions.length ? { reasoningEffort } : {}),
    customInstructions: hddSettings.customInstructions,
    ...(selectedCliProfile ? { cliPath: selectedCliProfile.executablePath, cliArgs: selectedCliProfile.argsTemplate, cliPreset: selectedCliProfile.preset } : {}),
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void chat.sendMessage(undefined, generationOptions);
    }
  };

  const submitMessage = (event?: FormEvent) => void chat.sendMessage(event, generationOptions);
  const toggleContextRoot = (id: string) => setContextRoots((current) => current.includes(id) ? current.filter((root) => root !== id) : [...current, id]);
  const selectAllContextRoots = () => setContextRoots(HDD_CONTEXT_ROOTS.map((root) => root.id));
  const startConversation = () => {
    setSettingsMenuOpen(false);
    setWorkspaceView("chat");
    void chat.createConversation();
  };
  const openLibrarySettings = () => {
    setSettingsMenuOpen(false);
    setWorkspaceView("settings");
  };
  const handleSettingsMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setSettingsMenuOpen(false);
    }
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setSessionQuery("");
  };
  const openConversation = (id: string) => {
    setWorkspaceView("chat");
    closeSearch();
    void chat.openConversation(id);
  };

  if (nav === "sources") return <div className="tab-modal-v2__page-stack"><section className="tab-modal-v2__list-panel"><div className="tab-modal-v2__section-heading"><div><b>最近回答的来源</b></div><span>{chat.lastCitations.length} 个来源</span></div><HddSourceList citations={chat.lastCitations} selectedPath={null} /></section></div>;

  if (nav === "settings") return <div className="tab-modal-v2__page-stack"><ContentCard accent="gold" className="tab-modal-v2__hdd-status-card"><div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoSettingsOutline aria-hidden="true" /></span><span className={`tab-modal-v2__live-pill${chat.status?.available ? " is-ready" : ""}`}><i />{chat.status?.available ? "在线" : chat.status ? "离线" : "检查中"}</span></div><h2>H.D.D 本机桥接</h2><p>当前对话使用{providerLabel}。知识镜像仅提供本机 Markdown / TXT 内容，历史会话保存在本机。</p><div className="tab-modal-v2__definition-list"><div><span>版本</span><b>{chat.status?.version ?? "—"}</b></div><div><span>状态</span><b>{chat.status?.message ?? "正在检查回答引擎"}</b></div></div><ActionButton variant="quiet" onClick={context.actions.openSettings}>打开工作台设置</ActionButton></ContentCard></div>;

  return <div className="tab-modal-v2__hdd-workbench">
    <aside className="tab-modal-v2__hdd-sessions" aria-label="H.D.D 会话列表">
      <header className="tab-modal-v2__hdd-sidebar-header"><b>H.D.D</b><ActionButton className="tab-modal-v2__hdd-search-trigger" aria-label="搜索" title="搜索聊天" aria-expanded={searchOpen} onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}><IoSearchOutline aria-hidden="true" /></ActionButton></header>
      <ActionButton className="tab-modal-v2__hdd-new-session" aria-label="新建会话" title="新建会话" onClick={startConversation}><IoAddOutline aria-hidden="true" /><span>新对话</span></ActionButton>
      <div className="tab-modal-v2__hdd-session-group"><b>最近</b><div className="tab-modal-v2__hdd-session-list">{chat.conversations.map((conversation) => <HddConversationRow key={conversation.id} conversation={conversation} selected={conversation.id === chat.active?.id} onOpen={() => openConversation(conversation.id)} onDelete={() => chat.requestDelete(conversation)} />)}{!chat.conversations.length && <span className="tab-modal-v2__hdd-muted">还没有会话</span>}</div></div>
      <ActionButton className={`tab-modal-v2__hdd-settings-button${workspaceView === "settings" ? " is-active" : ""}`} aria-label="H.D.D 设置" title="H.D.D 设置" aria-haspopup="dialog" aria-expanded={settingsMenuOpen} onClick={() => setSettingsMenuOpen((open) => !open)}><IoSettingsOutline aria-hidden="true" /><span>设置</span></ActionButton>
    </aside>

    {settingsMenuOpen && <div className="tab-modal-v2__hdd-settings-layer" onClick={() => setSettingsMenuOpen(false)} onKeyDownCapture={handleSettingsMenuKeyDown}>
      <section className="tab-modal-v2__hdd-settings-popover" role="dialog" aria-modal="true" aria-label="H.D.D 设置菜单" onClick={(event) => event.stopPropagation()}>
        <header className="tab-modal-v2__hdd-settings-popover-header"><div><span className="tab-modal-v2__hdd-settings-popover-icon"><IoSettingsOutline aria-hidden="true" /></span><div><h2>设置</h2><p>H.D.D 工作区</p></div></div><ActionButton autoFocus aria-label="关闭设置菜单" title="关闭设置菜单" onClick={() => setSettingsMenuOpen(false)}><IoCloseOutline aria-hidden="true" /></ActionButton></header>
        <div className="tab-modal-v2__hdd-settings-popover-body">
          <b className="tab-modal-v2__hdd-settings-popover-section">回答模型</b>
          <section className="tab-modal-v2__hdd-settings-model" aria-label="模型设置">
            <div className="tab-modal-v2__hdd-settings-model-heading"><div><b>{providerLabel}</b><small>本次回答使用</small></div><span>MODEL</span></div>
            <label className="tab-modal-v2__hdd-settings-model-field"><span>模型</span><select value={model} onChange={(event) => selectModel(event.target.value as HddModelId)} disabled={chat.loading || hddSettings.provider === "cli" || (hddSettings.provider === "codex" && !codexModels?.length)} aria-label="模型">{!modelOptions.some((item) => item.id === model) && <option value={model}>{model}（当前不可用）</option>}{modelOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="tab-modal-v2__hdd-settings-model-field"><span>强度</span><select value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value as HddReasoningEffort)} disabled={chat.loading || !reasoningOptions.length} aria-label="模型强度">{reasoningOptions.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label>
            {hddSettings.provider === "codex" && chat.status && !codexModels?.length && <p className="tab-modal-v2__hdd-settings-model-note">Codex 模型列表暂不可用，请稍后重试。</p>}
            {hddSettings.provider === "ollama" && <p className="tab-modal-v2__hdd-settings-model-note">这里只显示本机 Ollama 模型。GPT 模型位于 Codex CLI 提供方。</p>}
            <button type="button" className="tab-modal-v2__hdd-settings-provider-link" onClick={context.actions.openSettings}>切换回答提供方 <IoChevronForwardOutline aria-hidden="true" /></button>
          </section>
          <b className="tab-modal-v2__hdd-settings-popover-section">工作区</b>
          <button type="button" className="tab-modal-v2__hdd-settings-item" aria-label="打开项目库设置" onClick={openLibrarySettings}><span className="tab-modal-v2__hdd-settings-item-icon"><IoFolderOpenOutline aria-hidden="true" /></span><span><b>项目库</b><small>选择回答时使用的知识目录</small></span><IoChevronForwardOutline aria-hidden="true" /></button>
        </div>
      </section>
    </div>}

    {workspaceView === "settings" ? <HddLibrarySettings contextRoots={contextRoots} onToggle={toggleContextRoot} onSelectAll={selectAllContextRoots} onClose={() => setWorkspaceView("chat")} /> : <section className={`tab-modal-v2__hdd-conversation${chat.active ? " has-active" : " is-empty"}`} aria-label="H.D.D 对话">
      {chat.active && <header className="tab-modal-v2__hdd-conversation-header"><div><h2>{chat.active.title}</h2></div><div className="tab-modal-v2__hdd-header-actions"><ActionButton aria-label="删除当前会话" title="删除当前会话" onClick={() => chat.requestDelete()}><IoTrashOutline aria-hidden="true" /></ActionButton></div></header>}
      <div className="tab-modal-v2__hdd-messages" ref={chat.messagesRef}>
        {chat.loadingConversation && <span className="tab-modal-v2__hdd-muted">正在读取会话…</span>}
        {chat.active?.messages.map((message) => <article className={`tab-modal-v2__hdd-message ${message.role}`} key={message.id}><span>{message.role === "user" ? "你" : "H.D.D"}</span><p>{message.content || (chat.loading ? "正在生成…" : "")}</p>{message.stopped && <small className="tab-modal-v2__hdd-stopped">已停止</small>}</article>)}
        {!chat.loadingConversation && !chat.active && <div className="tab-modal-v2__hdd-empty"><IoChatbubbleEllipsesOutline aria-hidden="true" /><b>从一个问题开始</b><span>本机只读回答，不会修改文件。</span></div>}
        {chat.active && chat.lastCitations.length > 0 && (
          <section className="tab-modal-v2__hdd-inline-sources" aria-label="回答来源">
            <div className="tab-modal-v2__hdd-context-section-heading"><b>回答来源</b><span>{chat.lastCitations.length} 个</span></div>
            <HddSourceList citations={chat.lastCitations} selectedPath={selectedPath} onSelect={setSelectedPath} compact />
            {selectedCitation && <div className="tab-modal-v2__hdd-context-preview"><b>来源预览</b><code>{selectedCitation.path}</code></div>}
          </section>
        )}
      </div>
      {chat.error && <div className="tab-modal-v2__hdd-error" role="status">{chat.error}</div>}
      <form className="tab-modal-v2__hdd-composer" onSubmit={submitMessage}>
        <div className="tab-modal-v2__hdd-composer-input">
          <textarea value={chat.draft} onChange={(event) => chat.setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={canSend ? "向 H.D.D 提问…" : "回答引擎或模型列表暂不可用"} disabled={chat.loading || !canSend} rows={2} aria-label="向 H.D.D 提问" />
          {chat.loading ? <ActionButton className="tab-modal-v2__hdd-send is-generating" type="button" variant="danger" onClick={chat.stopGeneration} aria-label="停止生成"><IoStopCircleOutline aria-hidden="true" /></ActionButton> : <ActionButton className={`tab-modal-v2__hdd-send ${hasDraft ? "is-filled" : "is-empty"}`} type="submit" variant="primary" disabled={!hasDraft || !canSend} aria-label="发送消息">{hasDraft ? <IoArrowUpOutline aria-hidden="true" /> : <PiWaveform aria-hidden="true" />}</ActionButton>}
        </div>
      </form>
    </section>}

    {searchOpen && <div className="tab-modal-v2__hdd-search-overlay" onClick={closeSearch}>
      <section className="tab-modal-v2__hdd-search-dialog" role="dialog" aria-modal="true" aria-label="搜索聊天" onClick={(event) => event.stopPropagation()}>
        <header className="tab-modal-v2__hdd-search-dialog-header">
          <label className="tab-modal-v2__hdd-search-input"><IoSearchOutline aria-hidden="true" /><input autoFocus value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} placeholder="搜索聊天" aria-label="搜索聊天" /></label>
          <ActionButton className="tab-modal-v2__hdd-search-dialog-close" aria-label="关闭搜索" title="关闭搜索" onClick={closeSearch}><IoCloseOutline aria-hidden="true" /></ActionButton>
        </header>
        <div className="tab-modal-v2__hdd-search-dialog-body">
          <b className="tab-modal-v2__hdd-search-section-title">聊天</b>
          <div className="tab-modal-v2__hdd-search-dialog-results">{visibleConversations.map((conversation) => <HddConversationRow key={conversation.id} conversation={conversation} selected={conversation.id === chat.active?.id} onOpen={() => openConversation(conversation.id)} onDelete={() => chat.requestDelete(conversation)} />)}{!visibleConversations.length && <span className="tab-modal-v2__hdd-muted">{normalizedSessionQuery ? "没有匹配会话" : "还没有会话"}</span>}</div>
          <b className="tab-modal-v2__hdd-search-section-title">快捷操作</b>
          <ActionButton className="tab-modal-v2__hdd-search-quick-action" onClick={() => { closeSearch(); startConversation(); }}><IoAddOutline aria-hidden="true" /><span>新对话</span></ActionButton>
        </div>
      </section>
    </div>}

    {chat.deleteCandidate && <div className="tab-modal-v2__confirm" role="dialog" aria-modal="true"><b>删除这个会话？</b><p>历史 JSON 将被移除，且无法从 ObsUI 恢复。</p><div><ActionButton aria-label="取消删除" onClick={chat.cancelDelete}>取消</ActionButton><ActionButton aria-label="确认删除" title="确认删除" variant="danger" onClick={() => void chat.deleteConversation()}><IoTrashOutline aria-hidden="true" />确认删除</ActionButton></div></div>}
  </div>;
}

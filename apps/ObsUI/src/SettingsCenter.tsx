import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";
import {
  IoCloseOutline,
  IoColorPaletteOutline,
  IoCubeOutline,
  IoExtensionPuzzleOutline,
  IoImageOutline,
  IoInformationCircleOutline,
  IoPawOutline,
  IoPersonOutline,
  IoRocketOutline,
  IoSaveOutline,
  IoServerOutline,
} from "react-icons/io5";
import type { IconType } from "react-icons";
import defaultWallpaperUrl from "../assets/wallpapers/peloyce-default.png";
import { DEFAULT_OLLAMA_MODEL, HDD_PROVIDERS, hddReasoningEfforts, normalizeHddReasoningEffort, type HddCliProfile, type HddModelId, type HddModelOption, type HddProviderId, type HddReasoningEffort } from "./hdd-models";
import { OBSUI_BUILD_HISTORY, OBSUI_VERSION } from "./version-info";
import { DEFAULT_STARTUP_SETTINGS, DEFAULT_WORKBENCH_SETTINGS, type StartupApplicationId, type WorkbenchSettings, type WorkbenchStartupState } from "./workbench-settings";
import "./settings-center.css";

export type SettingsSection = "appearance" | "startup" | "hdd" | "plugins" | "profile" | "pet" | "data" | "about";

type Props = {
  initialSection?: SettingsSection;
  settings: WorkbenchSettings;
  onSettingsChange: (settings: WorkbenchSettings) => void;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  updatedAt: string;
  dialogRef?: RefObject<HTMLElement>;
  closeRef?: RefObject<HTMLButtonElement>;
};

const sections: Array<{ id: SettingsSection; label: string; Icon: IconType }> = [
  { id: "appearance", label: "个性化", Icon: IoColorPaletteOutline },
  { id: "startup", label: "启动与应用", Icon: IoRocketOutline },
  { id: "hdd", label: "H.D.D 模型", Icon: IoCubeOutline },
  { id: "plugins", label: "插件", Icon: IoExtensionPuzzleOutline },
  { id: "profile", label: "个人信息", Icon: IoPersonOutline },
  { id: "pet", label: "宠物", Icon: IoPawOutline },
  { id: "data", label: "本地数据", Icon: IoServerOutline },
  { id: "about", label: "关于与版本", Icon: IoInformationCircleOutline },
];

function imageDataUrl(file: File, maximumBytes: number) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("请选择图片文件。"));
    if (file.size > maximumBytes) return reject(new Error(`图片不能超过 ${Math.round(maximumBytes / 1024 / 1024)} MB。`));
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("图片读取失败。"));
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

function Toggle({ checked, disabled = false, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button type="button" className={`settings-toggle${checked ? " is-on" : ""}`} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><i /></button>;
}

type HddProviderStatus = {
  id: HddProviderId;
  label: string;
  detail: string;
  available: boolean;
  version: string | null;
  models: HddModelOption[];
  cliCandidates?: Array<{ label: string; path: string; preset: HddCliProfile["preset"]; model: string; argsTemplate: string }>;
};

type HddProvidersPayload = {
  providers: HddProviderStatus[];
};

export function SettingsCenter({ initialSection = "appearance", settings, onSettingsChange, onClose, onExport, onImport, onReset, updatedAt, dialogRef, closeRef }: Props) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [message, setMessage] = useState("");
  const [instructionDraft, setInstructionDraft] = useState(settings.hdd.customInstructions);
  const [profileDraft, setProfileDraft] = useState(settings.profile);
  const [startup, setStartup] = useState<WorkbenchStartupState>({ ...DEFAULT_STARTUP_SETTINGS, applicationsStatus: [] });
  const [startupLoading, setStartupLoading] = useState(true);
  const [hddProviders, setHddProviders] = useState<HddProvidersPayload>({ providers: [] });
  const [hddProvidersLoading, setHddProvidersLoading] = useState(true);
  const [screenshotStatus, setScreenshotStatus] = useState<{ available: boolean; running: boolean; hotkey: string; hotkeyStatus: string; lastError: string | null } | null>(null);
  const wallpaperInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => { setSection(initialSection); }, [initialSection]);
  useEffect(() => { setInstructionDraft(settings.hdd.customInstructions); }, [settings.hdd.customInstructions]);
  useEffect(() => { setProfileDraft(settings.profile); }, [settings.profile]);
  useEffect(() => {
    let disposed = false;
    const refreshProviders = () => {
      void fetch("/api/hdd/providers", { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json() as HddProvidersPayload & { message?: string };
          if (!response.ok) throw new Error(payload.message || "H.D.D 提供方暂不可用。");
          if (!disposed) setHddProviders(payload);
        })
        .catch((error) => { if (!disposed) setMessage(error instanceof Error ? error.message : "H.D.D 提供方暂不可用。"); })
        .finally(() => { if (!disposed) setHddProvidersLoading(false); });
    };
    refreshProviders();
    const refreshTimer = window.setInterval(refreshProviders, 60_000);
    return () => { disposed = true; window.clearInterval(refreshTimer); };
  }, []);
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      fetch("/api/screenshot/status", { cache: "no-store" })
        .then((response) => response.json())
        .then((payload) => { if (!disposed && payload && typeof payload === "object") setScreenshotStatus(payload); })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    let disposed = false;
    fetch("/api/workbench-startup", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as WorkbenchStartupState;
        if (!response.ok) throw new Error(payload.message || "启动设置暂不可用。");
        if (!disposed) setStartup(payload);
      })
      .catch((error) => { if (!disposed) setMessage(error instanceof Error ? error.message : "启动设置暂不可用。"); })
      .finally(() => { if (!disposed) setStartupLoading(false); });
    return () => { disposed = true; };
  }, []);

  const updateSettings = (next: WorkbenchSettings, success: string) => {
    onSettingsChange(next);
    setMessage(success);
  };

  const saveStartup = async (next: WorkbenchStartupState) => {
    setStartup(next);
    setStartupLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/workbench-startup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowsStartup: next.windowsStartup, applications: next.applications, customApplications: next.customApplications }),
      });
      const payload = await response.json() as WorkbenchStartupState;
      if (!response.ok) throw new Error(payload.message || "无法保存启动设置。");
      setStartup(payload);
      setMessage(payload.message || "启动设置已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法保存启动设置。");
      try {
        const response = await fetch("/api/workbench-startup", { cache: "no-store" });
        if (response.ok) setStartup(await response.json() as WorkbenchStartupState);
      } catch { /* keep the last visible state when refresh is unavailable */ }
    } finally { setStartupLoading(false); }
  };

  const addCustomApplication = async () => {
    setStartupLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/workbench-startup/select-application", { method: "POST" });
      const payload = await response.json() as WorkbenchStartupState & { cancelled?: boolean };
      if (!response.ok) throw new Error(payload.message || "无法添加应用。");
      if (!payload.cancelled) {
        setStartup(payload);
        setMessage(payload.message || "应用已添加。");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法添加应用。"); }
    finally { setStartupLoading(false); }
  };

  const selectWallpaper = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { updateSettings({ ...settings, wallpaperDataUrl: await imageDataUrl(file, 5 * 1024 * 1024) }, "壁纸已更换并保存在本机。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "壁纸读取失败。"); }
  };

  const selectAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const avatarDataUrl = await imageDataUrl(file, 2 * 1024 * 1024);
      setProfileDraft((current) => ({ ...current, avatarDataUrl }));
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "头像读取失败。"); }
  };

  const updateHddSettings = (patch: Partial<WorkbenchSettings["hdd"]>, success?: string) => {
    onSettingsChange({ ...settings, hdd: { ...settings.hdd, ...patch } });
    if (success) setMessage(success);
  };

  const selectedCliProfile = settings.hdd.cliProfiles.find((profile) => profile.id === settings.hdd.selectedCliProfileId) ?? settings.hdd.cliProfiles[0] ?? null;
  const selectedProvider = HDD_PROVIDERS.find((provider) => provider.id === settings.hdd.provider) ?? HDD_PROVIDERS[0];
  const providerStatus = hddProviders.providers.find((provider) => provider.id === settings.hdd.provider);
  const modelOptions = providerStatus?.models?.length
      ? providerStatus.models
      : settings.hdd.model ? [{ id: settings.hdd.model, label: settings.hdd.model }] : [];

  const selectHddProvider = (provider: HddProviderId) => {
    if (provider === "codex") {
      const models = hddProviders.providers.find((candidate) => candidate.id === provider)?.models ?? [];
      const model = models.find((item) => item.isDefault)?.id ?? models[0]?.id ?? DEFAULT_WORKBENCH_SETTINGS.hdd.model;
      updateHddSettings({ provider, model, reasoningEffort: normalizeHddReasoningEffort(provider, model, settings.hdd.reasoningEffort, models) });
    }
    else if (provider === "ollama") {
      const models = hddProviders.providers.find((candidate) => candidate.id === provider)?.models ?? [];
      const model = models.find((candidate) => candidate.id === DEFAULT_OLLAMA_MODEL)?.id ?? models[0]?.id ?? DEFAULT_OLLAMA_MODEL;
      updateHddSettings({ provider, model, reasoningEffort: normalizeHddReasoningEffort(provider, model, settings.hdd.reasoningEffort) });
    }
    else updateHddSettings({ provider, model: selectedCliProfile?.model ?? "", selectedCliProfileId: selectedCliProfile?.id ?? "" });
  };

  const addHddCli = async () => {
    setHddProvidersLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/hdd/select-cli", { method: "POST" });
      const payload = await response.json() as { profile?: HddCliProfile; cancelled?: boolean; message?: string };
      if (!response.ok) throw new Error(payload.message || "无法添加 CLI。");
      if (payload.profile) {
        const profile = payload.profile;
        updateHddSettings({ provider: "cli", model: profile.model, selectedCliProfileId: profile.id, cliProfiles: [...settings.hdd.cliProfiles.filter((item) => item.executablePath.toLocaleLowerCase() !== profile.executablePath.toLocaleLowerCase()), profile] }, `${profile.label} 已添加。`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法添加 CLI。"); }
    finally { setHddProvidersLoading(false); }
  };

  const useDetectedHddCli = (candidate: NonNullable<HddProviderStatus["cliCandidates"]>[number]) => {
    const profile: HddCliProfile = { id: "cli-" + (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + "-" + Math.random().toString(16).slice(2)), label: candidate.label, executablePath: candidate.path, model: candidate.model, argsTemplate: candidate.argsTemplate, preset: candidate.preset };
    updateHddSettings({ provider: "cli", model: profile.model, selectedCliProfileId: profile.id, cliProfiles: [...settings.hdd.cliProfiles.filter((item) => item.executablePath.toLocaleLowerCase() !== profile.executablePath.toLocaleLowerCase()), profile] }, profile.label + " 已设为 H.D.D 提供方。");
  };

  const updateSelectedCliProfile = (patch: Partial<HddCliProfile>) => {
    if (!selectedCliProfile) return;
    const cliProfiles = settings.hdd.cliProfiles.map((profile) => profile.id === selectedCliProfile.id ? { ...profile, ...patch } : profile);
    updateHddSettings({ cliProfiles, ...(patch.model !== undefined ? { model: patch.model } : {}) });
  };

  const renderContent = () => {
    if (section === "appearance") return <section className="settings-content-section"><PageHeading title="个性化" detail="更换工作台背景；图片只保存在本机。" /><div className="settings-wallpaper-preview" style={{ backgroundImage: `url(${settings.wallpaperDataUrl ?? defaultWallpaperUrl})` }}><span>{settings.wallpaperDataUrl ? "当前自定义壁纸" : "默认：佩洛伊斯"}</span></div><div className="settings-button-row"><button className="settings-primary" type="button" onClick={() => wallpaperInput.current?.click()}><IoImageOutline />选择图片</button><button className="settings-secondary" type="button" disabled={!settings.wallpaperDataUrl} onClick={() => updateSettings({ ...settings, wallpaperDataUrl: null }, "已恢复佩洛伊斯默认壁纸。")}>恢复默认</button></div><input ref={wallpaperInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={selectWallpaper} /><p className="settings-helper">当前默认壁纸为佩洛伊斯；支持 PNG、JPEG、WebP，最大 5 MB。</p></section>;
    if (section === "startup") return <section className="settings-content-section"><PageHeading title="启动与应用" detail="管理 Windows 登录启动，以及随 ObsUI 启动的本机应用。" /><SettingsGroup title="系统启动"><SettingRow title="登录 Windows 后启动 ObsUI" detail="通过当前用户的启动项打开工作台。"><Toggle checked={startup.windowsStartup} disabled={startupLoading} label="登录 Windows 后启动 ObsUI" onChange={(checked) => void saveStartup({ ...startup, windowsStartup: checked })} /></SettingRow></SettingsGroup><SettingsGroup title="截图快捷键"><div className="settings-screenshot-hotkey"><label><span>快捷键</span><input value={settings.screenshot.hotkey} maxLength={80} onChange={(event) => onSettingsChange({ ...settings, screenshot: { ...settings.screenshot, hotkey: event.target.value } })} placeholder="Ctrl+Alt+A" /></label><span className={screenshotStatus?.hotkeyStatus === "registered" ? "is-ready-text" : "settings-screenshot-status"}>{screenshotStatus?.hotkeyStatus === "registered" ? `已注册 · ${screenshotStatus.hotkey}` : screenshotStatus?.hotkeyStatus === "conflict" ? "快捷键冲突，请更换组合" : screenshotStatus?.hotkeyStatus === "disabled" ? "已停用" : screenshotStatus?.hotkeyStatus ?? "等待截图辅助进程"}</span></div><p className="settings-helper">截图启用开关位于“插件”页。支持 Ctrl、Alt、Shift 或 Win 修饰键与字母、F1-F12、Space、PrintScreen。冲突时不会拦截其他程序的快捷键。</p></SettingsGroup><SettingsGroup title="随 ObsUI 启动">{startup.applicationsStatus.map((application) => <SettingRow key={application.id} title={application.label} detail={application.installed ? "已检测到本机应用" : "未检测到可执行文件"}><Toggle checked={startup.applications[application.id]} disabled={startupLoading || !application.configured} label={`随 ObsUI 启动 ${application.label}`} onChange={(checked) => void saveStartup({ ...startup, applications: { ...startup.applications, [application.id]: checked } })} /></SettingRow>)}{startup.customApplications.map((application) => <SettingRow key={application.id} title={application.label} detail={application.installed ? application.path : "应用文件已移动或删除"}><Toggle checked={application.enabled} disabled={startupLoading || !application.installed} label={`随 ObsUI 启动 ${application.label}`} onChange={(checked) => void saveStartup({ ...startup, customApplications: startup.customApplications.map((item) => item.id === application.id ? { ...item, enabled: checked } : item) })} /></SettingRow>)}{!startup.applicationsStatus.length && <p className="settings-helper">{startupLoading ? "正在检测本机应用…" : "未取得本机应用状态。"}</p>}<button className="settings-secondary" type="button" disabled={startupLoading} onClick={() => void addCustomApplication()}>添加其他应用</button></SettingsGroup><p className="settings-helper">HWiNFO 由 ObsUI 启动器和页面会话共同管理，不会作为普通启动项重复运行。</p></section>;
    if (section === "plugins") return <section className="settings-content-section">
      <PageHeading title="插件" detail="为工作台添加可选扩展，并在这里管理插件的来源、权限与启用状态。" />
      <div className="settings-plugin-card">
        <div className="settings-plugin-card-icon"><IoExtensionPuzzleOutline aria-hidden="true" /></div>
        <div><span className="settings-plugin-card-kicker">EXTENSION HUB</span><h3>插件中心已预留</h3><p>后续可在这里添加文献、模型、自动化及其他本机插件。</p></div>
        <span className="settings-plugin-card-status">即将开放</span>
      </div>
      <SettingsGroup title="内置能力">
        <SettingRow title="系统截图" detail="全屏、窗口和框选截图；桌面像素只在本机辅助进程内处理。"><Toggle checked={settings.screenshot.enabled} label="启用系统截图" onChange={(checked) => updateSettings({ ...settings, screenshot: { ...settings.screenshot, enabled: checked } }, checked ? "系统截图已启用。" : "系统截图已停用。")} /></SettingRow>
        <SettingRow title="选区翻译" detail="在内置 PDF 阅读器中按需翻译选中文本；结果只保留在当前阅读会话。"><Toggle checked={settings.translation.enabled} label="启用选区翻译" onChange={(checked) => updateSettings({ ...settings, translation: { enabled: checked } }, checked ? "选区翻译已启用。" : "选区翻译已停用。")} /></SettingRow>
        <p className="settings-helper">这些能力目前以内置模块交付，关闭后不会发起对应请求；后续可在相同位置管理经过权限和许可证审核的第三方插件。</p>
      </SettingsGroup>
      <SettingsGroup title="规划中的能力">
        <SettingRow title="插件来源与权限" detail="添加前展示来源、权限和数据范围，便于逐项确认。" />
        <SettingRow title="插件启用状态" detail="后续可分别启用、停用和查看已安装插件。" />
        <SettingRow title="插件更新与移除" detail="后续集中处理更新、依赖和安全移除。" />
      </SettingsGroup>
      <SettingsGroup title="添加插件">
        <p className="settings-description">插件协议和安装入口尚未接入。当前不会自动下载、加载或连接任何插件。</p>
        <button className="settings-secondary" type="button" disabled title="插件管理尚未接入">添加插件（即将开放）</button>
      </SettingsGroup>
    </section>;
    if (section === "hdd") return <HddSettingsPanel settings={settings} instructionDraft={instructionDraft} setInstructionDraft={setInstructionDraft} onUpdate={updateHddSettings} onSaveInstructions={() => updateSettings({ ...settings, hdd: { ...settings.hdd, customInstructions: instructionDraft } }, "H.D.D 自定义指令已保存。")} providersLoading={hddProvidersLoading} selectedProvider={selectedProvider} providerStatus={providerStatus} modelOptions={modelOptions} selectedCliProfile={selectedCliProfile} onSelectProvider={selectHddProvider} onAddCli={addHddCli} onUseDetectedCli={useDetectedHddCli} onUpdateCliProfile={updateSelectedCliProfile} />;
    if (section === "profile") return <section className="settings-content-section"><PageHeading title="个人信息" detail="建立你的本机工作台资料；不会自动加入 H.D.D 对话。" /><div className="settings-profile"><button className="settings-avatar" type="button" onClick={() => avatarInput.current?.click()} aria-label="选择头像">{profileDraft.avatarDataUrl ? <img src={profileDraft.avatarDataUrl} alt="当前头像" /> : <IoPersonOutline />}</button><div><b>头像</b><span>点击选择本机图片</span></div><input ref={avatarInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={selectAvatar} /></div><div className="settings-form-grid"><label><span>昵称</span><input value={profileDraft.nickname} maxLength={80} onChange={(event) => setProfileDraft({ ...profileDraft, nickname: event.target.value })} placeholder="你的称呼" /></label><label><span>生日</span><input type="date" value={profileDraft.birthday} onChange={(event) => setProfileDraft({ ...profileDraft, birthday: event.target.value })} /></label><label className="settings-form-wide"><span>所在学校</span><input value={profileDraft.school} maxLength={160} onChange={(event) => setProfileDraft({ ...profileDraft, school: event.target.value })} placeholder="学校名称" /></label><label className="settings-form-wide"><span>专业／研究方向（可选）</span><input value={profileDraft.researchField} maxLength={160} onChange={(event) => setProfileDraft({ ...profileDraft, researchField: event.target.value })} placeholder="例如：材料科学与工程" /></label></div><button className="settings-primary settings-save-profile" type="button" disabled={JSON.stringify(profileDraft) === JSON.stringify(settings.profile)} onClick={() => updateSettings({ ...settings, profile: profileDraft }, "个人信息已保存。") }><IoSaveOutline />保存个人信息</button></section>;
    if (section === "pet") return <section className="settings-content-section"><PageHeading title="宠物" detail="为未来的桌面宠物功能保留独立入口。" /><div className="settings-pet-card"><IoPawOutline /><div><h3>桌面宠物</h3><p>宠物角色与桌面互动尚未接入。功能完成前不会显示一个无效的开启状态。</p><span>即将开放</span></div><Toggle checked={false} disabled label="启用桌面宠物" onChange={() => undefined} /></div></section>;
    if (section === "data") return <section className="settings-content-section"><PageHeading title="本地数据" detail="管理 ObsUI 项目、任务和资料的本机备份。" /><SettingsGroup title="数据备份"><p className="settings-description">导出的 JSON 只包含 ObsUI 项目数据，不包含壁纸、头像、凭据或 H.D.D 对话内容。</p><div className="settings-button-row"><button className="settings-primary" type="button" onClick={onExport}>导出 JSON 备份</button><button className="settings-secondary" type="button" onClick={onImport}>导入 JSON 备份</button><button className="settings-danger" type="button" onClick={onReset}>恢复示例数据</button></div><p className="settings-helper">最近保存：{new Date(updatedAt).toLocaleString("zh-CN")}</p></SettingsGroup></section>;
    const latest = OBSUI_BUILD_HISTORY[0];
    return <section className="settings-content-section"><PageHeading title="关于与版本" detail="查看 ObsUI 的当前版本与本地更新记录。" /><div className="settings-version-card"><div><span>当前版本</span><b>ObsUI</b><strong>{OBSUI_VERSION}</strong><small>本地开发版本</small></div><button className="settings-secondary" type="button" disabled title="尚未配置更新源">检查更新</button></div><SettingsGroup title="构建信息"><SettingRow title="最近提交" detail={latest?.commit ?? "暂不可用"} /><SettingRow title="提交日期" detail={latest?.date ?? "暂不可用"} /></SettingsGroup><SettingsGroup title="版本记录"><div className="settings-version-list">{OBSUI_BUILD_HISTORY.length ? OBSUI_BUILD_HISTORY.map((entry) => <div key={entry.commit}><time>{entry.date}</time><span>{entry.summary}</span><code>{entry.commit}</code></div>) : <p className="settings-helper">当前构建未包含 Git 版本记录。</p>}</div></SettingsGroup></section>;
  };

  return <div className="settings-center-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="settings-center" role="dialog" aria-modal="true" aria-label="工作台设置">
      <header className="settings-center-header"><div><h1>工作台设置</h1><p>管理本地数据、模型、插件与功能选项</p></div><button ref={closeRef} autoFocus type="button" className="settings-close" onClick={onClose} aria-label="关闭工作台设置"><IoCloseOutline /></button></header>
      <div className="settings-center-body"><nav className="settings-center-nav" aria-label="设置分类">{sections.map(({ id, label, Icon }) => <button key={id} type="button" className={section === id ? "is-active" : ""} onClick={() => { setSection(id); setMessage(""); }}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav><main className="settings-center-content">{renderContent()}</main></div>
      {message && <button type="button" className="settings-toast" role="status" onClick={() => setMessage("")}>{message}<IoCloseOutline aria-hidden="true" /></button>}
    </section>
  </div>;
}

function PageHeading({ title, detail }: { title: string; detail: string }) { return <header className="settings-page-heading"><h2>{title}</h2><p>{detail}</p></header>; }
function SettingsGroup({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) { return <section className="settings-group"><header><h3>{title}</h3>{action}</header>{children}</section>; }
function SettingRow({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) { return <div className="settings-row"><div><b>{title}</b><span>{detail}</span></div>{children}</div>; }

function HddSettingsPanel({
  settings,
  instructionDraft,
  setInstructionDraft,
  onUpdate,
  onSaveInstructions,
  providersLoading,
  selectedProvider,
  providerStatus,
  modelOptions,
  selectedCliProfile,
  onSelectProvider,
  onAddCli,
  onUseDetectedCli,
  onUpdateCliProfile,
}: {
  settings: WorkbenchSettings;
  instructionDraft: string;
  setInstructionDraft: (value: string) => void;
  onUpdate: (patch: Partial<WorkbenchSettings["hdd"]>, success?: string) => void;
  onSaveInstructions: () => void;
  providersLoading: boolean;
  selectedProvider: typeof HDD_PROVIDERS[number];
  providerStatus?: HddProviderStatus;
  modelOptions: HddModelOption[];
  selectedCliProfile: HddCliProfile | null;
  onSelectProvider: (provider: HddProviderId) => void;
  onAddCli: () => void;
  onUseDetectedCli: (candidate: NonNullable<HddProviderStatus["cliCandidates"]>[number]) => void;
  onUpdateCliProfile: (patch: Partial<HddCliProfile>) => void;
}) {
  const reasoningOptions = hddReasoningEfforts(settings.hdd.provider, settings.hdd.model, settings.hdd.provider === "codex" ? providerStatus?.models : undefined);
  const selectModel = (model: HddModelId) => onUpdate({ model, reasoningEffort: normalizeHddReasoningEffort(settings.hdd.provider, model, settings.hdd.reasoningEffort, settings.hdd.provider === "codex" ? providerStatus?.models : undefined) });
  const statusDetail = providersLoading
    ? "正在检测本机提供方…"
    : providerStatus?.available
      ? providerStatus.version ? `已连接 · ${providerStatus.version}` : "已连接"
      : selectedProvider.id === "cli" && selectedCliProfile ? "已保存配置，发送前会再次检查路径" : "当前不可用；不会伪造回答";
  return <section className="settings-content-section">
    <PageHeading title="H.D.D 模型" detail="选择 H.D.D 的回答引擎、模型和默认行为。" />
    <SettingsGroup title="回答引擎">
      <div className="settings-two-columns">
        <label><span>提供方</span><select value={settings.hdd.provider} onChange={(event) => onSelectProvider(event.target.value as HddProviderId)}>{HDD_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
        <label><span>模型</span><select value={settings.hdd.model} onChange={(event) => selectModel(event.target.value as HddModelId)} disabled={!modelOptions.length || selectedProvider.id === "cli" || (selectedProvider.id === "codex" && !providerStatus?.models.length)}>{!modelOptions.some((item) => item.id === settings.hdd.model) && <option value={settings.hdd.model}>{settings.hdd.model}（当前不可用）</option>}{modelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
        {reasoningOptions.length > 0 && <label><span>推理强度</span><select value={normalizeHddReasoningEffort(settings.hdd.provider, settings.hdd.model, settings.hdd.reasoningEffort, settings.hdd.provider === "codex" ? providerStatus?.models : undefined)} onChange={(event) => onUpdate({ reasoningEffort: event.target.value as HddReasoningEffort })}>{reasoningOptions.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label>}
      </div>
      <p className="settings-helper">{selectedProvider.detail} · {statusDetail}</p>
      {selectedProvider.id === "codex" && !providersLoading && !providerStatus?.models.length && <p className="settings-helper">Codex 模型列表暂不可用；重新打开设置后会重试，不会显示未经验证的型号。</p>}
      {selectedProvider.id === "ollama" && !modelOptions.length && <p className="settings-helper">Ollama 在线后会读取已安装模型；当前保留默认模型名 {DEFAULT_OLLAMA_MODEL}。</p>}
      {selectedProvider.id === "cli" && <div className="settings-cli-config">
        <div className="settings-cli-heading"><div><b>外部 CLI</b><span>{selectedCliProfile ? selectedCliProfile.executablePath : "尚未添加命令行工具"}</span></div><button className="settings-secondary" type="button" onClick={onAddCli} disabled={providersLoading}>添加 CLI</button></div>
        {providerStatus?.cliCandidates?.length ? <div className="settings-cli-candidates" aria-label="已检测到的 CLI">{providerStatus.cliCandidates.map((candidate) => <button key={candidate.path} type="button" className="settings-secondary" onClick={() => onUseDetectedCli(candidate)}>使用 {candidate.label}</button>)}</div> : null}
        {selectedCliProfile ? <div className="settings-cli-fields"><label><span>模型标识（可选）</span><input value={selectedCliProfile.model} maxLength={128} onChange={(event) => onUpdateCliProfile({ model: event.target.value })} placeholder="例如：ollama/qwen3.5:9b-64k" /></label><label><span>参数模板（可选）</span><input value={selectedCliProfile.argsTemplate} maxLength={512} onChange={(event) => onUpdateCliProfile({ argsTemplate: event.target.value })} placeholder="例如：run --format json --model {model}" /></label><p className="settings-helper">问题会作为安全的 stdin 或参数传给 CLI；{`{model}`} 会替换为模型标识。外部 CLI 的权限不由 ObsUI 完全约束，请只选择你信任的工具。</p></div> : <p className="settings-helper">可添加 OpenCode、Claude Code 或其他本机 CLI；添加后默认不会自动执行。</p>}
      </div>}
    </SettingsGroup>
    <SettingsGroup title="H.D.D 自定义指令" action={<button className="settings-primary" type="button" disabled={instructionDraft === settings.hdd.customInstructions} onClick={onSaveInstructions}><IoSaveOutline />保存</button>}>
      <p className="settings-description">为所有 H.D.D 新请求提供额外说明和上下文。</p>
      <textarea className="settings-instructions" value={instructionDraft} maxLength={12_000} onChange={(event) => setInstructionDraft(event.target.value)} placeholder="添加自定义指令…" />
      <p className="settings-helper">配置保存在本机；发起 H.D.D 对话时会随请求提交给所选提供方。安全与只读规则始终优先。</p>
    </SettingsGroup>
  </section>;
}

## 2026-08-23 — 顶部 Tab 栅格样式复刻

**Comparison target**

- 用户指定的五状态参考：`C:\Users\86159\Desktop\112.png`（727 × 2164 px）。本次以“本机”选中行的完整 Tab 区 `(165, 417)–(701, 478)` 作为同状态视觉真值；归一化为 `750 × 76 px`。
- 浏览器渲染：`F:\ResearchKB\.harness\qa\obsui\tab-style-replica-live-local-full.png`（1280 × 720 px）与聚焦图 `F:\ResearchKB\.harness\qa\obsui\tab-style-replica-live-local.png`（750 × 76 px）。二者的同画布对照为 `F:\ResearchKB\.harness\qa\obsui\tab-style-reference-vs-live-local.png`。
- 验收环境：应用内浏览器，CSS 视口 `1280 × 720`，`devicePixelRatio = 1.25`；状态为“本机”唯一选中。源图和实现均按相同聚焦区域检查，不比较浏览器外框。

**Findings**

- [P1 fixed] Tab 容器此前把 `200 × 100` 的独立栅格压为横向过宽的比例，导致页签像悬浮按钮。容器现回到参考面板的原生网格 `552,30–1533,130 / 1672 × 941`，五槽位保持等宽等高、相邻基线一致，并和顶部框架贴合。
- [P1 fixed] 未选中态此前为通用灰色渐变，缺少参考图的金属纹理、顶边高光、内凹边缘与细暗收口。现从原始 idle 栅格素材归一化复用，并剔除每张裁图左侧属于前一页签的邻接像素；没有重新引入独立左竖线、长方形底板或额外承托层。
- [P1 fixed] 本机黄色选中 PNG、黑色字形、按钮顺序、命中区和应用状态切换代码未改；只替换未选中栅格并校正 Tab 组级比例/锚点。
- 无待处理 P0、P1 或 P2。参考图的黄色状态与当前实现存在轻微纹理差异，属于用户明确要求保留当前黄色选中效果的预期差异，不作为缺陷处理。

**Fidelity surfaces**

- 字体与文字：未选中白字沿用源栅格的描边和视觉中心；现有黄色选中黑字未改。
- 间距与布局：五个按钮均为 `150.1125 × 76.525 CSS px`，五种选中状态的坐标/尺寸最大差为 `0`；无切换位移、缩放或跳动。
- 颜色与表面：灰色未选中页签恢复金属灰渐变、顶边高光、窄深色外描边和薄暗收口；黄色激活面未修改。
- 图像质量与嵌入：使用项目内参考栅格，不使用 CSS/矢量重绘；清理后的面板 Tab 区每行最多 `0` 个可见底图像素，未出现整块黑色底板、白边或灰边残留。
- 内容与交互：依次点击“目标 / 本机 / 仓库 / 文献 / H.D.D”，每次恰有一个 `aria-pressed="true"`；控制台无 error/warn。

**Verification**

- [x] `rebuild_independent_tabs.py`：仅重建五张 inactive 栅格，保留全部 active 栅格。
- [x] `rebuild_panel_clean_for_tabs.py`、`inspect_tab_geometry.py`、`inspect_panel_top.py`：五个组件尺寸和 alpha 轮廓统一；无矩形底板。
- [x] 应用内浏览器五状态视觉与交互核验；同状态参考/实现合成对照已保存。
- [x] `pnpm run build`。
- [x] `pnpm test`：5 个测试文件，14/14 通过。
- [x] `git diff --check`：通过（仅输出既有工作区的 CRLF 警告）。

final result: passed

---

## 2026-09-22 — 月历月份入口与绝区零状态刻度

**Comparison target**

- 用户指定入口：`C:\Users\h\AppData\Local\Temp\codex-clipboard-dcdf71c3-05b0-476a-8ba0-ad8bda7d5d5c.png`（328 × 82 px），顶部 `2026 / 09` 月份控件应打开日期选择器。
- 用户指定详情基线：`C:\Users\h\AppData\Local\Temp\codex-clipboard-237a65d2-76ed-445a-a351-8d6e043e11e2.png`（386 × 114 px）。用户明确要求日期下方状态轨不要复刻该三色彩条。
- 实现：`http://127.0.0.1:5173/?ui=tab-v2` 的“目标 → 日历 / 月历”。应用内浏览器于 CSS `778 × 986` 窄屏和默认桌面尺寸现场检查；浏览器连接器只提供内存截图，未伪造本地截图路径。

**Findings**

- [P1 fixed] 日期选择器此前挂在右侧详情日期上，入口与用户指定的顶部月份控件不一致。现点击顶部 `2026 / 09` 打开/关闭选择器，前后箭头、月份切换和日期选择保持可用；右侧 `2026.09.22` 改回不可点击的详情读数。
- [P1 fixed] 详情日期下方原为黄色、青色、紫色三段彩条，过于接近参考。现改为绝区零式的单一黄色活动刻度、银灰机械分段与深色金属轨；保留状态层级，不复制原配色和比例。
- 无待处理 P0、P1 或 P2。选择器在窄屏中从月份控件向左展开，未越出工作台，月历 6 周网格与详情区仍完整可见。

**Fidelity surfaces**

- 字体与文案：顶部日期维持加粗等宽感数字与 `2026 / 09` 分隔形式；右侧日期保持高对比只读层级。
- 布局与节奏：选择器锚定月份导航下方、右对齐；窄屏宽度受可视窗口约束，不遮挡顶部导航。
- 颜色与材质：入口悬停继续使用既有暖黄色；状态轨只使用黄色、银灰、炭黑，与工作台金属边框一致。
- 图像质量：本轮不新增或替换图像资产；箭头延用项目的 `react-icons` 图标路径。
- 内容：月份导航、日期选择、任务日期详情及新增日程入口均保留原有文案与行为。

**Runtime checks**

- 应用内浏览器实测：顶部月份控件可打开选择器；选择器可切换到 2026 年 10 月并选择日期，月历与右侧详情同步更新；随后恢复到 2026 年 9 月 22 日。
- 窄屏实测：选择器在顶部导航下方展开，右侧日期不可点击，完整月历和详情区无重叠。
- 控制台 error/warn：`[]`。
- `pnpm test`：30 个测试文件、180/180 通过；`pnpm run build`：通过。

**Implementation Checklist**

- [x] 将日期选择器入口移至顶部月份控件。
- [x] 右侧日期恢复为详情文字，不再承载选择器交互。
- [x] 使用黄色活动刻度与中性金属轨替换三色彩条。
- [x] 完成桌面、窄屏、月份切换、日期选择与控制台复核。

final result: passed

---

## 2026-09-20 — 功能区参考绝区零 UI 质感与语义配色

**Comparison target**

- 本地录屏：`C:\Users\h\Desktop\素材\ZZZ素材\ZZZ素材\zzz原始录屏\QQ20260824-215851-HD.mp4`。
- 代表帧：`00:00:05.068`、`00:00:08.109`、`00:00:15.204`、`00:00:24.326`、`00:00:35.476`；重点观察深炭灰模块、粗黑描边、内嵌暗槽、顶部微高光和黄色/蓝色/橙色/绿色/紫色的状态用途。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`，应用内浏览器；参考帧与本机模块截图在同一次视觉比较中检查。

**Findings**

- [P1 fixed] 原功能区大面积使用相近蓝灰，卡片与外壳层级偏平；现改为深炭灰底、较亮金属面、近黑内槽、双层内边和轻微顶部高光，增强材质深度。
- [P1 fixed] 首轮曾给五个功能区机械分配不同主题色；按用户反馈撤销。颜色现在只表达语义：黄色为主选中/主操作，蓝色为局部选择与信息态，橙色为类别/提醒，绿色为完成，紫色只用于特殊内容。
- [P2 fixed] 目标任务卡与功能卡片原先把语义色放在侧边或顶部边缘，视觉上形成突兀色带；现将结构性边缘统一为中性金属灰，语义色只保留在控件、文字、图标和进度元素内。
- [P1 fixed] 本机页原先用“本机状态”标题、左右翻页按钮和横向卡片轨道包住状态区；现按示意图改为上方额度板块与下方独立卡片组，卡片组保留自身外框和内部间距，不再重复显示标题与翻页按钮；其他摘要卡片轨道同步采用该分区方式。
- [P1 fixed] 设备档案原先在窄卡片内使用两列字段，长文本被迫截断；现改为单列上下排列，并压缩行高保证七项设备信息在卡片内完整可见。
- [P2 fixed] 本地模型表格原先呈现为卡片内的多枚圆角行块；现改为一个连续表格面，行之间只保留细分隔线，减少嵌套层级。
- [P2 fixed] H.D.D 空输入时的发送按钮原本仍显示高饱和橙色；现禁用态为中性灰，只有可执行主操作才使用黄色。
- 未发现待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 材质：外壳、顶栏、内容槽和卡片采用分层炭灰、硬边线、内嵌阴影及克制高光；不使用角色、游戏图标、Logo 或装饰贴图。
- 颜色：保留参考中的少量强色和大面积中性面；内容卡片沿用已有 `blue / gold / green / violet` 语义，但结构性边缘统一为中性灰，不新增页面主题色。
- 分区：按示意图使用“外层功能区 → 独立板块 → 板块内卡片”的三级关系；上方额度与下方状态卡组分开，状态卡组内部保持卡片间距。
- 排版与布局：沿用现有 Segoe UI 字体栈、五项顶部导航、各页面分栏、卡片轨道及所有交互；本轮只调整摘要板块容器、设备字段排列和轨道控件显隐，不改变数据与功能路径。
- 图标与资产：继续使用现有图标和项目资产，没有复制录屏中的任何素材。

**Runtime checks**

- 应用内浏览器逐一切换目标、本机、仓库、文献和 H.D.D；五个标签最终选中态均为黄色；各页面不再渲染摘要卡片轨道标题和左右翻页控件。
- 1600 × 1000 桌面视口实测：外壳 `1278px`、内容区 `1245px`，两者 `scrollWidth - clientWidth = 0`。
- 本机页现场确认：额度板块与下方卡片组有独立边界；设备档案字段为单列，最后一项未超出卡片底部；本地模型为连续表格面；结构性边缘保持中性灰，橙色/绿色只在类别、完成状态等内容元素中出现；H.D.D 空输入按钮为中性灰。
- 浏览器控制台 error/warn 为 `[]`。
- `pnpm test`：28 个测试文件、170/170 通过（最终完整验证见本轮结束检查）。
- `pnpm run build` 与 `git diff --check`：最终结果见本轮结束检查。

**Implementation Checklist**

- [x] 从本地录屏提取代表帧、设计 token 和可审查视觉观察。
- [x] 保留现有数据、功能和主导航，仅调整共享视觉主题与摘要分区布局。
- [x] 撤销无语义的页面分色，保留基于状态的颜色规则。
- [x] 移除卡片侧边和顶部的装饰性色带，保留中性材质边缘。
- [x] 按示意图拆分摘要板块，移除重复轨道标题和左右翻页按钮。
- [x] 设备档案改为单列并完成内容底部可见性复核。
- [x] 完成五区浏览器切换、桌面尺寸、禁用态、控制台和视觉对照。

final result: passed

## 2026-09-15 — 工作台设置、英文推理强度与伴随启动复核

**Comparison target**

- H.D.D 设置视觉真值：`C:\Users\h\.codex\generated_images\01a09f70-32c6-7520-a215-322c25a23242\exec-70ef2edc-62e2-4e2d-afb2-fda72bc9444c.png`（`1672 × 941 px`）。
- 关于与版本视觉真值：`C:\Users\h\.codex\generated_images\01a09f70-32c6-7520-a215-322c25a23242\exec-73c3d12d-fba4-4ec3-a5bf-406a4d1a34ac.png`（`1672 × 941 px`）。
- 浏览器实现：`http://127.0.0.1:4173/?ui=tab-v2`，Codex 应用内浏览器现场捕捉，CSS 视口约 `930 × 986 px`。浏览器连接器以内存形式返回实现截图，未伪造宿主文件路径。
- 状态：右上角“工作台设置”打开；分别检查“个性化”“启动与应用”“H.D.D 模型”“个人信息”“宠物”“本地数据”和“关于与版本”。

**Findings**

- [P2 fixed] 首轮窄视口捕捉中，全局 `nav button span` 规则把设置分类文字限制为 `18px`，导致中文逐字纵排。现增加设置中心作用域覆盖，并在 `1100px` 以下把导航列收敛为 `190px`；复测七个分类均保持横排、无截断。
- 设置总览已按用户确认移除；默认个性化页直接显示项目内佩洛伊斯壁纸。H.D.D 页提供 Codex CLI、本地 Ollama、其他 CLI 三类引擎、提供方对应模型、动态模型强度和自定义指令；Codex 与本地模型只显示自身支持的档位。没有“其他设置速览”或底部版本号，关于与版本页独立显示真实 `package.json` 版本和构建时 Git 记录。
- 无待处理 P0、P1 或 P2。当前应用内浏览器视口明显窄于 `1672px` 设计稿，内容区按响应式规则压缩；这是可用性适配，不是设计漂移。

**Fidelity surfaces**

- 字体与文字：沿用 Segoe UI / Microsoft YaHei；标题、分类、表单标签和辅助说明层级清晰。所有已确认字段、隐私说明及 H.D.D 安全边界均完整显示。
- 间距与布局：保持居中玻璃面板、左侧分类和右侧内容两栏结构；窄视口导航缩为 `190px`，表单与版本卡仍完整可见，设置面板内部滚动不会隐藏关闭按钮。
- 颜色与视觉 token：保留深蓝灰半透明面板、细边框、暖黄色选中态和主按钮；背景壁纸只作为弱化衬底。
- 图像质量与资产：背景继续使用项目现有壁纸；图标全部来自 `react-icons/io5`，未使用自绘 SVG、CSS 图形或占位图片。头像与壁纸仅在用户选择真实本机图片后显示。
- 文案与内容：H.D.D 自定义指令明确说明“本机保存、请求时提交、不能覆盖安全与只读规则”；个人资料明确不会自动加入 H.D.D；宠物未接入时禁用开关并显示“即将开放”；版本记录来自构建时 Git 输出，不写死虚假历史。

**Interaction and runtime evidence**

- 右上角入口可打开设置，左侧仅有七个有效分类且均可切换；关闭按钮可聚焦，弹窗暴露 `role="dialog"` / `aria-modal="true"`。2026-09-15 应用内浏览器实查个性化页显示“默认：佩洛伊斯”，不存在设置总览入口。
- H.D.D 自定义指令编辑后“保存”按钮启用；清空测试内容后恢复禁用，未将验收文字写入用户设置。现场切换到本地 Ollama 后模型列表按 `Qwen 3.5 9B · 64K（默认）`、`128K`、`200K（手动）` 显示，随后恢复原有 Codex 5.6 Luna / `high` 设置。
- `/api/hdd/providers` 实查 Codex CLI、Ollama、其他 CLI 均 available，Ollama 版本 `0.34.0`，外部 CLI 检测到 OpenCode；状态接口分别确认 Ollama 和外部 CLI 路径可用，未执行真实生成请求。
- 本机接口识别到 Zotero、FlClash 和 Ollama；无变更 PUT 复核返回成功，`customApplications` 可往返读写。“添加其他应用”已接入 Windows STA `.exe` 文件选择器，新增项默认关闭。当前 Zotero 伴随启动已开启，FlClash/Ollama 与 Windows 登录自启动保持关闭；HWiNFO 继续由页面生命周期单独管理。
- [P1 fixed] 修复桌面快捷方式复用已有 Vite 服务时不再触发 Zotero：伴随应用检查现在覆盖 Vite 创建、`start-obsui.ps1` 服务就绪和 `App` 页面挂载，并通过 `/api/workbench-startup/launch` 去重；实测同源 POST 返回 `alreadyRunning:["zotero"]`、`ready:["zotero"]`，重复请求未增加进程。
- [P1 fixed] 修复首次进入文献页短暂显示“未连接”或 `0 / 0` 空列表：Zotero 开启时启动接口最多等待本地 API 10 秒，启动遮罩继续等待文献运行状态和完整统一条目，二者一起注入文献页首帧；文献页已有完整启动快照时不再立即重复刷新，未连接时仍每 1 秒重试。组件回归测试确认后台请求未开始时首帧已显示“已连接，可写入”和全部预载条目；5173 实测接口返回 158 条。
- [P2 fixed] 启动脚本不再无条件预启动 Ollama；FlClash、Ollama 和自定义应用与 Zotero 一样只在对应开关开启时启动，HWiNFO 继续走独立的传感器生命周期。
- [P1 fixed] H.D.D 模型强度不再因非 Codex 提供方被禁用并显示永久等待光标：Qwen 3.5 显示 `off/low/medium/high` 并真实传入 Ollama `think`；Codex 按具体模型限制 `xhigh/max/ultra` 上限；OpenCode 对已识别模型传入 `--variant`。未知通用 CLI 不伪造无法发现的能力档位。
- 个人信息页包含头像、昵称、生日、所在学校和可选专业／研究方向；宠物页不伪装成已实现功能；关于与版本页显示 `0.1.0`、`3c37e6c` 和最近四条真实 Git 记录。
- 最终刷新后页面与设置交互正常；日志保留编辑过程中依赖文件先后热更新造成的两条历史 HMR 错误，完整刷新后未再新增，TypeScript 与生产构建均通过。

**Implementation checklist**

- [x] 全局设置中心、分类导航和响应式布局。
- [x] 壁纸、H.D.D 默认值／自定义指令、个人资料的本机持久化。
- [x] H.D.D 提供方发现、本地 Ollama 模型选择、OpenCode／通用 CLI 配置和安全参数校验。
- [x] Windows 自启动与 Zotero、FlClash、Ollama 伴随启动接口；HWiNFO 保持独立生命周期。
- [x] 宠物诚实预留态、本地数据入口、真实版本与 Git 更新记录。
- [ ] 本轮 Zotero 首帧修复的应用内浏览器验收：自动化工具持续返回 `nodeRepl.fetch request failed`；接口、组件回归测试、构建和差异检查已完成，仍需下一次可用时补一次冷启动可视化确认。

final result: passed

---

## 2026-09-14 — 电视机启动加载层与鲨牙布形象落地

**Comparison target**

- 视觉真值：电视、书架和状态区以 `C:\Users\h\.codex\generated_images\01a0987a-d6ed-7432-9104-a3898aaef70d\exec-067e8419-001e-4a78-a34c-c8951e196fa1.png`（`1672 × 941 px`）为准；鲨牙布的面部、鳍、脚、尾巴和连续身体结构以用户提供的 `codex-clipboard-231bd5de-ab5a-4685-956d-3f9358b964e2.png` 与 `codex-clipboard-9ef84c3e-943f-43bc-8a1d-6ec9d55b034b.png` 为更高优先级真值。
- 浏览器实现：`http://127.0.0.1:4173/?ui=tab-v2`，Codex 应用内浏览器现场捕捉，CSS 视口 `1280 × 720`、`devicePixelRatio = 1.25`。截图由浏览器连接器以内存形式返回，未伪造宿主文件路径。
- 归一化：源图与实现均为 `1672:941` 的 16:9 内容；浏览器以 `1280 × 720 CSS px` 等比显示，不比较浏览器外框。
- 状态：冷启动电视开机横线、加载画面与动态状态、遮罩退出后的首页，以及打开/关闭文献功能面板。

**Findings**

- 无待处理 P0、P1 或 P2。电视机、书架、书籍、VHS、四张状态卡和唯一一次 `ObsUI` 标记均保持所选视觉稿；鲨牙布为两片自然侧鳍、两只短脚和一条尾巴，没有手、额外肢体或持物动作。
- [P2 fixed] 初次浏览器检查发现 React 对 `fetchPriority` 属性产生 warning；已移除该非必要属性，复测 error/warning 为 `[]`。
- [P1 fixed] 首版角色的尾部拆层产生了拼装感，生成修订稿又一度出现脚部结构和身体细缝问题。最终改为一张完整角色图层：恰好两只独立短脚、两片侧鳍和一条尾巴，腹部与蓝色身体连续；不再拆尾、不再叠加可能错位的肢体，仅保留整体彩色像素一致的轻微起伏和眨眼帧。

**Fidelity surfaces**

- 字体与文字：主视觉文字保留在确认稿内；动态状态使用现有 Segoe UI / Microsoft YaHei 字体，单行不换行，未遮挡四张状态卡。
- 间距与布局：启动舞台按 `1672 / 941` 等比缩放；当前状态描边与卡片槽位对齐，动态文字覆盖原静态状态区，未引起页面横向溢出。
- 颜色与视觉 token：保留暗色 CRT、暖黄状态光和低饱和书房背景；新增交互反馈仅使用已有黄、黑、白三色。
- 图像质量与资产：无角色背景板为 `71.88 kB` WebP；完整角色与同尺寸眨眼帧分别为 `83.64 kB`、`85.04 kB` 的透明 WebP。棋盘格由确定性蒙版清除，角色边缘无白底或矩形底板；没有用 CSS 图形重画鲨牙布、电视、书架或书籍。
- 文案与内容：状态会在“本地资料 / 天气 / 系统监控 / 本机网络 / 工作台”之间随首次读取进度更新；没有重复添加 `ObsUI` 字样。

**Comparison history and runtime evidence**

- 冷启动捕捉显示先出现电视开机横线，再展开完整 CRT 画面；最新应用内浏览器画面中两只脚分离、身体无拼装细缝、尾巴完整，角色未遮挡右侧状态卡；关键数据完成后切回完整首页。
- 比较历史：旧拆层版因尾部接缝被判定为 P1；第一张修订素材因脚部和身体拼装线被拒绝；第二张修订素材修正形体后又输出实体棋盘格，已通过边缘连通蒙版转为真实透明通道。最终现场捕捉未再发现 P0/P1/P2 形体问题。
- 主界面在遮罩后立即挂载，各本机接口并发读取；全部首轮状态结束后立即退出，异常或长请求最迟 `4.8 s` 自动放行，避免卡死。
- 文献入口可打开三栏功能面板，关闭后焦点返回入口；启动遮罩不会在页内切换时重复出现。
- 最终浏览器控制台 error/warning 为 `[]`。

**Implementation checklist**

- [x] 使用确认视觉稿实现电视机启动加载层；鲨牙布采用完整单层身体，只做不会改变解剖结构的轻微起伏与眨眼。
- [x] 首轮本地资料、天气、系统、网络、出口地址、本地模型和 Codex 状态并发准备。
- [x] 最短展示、数据就绪提前退出、最长等待兜底及减少动态效果偏好均已处理。
- [x] 验证启动、自动退出、首页显示、文献面板打开/关闭和控制台日志。
- [x] `pnpm test`：21 个测试文件、124/124 通过；`pnpm run build` 通过。

final result: passed

---

## 2026-09-08 — 独立主板温度映射与温度轨复核

**Comparison target**

- 用户参考：`C:\Users\h\AppData\Local\Temp\codex-clipboard-3589dd64-458c-4300-a93e-7b4f4fbd065a.png`，`369 × 650 px`。关注独立的 CPU / 主板温度，以及温度文字、读数与轨道的可读间距。
- 实现：`http://127.0.0.1:5173/?ui=tab-v2` 的“本机”页。Chromium 渲染截图为本轮浏览器连接器内存捕捉，浏览器视口 `2048 × 960 CSS px`，无可持久化截图路径；对比聚焦左侧“系统状态”卡，不比较宿主工作台外框。
- 状态：LibreHardwareMonitor 已连接、传感器选择已恢复推荐项；浏览器实际读数为 CPU `73 °C`、显卡 `36 °C`、主板 `43 °C`、硬盘 `47 °C`、内存条 `37 °C`（实时值会变化）。

**Findings**

- [P1 fixed] 此前主板温度错误选用了 LPC 传感器的第一项 `/lpc/it8613e/0/temperature/0`，该项在本机接近 CPU 温度。现排除该项，并将 `/lpc/it8613e/0/temperature/1` 映射为“主板温度”；浏览器复核中 CPU `73 °C` 与主板 `43 °C` 已分离。
- [P2 fixed] 旧版本传感器选择会保留错误的传感器 ID。现清除 v3/v4 旧缓存并提升默认映射版本，刷新后恢复 CPU 频率、CPU 电压、CPU 占用、CPU 热功耗、GPU 频率、显存频率、GPU 热功耗和内存占用的中文推荐摘要。
- 无待处理 P0、P1 或 P2。参考图中读数位于轨道上方；实现将读数独立置于轨道左侧列，这是遵循用户“字体和温度轨不要重叠”的有意差异。

**Fidelity surfaces**

- 字体与文字：传感器名称、数值和单位均为中文且分列显示；没有文字压住轨道或温度条。
- 间距与布局：五条温度行保持固定、紧凑的行距；在当前卡片宽度下，名称、数值和轨道各自占据独立网格列。
- 颜色与视觉 token：保持深色面板、蓝色关键频率和按温度状态显示的绿/暖色温度轨，不影响现有工作台主题。
- 图像与图标：复用既有图标资源；本次没有新增或替换图片资产。
- 文案与内容：主板、显卡、硬盘、内存条均使用可识别的中文名称，实时值来自本机监测服务而不是占位值。

**Evidence and verification**

- 全视图和温度区均在同一轮浏览器视觉输入中，按上述源图对照；左侧系统状态卡完整可见，温度行无裁切或交叠。
- DOM 与实时接口同时核验：独立主板读数来自 `hardware-monitor:web:/lpc/it8613e/0/temperature/1:node:16`，接口已报告 LibreHardwareMonitor 连接成功。
- 已刷新页面并切换至“本机”，核验旧选择被替换为推荐摘要且五条真实温度均正常显示。

**Implementation checklist**

- [x] 映射独立的主板温度传感器。
- [x] 清理旧传感器选择并恢复中文默认项。
- [x] 完成实时页面、接口、测试、构建与差异检查。

final result: passed

---

## 2026-09-08 — 可配置实时传感器系统状态卡

**Comparison target**

- 源图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-cd17ce5a-6174-440c-a2c3-96dd4290f2a3.png`，`360 × 637` px。目标状态为暗色系统状态卡、双列关键读数、顶部“选择传感器 / 传感器详情”入口及温度轨。
- 实现：`http://127.0.0.1:5174/?ui=tab-v2` 的“本机”页，Codex in-app Browser 实时捕捉，CSS 视口 `360 × 637`。截图由浏览器连接器以内存形式返回，未写入额外本地文件；浏览器未报告 device pixel ratio，因此未做密度缩放。
- 同尺寸源图与实现捕捉已作为同一轮视觉上下文进行对照；实现使用实机 NVIDIA 与 Windows 读数，缺失的硬件温度不以占位数值伪造。

**Findings**

- 无待处理 P0、P1 或 P2。原先详情弹窗的 Escape 会冒泡到外层工作台（P1）；现改在传感器弹窗捕获阶段消费事件，实机复测只关闭详情并把焦点返回“传感器详情”按钮。
- 与源图的可接受差异：源图为独立、满高的 360 px 卡；实现按本轮约束保留既有四卡横向布局，因此在桌面视口嵌入“本机”工作台，在 `360 × 637` 视口第一卡自适应为满宽。源图中的多条温度轨在本机没有相应真实数据时不显示，符合“不展示假温度”的约束。

**Fidelity surfaces**

- 字体与文字：读数采用等宽、较高对比度的数字；标签保持低对比蓝灰层级，顶部操作与“3 秒刷新”清晰可辨；窄视口未发生关键标签截断。
- 间距与布局：摘要采用双列，最多 8 项；`360 × 637` 下卡片满宽、温度轨位于摘要下方，外层水平滚动仅服务于四卡容器，未遮挡系统卡操作控件。
- 颜色与视觉 token：沿用既有深色蓝灰面板、蓝色 CPU/频率、绿色温度轨和明亮实时读数，未引入与源图冲突的新主题色。
- 图像与图标：复用项目中的 `react-icons` 设置与脉冲图标；没有以自绘图形、占位图或伪造资产替换可见图标。
- 文案与内容：选择器按 CPU、GPU、内存、存储等已发现类别分组，显示来源和单位；详情显示 NVIDIA 连接状态；已选传感器临时缺失时明确显示“暂不可用”，恢复后自动回显真实数值。

**Runtime and interaction evidence**

- 实机 `GET /api/system-metrics`：NVIDIA 已连接，返回核心频率、显存频率、功耗、温度、占用及 Windows CPU/内存/磁盘回退读数；Libre/Open Hardware Monitor 未运行时状态明确为未检测到。
- 浏览器实际检查：打开“本机”→系统状态卡每 3 秒更新；选择器显示 `8 / 8` 摘要与 `1 / 5` 温度上限；取消 GPU 功耗后变为 `7 / 8`，恢复推荐后复原；详情列出 NVIDIA SMI 来源；Escape 关闭详情并将焦点还给触发按钮。控制台 error/warning 为 `[]`。
- `pnpm test`：15 个测试文件、55/55 通过。`pnpm run build`：TypeScript 检查与 Vite production build 通过。`git diff --check`：通过（工作区已有 LF/CRLF 提示，不含 whitespace error）。

**Implementation checklist**

- [x] 系统状态卡保留为四卡布局首卡，3 秒刷新真实传感器数据。
- [x] 选择器、来源详情、8 项摘要 / 5 条温度上限、暂不可用与恢复状态可用。
- [x] Libre/Open Hardware Monitor、NVIDIA SMI 与 Windows 回退遵循真实数据优先级。
- [x] 完成同尺寸视觉检查、交互检查、控制台检查、测试、构建和 diff 检查。

final result: passed

---

## 2026-09-08 — 系统状态卡温度轨紧凑布局跟进

**Comparison target**

- 最新布局源图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-15521d21-cdec-4272-9bdc-20a2d671801f.png`，`350 × 647 px`。重点是“硬件名称在温度轨左侧、读数位于轨道上方”的紧凑温度区。
- 问题状态源图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-082d5d8a-18de-4dd3-aaa7-732299898275.png`，`478 × 417 px`。其暴露了温度行被剩余高度拉开的问题。
- 实现：`http://127.0.0.1:5174/?ui=tab-v2` 的“本机”页，由 Codex in-app Browser 渲染；CSS 视口 `928 × 986`、`devicePixelRatio = 1.25`，聚焦系统卡 `310 × 516 CSS px`。浏览器截图由连接器以内存形式返回，未另写本地文件；因此以温度区内容而非宿主工作台外框作聚焦对照，并明确源图为独立满高卡、实现为四卡横向布局的首卡。
- 状态：等待首次三秒采样完成；GPU 温度为真实 NVIDIA 读数，其余本机未检测到的温度均明确显示“暂不可用”。

**Findings**

- [P2 fixed] 温度轨此前使用 `minmax(38px, 1fr)`，空余高度会平均分配给五行，造成用户问题图中明显过大的上下间距。现改为固定 `38px` 行高与 `align-content: start`，使五条温度轨保持与参考相近的连续节奏。
- [P2 fixed] 温度名称原先位于轨道上方。现将名称置于左侧固定列，右侧以“读数上、轨道下”排列，减少纵向占用并保留数值可读性。
- [P2 fixed] 外层“本机”页现为不可纵向滚动；窄高视口时仅温度列表 `overflow-y: auto`，不会带动整页或隐藏持久控件。
- 无待处理 P0、P1 或 P2。源图中的“实时 / 曲线”切换没有被仿造：本卡当前只实现已要求的真实三秒实时读数，避免出现无功能的视觉控件。

**Fidelity surfaces**

- 字体与文字：温度名称为 `13px`、读数为等宽 `14px`，读数位于轨道正上方；不可用状态改为较弱的 `11px`，但文字仍可辨识。
- 间距与布局：温度区固定为五行 `38px`、行间 `4px`；名称列 `76px`，名称与轨道间距 `8px`。默认视口五行完整可见，无内层滚动条；短视口在卡片内部滚动。
- 颜色与视觉 token：沿用深蓝灰卡面、绿色正常温度和低对比不可用轨道；不改变既有系统卡的蓝色操作入口和暗色主题。
- 图像与图标：源图没有需要复刻的照片、Logo 或装饰性位图；实现继续使用项目现有 `react-icons` 图标，无自绘或占位图替代。
- 文案与内容：保留“选择传感器”“传感器详情”“3 秒刷新”及真实测得的名称、单位；缺失温度不显示虚构数值。

**Comparison history and runtime evidence**

- 第一轮（问题源图）发现温度行因 `1fr` 拉伸形成约 `78px` 的视觉间隔，记录为 P2。修正为固定行高后，在最终浏览器捕捉中五行均为 `38px`，名称在左、读数与轨道在右，未再出现大面积行间空白。
- 最终 DOM 几何：外层内容区 `overflow-y: hidden`、`scrollHeight === clientHeight`；默认视口温度列表共 `5` 行且不需要滚动。以 `928 × 650` 短视口复测时，外层仍不可滚动、温度列表会在卡内滚动。
- 已检查“选择传感器”可见主板、存储、内存等暂不可用温度选项；真实 NVIDIA 温度在三秒采样后恢复显示。

**Implementation checklist**

- [x] 温度名称移至每条温度轨左侧。
- [x] 温度行固定紧凑间距，不再填满剩余高度。
- [x] 本机页固定，卡内温度区仅在短视口中滚动。
- [x] 已完成浏览器视觉复核和温度行几何检查。

final result: passed

## 2026-08-23 — 面板外视觉作用域修正

**Comparison target**

- 修改前首页视觉快照：`F:\ResearchKB\apps\ObsUI\assets\reference-ui.png` 及项目内既有壁纸、品牌、导航切片。
- 修正后首页：`F:\ResearchKB\.harness\qa\obsui\scope-fix-overview.png`。
- 面板保留性并排核对：`F:\ResearchKB\.harness\qa\obsui\scope-fix-panel-comparison.png`（左为修正前面板最终稿，右为恢复首页后的同一面板状态）。

**Findings**

- [P1 fixed] 上一轮误将视觉重构规则放入全局 `styles.css` 基础层，导致首页、左侧导航和右侧信息栏被一起改造。现已恢复这些区域的修改前样式。
- [P1 fixed] 新 design tokens 已移入 `.device-workspace`，新增视觉规则仅作用于设备面板与其内容组件；首页 Codex 卡恢复原始标记和样式链。
- 面板并排核对中，外壳、PDU、读取条、卡带、五个 Tab 的位置与尺寸一致；五个 Tab 均为 `150.1125 × 76.525 CSS px`，仅“本机”处于 `aria-pressed=true`。
- 无待处理 P0、P1 或 P2。

**Verification**

- 浏览器实际渲染：首页恢复为原有左侧品牌/导航和右侧状态卡布局；打开“状态监控”后面板内部重构仍生效。
- `pnpm run build` 通过；`pnpm test` 通过（5 个测试文件，14/14）；`git diff --check` 通过。

final result: passed

---

## 2026-08-23 — Tab 比例与主框架融合（当前结果）

**Comparison target**

- 目标参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-9f9cf09a-4480-4a8f-8a21-54c9663ab206.png`（688 × 2048）与近景 `C:\Users\86159\AppData\Local\Temp\codex-clipboard-5bda13ff-8dde-4574-a976-6ef6f5f9d112.png`（805 × 152）；只用于对照，不作为运行时 Tab 底图或裁切源。
- 当前实现证据：`F:\ResearchKB\.harness\qa\obsui\tab-fusion-final-{goal,local,repository,literature,storage}.png`；同输入对照：`tab-fusion-source-vs-live.png`。
- 交互参考视频：`C:\Users\86159\Desktop\VID20260823011302.mp4`；保持原有新项亮黄、旧项短暂淡出和约 150ms 交接节奏。

**Implementation**

- 五组独立 PNG 组件（每组 inactive/active 两态，共 10 张）仍为 `200×100`；灰/黄面共用同一 alpha 轮廓，文字中心和状态几何一致。
- `rebuild_independent_tabs.py` 在保留左右无竖线的前提下，将圆角收窄、文字缩小到中文 `27px` / H.D.D `26px`，补回轻微顶部金属高光，并把底部黑色收口压薄到与主框架自然衔接的厚度。
- `rebuild_panel_clean_for_tabs.py` 不再填充整个 `TAB_BOX`，仅清除旧 Tab 轮廓并保留原面板顶框；清理掩码二值化，彻底去掉旧面板边缘浅色残留，同时移除父容器连接像素层。
- `styles.css` 仅调整 `.device-tabs` 统一容器的组级几何：`left: 37.85%`、`width: 49%`、`top: 6.7%`、`height: 7.1%`；`App.tsx`、按钮顺序、命中区逻辑和切换动画未改。按钮与图片没有 `border-left`、左侧 `box-shadow` 或可见 `::before/::after`。
- 交接层仍只覆盖旧 Tab 原槽位，150ms 淡出且不参与布局；按钮和图片在两种状态下保持相同盒模型。

**Browser evidence**

- 本地预览：`http://127.0.0.1:5173/`；应用内浏览器视口 `1280×720 CSS px`，浏览器报告 density `1.25`，截图按 `1280×720` 像素保存。
- 逐一点击“目标 / 本机 / 仓库 / 文献 / H.D.D”：每次恰有一个 `aria-pressed="true"`，五个图片资源均报告原始尺寸 `200×100`，稳定等待 240ms 后交接层清除。
- 五个状态的五个按钮几何均为 `125.3625×51.1125 CSS px`，组容器为 `626.8625×51.1125 CSS px`；五状态之间最大坐标/尺寸差为 `0`，无位移、无缩放、无跳动。
- `inspect_panel_top.py` 报告 `tab_region_max_visible_pixels_per_row=6`，没有整块黑色矩形底板或父容器分隔线；`inspect_tab_composite.py` 在 Tab 底边以下区域未发现亮色残留。
- 五张状态截图均显示 Tab 左边缘没有独立黑色竖线，Tab 之间只保留连续的面渐变与底部结构；未发现灰色 inactive 泄漏、底部白线/缺口、额外横条、H.D.D 缺失或背景拼贴感。

**Fidelity surfaces**

- 字体与文字：保留原字体和字形风格，文字缩小到参考样本的机械页签比例并保持各槽位中心对齐；H.D.D 文案未改。
- 间距与布局：五个按钮仍为固定 `20%` 槽位；统一组级尺寸为 `626.8625×51.1125`，不使用单个 Tab 的 margin/left/translate 补丁。
- 颜色与视觉 token：黄色激活面、灰色金属渐变和 150ms 交接参数保持；补回轻微顶部高光，底部收口变薄，移除的是独立黑色侧线和底板，不是选中态颜色。
- 图像质量与透明度：运行时只使用独立 PNG；左右边缘由 Tab 面连续封闭，面板底图不再覆盖 Tab 区域为完整矩形。
- 内容与交互：按钮顺序、标签文字、内容区和切换逻辑未改。

**Comparison history**

- Earlier P1: `device-panel-clean.png` 用整块 `TAB_BOX` 暗色填充封住壁纸，形成明显黑色长方形底板；已改为只清除旧 Tab 轮廓并恢复原面板顶框。
- Earlier P2: 4px 额外黑色接缝和目标左下浅色残留；已移除连接层并用二值清理修正面板边缘。
- Current P2 fixed: PNG 自身左右黑色外壳与相邻槽位叠加形成细竖线；已改为边缘连续的 Tab 面，`tab-fusion-source-vs-live.png` 和五状态截图为修复后证据。
- Current P1 fixed: Tab 组相对参考样本过宽、过高、圆角过大且底部黑色延伸过厚；已统一缩小组容器、降低高度、缩小文字、收窄圆角并压薄底部收口，近景对照图已重新生成。

**Verification**

- [x] `python .harness/qa/obsui/rebuild_independent_tabs.py`、`rebuild_panel_clean_for_tabs.py`。
- [x] `python .harness/qa/obsui/inspect_tab_geometry.py` — 10 张独立组件尺寸、统一 alpha 轮廓、左右边缘封闭、透明像素清理和灰/黄状态隔离通过。
- [x] `python .harness/qa/obsui/inspect_panel_top.py`、`inspect_tab_composite.py` 与 `compare_tab_fusion.py` — 无整块矩形底板、无亮色残留，目标参考与当前实现已合并对照。
- [x] 浏览器五状态逐一点击与截图 — 唯一激活态、固定几何和交接层清除通过；控制台无 error/warn。
- [x] `pnpm test` — 5 个测试文件、14/14 通过。
- [x] `pnpm run build` — TypeScript 与 Vite 构建通过。
- [x] `git diff --check` — 通过（仅保留仓库既有换行格式提示）。

final result: passed

---

**Comparison target**

- Full source visual truth: `F:\ResearchKB\apps\ObsUI\assets\reference-ui.png` (1672 × 941 px).
- Focused source visual truth: `C:\Users\86159\AppData\Local\Temp\codex-clipboard-f5d774cc-d9c9-4d90-9a2e-7e7e239e683b.png` (325 × 181 px; CPU/GPU/MEM/DISK card).
- Browser-rendered implementation: `F:\ResearchKB\.harness\qa\obsui\obsui-live-metrics-qa.png` (1280 × 720 px; CSS viewport 1280 × 720; density 1).
- Full-view comparison: `F:\ResearchKB\.harness\qa\obsui\obsui-live-metrics-full-comparison.png`, with the full reference normalized to 1280 × 720 above the implementation.
- Focused comparison: `F:\ResearchKB\.harness\qa\obsui\obsui-live-metrics-comparison.png`, with the reference and implementation card normalized to 243 × 114 px and placed side by side.
- State: dashboard overview; performance card connected (`LIVE`) and sampling local Windows metrics.

**Findings**

- No actionable P0/P1/P2 visual or interaction differences remain for the requested live-performance card.
- Intentional difference: the source's frozen values are replaced by live CPU, GPU, memory, and disk percentages; `LIVE` replaces the static `INFO` label when the local source is connected.
- The full dashboard retains the requested wallpaper and right-edge rail placement; only the performance card's source slice was replaced so its text and meter widths can update.

**Fidelity surfaces**

- Fonts and typography: the live labels retain the compact bold hierarchy and uppercase naming of the reference; percentages remain right-aligned in each metric row.
- Spacing and layout rhythm: the 2 × 2 grid, meter placement, radii, and card dimensions are unchanged at 243.34 × 114.04 CSS px in the 1280 × 720 viewport.
- Colors and visual tokens: the off-white surface, black icon tiles, and yellow meters follow the supplied card; live state uses the same visual language without introducing a competing style.
- Image quality and asset fidelity: surrounding reference-derived assets and wallpaper are unchanged; the standard metric icons use the existing Ionicons library so live values remain readable.
- Copy and content: CPU, GPU, MEM, and DISK now represent real local readings, not placeholder content.

**Focused interaction evidence**

- The local endpoint returned a valid sample such as `{ cpu: 19, gpu: 11, memory: 74, disk: 0 }` from this Windows machine.
- Browser capture subsequently rendered different live values (for example CPU 17%, GPU 35%, memory 69%, disk 0%), confirming automatic refresh rather than a fixed response.
- The card displays `LIVE`; clicking it opens the 状态监控 workspace, which describes the local-only source and metric definitions.
- Browser console check: no errors.

**Comparison history**

- Earlier P1: the performance card displayed only values baked into the reference image and could not reflect the user's computer.
  Fix: added a localhost-only Vite endpoint backed by Windows CIM performance classes; the frontend polls it every 2 seconds and renders values and meter widths as live UI.
  Post-fix evidence: browser-rendered values changed across samples, with the complete card matching the reference's layout in the focused side-by-side capture.

**Implementation checklist**

- [x] Read CPU, all-GPU-engine peak usage, used physical memory, and physical disk activity from Windows locally.
- [x] Render the live values in the right-side reference card and update meters every 2 seconds.
- [x] Add unavailable-state handling without reintroducing simulated values.
- [x] Verify the local endpoint, dashboard card, monitor-page link, production build, 8 automated tests, and browser console.

**Follow-up polish**

- [P3] Add a user-selectable GPU adapter and disk device only if a single-device preference is required; the current GPU value is the busiest engine across installed adapters and disk is aggregate physical-disk activity.

final result: passed

---

## 2026-08-23 — 长素材图基准下的五 Tab 重建与交接动画

**Comparison target**

- 唯一视觉基准：`C:\Users\86159\Desktop\112.png`；验收副本：`F:\ResearchKB\.harness\qa\obsui\reference-tabs\long-tab-states.png`。
- 交互参考：`C:\Users\86159\Desktop\VID20260823011302.mp4`，确认新项先亮黄、旧项短暂保留后淡出。
- 同画布源图/浏览器对照：`F:\ResearchKB\.harness\qa\obsui\tab-source-vs-live.png`。

**Findings and implementation**

- 五个状态均由长素材图生成 `1000×100` 条带，固定为五个 `200px` 槽位；五张条带共用同一 alpha 外轮廓与底部横轨。
- 未选中 Tab 只使用长素材图中的灰色源像素并中和跨缝黄色抗锯齿残留；选中态保留对应源图的黄色面、黑色描边、金属渐变和字形；H.D.D 选中态完整。
- 命中区继续使用统一 `20%` 槽位；没有新增单个 Tab 的 margin、left 或 translate 修补。
- 切换时通过 Tab 容器内的旧态覆盖层以 `150ms ease-out` 从不透明淡出；覆盖层不参与布局、不接收指针，Tab 容器与五个按钮的坐标和尺寸不变。

**Browser evidence**

- 应用内浏览器视口 `1280×720 CSS px`；逐一点击“目标 / 本机 / 仓库 / 文献 / H.D.D”。每个状态恰有一个 `aria-pressed="true"`，五个按钮及容器的 `x/y/width/height` 前后一致，`transform: none`。
- 过渡层 CSS 已实测为 `150ms`；等待 `220ms` 后覆盖层清除。五张浏览器状态截图均检测到唯一黄色槽位，未选中槽位无黄色污染。

**Verification**

- [x] `python .harness/qa/obsui/rebuild_tabs_from_long_reference.py`。
- [x] `python .harness/qa/obsui/inspect_tab_geometry.py` — 源素材与浏览器五状态几何/黄色隔离通过。
- [x] `pnpm run build`。
- [x] `pnpm test` — 5 个测试文件，14/14 通过。
- [x] `git diff --check` — 无 whitespace error；仅保留既有行尾转换警告。

final result: passed

---

## 2026-08-23 — 源外壳与选中面分层重建（当前验收）

**根因修正**

- 上一轮把整张截图用阈值和形态学膨胀抠成条带；截图的黑色背景、原灰字和外壳抗锯齿因此进入资源，造成裁切痕迹、左右弧度不一致和选中标签左侧残留。
- 现在不再使用截图背景或整块截图外壳：横轨、灰色外壳和本机选中外壳均直接来自 `板块.png` 对应源图；四张选中截图只提供黄色面和黑字像素，文字以紧致像素遮罩单独合成。
- 本机未选中态先清除黄色外壳，再使用源图灰色外壳和白字像素，避免本机在未选中时比其它灰色标签更高或带黄色边缘。

**实现证据**

- 资源生成脚本：`.harness/qa/obsui/rebuild_device_assets.py`。
- 五张最终条带：`apps/ObsUI/assets/reference/device-tabs/strips/{goal,local,repository,literature,storage}.png`，均为 `981×100`，只保留一层横轨。
- 浏览器五状态截图：`.harness/qa/obsui/live-source-shell-{goal,local,repository,literature,storage}.png`；顶部对照：`.harness/qa/obsui/live-source-shell-comparison.png`。

**验收**

- 目标、本机、仓库、文献、H.D.D 依次点击；每次恰有一个 `aria-pressed="true"`，最后恢复本机。
- 选中态完整覆盖对应灰色外壳，左右圆角和底部横轨连续；本机未选中不再露出黄色或暗色旧层。
- `.device-panel-clean.png` 的原始标签矩形仍为空，由 `.device-tabs` 唯一显示标签；按钮仅保留透明命中区与辅助文本。
- 运行 `pnpm build`、`pnpm test`（5 个测试文件、14/14）和 `git diff --check`，均通过。

final result: passed

---

## 2026-08-22 — 整条横轨重建与统一命中区（本轮复核）

**Root cause**

- 之前把不同截图坐标系中的单个黄色标签贴回原始横轨；标签外壳宽度和左右锚点不一致，才会出现本机偏宽以及其它标签左侧露出灰壳。

**Fix**

- `rebuild_device_assets.py` 现在按固定横轨锚点生成五张完整 `981×100` 条带；目标、仓库、文献使用完整选中态截图的像素，灰色条带由同一套截图几何提供，本机选中像素取自 `板块.png`，H.D.D 只裁入完整模块并通过统一外壳遮罩。
- `device-panel-clean.png` 继续清除原始标签窗口，DOM 只切换一张条带图；五个透明按钮改为等宽 20% 命中区，避免交互区域再次制造“本机更宽”的错觉。

**Verification**

- [x] 浏览器逐一点击五个标签；每个状态恰有一个 `aria-pressed="true"`，五条资源均可见。
- [x] 实际预览中仓库、文献、H.D.D 的黄色模块左右弧线完整，左侧不再出现旧灰色底部；本机选中和未选中与其它标签使用同一横轨几何。
- [x] 五个按钮计算宽度均为 `150.11px`（当前 `750.56px` 标签区的 20%），没有额外焦点框、阴影或伪元素。
- [x] `pnpm build`、`pnpm test`（5 个测试文件、14/14）和 `git diff --check` 通过。

final result: passed

## 2026-08-22 — 顶部标签原图像素重建（当前验收）

**Comparison target**

- 几何与本机状态基准：`F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`，即用户提供的 `C:\Users\86159\Desktop\板块.png`。
- 非本机选中态像素来源：`F:\ResearchKB\.harness\qa\obsui\reference-tabs\goal-selected.png`、`repository-selected.png`、`literature-selected.png`、`storage-selected.png`。
- 五状态同尺寸对照：`F:\ResearchKB\.harness\qa\obsui\device-tabs-final-comparison.png`；完整目标/本机状态：`device-tabs-final-target-full.png`、`device-tabs-final-local-full.png`。

**Findings**

- [P1 fixed] 移除 `msyhbd.ttc`、`ImageFont`、`draw.text` 和文字遮罩重绘；五个标签的可见字形均来自原图或用户状态截图像素。
- [P1 fixed] 选中态只替换对应标签面 `0..85px`，底部横轨由同一张原图条带保留；不再叠加第二条横轨、隐藏卡片或相邻黄色区域。
- [P1 fixed] `App.tsx` 只切换一张完整状态条带，按钮仅作为透明点击命中区；旧的独立卡片资源不再参与渲染。

**Interaction and verification**

- [x] 依次点击目标、本机、仓库、文献、H.D.D.；每次只有一个 `aria-pressed="true"`。
- [x] 五个状态均生成浏览器截图；每个按钮的 `::before/::after` 均为 `none`，无可见焦点框或额外阴影。
- [x] 鼠标点击和键盘 Tab 聚焦均无蓝色轮廓；页面日志无运行时错误。
- [x] `pnpm build`、`pnpm test`（5 个测试文件、14/14）和 `git diff --check` 通过。

final result: passed

---

## 2026-08-22 — 顶部标签接缝二次复核

**Comparison target**

- 用户本轮截图：四个非“本机”选中态截图，均以 `C:\Users\86159\Desktop\板块.png` 为原图基准。
- 实现：`F:\ResearchKB\apps\ObsUI\assets\reference\device-tabs\strips\*.png` 五张完整状态条带。

**Findings**

- [P1 fixed] 原先每个按钮单独叠加卡片时，底层原图标签与按钮自身黑色边缘在接缝处重叠，造成黄色标签两侧出现粗黑竖边、错位和额外间隙。
- 现改为每个选中状态只绘制一张完整的五标签原图条带；按钮仅保留点击区域和无障碍名称，不再生成任何伪元素或第二套标签皮肤。

**Verification**

- [x] 目标、本机、仓库、文献、H.D.D. 五个状态逐一点击验证。
- [x] 每个状态只有一张 `device-tabs` 条带背景，按钮 `::before/::after` 均为 `none`。
- [x] 鼠标点击和键盘焦点均不显示浏览器默认蓝色焦点框。
- [x] `pnpm run build` 通过。
- [x] `pnpm test` — 5 个测试文件，14/14 通过。

final result: passed

---

## 2026-08-22 — 顶部板块独立双状态卡片复核（历史验收，已由统一条带方案替代）

**Comparison target**

- 唯一视觉基准：`F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（用户提供的 `C:\Users\86159\Desktop\板块.png`）。
- 本地预览：`http://127.0.0.1:5173/`；应用内浏览器按 1280 × 720 CSS 视口逐一点击五个板块。

**Findings**

- [P1 fixed] 顶部导航不再使用共享整条背景或 CSS 重绘文字；五个板块分别使用自己的 idle/active 光栅卡片。
- [P1 fixed] 未选中状态为原图灰底白字，选中状态为本机参考的黄底黑字；选中层只覆盖当前按钮，不会在左侧或相邻板块留下黄色残片、隐藏板块或字体替换。
- 按原图 tab 的非等宽位置与间隔绝对定位，卡片边缘、上沿高度和相邻黑色接缝保持源图关系；其余设备面板区域未改动。

**Interaction and verification**

- [x] 目标、本机、仓库、文献、H.D.D. 五个按钮均可点击，且每次只有一个 `active` 按钮。
- [x] 每次只有当前按钮显示 active 卡片图层，其余四个只显示 idle 卡片图层；活动按钮背景透明，不受全局 `nav button.active` 色块覆盖。
- [x] 浏览器控制台无 warning/error。
- [x] `pnpm run build` 通过。
- [x] `pnpm test` — 5 个测试文件，14/14 通过。

final result: passed

---

## 2026-08-22 — 四卡连续滑动区最终复核

**Comparison target**

- Source visual truth: 用户上传的 `C:\Users\86159\Desktop\板块.png`，其在项目中的无损参考副本为 `F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（1672 × 941 px）。
- Rendered implementation: `F:\ResearchKB\.harness\qa\obsui\device-panel-group-initial.png`（1280 × 720 px，浏览器 CSS 视口 1280 × 720，`devicePixelRatio: 1`）。
- Same-canvas focused comparison: `F:\ResearchKB\.harness\qa\obsui\device-panel-group-comparison.png`。左侧为原图的四卡滑动区 `(252, 302)–(1518, 814)`，右侧为同一浏览器状态的滑动区；两侧均已归一化为 969 × 392 px。该原图左下椭圆按用户此前要求以相邻原始壳体纹理去除后再对照。
- State: “本机 → 状态监控”的初始位置（`scrollLeft: 0`）。右侧叠加了真实的本机动态数据，因而只评估卡片壳体、黑色数据区、灰色铭牌区、橙色扣件和固定外框的视觉一致性。

**Findings**

- Earlier [P1] 单独缩放四张裁切卡片会在缩放像素取整时露出黑缝、破坏卡片圆角，并造成卡片之间的非原始大空隙。
  - Fix: `RailPage` 现在按四项组成一个整体可拖动卡组；每组直接使用原图连续裁切的 `device-card-group.png`。壳体边界、间隙、圆角、顶部连接轨和首张橙色扣件均来自同一连续光栅图，动态内容只以透明层放在既定黑色信息区与下方铭牌区。
  - Post-fix evidence: 同画布对照显示四张卡的非等宽尺寸与间距保持原图的 `333/20/302/21/281/18/291 px` 节奏；初始视图没有 CSS 拼接缝、未完成圆角或卡片超出外框。
- No actionable P0/P1/P2 differences remain in the user-specified sliding-board region. 动态文字是该工作台功能内容，不是源图中的装饰文字；它保持在原图的黑色内容区内。

**Fidelity surfaces**

- Fonts and typography: 原图自带的标签与外框文字仍使用光栅素材；动态数据维持清晰的系统字体、粗细和对比度，未再模糊选中标签文字。
- Spacing and layout rhythm: 固定外框为原图 `1672 / 941` 比例；可视区精确位于原图 `(252, 302)–(1518, 814)`。四卡作为单一图层移动，卡间黑缝仅保留原图本有的 20/21/18 px 节距。
- Colors and visual tokens: 外框、灰黑机壳、斜纹黑色内容槽和橙色扣件均直接来自用户原图，无 CSS 仿制色块或额外顶带。
- Image quality and asset fidelity: 初始与续接卡组使用连续原图裁切并以 `100% 100%` 比例缩放；没有单卡放大、边缘透明晕圈或额外外壳绘制。首张底部椭圆是用户明确要求删除的唯一壳体差异。
- Copy and content: 现有监测数据位于每张卡片的黑色信息区，名称在下方灰色铭牌区；拖动时数据层与所属卡组共同移动。

**Focused interaction evidence**

- 指针真实拖动将轨道从 `scrollLeft: 0` 移至 `982.40`（最大值 `983`）；第二个四卡组在固定长槽中完整对齐，范围 `x: 193.44–1162.61`，未突破长槽右边界。
- 中途拖动实拍：`F:\ResearchKB\.harness\qa\obsui\device-panel-group-dragged.png`；末端实拍：`F:\ResearchKB\.harness\qa\obsui\device-panel-group-end.png`。续接卡组同样保留原图卡槽的圆角、卡距和顶部连接轨，且不重复首卡的橙色扣件。
- 浏览器控制台仅包含 Vite 连接与 React DevTools 提示，无运行时错误。
- `pnpm run build`、`pnpm test`（5 个文件，14/14）和 `git diff --check` 均通过。

**Implementation checklist**

- [x] 固定外框不参与横向滚动，且沿用原图比例。
- [x] 四张卡、卡片壳体、内容和首卡扣件作为连续组整体拖动。
- [x] 所有工作区页面复用同一滑动卡组结构。
- [x] 卡片被限制在固定长槽内；末端内容可通过拖动完整显示。
- [x] 去除每张卡底部不需要的椭圆按钮装饰。

**Follow-up polish**

- [P3] 若后续为卡片增加超过两组的长期内容，可再制作专用的多组连续原画条带；当前两组的连接间距沿用原图的卡间黑缝，功能和可见范围已通过拖动验证。

final result: passed

---

## 2026-08-22 — 固定机壳与统一可拖动卡片带（当前状态）

**Comparison target**

- Source visual truth: `F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`，即用户提供的 `C:\Users\86159\Desktop\板块.png`；本次仅以它确定固定机壳、卡片壳体、橙色扣件与铭牌的视觉规则。
- Browser-rendered implementation (initial state): `F:\ResearchKB\.harness\qa\obsui\device-panel-viewport-initial.png`（1280 × 720 px；CSS viewport 1280 × 720；devicePixelRatio 1）。
- Browser-rendered implementation (dragged state): `F:\ResearchKB\.harness\qa\obsui\device-panel-viewport-dragged.png`（1280 × 720 px；同一视口与密度）。
- Full/focused comparison: `F:\ResearchKB\.harness\qa\obsui\device-panel-viewport-initial-comparison.png`。左侧是源图四卡区域，右侧是同一初始状态下的实现；两侧均裁取固定长槽和四卡区域后等尺寸归一化。源图为空卡壳，右侧保留现有真实内容，这是预期的产品内容差异。
- State: “本机”分类、系统监测数据已加载；初始时第四张卡被固定右边界遮挡，拖动后它完整进入视口。

**Findings**

- No actionable P0/P1/P2 differences remain for the requested interaction and card placement.
- Intentional difference: source图第一张卡带有下部椭圆装饰；用户明确要求移除，因此实现以连续灰色铭牌区取代该装饰。

**Fidelity surfaces**

- Fonts and typography: 标签文字继续使用源图的栅格字形。卡片数据采用清晰的本机工作台字重；动态数值置于黑色数据区，名称单独置于下方灰色铭牌区，未使用模糊的选中态文字。
- Spacing and layout rhythm: `device-panel-clean.png` 只保留固定长机壳；首卡与后续卡使用一致的 333 px 源比例和 20 px 源比例间隔。首卡橙色扣件与其内容同属一个移动单元，没有与顶部轨道脱节。
- Colors and visual tokens: 原图石墨色壳体、深色斜纹数据槽、橙色扣件和黄色选中标签均保留。黑色轨道底只用于遮蔽源图中不可移动的预置卡片。
- Image quality and asset fidelity: 机壳、卡片、扣件、标签均来自用户提供的原图裁切；没有以 CSS 形状、内联 SVG 或占位素材替代可见的参考美术。
- Copy and content: 现有项目、任务、资料、监测和设置内容均封装在小卡片的黑色区；各卡的名称在灰色铭牌区。五个标签都经同一 `RailPage`/`RailCard` 结构渲染。

**Focused interaction evidence**

- 初始：轨道 `scrollLeft: 0`，右侧第四张卡 `right: 1252.42px`，固定可视区右边界 `1156.61px`，因此按设计被外框裁切。
- 真实指针拖动后：轨道 `scrollLeft: 537.60px`；同一第四张卡范围为 `461.14–714.83px`，完全位于固定可视区 `192.00–1156.61px` 内。
- “目标、仓库、文献、H.D.D、本机”逐一点击验证：均使用同一滑动卡片框架，且切换视图会复位到左端；前四者各含 4 张卡，本机含 8 张卡。
- Browser console: 当前刷新会话只有 Vite 连接与 React DevTools 信息。较早一次热更新曾记录 Vite reload 提示；随后完整刷新和生产构建均成功，未出现运行时错误。

**Comparison history**

- Earlier P1: 原实现把长槽外框切成多个可移动片段，导致顶部连接部分和小卡片脱节，且续接处重复。
  Fix: 长槽改为唯一固定 `device-panel-clean.png`；单张卡片只承载自己的壳体和内容。
  Post-fix evidence: 初始与拖动截图都显示完整外框不移动、所有可见卡片以相同节距同步移动。
- Earlier P1: 右侧卡片要么越出机壳，要么无法通过拖动完整显示。
  Fix: 在固定长槽内部建立实际横向滚动视口，保留超出部分并由 `overflow-x` 裁切。
  Post-fix evidence: 上述边界测量证明初始裁切和拖动后的完整显示。
- Earlier P1: 数据和名称没有落在参考图对应区域，且源图的橙色扣件在拖动时残留为静态装饰。
  Fix: `rail-card-data` 定位到黑色数据槽，`rail-card-name` 定位到下方灰色区；首卡专用素材承载扣件，同时清理固定机壳中遗留的扣件像素。
  Post-fix evidence: 两个浏览器截图中，扣件随首卡离开视口；数据与名称分别处于指定的黑色和灰色区域。

**Implementation checklist**

- [x] 固定原图长机壳，且不重复添加可移动外框。
- [x] 以统一尺寸的小卡片承载所有分类的既有内容。
- [x] 仅首卡带橙色扣件；扣件与卡片内容同轨移动。
- [x] 初始右侧卡片裁切，拖动后完整可见，内容不溢出固定框架。
- [x] `pnpm run build`、`pnpm test`（14/14）和 `git diff --check` 通过。

**Follow-up polish**

- [P3] 如果后续补充更长的中文名称，可为灰色铭牌增加滚动提示或二行截断；当前短名称已完整可读。

final result: passed

---

## 2026-08-22 — 全局连续卡带与清晰选中标签

**Comparison target**

- 用户指出的续接问题：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-51e89e40-d56e-4271-8cdb-306b76177764.png` 与 `C:\Users\86159\AppData\Local\Temp\codex-clipboard-32dd025d-b8da-4c2b-be08-fa518427b5af.png`。
- 用户指出的模糊选中标签：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-544f9195-c866-4482-9d71-c52f99181567.png`。
- 设备机壳源图：`F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`；其卡槽区域是连续机壳的视觉基准。
- 修正后的拖动状态：`F:\ResearchKB\.harness\qa\obsui\device-panel-continuous-belt.png`（1280 × 720 px；CSS viewport 1280 × 720；密度 1）。
- 源图与实现的同尺寸卡槽比较：`F:\ResearchKB\.harness\qa\obsui\device-panel-continuous-belt-comparison.png`（2008 × 398 px）。
- 清晰标签状态：`F:\ResearchKB\.harness\qa\obsui\device-tab-sharp-goal.png`（1280 × 720 px）。

**Findings**

- [P1 fixed] 第 4→5 张卡的续接从“新的一段左端卡”改为“内部卡 → 内部卡 → 无端盖宽卡 → 末卡”的连续序列。每组四卡宽度仍严格填满卡槽，但不再在续接处重复左端机壳。
- [P1 fixed] 左右外机壳边缘独立为固定源图覆盖层，拖动时不再跟随内容重复出现；这同时修复了用户截图中的左侧浮动端盖和中部双重竖边。
- [P2 fixed] 所有非“本机”的选中标签使用原始白色字形的锐化高亮蒙版，并先清除黄色底图中残留的黑字阴影。黑字保持原有字形，边缘更清楚。

**Fidelity surfaces**

- 字体与排版：选中“目标”在相同黄色物理标签上显示锐利的黑色原字形；未改变应用内容文字的字体、层级或换行。
- 间距与布局：五个工作区均通过同一个 `RailPage` 规则渲染。实测目标、本机、仓库、文献和 H.D.D 的第 4 卡均在框架内；本机 8 卡继续横向滚动。
- 颜色与视觉标记：石墨机壳、源图橙色卡扣和黄色选中面保留；只有重复的续接端盖及模糊灰影被移除。
- 图像质量与素材保真：所有卡槽、固定外缘和标签字形均由提供的设备图派生；未使用 CSS 绘制替代机壳或字形。
- 文案与内容：磁盘、网络、项目、资料和设置内容仍作为各自卡片的一部分随轨道移动。

**Verification**

- [x] 应用内浏览器：本机轨道滚动到 `scrollLeft: 1002.4`，四张末段卡完整显示，无重复端盖。
- [x] 应用内浏览器：五个标签页均有固定边缘层，第 4 卡右边界均未超出框架。
- [x] 应用内浏览器：选中“目标”呈锐利黑色字形，不显示额外黄框。
- [x] `pnpm run build`
- [x] `pnpm test` — 5 个测试文件、14/14 通过。

final result: passed

---

## 2026-08-22 — 当前验收结论：固定机壳与统一可拖动卡片带

- Source visual truth: `F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（用户提供的 `C:\Users\86159\Desktop\板块.png`）。
- Implementation captures: `F:\ResearchKB\.harness\qa\obsui\device-panel-viewport-initial.png` 与 `F:\ResearchKB\.harness\qa\obsui\device-panel-viewport-dragged.png`，均为 1280 × 720 px、CSS viewport 1280 × 720、devicePixelRatio 1。
- Same-canvas comparison: `F:\ResearchKB\.harness\qa\obsui\device-panel-viewport-initial-comparison.png`；源图和实现均裁取四卡长槽并等尺寸归一化。源图为空壳、实现填充现有内容是预期差异。
- Visual review: 固定长机壳不随轨道移动；统一尺寸卡片只在框内横向移动；橙色扣件随首卡而动；黑色区承载数据、下方灰色区承载名称；首卡底部椭圆按用户要求移除。
- Interaction evidence: 初始 `scrollLeft: 0` 时第四张卡 `right: 1252.42px` 大于视口右边界 `1156.61px`，因此被裁切；真实指针拖动后 `scrollLeft: 537.60px`，同卡范围为 `461.14–714.83px`，完整落在 `192.00–1156.61px` 固定视口内。
- Shared-framework evidence: “目标、仓库、文献、H.D.D、本机”均已点击验证并使用同一轨道；前四者各 4 张卡，本机 8 张卡。生产构建、14/14 自动化测试和 `git diff --check` 均通过。
- Required fidelity surfaces: 原图栅格标签字形、石墨机壳、橙色扣件和斜纹数据区均由原图素材保留；新增动态文字保持清晰、未使用模糊选中态或 CSS/SVG 替代美术。除用户明确移除的椭圆装饰外，无 P0/P1/P2 视觉差异。

final result: passed

---

## 2026-08-22 — 横向续接卡片细节

**Comparison target**

- 连续卡带的源图基准：`F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`，卡片区域 `(225, 291)–(1535, 831)`。
- 用户指出的故障放大图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-a948f4d3-5c41-476e-b9a0-74d6a87d181d.png` 与 `C:\Users\86159\AppData\Local\Temp\codex-clipboard-0823475c-8ae5-4f28-b9f8-4072bbce5198.png`。
- 修正后的应用内浏览器截图：`F:\ResearchKB\.harness\qa\obsui\device-panel-refined-continuity.png`（1280 × 720 px；CSS viewport 1280 × 720；密度 1）。
- 合并比较图：`F:\ResearchKB\.harness\qa\obsui\device-panel-refined-continuity-comparison.png`（2008 × 398 px）；左侧为等尺寸源图卡槽，右侧为同一轨道的拖动后可视区域。
- 状态：本机页，按右方向键将可聚焦卡片轨道移动到末段；轨道 `scrollLeft: 1002.4`、`clientWidth: 1003`、`scrollWidth: 2006`。

**Findings**

- [P1 fixed] 第 4 张与第 5 张之间不再重复完整卡槽的左右端盖。续接位置改为内部卡片切片，顶部轨道连续，垂直边框不再双重堆叠。
- [P1 fixed] 橙色卡扣仅保留在源图的首张卡上；续接段不重复该装饰，因此不会在一个可视区域内出现两个无来源的橙色卡扣。
- [P2 fixed] 卡片轨道获得左右方向键支持，便于准确验证拖动后的接缝；键盘焦点不绘制额外白色边框。

**Fidelity surfaces**

- 字体与排版：续接修正只替换背景切片，不改变现有内容的字体、字重、断行或信息层级。
- 间距与布局：四张卡在任一停靠段仍填满 1003 px 卡槽宽度；卡间间距沿用源图的内置尺寸。
- 颜色与视觉标记：石墨色卡带、灰色机壳和唯一的源图橙色卡扣保持不变；移除了续接段中重复的橙色标记。
- 图像质量与素材保真：续接素材直接由提供的设备面板切片生成，未以 CSS 或新绘图伪造机壳。
- 文案与内容：磁盘、监控说明、网络和出口 IP 内容在各自卡片内保持随轨道移动。

**Verification**

- [x] 应用内浏览器截取拖动末段并与源图卡槽并排核对。
- [x] 末段四张卡完整受框架裁切，无重复起止边、无额外焦点框。
- [x] `pnpm run build`
- [x] `pnpm test` — 5 个测试文件、14/14 通过。

final result: passed

---

## 2026-08-22 — 原字形标签与可移动卡片外壳

**Comparison target**

- Tab typography reference: `C:\Users\86159\AppData\Local\Temp\codex-clipboard-d31d3c66-d155-41c2-b57b-97d2cc6b0fa7.png`.
- Card-shell drag reference: `C:\Users\86159\AppData\Local\Temp\codex-clipboard-b89c14cd-a0b5-4704-8a01-0dc2f0ec8141.png`.
- Browser verification: `http://127.0.0.1:5173/` at 1280 × 720 CSS px, using the in-app browser.

**Findings**

- All five tab states now use glyph pixels extracted from the supplied device artwork; no system font is drawn for tab labels.
- The card rail is an opaque empty backing plus repeated `device-card-shell.png` cards. Card content, its frame, and two empty continuation slots share one horizontal drag track.
- The selected tab uses a yellow raster surface with a black label. No external yellow selection frame is rendered.

**Focused interaction evidence**

- Browser click on “本机” selected `local-active.png`; its computed active background was the yellow tab asset, with transparent DOM text and no outline.
- A real pointer drag from x=800 to x=460 inside the card bay moved the rail from `scrollLeft: 0` to `389.6` (maximum `390`), proving that the shells themselves are in the draggable track.
- At the target panel’s 1280 px viewport, content cards and continuation slots each resolve to a 258 × 377 px source-derived shell; the rail is horizontally overflowing (`1359` scroll width vs `969` client width).
- Browser console contains only Vite/React informational messages and hot-update events; no application errors.

**Verification**

- [x] `pnpm build`
- [x] `pnpm test` — 5 files, 14 tests passed
- [x] In-app browser tab selection and actual pointer-drag verification

final result: passed

---

## 2026-08-22 — 标签选中状态与横向卡片轨道

**Comparison target**

- Selected-tab reference: `C:\Users\86159\AppData\Local\Temp\codex-clipboard-14bf6b76-282e-495a-a96f-e477bbe01c1e.png` (1091 × 128 px). The user clarified that yellow fill and black text are the intended selected state, while the source image’s yellow outline is not wanted.
- Card-rail reference: `C:\Users\86159\AppData\Local\Temp\codex-clipboard-50f6f679-71df-4cc8-a91a-0e1049c1c600.png` (473 × 199 px).
- Browser-rendered selection capture: `F:\ResearchKB\.harness\qa\obsui\device-panel-final-goal.png` (1280 × 720 px; CSS viewport 1280 × 720; browser devicePixelRatio 1.25).
- Browser-rendered dragged rail capture: `F:\ResearchKB\.harness\qa\obsui\device-panel-rail-dragged.png` (1280 × 720 px; same viewport and density).
- Full-view comparison evidence: `F:\ResearchKB\.harness\qa\obsui\device-panel-selection-comparison.png` and `F:\ResearchKB\.harness\qa\obsui\device-panel-rail-comparison.png`, each placing the reference at left and the normalized browser result at right.
- State: “目标” selected for the first capture; the monitor rail was dragged leftward for the second capture, revealing disk, monitor note, network and proxy-egress cards.

**Findings**

- No actionable P0/P1/P2 differences remain for the two requested changes.
- Intentional difference: the reference’s external yellow border is omitted, per the user’s explicit instruction. Keyboard focus remains available as a black inset treatment that does not create a separate selection frame.

**Fidelity surfaces**

- Fonts and typography: a selected label is rendered as a readable bold black label on yellow; inactive labels remain light on graphite. The label image assets preserve the reference’s physical-tab rather than generic-button treatment.
- Spacing and layout rhythm: the five tabs retain their original slots and the four-card bay remains visible before any drag. The rail advances horizontally rather than introducing a second layout or changing card size.
- Colors and visual tokens: only one tab is yellow at a time. The selected yellow/black state follows the supplied “本机” example; inactive tabs are graphite with light text.
- Image quality and asset fidelity: state-specific tab images are derived from the supplied device-panel asset and use its chrome, borders and surface texture. No placeholder illustration or CSS-drawn replacement was introduced.
- Copy and content: all existing labels and card content remain available. The rail’s accessible name explains that it can be dragged horizontally.

**Focused interaction evidence**

- Selecting “目标” makes only that tab yellow with black text; selecting “本机” moves the state to that tab.
- Dragging the monitor card bay leftward moves the visible rail from the first four performance cards to later monitor, network and proxy-egress cards.
- Browser console check: no errors.

**Comparison history**

- Earlier P1: the user-supplied panel image contained a permanently yellow “本机” tab, so another active tab could leave two yellow tabs visible.
  Fix: added explicit idle and active raster states for all five tabs.
  Post-fix evidence: browser captures show exactly one yellow tab after both “目标” and “本机” selections.
- Earlier P1: the four-card bay used a fixed grid and could not expose later monitor cards by dragging.
  Fix: changed the bay to a pointer-drag horizontal rail with click suppression after a drag and native horizontal scrolling support.
  Post-fix evidence: the dragged browser capture exposes the later network and proxy-egress cards in the same bay.

**Implementation checklist**

- [x] Replace the former yellow selection outline with yellow tab surface and black text.
- [x] Provide distinct selected and unselected assets for every tab.
- [x] Convert the card bay into a horizontally draggable rail without changing the existing card content.
- [x] Verify click selection, drag behavior, browser console, production build and 14 automated tests.

**Follow-up polish**

- [P3] State-specific tab images intentionally prioritize a readable selected label; they can be replaced later with a custom artist-authored set if more surface texture variation is desired.

final result: passed

---

## 2026-08-22 — 设备面板工作区替换

**Comparison target**

- Full source visual truth: `F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`, copied unchanged from the user-provided `C:\Users\86159\Desktop\板块.png` (1672 × 941 px).
- Browser-rendered implementation: `F:\ResearchKB\.harness\qa\obsui\device-panel-goals.png` (1280 × 720 px; CSS viewport 1280 × 720; browser devicePixelRatio 1.25; capture normalized to the CSS viewport).
- Full-view comparison: `F:\ResearchKB\.harness\qa\obsui\device-panel-goals-comparison.png`, with the source normalized to 1280 × 720 on the left and the browser capture on the right.
- Focused-region comparison: the tab strip, dark readout slot, four-card bay and close control were compared within that side-by-side image; a separate crop was unnecessary because all critical features are legible at the normalized scale.
- State: “目标” tab selected, two existing task cards visible, task form available in the first card.

**Findings**

- No actionable P0/P1/P2 differences remain for the requested shared panel frame.
- Intentional content difference: the supplied board is an empty visual shell, while the implementation places the existing task form and task cards in its four-card bay. The background workbench remains visible outside the frame, matching the application’s existing modal behavior.

**Fidelity surfaces**

- Fonts and typography: the large tab labels, “MODULE” rail text and close glyph remain in the supplied raster asset; added content uses the app’s compact local-workbench text hierarchy so it remains readable without competing with the frame.
- Spacing and layout rhythm: the raster frame keeps its original tab strip, readout and four-card geometry. The form occupies the first bay, and each existing task gets a subsequent bay without overlapping the frame.
- Colors and visual tokens: the dark graphite shell and orange/yellow hardware accents are retained from the user’s asset. Added controls use the same orange accent and dark surfaces.
- Image quality and asset fidelity: `device-panel.png` is the supplied source asset, used intact as the panel frame; no replacement illustration, inline SVG, CSS art or placeholder imagery was introduced.
- Copy and content: content is assigned as 目标=计划任务、本机=状态监控、仓库=项目、文献=知识资料、H.D.D=本地数据与设置. All five tabs and the close control remain semantic buttons.

**Focused interaction evidence**

- Browser verification confirmed that the five tabs expose their mapped content, including the monitor’s “刷新出口 IP” control, the repository project entry, the literature form and the JSON export control.
- The close control returns to the dashboard overview.
- Browser console check: no errors.

**Comparison history**

- Earlier P1: the global navigation CSS affected the new tab strip, causing the “目标” tab label to wrap vertically.
  Fix: reset inherited navigation padding, gap, color, background and active-state shadow within `.device-tabs`.
  Post-fix evidence: the browser capture shows the original horizontal labels, aligned in the supplied tab slots.

**Implementation checklist**

- [x] Use the supplied board image as the shared frame for every non-overview workspace.
- [x] Map existing task, system, project, resource and local-data views to the five tabs.
- [x] Keep tabs and close control keyboard-accessible and visibly focused/selected.
- [x] Verify the primary tabs, close interaction, production build, automated tests and browser console.

**Follow-up polish**

- [P3] The source asset depicts “本机” as the yellow physical tab; non-local selected tabs use an added yellow outline to communicate the interactive active state. Separate state-specific tab assets could replace this outline if a stricter physical-tab animation is desired.

final result: passed

---

## 2026-08-22 — 卡片与内容同步移动（当前状态）

**Findings**

- [P1 fixed] 将五个独立标签图替换为单张状态专属标签带，消除接缝和比例不一致。
- [P1 fixed] 每个内容项恢复为一张完整的源图卡片外壳加内容的单一移动单元；轨道背景覆盖原图中不可移动的卡槽，因此不会露出第二层静态卡片。

**Focused interaction evidence**

- 用户卡片参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-f3d25960-4635-4238-b72b-86cebdb6ee45.png`。
- 浏览器实测：标签带为 751 × 75 CSS px，按钮自身不再绘制背景；切换“本机”和“H.D.D”会替换整条标签带。
- 浏览器实测：轨道为源图暗色底、页面无背景、三个内容项均使用 `device-card-shell.png`。两个空白延续槽也使用同一外壳。
- 真实拖动使轨道从 `scrollLeft: 0` 移至 `389.6`；首张卡的 x 坐标从 193 变为 −196，同时保留其 `device-card-shell.png` 背景，并复位到 0。
- `pnpm build` 通过，自动化测试 14/14 通过。

**Verification limitation**

- 内嵌浏览器可完成点击、拖动及样式核对，但不支持元素截图；当前环境的 Chrome 不可用。因此无法生成本次变更后的浏览器截图与参考图放在同画布进行最终像素比对。

final result: blocked

---

## 2026-08-31 — `?ui=tab-v2` 精简 Shell 视觉复核（最新）

**Findings**

- 没有可阻塞验收的 P0/P1/P2 差异。用户反馈截图中的旧版问题已按请求处理：可见的五联 Tab、三条斜杠、`PUBLIC SHELL / PHASE 1` 等重复 Shell 文案，以及目标页 `01/02` 序号均不再出现在当前 V2 弹窗结构中。
- [P3，可选] 当前顶栏仍保留一个 34px 的既有 `obsui.ico` 品牌图标和 `ObsUI` 品牌名；本轮将“ObsUI 的标签”解释为功能 Tab，而不是品牌标识。若后续也希望去掉品牌标识，可单独再收紧顶栏。

**Source visual truth**

- 用户反馈截图（问题证据，不作为旧版像素复刻目标）：
  - `C:\Users\86159\AppData\Local\Temp\codex-clipboard-9ab2c612-8cbe-495e-91e9-2852b8fc23ca.png`（390×895 px）
  - `C:\Users\86159\AppData\Local\Temp\codex-clipboard-94217896-6c9c-4c9a-aaa3-5b51fec5b53a.png`（292×110 px）
  - `C:\Users\86159\AppData\Local\Temp\codex-clipboard-6a3daba3-2fa3-4f59-93c9-59e71a896ec9.png`（264×268 px）
- 真实验收目标由用户文字请求确定：减少图形和层级、移除功能 Tab、去除重复说明与序号、让功能区和背景使用同一套平面坐标。

**Implementation evidence**

- 运行地址：`http://127.0.0.1:5173/?ui=tab-v2`
- 浏览器视口：1280×720 CSS px；`devicePixelRatio = 1.25`；实现截图像素尺寸为 1280×720。外层弹窗约 1200×680 CSS px，内容视口约 `1166.4×582.4` CSS px，内缩 16px。
- 最新浏览器截图：
  - `F:\ResearchKB\.harness\qa\obsui\obsui-compact-target-clean-final.png`（目标/当前目标）
  - `F:\ResearchKB\.harness\qa\obsui\obsui-compact-calendar-clean.png`（目标/日历）
  - `F:\ResearchKB\.harness\qa\obsui\obsui-compact-local-clean.png`（本机）
  - `F:\ResearchKB\.harness\qa\obsui\obsui-compact-library-clean.png`（文献）
- 源截图是不同尺寸的裁剪问题证据，未声明 CSS 尺寸或设备密度，未做伪精确的像素归一化；本轮比较的是用户明确要求的视觉变化，而不是复制旧版纹理和比例。

**Full-view comparison evidence**

- 旧版全视图显示多层纹理外壳、额外 Tab 轨道和三条斜杠；最新目标截图只有一个平面弹窗框、64px 顶栏和一个对齐的内容视口，页面背景与功能区不再叠加第二套装饰坐标。
- 本机、文献、自动化计时和 H.D.D 入口均复用同一个 Shell；本机与文献实测均为 0 个弹窗 Tab、0 个斜杠/旧背板节点，内容视口尺寸一致。

**Focused-region comparison evidence**

- 顶栏：对照用户截图 #2，当前实现移除了三条斜杠、`PUBLIC SHELL / PHASE 1` 小字、Tab 轨道和文字关闭按钮，只保留品牌标识与图标关闭按钮。
- 目标页左栏：对照用户截图 #3，当前实现保留“当前目标”“日历 / 月历”两个功能入口，但去掉 `01/02`、图形块和重复副说明；两项仍用 `aria-pressed` 表达选中状态。
- 目标内容与日历内容均在同一个 `1166.4×582.4` CSS px 视口中渲染；日历切换后未发生 Shell 或内容区位移。

**Required fidelity surfaces**

- Fonts and typography：Shell 使用现有产品字体栈 `Segoe UI` / `Microsoft YaHei`；品牌、功能入口、内容标题和辅助文字有明确层级，无截图中旧版大字与小字重叠。源截图字体未提供可归一化 CSS 规格，因此不作字体像素级等同声明。
- Spacing and layout rhythm：外层单框、64px 顶栏、16px 内容内缩、10px 内容圆角和统一网格已实测；目标页侧栏与工作区处于同一内容坐标系统，没有旧版多框架错位。
- Colors and visual tokens：改为平面深灰背景、低对比边界和单一黄色选中态；移除旧版渐变、点阵、重阴影和装饰性承托层。
- Image quality and asset fidelity：仅保留仓库现有 `obsui.ico`，按 34px 原比例显示；三条斜杠没有用 CSS/HTML 伪造替代，关闭按钮使用现有图标库图标；本轮没有新增生成图片。
- Copy and content：删除 Shell 阶段说明、重复区域说明和目标序号；占位页文案收敛为“分类/搜索/资源列表”等结构性短标签，避免同一功能重复介绍。
- States and accessibility：目标/日历、本机、文献、自动化计时、H.D.D 状态均可打开；关闭按钮和 ESC 均关闭弹窗并将焦点恢复到“计划任务”；弹窗保持 `role=dialog` 与中文 `aria-label`。

**Interaction and runtime checks**

- `pnpm run build`：通过。
- `pnpm test`：9 个测试文件、29 项测试全部通过。
- `git diff --check`：通过；仅有 Git 对既有工作副本的 LF/CRLF 提示，无 whitespace error。
- 干净页面重新加载后浏览器控制台 error/warn：0 条。
- 入口验证：知识资源→文献、计划任务→目标、自动化计时→目标、本机状态→本机、工作台设置→H.D.D；所有 V2 弹窗均没有可见 Tab 轨道或旧背板节点。

**Comparison history**

- 第一轮精简截图发现继承的旧 Grid 规则把 Shell 内容压缩到约 32px；修复为 Shell 明确 `display: block` 并由内部 Frame 管理 64px 顶栏与剩余内容区。
- 修复后重新截取目标、日历、本机、文献状态，并在同一组视觉输入中与三张用户反馈截图复核；未发现新的 P0/P1/P2 问题。

**Implementation Checklist**

- [x] 移除 V2 弹窗内可见五联 Tab。
- [x] 移除三条斜杠、旧背板和阶段性 Shell 文案。
- [x] 去掉目标页 `01/02`、图形块及重复副说明。
- [x] 将 Shell、内容视口和目标页功能区统一到单一平面坐标。
- [x] 验证目标/日历切换、关闭、ESC、焦点恢复和多入口打开。
- [x] 通过构建、测试、diff 检查和干净页面控制台检查。

final result: passed

---

## 2026-08-25 — TabModalV2 游戏 UI 拼图式重建（功能通过，视觉待确认）

**Scope**

- 保留 `?ui=tab-v2` 和旧版默认入口；只替换 V2 视觉层。
- 移除自定义 CPU/GPU/MEM 顶部 HUD；不再以 `shell-*-3x.png` 作为 V2 整体运行时背景。
- 以 `C:\Users\86159\Desktop\ZZZ素材` 的六张截图为来源，拆出共享外框、Tab、关闭按钮、左栏、进度条、卡片、按钮、箭头和五种布局变体。

**Findings**

- [P1 fixed] `TabModalShell` 改为稳定共享外框 + 五个真实 HTML 内容布局；本机橙色 PDU 轨道只由 `local` 变体渲染。
- [P1 fixed] 目标、仓库、文献、H.D.D 使用各自灰色左栏素材，不再复用本机橙色区域。
- [P1 fixed] 本机与 H.D.D 使用真实横向 CardRail；文献改为真实纵向作战列表。
- [P1 fixed] 动态业务指标放入本机内容卡，不再显示独立 HUD；游戏动态标签、资源数值和原始文字从拆分素材中去除或模糊。

**Functional evidence**

- `pnpm test -- --run`：8 个测试文件，24/24 通过。
- `pnpm run build`：通过。
- `git diff --check`：无 whitespace error，仅有既有 CRLF 转换提示。
- 浏览器五 Tab 切换、唯一选中、固定外框几何、CardRail `scrollLeft` 边界、关闭与焦点恢复、控制台 error/warn 均已检查。

**Visual gate**

- 证据目录：`F:\ResearchKB\.harness\qa\obsui\tab-modal-v2\game-puzzle-rebuild\`。
- 已检查 1280×720、1920×1080、2560×1440、125% 和 150% DPI；实现截图与素材截图已分别保存。
- 视觉仍需用户在同一视口对照原始游戏截图确认；确认前不宣称像素级通过。

final result: blocked

## 2026-08-25 — 游戏 UI 复刻版 Tab Modal V2

**Implementation**

- V2 继续通过 `?ui=tab-v2` 启用，旧版默认入口不变。
- 五个项目 Tab 固定为“目标 / 本机 / 仓库 / 文献 / H.D.D”，分别对应游戏的目标、日常、训练、作战、战术视觉状态。
- 外框、Tab 状态、左栏、卡片壳、进度轨道、HUD、箭头和页面图像使用拆分后的游戏素材；业务数据与文字仍由真实 React/既有业务适配层渲染。
- 没有把整张游戏截图作为运行时背景，也没有删除旧版素材或业务处理。

**Functional evidence**

- `pnpm test`：8 个测试文件、22/22 通过。
- `pnpm run build`：通过。
- `git diff --check`：通过，仅有既有 LF→CRLF 提示。
- 浏览器已验证默认“本机”、五 Tab 唯一选中、外框/Tab 轨道/关闭按钮几何稳定、真实 `scrollLeft` 变化、箭头边界、关闭返回总览和控制台无 error/warn。
- 功能证据：[.harness/qa/obsui/tab-modal-v2/functional/report.md](/F:/ResearchKB/.harness/qa/obsui/tab-modal-v2/functional/report.md)。

**Visual evidence and open gate**

- 实现侧五状态截图和几何记录保存在 `.harness/qa/obsui/tab-modal-v2/visual/`。
- 当前浏览器实际视口为 `1280×720 CSS px / DPR 1.25`；1920×1080、2560×1440、125%/150% 的浏览器逐项复核尚未完成。
- 原始游戏截图与实现截图尚未完成同一视口逐状态并排确认，且尚未得到用户的视觉确认；所以本节只记录为“功能通过、视觉待确认”。
- 视觉证据：[.harness/qa/obsui/tab-modal-v2/visual/report.md](/F:/ResearchKB/.harness/qa/obsui/tab-modal-v2/visual/report.md)。

final result: blocked

## 2026-08-25 — TabModalV2 从零重建（功能通过，视觉待用户确认）

**Implementation**

- 新增 `src/tab-modal-v2/` 独立组件树：`TabModalV2`、`TabModalShell`、`TopTabs`、`LeftNavPanel`、`ContentViewport`、`ContentCard`、`ActionButton`、`CardRail`。
- V2 仅由 `?ui=tab-v2` 启用，默认选中“本机”；无 query 的旧版入口、旧外壳资源和旧 DOM 保留。
- 外框、Tab、左栏、内容视口和卡片均为真实 HTML/CSS/React；卡片轨道使用实际 `scrollLeft`、箭头边界和指针拖动，不使用整块运行时截图、整体缩放或 `zoom`。
- H.D.D 请求/会话逻辑抽为 `useHddChat`，旧版继续使用旧 DOM，V2 使用独立 H.D.D 页面结构。

**Browser evidence**

- 1920×1080、2560×1440、等效 125%/150% DPI 视口检查通过；五个 Tab 的外框、Tab 轨道、关闭按钮坐标稳定。
- 五个 Tab 顺序、业务映射、左栏选择、关闭/焦点恢复、真实横向滚动和控制台无 error/warn 已验证。
- 证据目录：`F:\ResearchKB\.harness\qa\obsui\tab-modal-v2\`。

**Open gate**

- 功能验收：通过。
- 视觉验收：待用户在同一视口完成参考素材与实现截图并排确认后再标记通过；当前不宣称像素级视觉通过。

---

## 2026-08-24 — 高密度外壳与无矩形遮罩修正（视觉待用户确认）

**Correction**

- 五张 688px 原始 RGBA 外壳继续是唯一视觉来源；`scripts/prepare_device_shells.py` 以预乘 Alpha 的 Lanczos 重采样生成统一 `2064×1119`（3×）资源，运行时不再进行 `scaleY()`。
- `.device-workspace` 已清除 `box-shadow`、遗留背景图与滤镜；外壳图片也无 transform/filter。背景毛玻璃只保留在覆盖完整视口的 `.device-modal::before`，因此不再由工作区盒模型投射长方形明暗边界。

**Chrome regression check**

- 临时固定 Chrome 为 `1552×854 CSS px` 后逐一切换目标、本机、仓库、文献、H.D.D：工作区均为 `216, 123.6, 1120, 607.2`，内容开口、Tab 命中区和关闭键的 `getBoundingClientRect()` 均完全一致。
- 运行时五张图片的自然尺寸均为 `2064×1119`，computed transform 为 `none`；工作区的 `background-image`、`box-shadow` 和 `filter` 均为 `none`；背景伪元素为完整 `1552×854` 覆盖。
- 背景点击仍不关闭弹窗，`inert` 阻止仪表台和侧栏聚焦；Escape 会关闭弹窗并恢复“状态监控”入口焦点。
- `pnpm test` 通过（7 个测试文件、19 项）；`pnpm build` 通过；`git diff --check` 无 whitespace error（仅既有 CRLF 提示）。

**Open gate**

截图与自动化几何检查只能证明实现条件已满足，不能替代用户对真实 Chrome 显示密度下的视觉判断。本节 `final result: blocked`，待用户确认 Tab 字体、外轮廓、透明边、主体融合和 H.D.D 右缘后再更新。

final result: blocked

---

## 2026-08-24 — 一体式弹层尺寸、外壳校正与模态遮罩（待用户确认）

**Comparison target**

- 用户确认的尺寸意图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-9bccee50-8b0b-4103-af4d-9b42ace3b22b.png`；目标为比该预览再大一圈的居中设备弹层。
- 外壳视觉真值：`assets/reference/device-shell/shell-{target,local,repository,literature,hdd}.png`。这些原图仍是唯一外壳来源，未使用生成的预览图作为应用资产。
- 浏览器证据：`.harness/qa/obsui/device-modal-20260824/device-modal-{target,local,repository,literature,hdd}.png`；同画布源图/实机对照：`source-vs-live-five-device-modal.png`。
- 验收环境：应用内浏览器 CSS 视口 `1280 × 720`，弹层根盒为 `1120 × 607.2 CSS px`，中心为 `(640, 360)`；小屏复核视口为 `640 × 720`。

**Findings**

- [P1 fixed] 五张外壳此前虽然 DOM 盒一致，但原图不透明高度为 `368–373 px`，切换时底边会出现最多 5px 的视觉跳动。现保留原图，并以顶部为锚点应用 `1.0000–1.0136` 的纵向微量校正；五种状态的有效可见高度均为 `607.2 CSS px`。
- [P1 fixed] 弹层不再受旧 `688px` 上限限制。默认视口下外壳根盒为 `1120 × 607.2 CSS px`，同一位置、同一内容开口和同一 Tab 命中区在五种状态间保持不变；小屏根盒为 `608 × 329.625 CSS px`，左右各保留 16px。
- [P1 fixed] 打开功能面板后，侧栏和仪表台带 `inert`，背景命中点为 `.device-modal`，且遮罩实测为 `blur(14px) saturate(.72) brightness(.74)` 与半透明深色层；背景不能点击或获得键盘焦点。
- [P1 fixed] 右上关闭键和 Escape 均可关闭；关闭后焦点恢复至原入口。焦点循环测试保持在 `.device-workspace` 内。

**Fidelity surfaces**

- 字体与文字：仍由现有内容组件提供；外壳内置 Tab 字样、材质和轮廓未被 CSS 重绘。内容缩放随同一设备画布等比变化，无跨 Tab 的字号跳动。
- 间距与布局：五个状态的外壳根盒、Tab 容器和内容开口坐标最大差为 `0`；原始外壳透明底边由同一基线校正，关闭键与 H.D.D. 右缘完整。
- 颜色与视觉 tokens：遮罩仅在弹层外使用深色半透明与毛玻璃；设备本体继续使用原始黑、橙、黄和灰色栅格像素，未新增承托边框或独立 Tab 接缝。
- 图像质量与资产：每个状态仅显示对应的单张原始外壳底图；五态并排图未见透明晕边、额外框线、H.D.D. 裁切或底部收口缺失。
- 文案与内容：目标/本机/仓库/文献/H.D.D 的功能内容维持原行为；H.D.D. 对话布局仅改变内容开口内部，不移动外壳结构。

**Verification**

- [x] 浏览器逐一点击五个 Tab：每次唯一选中，根盒、Tab 与内容开口几何一致。
- [x] 状态监控、知识资源、工作台设置入口分别打开本机、文献、H.D.D.；关闭与 Escape 恢复到入口。
- [x] 默认视口 1120px 上限与 `640 × 720` 小屏 16px 边距。
- [x] 浏览器控制台无 error/warn；`pnpm test` 为 6 个测试文件、17 项通过；`pnpm build` 通过。

**Open gate**

实机五态和同画布源图对照已保存，但用户尚未确认最终 1120px 大小、模糊强度与整体观感。本节保持 `final result: blocked`；构建、自动化测试和几何检查不替代这次视觉确认。

final result: blocked

---

## 2026-08-22 — 连体可拖动卡片与边界修正

**Findings**

- [P1 fixed] 可移动项改为源图四卡整排的连续切片：每张卡片都携带对应的顶部连接轨道和内容，不再使用与上沿脱节的重复小卡片外壳。
- [P1 fixed] 四张初始卡片的切片宽度严格等于源图卡槽宽度；1280 × 720 预览中第四张卡右边界为 `1175.15px`，轨道右边界为 `1175.18px`，未超出框架。
- [P1 fixed] 移除卡片底部的椭圆按钮装饰；首张卡片以相邻原始卡片的下部机壳纹理覆盖该区域，未新增绘制素材。
- 内容由 `RailCard` 包裹，卡片背景、连接轨道和内容在同一个横向轨道中移动；超过四项时在同一框架内横向滚动。

**Verification**

- [x] 应用内浏览器在 1280 × 720 下实拍“目标”和“本机”状态：四卡完整贴合于框架内，顶部连接轨道连续，底部无椭圆装饰。
- [x] “本机”视图有 8 个卡片单元，轨道 `scrollWidth: 2006px`、`clientWidth: 1003px`，确认额外内容保留在同一可横向拖动轨道。
- [x] `pnpm run build`
- [x] `pnpm test` — 5 个测试文件、14/14 通过。

final result: passed

---

## 2026-08-22 — 滑动卡槽与固定外框精确对齐（当前验收）

**Comparison target**

- Source visual truth: `F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（1672 × 941 px；即用户提供的 `C:\Users\86159\Desktop\板块.png`）。
- Browser-rendered initial state: `F:\ResearchKB\.harness\qa\obsui\device-panel-source-aligned-initial.png`（1280 × 720 px；CSS viewport 1280 × 720；devicePixelRatio 1）。
- Browser-rendered dragged state: `F:\ResearchKB\.harness\qa\obsui\device-panel-source-aligned-dragged.png`（同一视口与密度）。
- Same-canvas focused comparison: `F:\ResearchKB\.harness\qa\obsui\device-panel-source-aligned-comparison.png`。左侧为原图四卡长槽，右侧为等尺寸归一化的初始实现；只比较用户指定的固定外框、卡片壳体、橙色扣件、黑色内容区与下方铭牌区。
- State: “本机”初始四个原始卡槽，随后真实指针拖动至下一组卡片。

**Findings**

- No actionable P0/P1/P2 differences remain in the sliding-board region.
- Intentional difference: 源图首卡下方有椭圆按钮，用户先前明确要求删除；实现保持同一灰色面板纹理而不保留该装饰。

**Fidelity surfaces**

- Fonts and typography: 外框及选中标签的字形仍为原图栅格素材；动态数据文字保持清晰，置于黑色信息区，名称置于下方灰色铭牌区。
- Spacing and layout rhythm: 机壳现在严格使用原图 `1672 / 941` 比例；固定可视区按原图 `(252, 302)–(1518, 814)` 定位。四个初始卡的宽度/间隙按源图保留为 `333/20/302/21/281/18/291 px`，不再错误地等宽拉伸。
- Colors and image quality: 固定外框恢复为未经改色的原图；所有可见卡片、斜纹内容槽和扣件均来自相应原图裁切，没有额外的黑色顶带、CSS 绘制壳体或替代美术。
- Copy and content: 现有监测数据在卡片内可读；首卡、性能卡与后续说明卡都随同一轨道移动。

**Focused interaction evidence**

- 初始四卡几何（CSS px）：首卡 `192.89–447.86`、第二卡 `463.21–694.38`、第三卡 `710.50–925.66`、第四卡 `939.48–1162.19`；固定长槽为 `192.89–1162.11`。对应宽度与源图非等宽卡槽一致，右侧边缘由固定外框裁切。
- 真实指针拖动后：`scrollLeft` 从 `0` 到 `517.60px`；第五张卡范围为 `658.40–913.38px`，完整处于固定视口 `192.89–1162.11px` 内。
- 控制台最近刷新会话仅有 Vite 连接和 React DevTools 信息，没有运行时错误；`pnpm run build`、`pnpm test`（14/14）和 `git diff --check` 通过。

**Comparison history**

- Earlier P1: 使用 `1680 / 912` 容器和等宽卡片，使机壳背景在 `contain` 缩放下与卡槽发生相对偏移，产生额外的顶带和错误的卡片节距。
  Fix: 容器改为源图实际 `1672 / 941` 比例并填满原图；固定可视区、四张卡的宽度与间距改为源像素坐标。
  Post-fix evidence: 同画布对比显示固定上框、外侧圆角、橙色扣件与四张非等宽卡的边缘均重新对齐。

**Implementation checklist**

- [x] 固定外框保持源图比例和位置，不参与横向滚动。
- [x] 初始四张卡按源图原始非等宽节距显示。
- [x] 卡片、其内容和首卡扣件一起移动；额外卡片可在拖动后完整显示。
- [x] 删除用户不需要的首卡底部椭圆装饰。

final result: passed

---

## 2026-08-22 — 历史验收：整组停靠与连续卡槽（已由自由拖动方案替代）

**Comparison target**

- Source: `F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（用户的 `C:\Users\86159\Desktop\板块.png`，1672 × 941 px）。
- Implementation: `F:\ResearchKB\.harness\qa\obsui\device-panel-group-start-aligned.png` 和 `F:\ResearchKB\.harness\qa\obsui\device-panel-group-final-aligned-late.png`（1280 × 720 px；CSS 1280 × 720；`devicePixelRatio: 1`）。
- Same-canvas focused evidence: `F:\ResearchKB\.harness\qa\obsui\device-panel-group-final-aligned-comparison.png`，将同一四卡区域标准化为 969 × 392 px 并并排检查；原图椭圆按用户要求移除后再比较。
- Interaction evidence: 松手后的起始组与末组均为完整四卡状态；状态为“本机 → 状态监控”，动态内容叠加于原图指定的数据区。

**Findings**

- [P1 fixed] 单卡裁切缩放导致的黑缝、非原始大间隙和圆角断裂，已改为单张连续四卡原图作为整体轨道背景；透明内容层与对应卡组同步移动。
- [P1 fixed] 续接卡组与首组均为 `1266 × 512` 源像素；真实拖至末端时 `scrollLeft: 968.80 / 969`，首组右缘为 `193.26px`、续接组左缘为 `193.26px`，刚好在固定轨道左缘 `192.89px` 停靠。因此两端都不会留下半张卡或断开的左侧小条。
- [P1 fixed] 续接组恢复为同一张四卡源图的完整节距：`333 / 20 / 302 / 21 / 281 / 18 / 291 px`。卡宽、间隙、圆角和最右卡边界与首组一致，不再将中间卡缩成不属于样图的窄卡，也没有末端的额外黑色空隙。
- [P2 fixed] 顶部连接轨只作为每组的一整条连续源图层绘制；重复组的橙色扣件被移除而卡片机壳保留。各组停靠时，轨道和第一张卡的左缘同步抵达固定边界，消除了顶部突起与首卡左侧断裂。
- 无可行动的 P0/P1/P2 问题。字体、间距、石墨灰色壳体、斜纹黑色信息区、原图圆角和橙色扣件均已在同画布对照中复核；唯一壳体差异是用户明确要求删除的底部椭圆。

**Implementation checklist**

- [x] 固定外框保持原图比例，不参与拖动。
- [x] 原图四卡壳体、卡距、圆角和顶部连接轨作为连续图层整体移动，并在松手后停靠到完整组边界。
- [x] 动态内容处于黑色信息区，名称处于下方灰色铭牌区。
- [x] 本机、目标、仓库、文献和 H.D.D. 均固定生成两组共享卡组；浏览器实测每个页面均为 `groups: 2`、`scrollWidth: 1938px`、`clientWidth: 969px`，真实拖动松手后均停靠到 `scrollLeft: 968.80 / 969px`。
- [x] `pnpm run build`、`pnpm test`（14/14）和 `git diff --check` 通过。

**Follow-up polish**

- [P3] 若未来需要三组以上的长期卡片内容，可基于同一原图制作更长的连续带图；当前两组的连接节距沿用原图黑缝并已通过拖动验收。

final result: passed

---

## 2026-08-22 — 自由拖动、组间间隙与左缘复核

**Comparison target**

- Source: `F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（用户提供的 `C:\Users\86159\Desktop\板块.png`）。
- Same-canvas source comparison: `F:\ResearchKB\.harness\qa\obsui\device-panel-group-free-drag-comparison.png`。左侧为源图四卡壳体，右侧为同尺寸的本机起始状态。
- Free-drag evidence: `F:\ResearchKB\.harness\qa\obsui\device-panel-group-free-drag-start.png`、`F:\ResearchKB\.harness\qa\obsui\device-panel-group-free-drag-mid.png` 与 `F:\ResearchKB\.harness\qa\obsui\device-panel-group-free-drag-end.png`；均为 1280 × 720 CSS 像素、同一“本机 → 状态监控”状态。

**Findings**

- [P1 fixed] 删除整组停靠和 CSS 滚动捕捉。真实指针拖动 `300px` 后轨道稳定保持 `scrollLeft: 300px`，松手不会回弹；五个标签页均实测可继续自由左右拖动。
- [P1 fixed] 续接组最前方插入原图 `18px` 黑色卡槽间隙，并作为移动图层的一部分。中途拖动时首组右缘为 `862.06px`、续接首卡左缘为 `875.84px`，中间保留 `13.78 CSS px` 的原图比例空隙，卡片不再相连。
- [P1 fixed] 使用已清除烘焙卡片残影的固定外框。拖至末端时续接卡组左缘可在轨道外侧，但首张可见卡的左缘为 `193.44px`，与固定轨道左缘 `192.89px` 对齐；没有任何首卡左侧细边残留在固定框上。
- 续接卡片仍使用与首组相同的源图非等宽节距和圆角；顶部轨道保持连续，卡片下方没有用户已要求移除的椭圆按钮。

**Verification**

- [x] 本机、目标、仓库、文献、H.D.D.：每页 `groups: 2`、`clientWidth: 969px`、`scrollWidth: 1952px`；真实拖动后均保持 `scrollLeft: 300px`。
- [x] `pnpm run build`。
- [x] `pnpm test` — 5 个测试文件，14/14 通过。
- [x] 浏览器控制台只有 Vite/React 开发信息，无运行时错误；`git diff --check` 通过。

final result: passed

---

## 2026-08-22 — 单一移动带图与完整末卡复核（当前验收）

**Comparison target**

- Source: `F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（用户提供的 `C:\Users\86159\Desktop\板块.png`）。
- Same-canvas initial comparison: `F:\ResearchKB\.harness\qa\obsui\device-panel-single-belt-comparison.png`。左侧为原图固定视口中的四卡，右侧为单一移动带图的相同 `1266 × 512 px` 初始切片。
- Group-join detail: `F:\ResearchKB\.harness\qa\obsui\belt-join-complete.png`。
- Cleared fixed-frame edge: `F:\ResearchKB\.harness\qa\obsui\clean-frame-left-zoom-v2.png`。

**Findings**

- [P1 fixed] 固定外框原先仍保留源图卡片及其向外溢出的阴影像素，导致第一张卡移走后左侧留下固定细边。生成外框时现已清除整个烘焙卡片区，并在四周额外清除 `8px`；卡壳、阴影和橙色扣件只存在于可移动 `.page` 图层。
- [P1 fixed] 相邻 DOM 卡组不再各自绘制背景。全部八张卡、顶部轨道和首卡扣件由一张连续移动带图承载，组边界没有两层边缘或固定突起。
- [P1 fixed] 原素材中的第四张卡被固定视口裁掉右缘，直接重复原图必然在拖动后露出方形断边。现以完整源卡壳补全第四张卡为 `302px`，并保留初始视口裁切流程：未拖动时仅遮住末端约 `11px`，向左拖后显示完整圆角。
- [P1 fixed] 每组宽 `1277px`，组间使用与原图节奏一致的 `20px` 黑色间隙；接缝细节中两侧均为完整圆角和独立阴影，没有双竖边、粘连或窄卡。

**Interaction evidence**

- 应用内浏览器实测轨道 `clientWidth: 605px`、单组 `609.775px`、总宽 `1229px`；初始状态第四张卡被右边框轻微遮挡，符合样图流程。
- 真实指针拖动后保持 `scrollLeft: 430.40px`（最大 `624px`），第一组右缘 `299.69px`、第二组左缘 `309.24px`，实际可见间隙 `9.55 CSS px`；橙色扣件随 `.page` 左移并完全离开固定框，没有遗留细边。
- 目标、本机、仓库、文献和 H.D.D. 五页均为两组卡片，实测拖动后全部保持 `scrollLeft: 430.40px`，无回弹或失效。
- 最后一次页面重载后只有 Vite 连接与 React 开发提示，无新的运行时错误。

**Verification**

- [x] `pnpm run build`。
- [x] `pnpm test` — 5 个测试文件，14/14 通过。
- [x] `git diff --check`。

final result: passed

---

## 2026-08-22 — 被裁切卡片右缘复核（当前验收）

**Comparison target**

- Defect capture: `C:\Users\86159\AppData\Local\Temp\codex-clipboard-68cfd73d-69dc-4b52-85f0-29d625102eaf.png`。
- Before/after same-canvas comparison: `F:\ResearchKB\.harness\qa\obsui\card-right-edge-before-after.png`。左侧为用户指出的方形断边，右侧为相同卡片节距下补全后的圆角边界。
- Completed edge detail: `F:\ResearchKB\.harness\qa\obsui\card-right-edges-complete.png`。

**Findings**

- [P1 fixed] 第二、第三及其重复卡片使用的源素材本身在右侧裁切线处结束，因此外层灰色机壳呈方形截断；这不是轨道遮挡或间隙问题。
- [P1 fixed] 从第一张源卡片的完整右缘提取 `32px` 原始圆角、阴影及灰色边框，原位补回被裁切卡片；没有改变卡宽、卡距、内容区或文字位置。
- 补全后每张卡的右上角、右侧竖边、右下角和黑色信息区圆角均连续；外框、组间 `20px` 间隙、滑动范围及首卡扣件保持上一轮通过状态。

**Verification**

- [x] 应用内浏览器加载最新 `device-card-belt.png`，轨道仍为两组、`clientWidth: 605px`、`scrollWidth: 1229px`。
- [x] 真实指针拖动后保持 `scrollLeft: 330.40px`，最大范围仍为 `624px`，未破坏自由滑动。
- [x] 最新页面日志只有 Vite 连接与 React 开发提示，无运行时错误。
- [x] `pnpm run build`、`pnpm test`（14/14）和 `git diff --check` 通过。

final result: passed

---

## 2026-08-22 — 滑动窗口固定右边框复核（当前验收）

**Comparison target**

- Defect capture: `C:\Users\86159\AppData\Local\Temp\codex-clipboard-37701772-e488-42b0-8604-9117e6e55edb.png`。
- Before/after same-canvas comparison: `F:\ResearchKB\.harness\qa\obsui\right-frame-before-after.png`。左侧为被清理区截断的右框，右侧为卡片滑过时恢复后的原图圆角右框。
- Live-layer composite: `F:\ResearchKB\.harness\qa\obsui\right-border-live-composite.png`。

**Findings**

- [P1 fixed] 清除固定卡片残影时使用的 `8px` 外扩区域覆盖了滑动窗口从 `x=1518` 开始的固定右框，造成上、下圆角处出现方形缺口。
- [P1 fixed] 在残影清理之后，仅从原图恢复 `(1518, 286)–(1531, 830)` 的固定右框像素；卡片层仍止于 `x=1518`，不会重新引入固定卡片细边。
- 恢复后的右框保持原图的黑色内沿、上下圆角和外侧铆钉边框；卡片、内容、间距及顶部轨道继续在框内自由滑动。

**Verification**

- [x] 应用内浏览器已加载新的 `device-panel-clean.png`；真实拖动后 `scrollLeft: 270.40px`，最大范围仍为 `624px`。
- [x] 轨道尺寸保持 `clientWidth: 605px`、`scrollWidth: 1229px`，右边框修改没有改变布局或裁切范围。
- [x] 最新页面日志只有 Vite/React 开发信息，无运行时错误。
- [x] `pnpm run build`、`pnpm test`（14/14）和 `git diff --check` 通过。

final result: passed

---

## 2026-08-22 — 外框连续性、弹窗比例与全标签选中态复核（当前验收）

**Comparison target**

- Source: `F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（用户提供的 `C:\Users\86159\Desktop\板块.png`）。
- Defect captures: `codex-clipboard-fd8948de-5552-4fd2-aaf5-8eb2764ed64e.png`、`codex-clipboard-81a2aa4e-7185-4a74-872f-bae0100898c4.png` 及四张非本机选中态截图。
- Same-canvas comparison: `F:\ResearchKB\.harness\qa\obsui\latest-frame-and-tabs-comparison.png`。上半部并列原始外框与实时卡带合成，下半部集中展示五个完整标签状态。

**Findings**

- [P1 fixed] 固定外框清理区此前向上、下、右各外扩 `8px`，把滑动窗口自身的圆角边界一起替换成直角黑纹理，形成上方黑色长方形越界和右框断裂。清理区现限定为 `(244, 302)–(1518, 814)`：只移除烘焙卡片及左侧阴影，原图上沿、下沿与完整右框保持不动。
- [P1 fixed] 弹窗由最多 `96vw`（窄高视口曾被媒体查询放大至 `100vw`）统一改为最多 `90vw / 1505px`。当前 `798 × 698` 验收视口中，弹窗从 `798px` 缩至 `718.55px`，比例仍为原素材 `1672:941`。
- [P1 fixed] 目标、仓库、文献与 H.D.D. 的黑字不再使用会向外膨胀并发糊的低阈值蒙版；改为高亮核心提取，保留各自原图字形，清晰度与本机选中态一致。
- 五个选中态继续使用完整栅格标签条，灰色标签、接缝、下方横轨和端点没有被 CSS 重绘或重复叠加。

**Interaction evidence**

- 应用内浏览器实测弹窗 `718.55 × 404.39px`，滑动窗口 `544.10 × 220.04px`，`clientWidth: 544px`、`scrollWidth: 1106px`、`overflow-x: auto`。
- 目标、本机、仓库、文献和 H.D.D. 均执行真实指针拖动；每个板块都从 `scrollLeft: 0` 稳定移动至 `390.40px`，没有回弹、失效或越过固定框。
- 拖动前后截图检查：卡带上方无黑色矩形越出圆角外框，右侧黑色内沿及上下圆角连续，末卡只在视口内被裁切。
- 五个标签点击后均加载对应单选栅格条；最后恢复本机且 `scrollLeft: 0`，便于继续验收。

**Verification**

- [x] `pnpm run build`。
- [x] `pnpm test` — 5 个测试文件，14/14 通过。
- [x] `git diff --check`。
- [x] 页面日志只有 Vite 连接与 React 开发提示，无运行时错误。

final result: passed

---

## 2026-08-22 — 原图右框与选中标签二次校正（当前验收）

**Comparison target**

- 唯一外观基准：`F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（用户提供的 `C:\Users\86159\Desktop\板块.png`）。
- 放大像素对照：`F:\ResearchKB\.harness\qa\obsui\current-frame-inspection.png`；完整面板与五个选中标签对照：`F:\ResearchKB\.harness\qa\obsui\latest-frame-and-tabs-comparison.png`。

**Findings**

- [P1 fixed] 第四张卡片此前整张复用了补全卡，和原图在右侧遮挡交界的亮度、弧线不连续。现保留原图中从左至右实际可见的 `291px` 卡片与固定右框，只从完整卡片补足原图遮住的末端；初始状态与原图连续，拖到左侧后仍可显示完整圆角卡片。
- [P1 fixed] 目标、仓库、文献与 H.D.D. 选中态此前从本机标签整块缩放生成，导致边框、接缝和字体都偏离各自原始标签。现保留每个分类自身的灰色外壳、黑色接缝和端点，只替换内侧黄色面，并以清晰的黑色字形居中绘制；本机继续使用原图的原始选中状态。
- [P1 fixed] 本机变为未选中状态时，原来在下沿残留的黄色细线已清除。五种选中状态均没有额外黄框、重叠接缝或发糊字形。

**Fidelity review**

- Typography：各标签保留原图的白字/黑字层级和倾斜表现；选中黑字清晰、居中，无蒙版膨胀或模糊。
- Layout and spacing：滑动窗口、卡片间隔、首卡扣件和右侧固定框按原图栅格保留；卡带仅在窗口内裁切。
- Colors and imagery：黄、灰、黑色材质及圆角边框全部来自原图栅格，不以 CSS 重绘替代。
- Content：各面板仍显示原有数据；数据位于卡片黑色内容区，名称位于内容区下方的灰色区域。

**Interaction evidence**

- 应用内浏览器中逐一点击目标、本机、仓库、文献、H.D.D.；每一项均成为唯一选中标签。
- 对五个分类分别进行了真实指针拖动，均从 `scrollLeft: 0` 变为 `430.40px`；没有失效、越界或留下固定卡片细边。
- 滑动窗口为 `clientWidth: 544px`、`scrollWidth: 1106px`、最大范围 `562px`；最终已恢复本机选中、`scrollLeft: 0`。

**Verification**

- [x] `pnpm run build`。
- [x] `pnpm test` — 5 个测试文件，14/14 通过。
- [x] `git diff --check`（只有既有工作区文件的行尾警告，无 diff whitespace error）。
- [x] 页面日志仅有 Vite 连接和 React DevTools 提示，无运行时错误。

final result: passed

---

## 2026-08-22 — 选中字形与右侧轨道残留修正（历史记录）

**Comparison target**

- 原始视觉材料：`F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（用户提供的 `C:\Users\86159\Desktop\板块.png`）。
- 实现材料：本地预览 `http://127.0.0.1:5173/`；应用内浏览器在 `798 × 698 CSS px` 视口中实际点击和拖动。
- 同画布全图与五个标签状态：`F:\ResearchKB\.harness\qa\obsui\latest-frame-and-tabs-comparison.png`；右侧局部放大：`F:\ResearchKB\.harness\qa\obsui\current-frame-inspection.png`。原图为 `1672 × 941 px`，预览弹窗按固定 `1672:941` 比例缩放。

**Comparison history and findings**

- [P1 fixed] 非本机选中态曾使用直立的替代字体，字形的倾斜、边缘观感和暖色阴影均与原图本机选中态不一致。现替换为与原图标签同类的斜体显示字形，按本机的可见大小居中绘制，并加入紧凑暖色投影；本机的原始栅格字形保持不变。
- [P1 fixed] 用户截图中最右侧出现的长条灰色固定残影位于可滑动内槽，卡带移动时不应保留。已以原图黑色内槽纹理替换 `(1518, 302)–(1567, 814)`，保留此区域外的面板装饰；初始状态不再显示该灰条，完整末卡仍可在向左拖动后出现。

**Fidelity review**

- Fonts and typography：五个标签的未选中白字仍为原图栅格；本机选中保持原始黑字；其他选中黑字采用同类斜体、相同的紧凑阴影层级，未再使用直立粗体或模糊蒙版。
- Spacing and layout rhythm：标签外壳、相邻接缝、卡片宽度、卡距与滑动窗口比例未改变；右侧仅清理轨道内残留，未改变拖动范围。
- Colors and visual tokens：黄色选中面、灰色标签壳、黑色轨道和暖色字影均继续取自原图颜色关系。
- Image quality and asset fidelity：设备外壳、卡带、圆角、纹理和扣件均继续使用用户提供原图的栅格资产；未以 CSS 图形替代。
- Copy and content：标签文案与原有板块数据保持不变。

**Interaction and verification**

- [x] 应用内浏览器逐一点击目标、本机、仓库、文献、H.D.D.，每项都正确进入唯一选中状态；最后恢复本机。
- [x] 仓库状态下执行真实指针拖动：`scrollLeft` 从 `0` 到 `430.40px`；轨道为 `clientWidth: 544px`、`scrollWidth: 1106px`。
- [x] 页面日志仅有 Vite 连接和 React DevTools 提示，无运行时错误。
- [x] `pnpm run build` 通过。
- [x] `pnpm test` — 5 个测试文件，14/14 通过。
- [x] `git diff --check`（仅有既有工作区文件的行尾警告，无 whitespace error）。

final result: passed

---

## 2026-08-22 — 顶部标签按原图像素重建（最终验收）

本节覆盖本轮用户提供的示意图与四张非“本机”选中截图；较早记录只保留为历史背景。

**实现**

- `rebuild_device_assets.py` 不再导入 `ImageFont`/`ImageDraw`，也不再重绘文字、生成文字遮罩或按标签宽度拉伸。
- 五个状态均由完整的 `device-tabs/strips/*.png` 条带提供：原图统一提供几何与底部横轨，用户截图提供非“本机”选中态的实际字形像素。
- `App.tsx` 仅按状态切换一张条带图；按钮只保留透明命中区、`aria-pressed` 和隐藏辅助文本。CSS 不再绘制伪元素、滤镜、额外阴影或焦点外框。

**验收**

- [x] 应用内浏览器依次点击五个标签，每个状态恰有一个 `aria-pressed="true"`，最后恢复“本机”。
- [x] 五个状态已保存同尺寸浏览器截图并与条带源图做对照；选中面、左右接缝、底部横轨和末端裁切保持单层连续结构。
- [x] 鼠标点击与键盘 Tab 聚焦均无可见蓝色轮廓；伪元素为 `none`，按钮 `box-shadow` 为 `none`。
- [x] `pnpm build`、`pnpm test`（5 个测试文件、14/14）和 `git diff --check` 通过。

最终结果：通过

---

## 2026-08-22 — 标签底图双层与边缘污染修正（本轮最终验收）

**Comparison target**

- 几何、灰色未选中态与“本机”选中态：`F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`（用户提供的 `板块.png`）。
- 目标、仓库、文献、H.D.D 选中像素：`F:\ResearchKB\.harness\qa\obsui\reference-tabs\goal-selected.png`、`repository-selected.png`、`literature-selected.png`、`storage-strip-reference.png`。
- 实现截图：`F:\ResearchKB\.harness\qa\obsui\live-finalqa-goal.png`、`live-finalqa-local.png`、`live-finalqa-repository.png`、`live-finalqa-literature.png`、`live-finalqa-storage.png`。
- 同输入的组合对照：`F:\ResearchKB\.harness\qa\obsui\qa-final-full-comparison.png`（完整面板）与 `qa-final-tab-comparison.png`（五状态聚焦条带，源图和实现逐行交替）。

**Earlier finding and fix**

- [P1 fixed] `device-panel-clean.png` 仍保留原图中“本机”黄色标签，而 `.device-tabs` 又叠加一条状态条带；切换到其它状态时，两层的边缘、底轨和黄色像素互相泄漏，形成用户指出的毛边与左侧灰色残留。
- [P1 fixed] 本机未选中条带曾直接从带有邻接选中态的截图裁剪，邻接黄色抗锯齿像素进入本机灰色外壳。
- 修复：在面板底图的原始标签矩形 `(552,30)-(1533,130)` 清空像素，只由一条完整状态条带显示标签；所有选中裁剪按原图标签 alpha 轮廓硬遮罩，保留统一底轨；本机未选中先保留本机外壳，再以去色的灰色像素和本机白字覆盖，清除邻接黄色污染；预加载五条条带，避免首次点击出现空白帧。

**Fidelity review**

- Fonts and typography：文字全部来自提供的栅格截图或示意图，未使用 `ImageFont`、`draw.text` 或 CSS 重绘；未选中保持白字，选中保持黑字与原始倾斜边缘。
- Spacing and layout rhythm：面板按 `1672:941` 原图比例渲染；标签条带固定在源图锚点，五个命中区只负责交互，不改变几何。
- Colors and visual tokens：底图标签窗口彻底清空；本机未选中区域已去除黄色 RGB 泄漏；选中黄色面、黑色边框、底部横轨仅出现一层。
- Image quality and asset fidelity：所有可见标签均为源像素条带；选中态使用原图轮廓遮罩，未再叠加伪元素、滤镜、阴影或焦点框。
- Copy and content：五个标签仍为“目标 / 本机 / 仓库 / 文献 / H.D.D”，面板主体和卡片内容未改动。

**Normalized comparison**

- 浏览器视口与实现截图：`1280 × 720 CSS px`，`devicePixelRatio = 1.25`；实现截图为 `1280 × 720 px`。
- 源面板：`1672 × 941 px`，按原比例归一化到 `1280 × 720` 后与实现全图比较。
- 聚焦条带：实现取同一视口的 `751 × 77 px` 标签区域；四张状态参考截图先按其实际尺寸裁出完整条带，再归一化到相同尺寸；本机状态直接与源面板同尺寸归一化结果比较。

**Interaction evidence**

- 依次点击五个标签后，五次均恰有一个 `aria-pressed="true"`；最后恢复“本机”。
- 每个状态的背景资源均已预加载并在 `300ms` 稳定等待后可见，无空白条带。
- CSS 伪元素为 `none`，标签按钮无 `box-shadow`、额外边框或过渡层；浏览器控制台没有运行时错误。

**Verification**

- [x] `pnpm build`。
- [x] `pnpm test` — 5 个测试文件，14/14 通过。
- [x] `git diff --check`（仅有既有工作区行尾警告，无 whitespace error）。

final result: passed

---

## 2026-08-22 — 标签面板坐标系修正（最终复核）

**Earlier finding**

- [P1 fixed] 面板使用 `90vw` 限宽，导致 1672×941 原图在视口中整体缩小；标签条带的左右锚点、黄底宽度和底部横轨随之产生系统性漂移。

**Fix**

- `.device-workspace` 改为按标准图比例填充可用视口：`min(100vw, calc(100vh * 1672 / 941), 1672px)`；标签仍由同一张完整状态条带提供。

**Post-fix evidence**

- 源图：`F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png`，1672×941。
- 修正后实现：`F:\ResearchKB\.harness\qa\obsui\current-audit-live-fixed-local.png`，1280×720，CSS 视口 1280×720，devicePixelRatio 1.25。
- 标签聚焦对照：`F:\ResearchKB\.harness\qa\obsui\live-fixed-crops-comparison.png`；五个状态均按 750×76 CSS 区域与源条带等比例对照，平均像素差约 7.3–9.8（浏览器重采样误差范围）。

**Verification**

- [x] 目标、本机、仓库、文献、H.D.D. 依次点击；每次一个 `aria-pressed="true"`，最终恢复本机。
- [x] 伪元素为 `none`，按钮无 `box-shadow`，可见焦点轮廓为 0px。
- [x] `pnpm build`、`pnpm test`（5 个测试文件、14/14）和 `git diff --check` 通过。

最终结果：通过

---

## 2026-08-22 — 双层标签底图清理后的最终复核

- 对照源：`F:\ResearchKB\apps\ObsUI\assets\reference\device-panel.png` 与四张选中态参考截图。
- 实现证据：`F:\ResearchKB\.harness\qa\obsui\qa-final-full-comparison.png`、`qa-final-tab-comparison.png`；五个实现状态截图均为 `1280 × 720 px`，视口为 `1280 × 720 CSS px`，`devicePixelRatio = 1.25`。
- 结果：面板底图标签窗口已清空，切换时只有一条状态条带可见；本机未选中不再带黄色边缘，目标/仓库/文献/H.D.D 选中时不再出现左侧灰色底部或重复边缘；五个状态均唯一选中并已恢复本机。
- 验证：`pnpm build`、`pnpm test`（14/14）和 `git diff --check` 均通过。

final result: passed

---

## 2026-08-22 — 整条横轨重建与统一命中区（最终复核）

- 根因：单个标签截图被贴到另一套坐标和宽度的横轨上，造成“本机偏宽”以及其它选中标签左侧露出灰壳。
- 修复：资源脚本按固定横轨锚点生成五张完整 `981×100` 条带；按钮只切换整条状态图，五个透明命中区统一为 20%。
- 验收：仓库、文献、H.D.D 的左右弧线完整；本机选中和未选中与同一横轨几何一致；无伪元素、阴影或焦点轮廓。
- 验证：浏览器五状态逐一点击，每次一个 `aria-pressed="true"`；`pnpm build`、`pnpm test`（14/14）和 `git diff --check` 均通过。

final result: passed

---

## 2026-08-23 — UI 设计层重构（当前验收）

**Comparison target**

- 设计语言来源：`C:\Users\86159\Desktop\VID20260823011302.mp4` 的全量关键帧；静态真值为 `F:\ResearchKB\.harness\qa\obsui\reference-full\ObsUI_Codex_Reference\02_target_game_keyframes\target_05_four_card_grid.jpg`（1920 × 1080 px）。
- 当前应用视频：`D:\QQ\VID20260823201149.mp4` 的关键帧；用于保留现有窗口、PDU 左侧装饰、顶部 Tab 与业务内容。
- 浏览器实现：`F:\ResearchKB\.harness\qa\obsui\refactor-monitor-final.png`（1280 × 720 px；CSS 视口 1280 × 720，devicePixelRatio 1.25；“本机”唯一选中）。
- 同画布全景对照：`F:\ResearchKB\.harness\qa\obsui\reference-vs-monitor-comparison.png`；聚焦内容卡对照：`F:\ResearchKB\.harness\qa\obsui\reference-vs-monitor-focused-card-comparison.png`；五 Tab 统一性证据：`F:\ResearchKB\.harness\qa\obsui\five-tab-refactor-grid.png`。

**Findings**

- [P1 fixed] 原 `styles.css` 是历史样式及尾部覆盖规则的叠加，内容区存在相互冲突的尺寸、边框和颜色来源。现重建为单一 token 层与共享 primitive 层；设备外壳、PDU、卡带和 Tab 仍使用项目内已验证的栅格素材。
- [P1 fixed] “本机”样板页的数值卡此前仅有分散文字。现统一为内凹深色数据面、固定标签/数值/说明基线和黄色状态条，并推广到网络数值、资料录入、计划、仓库和本地数据页。
- [P1 fixed] 首轮浏览器渲染发现左侧装饰的隐藏内容参与网格最小尺寸计算，导致父壳保留滚动偏移。现约束图标与导航的最小尺寸、复位壳滚动范围；最终浏览器中 `scrollHeight = clientHeight = 720`，无页面滚动溢出。
- 无待处理 P0、P1 或 P2。保留项：目标游戏使用更亮的银色卡外壳和专用奖励图标；ObsUI 为保留现有设备骨架与其数据内容，继续使用项目已提供的深灰卡带。这是可见但预期的 P3 差异。

**Fidelity surfaces**

- 字体与文字：中文保持紧凑粗体层级；标题、英文眉标、数值、说明与页脚标签分别使用统一的字重、字距和截断方式。
- 间距与布局：设备框、Tab 组、读取条和卡带坐标不变；五个 Tab 在每个状态下均为 `150.1125 × 76.525 CSS px`，同一条轨道为 `968.7125 × 391.7625 CSS px`，无切换位移或缩放。
- 颜色与 tokens：深色内凹面/深灰金属结构/橙色结构提示/黄色主交互与进度/红色危险操作均由 `--ui-*` tokens 管理；不再保留页面内的随机蓝色主按钮。
- 图像与材质：外壳、左侧 PDU、Tab、卡带、扣件与壁纸继续是项目内的原始栅格资产；没有以新 CSS 图形替代这些可见资产。内容控件只在已有内凹窗口内绘制，不新增外框、承托板或裁切层。
- 内容与交互：本地存储、指标轮询、网络查询、备份、表单、轨道拖动、Tab 逻辑及既有 150ms Tab 旧态淡出均未改。新增内容过渡为 160ms ease-out 整体轻移与 18ms 级差的局部淡入，不影响 Tab 黄色选中面。

**Browser and build evidence**

- 依次点击“目标 / 本机 / 仓库 / 文献 / H.D.D”，每次恰有一个 `aria-pressed="true"`，五组 Tab 几何一致；最终恢复“本机”。
- 切换内容时浏览器实测 `.page` 使用 `device-content-enter`，卡内容使用 `device-card-content-enter`；等待 240ms 后稳定，无布局位移。
- `pnpm run build` 通过；`pnpm test` 通过（5 个测试文件，14/14）；`git diff --check` 通过（仅仓库既有 CRLF 警告）。

**Follow-up polish**

- [P3] 若后续允许替换卡带源资产，可把现有深灰卡外壳升级为更接近游戏参考的浅银灰卡壳，并增加与真实数据语义匹配的专用状态图标；当前未做该替换，以避免改变已经确认的设备骨架与内容密度。

final result: passed

---

## 2026-08-23 — 顶部 Tab 原图复刻校准

**Comparison target**

- 唯一视觉基准：`C:\Users\86159\Desktop\112.png` 中五种 Tab 状态。
- 浏览器五状态复核：`F:\ResearchKB\.harness\qa\obsui\five-tabs-exact-grid.png`。
- 参考与当前面板并排图：`F:\ResearchKB\.harness\qa\obsui\reference-vs-exact-tabs.png`。

**Findings**

- [P1 fixed] 原实现使用十张 `200×100` 单 Tab 图片逐个拼接，放大了字重、圆角和黄色面，并造成接缝与参考图不一致。
- [P1 fixed] 现从 `112.png` 五个完整状态直接提取 `510×50` 五联页签条；文字、灰色金属层、轮廓、高光、圆角与选中黄色均来自参考原图。
- [P1 fixed] 切换改为整条状态图淡出，保留既有 150ms 动画；五个透明命中区仍各占 20%，每个均为 `150.1125 × 76.525 CSS px`，无位移或缩放。
- 无待处理 P0、P1 或 P2。面板内容中的实时数值与参考空卡不同，属于业务内容差异，不是 Tab 视觉偏差。

**Verification**

- 浏览器依次点击五个 Tab，每个状态恰有一个 `aria-pressed=true`；H.D.D 右边缘完整，无拼接线和裁切。
- `pnpm run build` 通过；`pnpm test` 通过（5 个测试文件，14/14）；`git diff --check` 通过；浏览器控制台无错误。

final result: passed

---

## 2026-08-23 — 顶部 Tab 固定几何修正

**Root cause and correction**

- [P1 fixed] 十张独立 Tab 裁图的透明边距、轮廓基线与左右裁切范围不一致，导致“目标”未选中时左侧错位、切换状态时视觉高度漂移，并裁掉 H.D.D 左缘。
- 改为五张统一 `550×55` 画布的完整五联状态图；Tab 容器、五个 20% 透明命中区、顺序、交互和 150ms 旧态淡出均保持不变。
- 五种实际渲染状态复核图：`F:\ResearchKB\.harness\qa\obsui\five-tabs-fixed-grid.png`。

**Verification**

- 浏览器逐项点击后，五种状态的 Tab 轨道均固定为 `750.5625 × 76.525 CSS px`；五个命中区均固定为 `150.1125 × 76.525 CSS px`，坐标在切换前后完全一致。
- 五张状态资源的浏览器原始尺寸均为 `550×55`；“目标”未选中左缘对齐，H.D.D 左侧轮廓完整，无缩放、位移、跳动或新增接缝。
- `pnpm run build` 通过；`pnpm test` 通过（5 个测试文件，14/14）；`git diff --check` 通过（仅 CRLF 提示）；浏览器控制台无错误。

final result: passed

---

## 2026-08-24 — Tab 裁切坐标与主体面板重新对齐

**Root cause**

- [P1 fixed] 之前把来自 `112.png` 的五联 Tab 条带放入 `device-panel-no-tabs.png` 的旧黑色擦除槽；旧槽坐标（约 `33.01% / 58.67%`）属于另一套面板 Tab 几何，造成 Tab 区右移、偏窄，并与主体上沿脱节。
- 条带本身的裁切保留不变，改为以 `112.png` 的主体面板内坐标重定位：`.device-tabs` 使用 `left: 16.73%`、`width: 75%`、`height: 13%`；不改变状态资源、命中区或动画。

**Verification**

- 同一视口实测 Tab 条带为 `959.475 × 93.5875 CSS px`，五个命中区均为 `191.8875 × 93.5875 CSS px`；目标、本机、仓库、文献、H.D.D 五状态坐标完全一致。
- 实际对照图：`F:\ResearchKB\.harness\qa\obsui\aligned-vs-reference.png`；五状态复核：`F:\ResearchKB\.harness\qa\obsui\reference-aligned-five-grid.png`。
- 视觉检查确认：左侧空平台缩短，Tab 左缘与主体内容区关系恢复，右端与参考图一致，H.D.D 左右轮廓完整；未新增黑底板、白边、位移或缩放。
- `pnpm run build` 通过；`pnpm test` 通过（5 个测试文件，14/14）；`git diff --check` 通过；浏览器控制台无 error/warn。

final result: passed

---

## 2026-08-24 — Tab 子面板与主体顶部一体化

**Root cause and correction**

- [P1 fixed] 之前只把五联 Tab 条带叠加到旧面板的擦除槽，Tab 下方横轨与主体上沿来自两套不同裁切，形成“独立贴片”的断层感。
- 新增 `assets/reference/device-tabs/tops/{goal,local,repository,literature,storage}.png`，分别从 `C:\Users\86159\Desktop\112.png` 五个状态行裁取顶部 `727×130` 的真实像素；每张图同时包含外框上沿、Tab 座、Tab 状态、读出槽和右侧关闭结构。
- `.device-tabs` 现在铺满面板顶部视觉层（`31.8%` 高度），以整张源图切换；五个透明命中区只覆盖对应页签，保留原顺序、状态管理和 150ms 旧态淡出动画。读出文字与关闭按钮提升到源图之上，主体内容区仍使用原有卡带与滚动结构。

**Verification**

- 浏览器五状态实拍：`F:\ResearchKB\.harness\qa\obsui\integrated-{goal,local,repository,literature,storage}.png`；并排校准图：`integrated-vs-reference-five-top-grid-aligned.png`。
- 在 `798×698` CSS 视口中，顶部源图层为 `798.4×142.8875 CSS px`；五个命中区均为 `109.85×22 CSS px`，横向起点与宽度在五种状态完全一致，H.D.D 左右轮廓完整。
- 五个 Tab 均可点击切换且恰有一个 `aria-pressed="true"`；浏览器控制台无 error/warn。`pnpm run build` 通过；`pnpm test` 通过（5 个测试文件，14/14）；`git diff --check` 通过（仅既有 CRLF 提示）。

**Remaining difference**

- 主体下方的业务卡片仍显示真实数据内容，而 `112.png` 是空卡参考图；这属于内容差异。顶部 Tab、外框上沿和读出槽已改为同一份参考源像素，未再使用独立黑色承托层或 CSS 仿制纹理。

final result: passed

## 2026-08-24 — 一体式原始外壳弹窗与 H.D.D（最新，视觉待用户确认）

**Source and implementation**

- 五张视觉源图：`F:\ResearchKB\apps\ObsUI\assets\reference\device-shell\shell-{target,local,repository,literature,hdd}.png`，均为 688×373 RGBA；来自压缩包 `01_shell_exact`，短底部仅以透明画布补齐，没有拉伸或裁切。
- 同一应用内浏览器视口：1280×720；实现完整截图与设备裁剪保存在 `F:\ResearchKB\.harness\qa\obsui\device-shell-20260824\`，并排证据为 `source-vs-live-five-states.png`。
- 浏览器中每个状态均只渲染一张外壳底图；Tab、关闭按钮和内容开口是透明命中/内容层，未再加载旧 Tab 条带或独立面板底图。

**Checked**

- [x] 目标、本机、仓库、文献、H.D.D 五个选中态逐一点击；选中资源与标签对应。
- [x] 关闭返回总览；自动化计时进入目标 Tab；任务卡内点击不再冒泡改写视图。
- [x] 外壳有效边界、PDU 左缘、读出槽、卡片开口、底部收口和 H.D.D 右缘在同一视口检查。
- [x] H.D.D 离线状态不伪造回答；本机 Codex CLI 在线时 SSE 流式回复、来源行、停止生成和删除二次确认已实际操作。
- [x] `pnpm test`（6 个测试文件、17 项测试）与 `pnpm build`。
- [x] `git diff --check` 无 whitespace error（仅既有 CRLF 转换提示）。

**Open gate**

源图与实现并排证据已保存，但外观仍须用户在同一视口确认后才可标记通过；在用户确认前，本节 `final result: blocked`。自动化构建、DOM 几何和截图不能替代这次像素级视觉确认。

final result: blocked

---

## 2026-08-31 — `?ui=tab-v2` 精简 Shell 视觉复核（最终）

**Findings**

- 无可阻塞验收的 P0/P1/P2 差异。按用户请求移除了 V2 弹窗的可见五联 Tab、三条斜杠、`PUBLIC SHELL / PHASE 1` 重复文案，以及目标页的 `01/02` 序号与副说明。
- [P3，可选] 顶栏仍保留一个 34px 的既有 `obsui.ico` 和 `ObsUI` 品牌名；本轮将“ObsUI 的标签”解释为功能 Tab，而非品牌标识。

**Source visual truth**

- 用户反馈截图（问题证据，非旧版像素复刻目标）：
  - `C:\Users\86159\AppData\Local\Temp\codex-clipboard-9ab2c612-8cbe-495e-91e9-2852b8fc23ca.png`（390×895 px）
  - `C:\Users\86159\AppData\Local\Temp\codex-clipboard-94217896-6c9c-4c9a-aaa3-5b51fec5b53a.png`（292×110 px）
  - `C:\Users\86159\AppData\Local\Temp\codex-clipboard-6a3daba3-2fa3-4f59-93c9-59e71a896ec9.png`（264×268 px）
- 文字请求是本轮验收目标：减少图形和层级、移除功能 Tab、去除重复说明与序号，并让功能区与背景共享平面坐标。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`
- 浏览器视口：1280×720 CSS px；`devicePixelRatio = 1.25`；实现截图：1280×720 px。外框约 1200×680 CSS px，内容视口约 1166.4×582.4 CSS px，内缩 16px。
- 截图：`F:\ResearchKB\.harness\qa\obsui\obsui-compact-target-clean-final.png`、`obsui-compact-calendar-clean.png`、`obsui-compact-local-clean.png`、`obsui-compact-library-clean.png`。
- 源图是不同尺寸的裁剪问题证据，未提供 CSS 尺寸或设备密度，因此不做伪精确像素归一化；比较对象是用户要求的视觉变化。

**Full-view comparison evidence**

- 旧版全视图的多层纹理、额外 Tab 轨道和斜杠已对应为一个平面弹窗框、64px 顶栏和一个对齐内容视口；页面背景与功能区不再叠加第二套装饰坐标。
- 本机、文献、自动化计时和 H.D.D 均复用该 Shell；本机与文献实测内容视口尺寸一致，弹窗 Tab 与旧背板节点均为 0。

**Focused-region comparison evidence**

- 顶栏对照截图 #2：无三条斜杠、阶段小字、Tab 轨道和文字关闭按钮，仅保留品牌标识与图标关闭按钮。
- 目标左栏对照截图 #3：保留“当前目标”“日历 / 月历”入口，移除 `01/02`、图形块和重复副说明；选中态仍由 `aria-pressed` 表达。
- 目标和日历在同一 1166.4×582.4 CSS px 内容视口内切换，未发生 Shell 或内容区位移。

**Required fidelity surfaces**

- Fonts and typography：使用既有 `Segoe UI` / `Microsoft YaHei` 字体栈，品牌、入口、标题和辅助文字层级清晰；源裁图无可归一化 CSS 字体规格。
- Spacing and layout rhythm：单框、64px 顶栏、16px 内缩、10px 内容圆角和统一网格均已实测；侧栏与工作区共用同一坐标系统。
- Colors and visual tokens：使用平面深灰、低对比边界和单一黄色选中态，移除旧版渐变、点阵、重阴影和装饰承托层。
- Image quality and asset fidelity：仅保留仓库已有 `obsui.ico`，按 34px 原比例显示；斜杠没有用 CSS/HTML 伪造，关闭按钮使用现有图标库，本轮未新增生成图片。
- Copy and content：删除阶段说明、重复区域说明和目标序号；占位页收敛为“分类/搜索/资源列表”等短标签。
- States and accessibility：目标/日历、本机、文献、自动化计时、H.D.D 均能打开；关闭按钮和 ESC 关闭弹窗并恢复“计划任务”焦点；保持 `role=dialog` 与中文 `aria-label`。

**Runtime checks**

- `pnpm run build` 通过；`pnpm test` 通过（9 个测试文件、29 项测试）；`git diff --check` 通过（仅 LF/CRLF 提示，无 whitespace error）。
- 干净页面重新加载后控制台 error/warn 为 0 条；已验证知识资源、计划任务、自动化计时、状态监控、工作台设置入口。

**Comparison history**

- 首轮精简截图发现继承 Grid 规则将 Shell 内容压缩到约 32px；已修复为 Shell `display: block`，由内部 Frame 管理 64px 顶栏与剩余内容区，并重新截取目标、日历、本机、文献状态。
- 修复后的同组视觉输入未发现新的 P0/P1/P2 问题。

**Implementation Checklist**

- [x] 移除 V2 可见 Tab、三条斜杠、旧背板和阶段文案。
- [x] 去掉目标页 `01/02`、图形块及重复副说明。
- [x] 统一 Shell、内容视口和功能区坐标。
- [x] 验证切换、关闭、ESC、焦点恢复、多入口和控制台。

final result: passed

---

## 2026-08-31 — `?ui=tab-v2` 顶栏 Tab 回补（最终）

**Findings**

- 无可阻塞验收的 P0/P1/P2 差异。按用户反馈恢复了五项功能 Tab，并将其放回品牌区右侧的原顶栏位置；轨道高度约 38px，不再单独占用弹窗内容高度。
- Tab 轨道保持五等分、单一选中态和键盘切换；内容视口仍为原来的 `1166.4×582.4` CSS px，没有因为回补 Tab 发生压缩或位移。

**Source visual truth**

- 用户反馈的顶栏问题截图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-94217896-6c9c-4c9a-aaa3-5b51fec5b53a.png`（292×110 px）。
- 用户要求的修正目标：保留 Tab 区，但放回之前的顶栏位置并压缩占用空间；同时继续保持已完成的去斜杠、去重复文案、去序号和单一坐标系统。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`
- 浏览器视口：1280×720 CSS px；`devicePixelRatio = 1.25`；实现截图为 1280×720 px。
- 最新截图：`F:\ResearchKB\.harness\qa\obsui\obsui-tabs-restored-final.png`（目标/当前目标）与 `F:\ResearchKB\.harness\qa\obsui\obsui-tabs-restored-calendar.png`（目标/日历）。
- 实测 Tab 轨道：`x=168.1, y=33.4, width=1001.1, height=38` CSS px；内容视口：`x=56.8, y=100.8, width=1166.4, height=582.4` CSS px。

**Full-view comparison evidence**

- 与旧版顶栏截图同组复核后，五个 Tab 重新可见且位于品牌区右侧；三条斜杠、阶段性 Shell 文案和旧版第二层装饰仍未恢复。
- 目标当前页和日历页均保留同一 Tab 轨道与同一内容坐标；日历切换不改变轨道或内容视口尺寸。

**Focused-region comparison evidence**

- 顶栏聚焦区：五个按钮分别为“目标、本机、仓库、文献、H.D.D”，仅选中项使用浅黄色平面态；不使用旧版渐变、超大页签或独立装饰层。
- 交互聚焦区：逐一点击五个 Tab 后，均保持 5 个 Tab、恰有 1 个 `aria-selected=true`，并切换到对应的目标/本机/仓库/文献/H.D.D 内容。

**Required fidelity surfaces**

- Fonts and typography：使用既有 `Segoe UI` / `Microsoft YaHei` 字体栈，Tab 文案为 12px 紧凑层级，未引入重复说明。
- Spacing and layout rhythm：Tab 轨道与顶栏同层，38px 高；内容区仍保持 16px 内缩和原有高度，避免再次侵入页面主体。
- Colors and visual tokens：轨道使用平面深灰，选中态使用单一黄色文字与深色选中面，去掉旧版 Tab 渐变与顶部装饰线。
- Image quality and asset fidelity：未新增图片或 CSS 图形；品牌图标继续使用既有 `obsui.ico`，Tab 和关闭按钮使用现有 HTML/图标组件。
- Copy and content：恢复必要的五项功能标签，仅保留短名称；阶段说明、重复介绍和目标页 `01/02` 仍不在当前 V2 Shell 中。
- States and accessibility：Tab 使用 `role=tablist` / `role=tab` / `aria-selected` / `aria-controls`；关闭按钮、ESC 和焦点恢复仍正常。

**Runtime checks**

- 五个 Tab 实际点击通过，内容视口尺寸在五种状态中保持 `1166.4×582.4` CSS px。
- 关闭按钮和 ESC 均可关闭弹窗；从主导航打开后焦点恢复到“计划任务”。
- 干净页面控制台 error/warn 为 0 条。
- `pnpm run build` 通过；`pnpm test` 通过（9 个测试文件、29 项测试）；`git diff --check` 通过（仅 LF/CRLF 提示，无 whitespace error）。

**Comparison history**

- 上一轮为了响应“Tab 区占用过多”移除了 Tab 轨道；本轮根据用户补充恢复同一功能区，并将它限制在顶栏单行内。
- 首次恢复截图检查确认轨道未造成内容压缩；随后重新截取目标和日历状态，并与顶栏/目标导航问题截图同组复核。

**Implementation Checklist**

- [x] 在品牌区右侧恢复五项 Tab。
- [x] 保持 Tab 切换和唯一选中状态。
- [x] 将轨道限制为顶栏单行，不占用主体内容高度。
- [x] 保留去斜杠、去重复文案、去序号和单坐标 Shell。
- [x] 通过构建、测试、diff、交互和控制台检查。

final result: passed

---

## 2026-09-01 — 本机概览四卡布局修正

**Findings**

- 本轮目标为本机页的布局修正，不改变代理启动、实时指标、出口 IP 查询或其他 Tab 的业务逻辑。
- 本机概览现在只保留顶部 `Codex 使用限额` 长条和下面的横向卡片轨道；原先重复的系统/网络明细面板已移除。
- 计划书与用户当前截图作为结构参考；本轮以用户文字要求为最终视觉真值。原始游戏截图不是 ObsUI 的像素复刻目标。

**Source visual truth**

- `C:\Users\86159\AppData\Local\Temp\codex-clipboard-a3c71577-c716-4e45-a56f-8471d29e3dc1.png`
- `C:\Users\86159\Desktop\ZZZ素材\zzz原始截图\5c441dcd-1c8f-4849-a6a8-43782dba2954.png`（仅作卡片滑动结构参考）
- `C:\Users\86159\Desktop\ZZZ素材\ObsUI_V1_总体规划与实施计划书.docx`（仅作信息分组参考）

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`
- 默认浏览器视口：1280×720 CSS px；四张卡按“系统 → 网络 → 本地模型 → Codex 自动化”顺序排列，卡片轨道 `scrollWidth=1472`、`clientWidth=1165`。
- 同尺寸截图：`F:\ResearchKB\.harness\qa\obsui\obsui-local-overview-four-cards-1621.png`。
- 滑动末端截图：`F:\ResearchKB\.harness\qa\obsui\obsui-local-overview-four-cards-end.png`。
- 对照图：`F:\ResearchKB\.harness\qa\obsui\obsui-local-overview-comparison.png`。

**Focused-region comparison evidence**

- 第一张卡只承载 CPU、GPU、内存、硬盘四项指标，并用四格指标单元显示实时值。
- 第二张卡承载网络状态、下载/上传、局域网 IP、出口 IP、FlClash 状态，以及“打开代理”与“刷新出口 IP”操作。
- 第三张卡固定显示“模型名称 / VRAM / RAM / 状态”列；当前 Ollama 未连接，VRAM/RAM 显示 `—`，不把模型文件大小冒充运行时资源。
- 第四张卡固定显示 Codex 自动化名称、运行周期、状态、上次运行、下次运行；当前自动化列表未接入，缺失值明确显示为未配置或 `—`。
- `.tab-modal-v2__local-overview .tab-modal-v2__detail-grid` 实测为 0 个；代理菜单仍可展开，横向右箭头可将末卡滚入视口。

**Viewport resilience**

- 900×700 与 640×800 临时视口均通过：主体没有横向溢出，卡片轨道保持可滚动，网络卡操作按钮仍在可视范围内；临时视口检查完成后已恢复默认尺寸。

**Required fidelity surfaces**

- Fonts and typography：沿用现有 Segoe UI / Microsoft YaHei / Consolas 体系；四个卡片标题、字段标签和状态文字层级清晰，无重复大段说明。
- Spacing and layout rhythm：额度条在最上方，卡片轨道紧随其后并填充剩余内容区；四张卡统一宽度、边界和内部节奏。
- Colors and visual tokens：复用既有蓝/黄/紫/绿强调色；状态点使用绿色在线、琥珀色未连接/未接入、灰色不可用。
- Image quality and asset fidelity：未新增图片或 CSS 伪造图形，图标继续使用现有 react-icons。
- Copy and content：本机概览不再重复展示下方系统/网络明细，字段名称与用户请求一致。
- States and accessibility：卡片带中文 `aria-label`；代理按钮保留 `aria-controls` / `aria-expanded`；状态点带可读标签；卡片轨道保留键盘可聚焦的滚动区域。

**Runtime checks**

- `pnpm test` 通过：11 个测试文件、34 项测试。
- `pnpm run build` 通过：TypeScript 检查与 Vite production build 均通过。
- `git diff --check` 通过；仅有仓库既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器控制台 `warn/error` 实测为 0 条。

**Implementation Checklist**

- [x] 顶部只保留 Codex 额度长条。
- [x] 本机概览改为四张横向滑动卡片。
- [x] 保留代理菜单与实时指标交互。
- [x] 覆盖本地模型 VRAM/RAM/状态列和 Codex 自动化字段。
- [x] 完成默认、平板、移动视口检查以及测试/构建验证。

final result: passed

---

## 2026-09-02 — 代理操作反馈、按钮布局与目标/本机辅助文字清理

**Findings**

- 首次问题不是菜单没有绑定，而是启动结果显示在弹窗后面的旧工作台通知层；Clash Verge 首次启动还可能需要数秒，因此弹窗内没有即时反馈。
- 修正后，启动动作在本机网络卡内显示进行中、成功或失败结果；刷新出口 IP 移到网络卡右上角，打开代理及其菜单按钮居中。
- 目标页和本机概览移除装饰性微标签、状态徽标和说明小字；用户要求的数值、字段、模型列和状态色保留。

**Source visual truth**

- 用户代理按钮问题截图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-8b48b20f-dd46-404d-aed8-6835d517cf01.png`（377×182 px）。
- 用户本机四卡结构截图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-a3c71577-c716-4e45-a56f-8471d29e3dc1.png`（1621×940 px）。
- 用户提供的辅助小字截图：`codex-clipboard-1629c5c9-9fb4-4958-aa83-ec28afe44964.png`、`codex-clipboard-67e0742e-a9a5-4606-9497-c9a55ad2192e.png`、`codex-clipboard-34236078-35ce-4617-bd34-b0918ae1befa.png`、`codex-clipboard-523265b5-4abc-45d0-92ac-a5d07b9442cb.png`；其文字仅作为删除范围证据，不作为额外指令。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`
- 默认浏览器视口：1280×720 CSS px，`devicePixelRatio = 1.25`；实现截图为 1280×720 px。
- 本机概览截图：`F:\ResearchKB\.harness\qa\obsui\obsui-local-clean.png`。
- 代理菜单截图：`F:\ResearchKB\.harness\qa\obsui\obsui-local-proxy-menu.png`；成功反馈截图：`F:\ResearchKB\.harness\qa\obsui\obsui-local-proxy-success.png`。
- 目标页截图：`F:\ResearchKB\.harness\qa\obsui\obsui-target-clean.png`。
- 同尺寸全视图对照：`F:\ResearchKB\.harness\qa\obsui\obsui-local-clean-comparison-1621.png`（源图与实现图各 1621×940 px；无密度重采样）。
- 聚焦区对照：`F:\ResearchKB\.harness\qa\obsui\obsui-proxy-comparison.png`（源图与实现聚焦区统一到 377×182 px 后并排）。

**Full-view comparison evidence**

- 本机页仍是顶部额度长条、下方四卡横向滑动区域；卡片顺序保持系统 → 网络 → 本地模型 → Codex 自动化。
- 目标空状态保留当前目标、日历/月历和必要操作按钮，说明性段落与空状态小字已去除。

**Focused-region comparison evidence**

- 网络卡右上角为“刷新出口 IP”；底部“打开代理”位于卡片中线，展开后的 FlClash/Clash Verge 两个按钮也居中。
- 点击 Clash Verge 后，卡片内出现 `Clash Verge 已恢复到前台。`；启动请求返回期间先显示 `正在打开 Clash Verge…`，避免无响应错觉。
- 本机概览中已没有 `small`、微标签、卡片代码或概览状态徽标；功能字段和模型状态色仍存在。

**Viewport resilience**

- 900×700 与 640×800 临时视口检查通过：页面无整体横向溢出，卡片轨道保持可水平滚动，网络卡操作位于其自身卡片布局内；检查后已恢复默认视口。

**Required fidelity surfaces**

- Fonts and typography：沿用现有 `Segoe UI` / `Microsoft YaHei` / `Consolas` 字体栈；删除低信息密度的微文案后，主标题、数值和字段层级更清晰。
- Spacing and layout rhythm：刷新按钮固定在网络卡上方右侧；代理动作区和菜单使用居中对齐，未改变四卡顺序及滑动机制。
- Colors and visual tokens：沿用蓝/黄/紫/绿卡片强调色；反馈消息分别使用进行中、成功和错误语义色。
- Image quality and asset fidelity：未新增图片或 CSS 伪造图形；图标继续使用既有 `react-icons` 与品牌资源。
- Copy and content：移除用户指出的辅助说明、英文微标签和状态徽标；保留 CPU/GPU/内存/硬盘、网络字段、模型列、自动化字段及代理操作文字。
- States and accessibility：启动按钮保留语义按钮、菜单 `role=menu` / `role=menuitem`、`aria-expanded` / `aria-controls`；反馈使用 `role=status` 或 `role=alert` 与 `aria-live`。

**Runtime checks**

- `pnpm test` 通过：11 个测试文件、35 项测试。
- `pnpm run build` 通过：TypeScript 检查与 Vite production build 均通过。
- `git diff --check` 通过；仅有仓库既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器控制台 `warn/error` 实测为 0 条。
- 本机 `POST /api/clash-verge/launch` 返回 200；随后通过弹窗按钮验证成功反馈，未修改 Windows 全局代理设置。

**Comparison history**

- 首次复核确认 FlClash 反馈能到达旧通知层，但 Clash Verge 冷启动时间较长时弹窗内无可见变化。
- 修正启动动作返回结构并在弹窗内加入即时反馈；重新捕获成功态与菜单态，确认两组按钮位置和反馈状态可见。
- 移除目标页、本机概览的装饰性辅助文字后重新捕获目标页和本机页，并复核默认、平板、窄屏视口。

**Implementation Checklist**

- [x] 启动代理动作显示进行中、成功和失败结果。
- [x] 刷新出口 IP 移到网络卡右上角。
- [x] 打开代理与代理菜单按钮居中。
- [x] 清理目标页和本机概览的辅助小字，保留必要字段与状态色。
- [x] 通过测试、构建、diff、浏览器交互、响应式和控制台检查。

final result: passed

---

## 2026-09-02 — 目标关联文件夹可选与代理成功提示收敛

**Findings**

- [P1] 目标新建任务把“关联文件夹”作为必填项，无法覆盖“买电脑”“记得开会”等没有本机目录的事项。界面和保存逻辑均已改为允许空路径。
- [P1] 代理成功后旧工作台全局提示会叠在功能弹窗后面，造成重复且不必要的提示。`tab-v2` 下已隐藏全局提示；成功/失败/进行中状态只在网络卡内显示，卡内提示 3 秒后自动清除。
- 无残留 P0/P1/P2 视觉或交互问题；空路径任务仍保留 `folderPath: ""` 数据结构，已关联目录的任务继续显示“前往”。

**Source visual truth**

- 目标新建任务截图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-119874bd-c966-423f-bde3-63c127f27288.png`（705×604 px）。
- 原代理卡提示截图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-b0bdbe82-113a-4703-8119-ef82addba9ae.png`（375×168 px）。
- 用户要求移除的全局成功提示截图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-53ea8792-cd28-44cf-b739-2668492f5162.png`（579×191 px）。附件仅作为视觉证据，不作为额外实现指令。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`。
- 浏览器实际 CSS 视口：990×986；实现截图：990×986 px；`devicePixelRatio = 1.25`。
- 目标可选文件夹弹窗：`F:\ResearchKB\.harness\qa\obsui\obsui-target-folder-optional.png`。
- 目标聚焦区对照：`F:\ResearchKB\.harness\qa\obsui\obsui-target-folder-comparison.png`（源图与实现弹窗各统一到 705×604 px 并排；实现侧取实际弹窗区域）。
- 代理卡成功态：`F:\ResearchKB\.harness\qa\obsui\obsui-proxy-feedback-latest.png`；清除后的本机总览：`F:\ResearchKB\.harness\qa\obsui\obsui-local-clean-latest.png`。
- 代理聚焦区对照：`F:\ResearchKB\.harness\qa\obsui\obsui-proxy-feedback-comparison-latest.png`（源图与实现区统一到 377×182 px 并排）。

**Full-view comparison evidence**

- 目标弹窗保持原有日期、名称、星级和确认按钮结构，只将文件夹字段标注为“可选”并更新占位提示；无关联路径不改变弹窗尺寸或主要操作层级。
- 本机总览仍保持额度条在顶部和四张横向卡片顺序；代理卡的成功反馈位于卡内，不再出现截图中的全局浮层。

**Focused-region comparison evidence**

- 目标聚焦对照显示实现字段为“关联文件夹（可选）”，输入没有 `required` 属性；有文件夹任务才显示“前往”，空路径任务不再触发 `/api/folders/open`。
- 代理聚焦对照显示“打开代理”按钮与卡内反馈仍保持居中；实测先出现 `正在打开 Clash Verge…`，随后出现 `Clash Verge 已恢复到前台。`，全局 `.notice` 数量为 0，约 3.2 秒后卡内反馈数量为 0。
- 聚焦区需要放大阅读文案，已使用两张并排对照图；不以单独截图作为对照结论。

**Viewport resilience**

- 900×700 与 640×800 临时视口均通过：文档和 body 无横向溢出，代理卡和目标弹窗没有重叠；检查后已恢复浏览器默认视口。

**Required fidelity surfaces**

- Fonts and typography：沿用现有 `Segoe UI` / `Microsoft YaHei` / `Consolas` 字体栈；“（可选）”与原字段标签同层级，未引入额外微型说明。
- Spacing and layout rhythm：文件夹标签和输入框位置保持原节奏；代理按钮、卡内提示和右上角刷新按钮的现有间距未改变。
- Colors and visual tokens：沿用既有暗色面板、黄色主按钮、绿色成功状态和错误语义色；全局提示隐藏不会改变卡片色彩层级。
- Image quality and asset fidelity：未新增图片或 CSS 伪造图形；图标继续使用现有 `react-icons`，对照图仅用于 QA。
- Copy and content：采用“关联文件夹（可选）”和“可选，例如 …”明确表达非必填；移除成功全局提示，保留卡内可读状态反馈。
- States and accessibility：文件夹字段保留可访问名称且 `required=false`；代理反馈使用 `role=status` / `role=alert` 与 `aria-live`，提示自动清除前后按钮仍可操作。

**Runtime checks**

- `pnpm test` 通过：11 个测试文件、37 项测试。
- `pnpm run build` 通过：TypeScript 检查与 Vite production build 均通过。
- `git diff --check` 通过；仅有仓库既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器控制台 `warn/error` 实测为 0 条。
- 浏览器交互实测：目标日历打开新建任务、读取可选字段属性；本机打开代理 → Clash Verge、检查进行中/成功/清除状态；全局 `.notice` 为 0；未修改 Windows 全局代理设置。

**Comparison history**

- 首次对照确认源图中的文件夹字段是必填视觉与保存逻辑双重限制；移除 UI `required` 后继续修正保存函数中的空路径拒绝。
- 首次代理复核确认成功提示来自旧工作台全局通知层；改为 `tab-v2` 隐藏全局层，并保留网络卡内的短暂状态反馈。
- 重新捕获目标弹窗、代理成功态和清除后的本机总览，补做 900×700 / 640×800 视口与控制台检查，未发现新的 P0/P1/P2 问题。

**Implementation Checklist**

- [x] 关联文件夹改为真正可选，保存空路径任务。
- [x] 空路径任务隐藏无效的“前往”操作，已有路径任务保持可打开。
- [x] 代理成功全局提示不再显示；卡内反馈约 3 秒自动消失。
- [x] 通过测试、构建、diff、浏览器交互、响应式和控制台检查。

final result: passed

---

## 2026-09-02 — H.D.D Codex 式三栏与模型强度

**Findings**

- [P1] H.D.D 三栏之间原有明显空隙，与 Codex 的连续工作区边界不一致；已改为一个外框内的三栏，列间无 gap，仅保留单条分隔线。
- [P1] 左侧只有会话列表，缺少 Codex 式的新对话、搜索和最近会话层级；已补充真实可用的“新对话”和会话搜索。
- [P1] 右侧“上下文”用途不明确；已改为“环境信息”，说明参考目录只决定本次回答可读取的本机知识范围，且保留目录增删和回答来源预览。
- [P1] 原发送栏没有模型强度选择；已加入五档选择，并将选择传入 Codex CLI 的调用级 `model_reasoning_effort` 配置。

**Source visual truth**

- Codex 左侧布局参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-5e5e1470-7748-4ce6-96a4-4f96e5c30f35.png`。
- Codex 全局工作区与右侧环境信息参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-062f0afa-1834-43c3-bae0-98b1f2a76454.png`。
- 附件仅作为布局和交互证据；暗色主题、ObsUI 顶部功能切换和本机只读边界继续沿用现有产品约束。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`。
- 实现截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-codex-layout-latest.png`。
- 默认浏览器视口实测 H.D.D 工作区为 914px：三栏边界为 `216 / 461 / 236px`，相邻面板左右边界分别连续于 `254px` 和 `715px`，`scrollWidth === clientWidth`。

**Full-view comparison evidence**

- 左侧吸收 Codex 的“品牌 → 新对话 → 搜索 → 最近会话”层级；中间保留对话标题、消息流和底部输入；右侧用“环境信息”承接 Codex 参考图中的环境面板语义。
- 三栏共享同一外框，去除视觉缝隙；右侧目录行去掉低信息量的目录 ID，来源路径在选中后的预览区域保留。
- 主题未改为参考图的浅色皮肤，避免扩大范围；改变的是信息架构、边界和控件语义。

**Focused-region comparison evidence**

- 模型强度下拉菜单实际包含“最低、低、中、高、最高”，实测切换到 `xhigh` 后值为 `xhigh`，恢复默认 `high` 正常。
- 移除一个参考目录后“添加知识目录”按钮出现，打开后可加入剩余目录；全部目录恢复后按钮按预期隐藏。
- 环境信息说明与右侧目录列表同屏可见；回答来源仍支持选中并显示来源预览。

**Viewport resilience**

- 900×700：保持三栏，实测列为 `190px / 434.2px / 215px`，页面无横向溢出。
- 600×800：自动堆叠为单列，实测三个面板宽度一致，页面无横向溢出。

**Required fidelity surfaces**

- Fonts and typography：沿用现有 `Segoe UI` / `Microsoft YaHei` / `Consolas` 字体栈；新增中文层级与参考图相同地服务于导航、环境和 composer 控件。
- Spacing and layout rhythm：三栏 `gap: 0`，外框负责整体边界，面板间只保留分隔线；输入区新增一行轻量模型控制，不改变消息区的可用高度结构。
- Colors and visual tokens：沿用 ObsUI 暗色面板、蓝色选中态、黄色主操作和绿色只读状态；浅色 Codex 截图只作为布局参考。
- Image quality and asset fidelity：未新增或伪造图片；继续使用现有 `react-icons`。
- Copy and content：将“上下文”改为“环境信息”，明确目录范围和只读/不上传边界；移除目录 ID 等低信息量小字。
- States and accessibility：模型选择具备 `aria-label="模型强度"`；新对话、搜索、目录增删和来源选择均为真实控件；无可用目录时不显示空的添加按钮。

**Runtime checks**

- `pnpm test` 通过：12 个测试文件、41 项测试。
- `pnpm run build` 通过：TypeScript 检查与 Vite production build 均通过。
- `git diff --check` 通过；仅有仓库既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器控制台 `warn/error` 实测为 0 条。
- Codex CLI 本机版本为 `0.152.1`；官方仓库当前配置 schema 和 TypeScript SDK 均支持 `model_reasoning_effort` 的调用级覆盖，本轮未读取或修改用户配置、密钥或 OpenCode 凭据。

**Implementation Checklist**

- [x] 三栏去除列间 gap，改为共享外框与连续分隔线。
- [x] 左侧改为 Codex 式会话栏，并加入会话搜索。
- [x] 右侧改为有明确用途的环境信息栏，保留目录范围和来源预览。
- [x] 加入并实际传递 Codex 模型强度选择。
- [x] 通过测试、构建、diff、浏览器交互、响应式和控制台检查。

final result: passed

---

## 2026-09-02 — H.D.D Codex 模型选择、搜索入口与对话区重排

**Findings**

- [P1] H.D.D 只显示强度、没有可选 Codex 模型；已增加 `5.5`、`5.6 Luna`、`5.6 Terra`、`5.6 Sol` 四个模型，并为每个模型提供 `low`、`medium`、`high`、`xhigh`、`max` 五档强度。
- [P1] 空状态的中心“新会话”标题行制造了与左右栏不一致的横向接缝；无活动会话时已移除该行，有活动会话时标题栏固定为统一 56px 高度。
- [P1] 左栏右侧的“在线”状态与 Codex 导航不一致；已改为搜索图标，点击打开独立的会话搜索板块，输入会筛选会话，关闭或选择结果后返回会话栏。
- [P1] 对话区原先使用密集的消息卡片；已按 Codex 的“标题/消息流/底部 composer”层级重排，消息改为更轻的文本流，用户消息保留轻量强调。

**Source visual truth**

- Codex 搜索图标参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-b2132216-9d54-47f2-9cd3-2f2b05a4c7c6.png`。
- Codex 对话工作区与环境面板参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-062f0afa-1834-43c3-bae0-98b1f2a76454.png`。
- 用户提供的 H.D.D 接缝、在线状态和 composer 裁图作为问题证据：`codex-clipboard-134007a3-454b-4197-b14d-6431d9b57d1f.png`、`codex-clipboard-1cc0406d-85ce-4cd7-9857-1bff533ecd8a.png`、`codex-clipboard-532c0710-dbd2-40d0-b525-fdbf05250e03.png`、`codex-clipboard-d284d208-57c0-4e60-9492-ad84d0be4398.png`。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`。
- 默认状态截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-codex-layout-v4.png`。
- 搜索板块截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-search-v4.png`。
- 共享工作区默认视口实测为 `913px`，三栏为 `216 / 461 / 236px`，左右边界连续于 `254px`、`715px`；左右顶栏为 `56px`，有活动会话时中心标题栏同为 `56px`，`rootScrollWidth === rootWidth`。

**Full-view comparison evidence**

- 左栏保留 Codex 的 H.D.D 标题、新对话、最近会话层级，右上角采用无文字搜索图标；搜索面板覆盖左栏并沿用同一顶栏高度。
- 中栏空状态不再渲染“新会话”标题行，composer 固定在底部；有会话时才渲染标题栏，避免空状态出现多余接缝。
- 三栏仍使用单一外框和 `gap: 0`，只保留连续的垂直分隔线；右栏环境信息保持只读边界、目录范围和回答来源。

**Focused-region comparison evidence**

- 模型下拉实际包含 `5.5`、`5.6 Luna`、`5.6 Terra`、`5.6 Sol`；默认选择 `5.6 Luna`。
- 模型强度下拉实际包含 `low`、`medium`、`high`、`xhigh`、`max`；浏览器实测可切换到 `max`，并恢复到 `high`。
- 搜索图标点击后出现 `搜索会话` 面板；输入不存在的关键字后显示“没有匹配会话”，关闭按钮可恢复原会话栏。

**Viewport resilience**

- 900×700：三栏保持为 `190px / 434px / 215px`，页面无横向溢出。
- 600×800：自动堆叠为单列，三个面板宽度均为 `529px`，页面无横向溢出。

**Required fidelity surfaces**

- Fonts and typography：沿用现有 `Segoe UI` / `Microsoft YaHei` / `Consolas` 字体栈；模型和强度使用可读的实际值，不再用抽象中文档位替代。
- Spacing and layout rhythm：三栏 `gap: 0`；共享外框、统一 56px 顶栏和无活动标题行解决接缝错位；composer 采用文本框与工具栏一体的 Codex 式底部结构。
- Colors and visual tokens：继续使用 ObsUI 暗色主题、蓝色交互态和黄色发送按钮，仅吸收 Codex 的信息架构与控件位置。
- Image quality and asset fidelity：未新增或伪造图片；搜索、关闭、目录移除均使用既有 `react-icons`。
- Copy and content：删除左栏常驻搜索框和空状态中心“新会话”标题；保留模型、强度、只读边界和来源等必要内容。
- States and accessibility：搜索入口、关闭搜索、模型和强度选择均为真实控件并具备 `aria-label`；搜索按钮暴露 `aria-expanded`，空状态无多余标题节点。

**Runtime checks**

- `pnpm test` 通过：12 个测试文件、42 项测试。
- `pnpm run build` 通过：TypeScript 检查与 Vite production build 均通过。
- `git diff --check` 通过；仅有仓库既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器控制台 `warn/error` 实测为 0 条；搜索筛选、模型切换、强度切换和 900/600px 响应式布局均已实测。
- Codex CLI 本机版本为 `0.152.1`；模型和强度由后端白名单校验后，分别传入 `--model` 与调用级 `model_reasoning_effort`，未读取或修改用户配置、密钥或 OpenCode 凭据。

**Implementation Checklist**

- [x] 增加四个 Codex 模型和五档强度，并将选择传递到本机 CLI。
- [x] 移除空状态的中心“新会话”区域，统一三栏顶栏节奏并去除列间缝隙。
- [x] 将 H.D.D 右上角在线文字替换为可打开/关闭的 Codex 式搜索入口。
- [x] 按 Codex 信息架构重排对话消息区和底部 composer。
- [x] 通过测试、构建、diff、同视口源图对照、搜索/选择交互、响应式和控制台检查。

final result: passed

---

## 2026-09-02 — H.D.D 搜索浮窗与满宽 composer 复核

**Findings**

- [P1] 搜索入口原先只覆盖左侧会话栏；已移到工作区顶层，改为居中的独立弹窗，包含聊天筛选、无结果状态、关闭和新对话快捷操作。
- [P1] composer 左右保留了与中栏边界不一致的内缩空隙；已取消水平和顶部外边距，文本框和工具栏贴合中栏边界，底部也不再留额外空白。
- [P2] 模型与发送区域占用偏大；已压缩模型、强度下拉和发送/停止按钮，同时保留可读的四个 Codex 模型与五档强度。
- [P2] 右侧“环境信息”不够直观；标题已改为“回答参考范围”，明确它用于控制本次回答可读取的固定知识目录，并展示回答来源。

**Source visual truth**

- Codex 搜索弹窗参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-9fc1f421-c1ab-481a-a247-eba94433668a.png`。
- H.D.D composer 缝隙与控件尺寸问题证据：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-dc8427a5-b5dc-4193-a952-999a4a04cda8.png`、`C:\Users\86159\AppData\Local\Temp\codex-clipboard-9071bdaa-d408-4c5f-aebf-4af256ce8b15.png`。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`。
- 默认状态截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-codex-layout-v5.png`。
- 搜索弹窗截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-search-v5.png`。
- 默认视口实测中栏为 `461px`，消息区底部与 composer 顶部相接；textarea 和 toolbar 左边界均为 `254px`，右边界与中栏相差 `1px`（中栏分隔线）；搜索弹窗在工作区内水平居中。

**Full-view comparison evidence**

- 搜索弹窗覆盖整个 H.D.D 工作区并置于视觉中心，背景保留暗色 Codex 风格和轻量遮罩；左侧会话栏不再出现内嵌搜索页。
- composer 直接占用中栏宽度，文本框从消息区底部边界开始并与工具栏形成连续底部区域；模型、强度和发送控件缩小后仍可操作。
- 右侧以“回答参考范围”作为功能标题，保留目录添加/移除和来源查看能力。

**Viewport resilience**

- 900×700：三栏保持为 `190px / 434px / 215px`，搜索弹窗居中且无横向溢出。
- 600×800：自动堆叠为单列，composer 与中栏同宽（`529px`），页面无横向溢出。

**States and accessibility**

- 搜索弹窗使用 `role="dialog"`、`aria-modal="true"` 和 `aria-label="搜索聊天"`；输入框、关闭按钮和新对话操作均为真实可访问控件。
- 搜索入口继续暴露 `aria-expanded`；输入不存在的关键词后显示“没有匹配会话”。

**Runtime checks**

- `pnpm test` 通过：12 个测试文件、42 项测试。
- `pnpm run build` 通过：TypeScript 检查与 Vite production build 均通过。
- `git diff --check` 通过；仅有仓库既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器控制台 `warn/error` 实测为 0 条；搜索打开/关闭、响应式尺寸和中栏边界对齐均已实测。

**Implementation Checklist**

- [x] 搜索图标打开居中的独立搜索弹窗，并支持筛选、关闭和新对话。
- [x] 输入区贴合中栏边界，取消上方留白，缩小模型/强度/发送控件。
- [x] 右侧标题和说明改为直观的“回答参考范围”。
- [x] 通过测试、构建、diff、同视口源图对照、响应式和控制台检查。

final result: passed

---

## 2026-09-02 — H.D.D 双栏、项目库设置与右侧合并

**Findings**

- [P1] 右侧参考范围面板占用固定宽度，且所有项目库选中时没有可见的添加入口；已移除独立右栏，把项目库选择移到左侧底部的 H.D.D 设置。
- [P1] 项目库现在使用六个真实的可切换按钮，选中/取消选中都会更新计数；取消后可重新选择，另有“全部选择”恢复入口。
- [P1] 对话区与右侧来源区域已合并为一个宽中栏；回答产生引用后，来源和来源预览显示在消息流底部。

**Source visual truth**

- 本轮沿用上一轮 Codex 式 H.D.D 对话和 composer 参考图；本轮用户反馈作为结构问题证据，不新增或伪造视觉素材。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`。
- 双栏对话截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-two-pane-v7.png`。
- 项目库设置截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-library-settings-v7.png`。
- 搜索弹窗回归截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-search-v7.png`。
- 默认视口实测为左栏 `216px`、对话栏 `697px`，右侧独立上下文面板数量为 `0`，页面无横向溢出；composer 与对话栏同宽。

**Full-view comparison evidence**

- 左侧底部新增设置入口，与 Codex 式会话导航保持同一栏；点击后主区切换为 H.D.D 设置，不再挤占对话区右缘。
- 设置页只保留项目库选择这一项核心能力，六个目录以选中态/未选中态表达，用户可以真正完成“删除后再添加”。
- 对话区扩展到原右栏位置；回答来源改为消息流中的内联区域，保留引用选择和路径预览。

**Viewport resilience**

- 900×700：双栏保持为 `190px / 649px`，页面无横向溢出。
- 600×800：左侧会话栏和对话区自动堆叠，宽度均为 `539px`，页面无横向溢出。

**States and accessibility**

- 设置入口使用 `aria-label="H.D.D 设置"` 和 `aria-pressed`；项目库按钮使用 `aria-pressed`，并提供选择/取消选择的明确标签。
- 设置页提供“返回对话”按钮；对话区没有独立右侧上下文面板，来源仍有 `aria-label="回答来源"`。

**Runtime checks**

- `pnpm test` 通过：12 个测试文件、42 项测试；覆盖双栏无右栏、内联来源和项目库取消/重新选择。
- `pnpm run build` 通过：TypeScript 检查与 Vite production build 均通过。
- `git diff --check` 通过；仅有仓库既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器实际检查：项目库从 `6 / 6` 取消为 `5 / 6` 后，可重新选择恢复为 `6 / 6`；最终刷新后 H.D.D 页面正常加载。日志读取中仅保留编辑阶段的一条历史 Vite HMR 失败记录，未影响最终页面。

**Implementation Checklist**

- [x] 移除 H.D.D 独立右侧区域并扩展对话栏。
- [x] 在左侧底部加入 H.D.D 设置入口和项目库选择。
- [x] 将回答来源/来源预览并入对话消息流。
- [x] 通过项目库添加回归、测试、构建、diff、响应式和浏览器交互检查。

final result: passed

---

## 2026-09-02 — H.D.D 设置二级弹窗与项目库入口

**Findings**

- [P1] 左下“设置”直接切换到项目库页面，缺少与 Codex 相似的中间菜单层；已改为先打开悬浮设置菜单，再从菜单进入项目库。
- [P1] 项目库入口需要清晰可发现并保留原有选择能力；菜单中新增真实的“项目库”按钮，进入后仍可逐项取消、重新选择和全部选择。
- [P1] Esc 可能同时触发外层 H.D.D 弹窗关闭；菜单层现在拦截 Esc，只关闭设置菜单并保留 H.D.D 工作区。

**Source visual truth**

- 设置菜单参考图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-9eca5257-2b75-413c-89d9-f51c544c64de.png`。
- 参考重点为底部入口上方的悬浮圆角菜单、菜单项分组和向右进入符号；应用继续保持既有暗色 Codex 式视觉。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`。
- 当前浏览器现场截图已检查设置菜单和项目库页面；浏览器截图接口未将新截图写入宿主文件路径，因此不伪造本地截图路径。
- 默认视口实测设置菜单为 `312px` 宽，项目库入口存在；右侧独立上下文面板数量仍为 `0`，页面无横向溢出。

**Full-view comparison evidence**

- 点击左侧底部“设置”后，悬浮菜单锚定在左下方并覆盖到对话区，结构对应参考图的“底部入口 → 弹出菜单”关系。
- 菜单仅保留当前 H.D.D 的核心工作区设置，点击“项目库”后主区标题变为“项目库”，六个目录选择内容才显示。
- 菜单关闭按钮、点击外部区域和 Esc 均可退出；项目库页的“返回对话”保持原对话工作流。

**States and accessibility**

- 设置按钮使用 `aria-haspopup="dialog"` 和 `aria-expanded`；悬浮菜单使用 `role="dialog"`、`aria-modal="true"`。
- “打开项目库设置”是可聚焦真实按钮；项目库选择按钮继续使用 `aria-pressed` 并明确表达选择/取消选择状态。
- Esc 回归验证后 H.D.D 工作区仍存在；点击外部区域只关闭菜单。

**Runtime checks**

- `pnpm test` 通过：12 个测试文件、42 项测试。
- `pnpm run build` 通过：TypeScript 检查与 Vite production build 均通过。
- `git diff --check` 通过；仅有仓库既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器实际检查：菜单打开 → 项目库页面 `6 / 6` → 取消为 `5 / 6` → 重新选择为 `6 / 6`；最终浏览器 error/warning 日志为 `[]`。

**Implementation Checklist**

- [x] 增加设置悬浮菜单和项目库二级入口。
- [x] 保留项目库逐项选择、重新添加和全部选择。
- [x] 修复 Esc 关闭菜单时误关闭外层 H.D.D 工作区的问题。
- [x] 通过同视口参考检查、交互回归、测试、构建和浏览器日志检查。

final result: passed

---

## 2026-09-02 — H.D.D 设置菜单定位与宽度修复

**Findings**

- [P1] 设置菜单底边压住了底部设置按钮，导致原有设置图标被遮住；已将菜单提升到按钮上方并保留 `8px` 间距。
- [P1] 菜单宽度超过设置按钮；已让菜单宽度跟随左侧设置按钮，不再越过按钮右边界。

**Source visual truth**

- Codex 设置菜单位置参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-39d8ad1d-6807-4ba5-aedb-fae62e1f904a.png`。
- ObsUI 原问题截图：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-f9004807-9566-4c78-aeab-8d92fb3e6a02.png`。

**Implementation evidence**

- URL：`http://127.0.0.1:5173/?ui=tab-v2`。
- 当前浏览器现场复核：弹窗左边界与设置按钮均为 `x=50`，弹窗宽度 `191px`、按钮宽度 `191px`，弹窗底部到按钮顶部间距 `8px`；设置图标可见。
- 右侧独立上下文面板数量为 `0`，页面无横向溢出。

**Full-view comparison evidence**

- 设置菜单仍锚定在左侧底部入口上方，覆盖范围收敛在按钮宽度内；视觉关系与 Codex 的“底部入口上方弹出”一致。
- 菜单内容和“项目库”二级入口保持不变，点击项目库后仍进入六项选择页。

**States and accessibility**

- 设置按钮继续暴露 `aria-haspopup="dialog"` 和 `aria-expanded`；菜单内关闭按钮和项目库入口均为真实可聚焦控件。
- 点击外部区域、关闭按钮和 Esc 均只关闭设置菜单，不关闭 H.D.D 外层工作区。

**Runtime checks**

- `pnpm test` 通过：12 个测试文件、42 项测试。
- `pnpm run build` 通过：TypeScript 检查与 Vite production build 均通过。
- `git diff --check` 通过；仅有仓库既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器实际检查：设置菜单、项目库进入、项目库取消/重新选择、外部关闭、Esc 关闭和最终页面日志均通过；error/warning 为 `[]`。

**Implementation Checklist**

- [x] 设置图标不再被弹窗遮挡。
- [x] 弹窗宽度与设置按钮一致。
- [x] 弹窗固定显示在设置按钮上方并保留可读间距。
- [x] 通过同视口截图对照、几何检查、交互回归、测试和构建检查。

final result: passed
## 2026-09-03 — 功能区占比与 Tab 选中态收口

**Comparison target**

- 用户参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-ce6807e6-cb83-4bcb-b380-1acb29bb8591.png`（原 ObsUI）、`C:\Users\86159\AppData\Local\Temp\codex-clipboard-1332cc37-fe01-434d-8f07-e6f98bb8d81a.png`（QQ 占比）、`C:\Users\86159\AppData\Local\Temp\codex-clipboard-cfb50ca1-9e67-43fe-8873-43581f74ba23.png`（Tab 近景）。对照时忽略浏览器外框，只比较功能区内容。
- 浏览器实现：`F:\ResearchKB\.harness\qa\obsui\obsui-tabmodal-qq-proportion-v1.png`，应用内浏览器视口 `2048 × 1035 CSS px`，状态为 H.D.D 选中。

**Findings**

- [P1 fixed] 功能区外壳从固定 `1200 × 700px` 放大为大屏约 `80%` 的占比，2048 视口下实测为 `1638.4 × 820px`，更接近 QQ 页面密度。
- [P2 fixed] 选中 Tab 原先渲染的下拉箭头已移除；五个 Tab 均无额外 SVG、下划线或选中态位移，Tab 切换仍保持可用。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 字体与文字：保留原有字体、字号和 Tab 文案，仅移除选中态附加图标。
- 间距与布局：五个 Tab 继续等分；大屏功能区扩大，小屏 `1280 × 720` 下保持 `1200 × 680px` 的可用尺寸，关闭按钮可见。
- 颜色与表面：保留原有深色外壳、黄色选中态、边框和遮罩，不新增装饰层。
- 图像质量与内容：背景、品牌图标、H.D.D 内容与按钮图标未替换。
- 交互：点击 H.D.D 后唯一 Tab 为 `aria-selected="true"`，选中 Tab 内无箭头，控制台无 warning/error。

**Verification**

- [x] 应用内浏览器对照原 ObsUI / QQ 参考 / Tab 近景与修改后截图。
- [x] `2048 × 1035`：功能区 `1638.4 × 820px`，H.D.D 选中且无下标。
- [x] `1280 × 720`：功能区 `1200 × 680px`，关闭按钮可见。
- [x] `pnpm test`：12 个测试文件、43/43 通过。
- [x] `pnpm run build`：TypeScript 与 Vite 构建通过。
- [x] `git diff --check`：通过，仅有工作区既有的 LF/CRLF 提示。

final result: passed

---

## 2026-09-03 — H.D.D Codex 式发送按钮状态

**Comparison target**

- 空输入参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-703db1b9-0cc2-425f-88b7-645be505186a.png`，像素尺寸 `116 × 98`。
- 有输入参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-1536672b-1e6c-4898-8d1b-bf8a4360820f.png`，像素尺寸 `70 × 80`。
- 原 H.D.D 纸飞机按钮截图 `C:\Users\86159\AppData\Local\Temp\codex-clipboard-331be9a8-1e96-4d33-a2c5-f460460d5506.png` 仅作为修改前基线，不作为目标状态。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`，CSS 视口 `1280 × 720`，`devicePixelRatio=1.25`；浏览器截图按 `1×` 输出，未做额外缩放。

**Implementation evidence**

- 空输入局部截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-send-empty-v1.jpg`，像素尺寸 `116 × 98`。
- 有输入局部截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-send-filled-v1.jpg`，像素尺寸 `70 × 80`。
- 两张实现图均在 H.D.D 选中、默认深色工作台状态下，从发送按钮同位置裁切；参考图本身为浅色局部裁切，因此仅比较按钮几何、颜色、图标和状态，不把外围背景材质差异误判为控件偏差。

**Findings**

- [P1 fixed] 原通用黄色矩形纸飞机按钮已改为 H.D.D 专用的纯圆形按钮；实现计算尺寸为 `36 × 36px`、`border-radius: 50%`，右侧位置保持在工具栏末端。
- [P1 fixed] 按钮颜色与参考图采样值一致，为 `#ee7c37`（实现计算值 `rgb(238, 124, 55)`）；空输入状态不再被通用禁用透明度压暗。
- [P1 fixed] 空输入显示 `PiWaveform` 波形图标；输入非空文本后切换 `IoArrowUpOutline` 上箭头，按钮从禁用恢复为可提交；生成中的停止按钮和原有 `chat.loading` 分支保留。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 字体与文字：发送控件不含可见文字；原输入提示、模型选择文案和无障碍标签保持不变。
- 间距与布局：两种状态使用同一 `36 × 36px` 盒模型和同一右对齐位置，工具栏没有新增横向溢出；圆形尺寸与参考图约 `35px` 的实心圆边界一致。
- 颜色与视觉 token：新增 H.D.D 局部 `--v2-codex-orange`，空态和有输入态共用参考橙色；hover 仅做轻微提亮，不恢复黄色边框或矩形底。
- 图像与图标：目标是标准 UI 图标而非栅格图片；使用 `react-icons/pi` 的 `PiWaveform` 与 `react-icons/io5` 的 `IoArrowUpOutline`，未新增自绘 SVG、CSS 图形或占位图。
- 文案与交互：`aria-label="发送消息"` 保留；空态仍阻止空内容提交，非空态可用；实际生成流程的停止入口未改动。

**Focused comparison evidence**

- 参考图和实现图已在同一组视觉输入中对照。空态圆形位于裁切区域约 `(17, 39)`，有输入态约 `(13, 27)`；实现截图按同样的局部裁切偏移生成。
- 空态实现 DOM 为 `is-empty`、`disabled=true`、`viewBox="0 0 256 256"`；有输入实现为 `is-filled`、`disabled=false`、上箭头 `viewBox="0 0 512 512"`。两态计算圆角均为 `50%`，颜色均为 `rgb(238, 124, 55)`。

**Full-view and responsive evidence**

- 本轮提供的源图均为发送按钮局部图，不是完整页面，因此以 focused comparison 作为主验收依据；完整 H.D.D 页面在 `1280 × 720` 下保持双栏结构和无横向溢出。
- 按钮使用固定等宽高和现有工具栏对齐规则，不改变 H.D.D 页面断点或中栏布局；本轮未引入新的页面级响应式规则。

**Runtime checks**

- `pnpm test`：12 个测试文件、43/43 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅有工作区既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器实际检查：H.D.D 选中 → 空输入波形态 → 输入“整理实验数据”后上箭头态 → 清空恢复波形态；error/warning 日志为 `[]`。

**Implementation Checklist**

- [x] 圆形橙色发送控件替换原黄色矩形纸飞机控件。
- [x] 空输入显示波形，有输入显示上箭头。
- [x] 保留空内容拦截和生成中的停止逻辑。
- [x] 完成同裁切视觉对照、浏览器状态验证、测试、构建和 diff 检查。

final result: passed

---

## 2026-09-04 — H.D.D 发送按钮右下等距定位

**Comparison target**

- 用户最新参考：`C:\Users\86159\AppData\Local\Temp\codex-clipboard-97eb5d08-133e-4b51-9546-991ce9c26270.png`，源图像素尺寸 `286 × 245`；按用户要求将按钮收口到发送区域右下角，并使底部/右侧间距一致。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`，H.D.D 选中，CSS 视口 `1280 × 720`，`devicePixelRatio=1.25`。

**Implementation evidence**

- 空态局部截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-send-position-v4-empty.jpg`，像素尺寸 `286 × 245`。
- 有输入局部截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-send-position-v4-filled.jpg`，像素尺寸 `286 × 245`。
- 完整页面回归截图：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-send-position-v4-full-empty.jpg`、`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-send-position-v4-full-filled.jpg`。
- 同一组对照输入：`F:\ResearchKB\.harness\qa\obsui\obsui-hdd-send-position-v4-comparison.jpg`，依次为源图、空态实现、有输入实现。源图与实现图统一为 `286 × 245` 裁切尺寸；实现端以 CSS 几何和 `devicePixelRatio=1.25` 作为密度基准，避免把捕获密度差异误判为布局偏差。

**Findings**

- [P2 fixed] 按钮原先只在 textarea 内部定位，导致相对整个发送区域底部留白偏大；现改为相对 `.tab-modal-v2__hdd-composer` 绝对定位，右侧和底部实测分别为 `10.00003px` 与 `9.99995px`。
- [P3 fixed] 按钮尺寸从 `36 × 36px` 略增至 `40 × 40px`，仍保持 `border-radius: 50%`，位置和视觉重心更接近右下角。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 字体与文字：发送控件无可见文字；输入提示、模型选择文字和无障碍标签保持不变。
- 间距与布局：按钮从工具栏布局中脱离，统一锚定整个 composer；`right=10px`、`bottom=10px`，两种状态盒模型均为 `40 × 40px`，页面无横向溢出。
- 颜色与视觉 token：空态、有输入态继续使用 `rgb(238, 124, 55)` / `#ee7c37`，圆角为 `50%`，不恢复黄色矩形边框。
- 图像与图标：继续使用 `PiWaveform` 与 `IoArrowUpOutline` 标准图标；未新增自绘 SVG、CSS 图形或占位资产。
- 文案与交互：空态为 `is-empty`、`disabled=true`、波形 `viewBox="0 0 256 256"`；有输入为 `is-filled`、`disabled=false`、上箭头 `viewBox="0 0 512 512"`；清空后恢复空态，生成中的停止分支未改动。

**Focused comparison evidence**

- 已将源图、空态实现和有输入实现放入同一张 `obsui-hdd-send-position-v4-comparison.jpg` 对照；最终按钮视觉位于发送区域右下角，且右/下内边距一致。
- 浏览器 DOM 实测确认按钮相对整个 form 的右侧和底部间距均为 `10px`；输入内容通过 `padding-right: 62px`、`padding-bottom: 50px` 保留避让空间。

**Full-view and responsive evidence**

- 完整页面截图保留 H.D.D 双栏工作区、Tab、关闭按钮和底部 composer；空态/有输入态切换不改变页面级结构。
- `1280 × 720` 下 `scrollWidth=1280`、`scrollHeight=720`，无横向溢出；本轮没有新增断点规则。

**Runtime checks**

- `pnpm test`：12 个测试文件、43/43 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅有工作区既有的 LF/CRLF 转换提示，无 whitespace error。
- 浏览器实际检查：H.D.D 选中 → 空态波形 → 输入“整理实验数据”切换上箭头 → 清空恢复波形；error/warning 日志为 `[]`。

**Implementation Checklist**

- [x] 发送按钮位于整个 composer 右下角。
- [x] 右侧与底部间距均为 `10px`。
- [x] 尺寸略增至 `40 × 40px`，保持圆形和 Codex 橙色状态。
- [x] 空态/有输入态、清空回退、测试、构建、截图对照和 diff 检查均通过。

final result: passed

---

## 2026-09-08 — 最新 QA：独立主板温度映射

完整对照报告见本文件的“独立主板温度映射与温度轨复核”章节。源图为 `C:\Users\h\AppData\Local\Temp\codex-clipboard-3589dd64-458c-4300-a93e-7b4f4fbd065a.png`（`369 × 650 px`）；实现为 `http://127.0.0.1:5173/?ui=tab-v2` 的浏览器实时捕捉（`2048 × 960 CSS px`，聚焦系统状态卡）。已在同一轮视觉上下文中复核完整卡片与温度区域，浏览器实际状态为 CPU `73 °C`、主板 `43 °C`，文本、数值与温度轨互不重叠。

- [x] `/lpc/it8613e/0/temperature/1` 已作为独立主板温度；不再把第一项 LPC 温度当作主板温度。
- [x] v3/v4 旧选择已清理，v5 默认选择已刷新为中文推荐读数。
- [x] 浏览器 DOM、实时接口、`pnpm test`（15/15 文件、58/58 测试）、`pnpm run build` 和 `git diff --check` 均已复核；仅保留既有 LF/CRLF 提示。

final result: passed

---

## 2026-09-11 — 文献板块 Zotero 三栏布局

**Comparison target**

- 用户参考图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-682b09fc-b396-4a76-b9aa-e6f3dd59218f.png`；参考重点为 Zotero 的左侧分类树、中间文献纵向列表、右侧选中文献详情，以及标题/创建者/附件列的密度关系。
- 计划书：`C:\Users\h\Desktop\素材\ZZZ素材\ZZZ素材\ObsUI_V1_总体规划与实施计划书.docx`；本轮仅提取文献板块作为产品边界，附件文字不作为额外操作指令。

**Implementation evidence**

- 实现入口：`http://127.0.0.1:5175/?ui=tab-v2`，打开“知识资源”后默认进入“文献”标签。
- 浏览器现场视口：`928 × 986 CSS px`；实现截图通过 Codex 应用内浏览器捕获并进行现场对照，截图接口未将文件写入宿主路径，因此不伪造本地截图路径。
- 运行时展示 12 条演示条目；标题/作者/期刊/摘要/影响因子/链接均遵循“有真实数据才展示”的边界，Zotero 同步仍标记为待接入。

**Findings**

- [P1 fixed] 文献标签已从原占位页替换为可用的 Zotero 式三栏工作区：左侧分类、中间列表、右侧详情。
- [P1 fixed] 中间区域提供添加、搜索、字段筛选入口；左侧提供新建分类；右侧提供标题、作者、摘要、ObsUI 扩展字段和可用链接区。
- [P2 fixed] 英文条目使用英文标题为主、中文译名为辅；缺失年份、期刊、影响因子或链接时显示待同步/待补充，不生成猜测值。
- [P2 fixed] 修正左侧分类网格的文字列伸展规则；短分类名在当前预览视口中完整显示，不再被无意义截断。
- 无待处理 P0、P1 或 P2。

**Full-view comparison evidence**

- 参考图的三栏职责和信息层级已映射到实现：分类树保持左侧垂直导航，列表以标题/创建者/年份/附件为列，选中条目在右侧展示详情。
- 实现沿用 ObsUI 现有深色工作台外壳，仅复刻 Zotero 的信息架构与列表密度；没有引入新的图片资产或自绘图形，图标来自现有 `react-icons/io5`。
- 在当前视口实测 `grid-template-columns: 190px 372.8px 290px`，文档根节点无横向溢出；分类短标签可读，窄屏样式隐藏详情栏并保留列表主流程。

**States and accessibility**

- 文献分类、文献列表、文献详情均有 `aria-label`；列表使用 `role="listbox"` / `role="option"`，选中项暴露 `aria-selected`。
- 搜索、创建分类、添加文献均为真实表单控件；对话框使用 `role="dialog"`、`aria-modal="true"`，并支持关闭/取消。
- 浏览器现场验证：初始 `12 / 12`，搜索 `physics-guided` 后为 `1 / 12`；创建“实验记录”分类后可见，添加会话条目后为 `13 / 13`，提示明确说明未写回 Zotero。

**Runtime checks**

- `pnpm test`：17 个测试文件、71/71 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅有工作区既有的 LF/CRLF 转换提示，无 whitespace error。
- 仍未接入 Zotero 正式 API/local API；本轮不读取或修改 `zotero.sqlite`，影响因子同步和持久化分类属于后续阶段。

**Implementation Checklist**

- [x] Zotero 三栏布局和现有 V2 文献标签接入。
- [x] 分类导航、搜索、添加、详情和空结果状态。
- [x] 中英文标题层级、附件/链接和影响因子诚实状态。
- [x] 页面交互测试、生产构建、差异检查和浏览器现场对照。

final result: passed

---

## 2026-09-20 — 本机设备档案

**Comparison target**

- 用户参考图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-90de12f8-6c86-408f-bae5-0989e46fd01d.png`；本轮只采用其中的字段清单，不复制其像素级布局、配色或窗口外观。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`，应用内浏览器现场打开“本机”模块。

**Implementation evidence**

- 新增真实本机设备档案读取：操作系统、处理器、显卡、主板、硬盘、显示器、内存及内存模块。
- 设备档案位于“本机”模块顶部，与 Codex 使用限额并列；继续沿用 ObsUI 现有卡片、颜色、间距和 `react-icons/io5` 图标体系。
- 后端读取结果不包含序列号、MAC/IP、模型文件路径等标识；无法可靠取得的工艺、芯片组、屏幕尺寸或通道数保持“暂不可用”。

**Findings**

- [P1 fixed] 新增“设备档案”区块，不再使用“设备能力档案”命名。
- [P2 fixed] 设备字段采用两列紧凑信息网格，显卡、存储、显示器和内存模块支持多条结果；窄视口会收敛为单列。
- [P2 fixed] 设备数据与系统指标共用接口但使用 30 秒缓存，避免每 3 秒重复查询静态硬件信息。
- 无待处理 P0、P1 或 P2。

**Runtime checks**

- 现场接口检查：`/api/system-metrics` 返回设备档案，当前主机的系统、CPU、双 GPU、主板、SSD、显示输出和内存均已在页面显示。
- 应用内浏览器 AX 树和截图检查通过；设备档案标题、状态、七类字段均可见，无新增横向溢出。
- `pnpm test`：27 个测试文件、166/166 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅有工作区既有的 LF/CRLF 转换提示，无 whitespace error。
- 当前 CUA 现场未提供独立控制台日志读取接口，因此本轮不虚构 console 日志结论。

**Implementation Checklist**

- [x] 设备档案名称和本机模块位置。
- [x] 真实设备字段接入、缓存、解析和不可用状态。
- [x] 现有风格复用、响应式布局、单元测试、构建和差异检查。

final result: passed

---

## 2026-09-20 — 设备档案并入本机状态卡片区

**Comparison target**

- 用户参考图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-fe74078c-e2c7-447d-999f-6d8f60376eb7.png`，原始尺寸 `2095 × 531 px`；图像传输展示为 `2048 × 519 px`。
- 参考重点是“本机状态”横向卡片轨道的层级、卡片容器、顶部色条、标题和横向滚动，不要求复制截图外部窗口。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`，Chrome 现有 ObsUI 预览标签，“本机”选中。

**Comparison history**

- [P1 earlier] 设备档案此前作为 Codex 额度旁的独立顶部面板，信息层级与用户参考的本机状态卡片区不一致。
- [P1 fixed] 已移除顶部独立设备面板，将设备档案作为本机状态横向卡片轨道的第一张 `ContentCard`；系统状态、网络状态、本地模型和 Codex 自动化继续保留为同一轨道中的其他卡片。
- 修复后现场截图显示五张同级卡片、统一卡片宽度/高度、统一拖动和左右滚动控制；没有发现新的 P0/P1/P2 问题。

**Fidelity surfaces**

- 字体与排版：设备档案复用现有卡片标题、Consolas 数据字体、标签层级和截断规则；不引入参考图之外的新字体。
- 间距与布局：复用 `.tab-modal-v2__card-rail`、`.tab-modal-v2__content-card` 和 `.tab-modal-v2__overview-card` 的轨道间距、卡片宽度、内边距及横向滚动行为。
- 颜色与视觉 token：设备档案使用现有蓝色顶部强调线和卡片背景；状态点复用现有 ready/warning/muted 语义色。
- 图标与资产：使用已有 `react-icons/io5` 图标，不新增自绘 SVG、CSS 图形或占位图片。
- 内容：继续展示操作系统、处理器、显卡、主板、硬盘、显示器、内存及模块信息；真实不可用字段保持诚实的“暂不可用”。

**Runtime checks**

- 应用内浏览器 AX 树确认本机状态轨道顺序为：设备档案、系统状态、网络状态、本地模型、Codex 自动化。
- 现场截图确认设备档案与参考卡片区使用相同的卡片容器和横向轨道；设备档案内容在当前卡片高度内可见，超长文本按现有规则截断。
- `pnpm test`：27 个测试文件、166/166 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅有工作区既有的 LF/CRLF 转换提示，无 whitespace error。
- 当前 CUA 现场未提供独立控制台日志读取接口，因此不虚构 console 日志结论；没有观察到页面运行时错误。
- 现场截图由应用内浏览器以工具内存形式返回，未伪造宿主文件路径。

**Implementation Checklist**

- [x] 设备档案改为本机状态横向卡片。
- [x] 与现有系统、网络、模型、自动化卡片共享容器和滚动交互。
- [x] 保留真实设备数据、字段完整性、测试和构建验证。

final result: passed

---

## 2026-09-20 — 首要任务横向长条尺寸调整

**Comparison target**

- 用户参考图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-7b976fac-c7e8-487a-9c64-21cb5a4527d2.png`，原始尺寸 `1764 × 366 px`；参考重点是深色首要任务板块、黄色进度条、截止信息、优先级和任务名称。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`，Chrome 现有 ObsUI 预览标签，“目标 / 当前目标”选中。

**Comparison history**

- [P1 earlier] 首要任务由上下两块组成，信息带和任务名称之间存在明显断层，且卡片高度约 `114px`。
- [P1 fixed] 将截止信息、进度、剩余时间、优先级和任务名称合并到同一条横向板块；按本轮反馈将卡片高度调整到约 `130px`，保留菜单和任务操作。
- 修复后未发现新的 P0、P1 或 P2 问题；单条长条是对原参考结构的明确简化，而不是新增视觉模块。

**Fidelity surfaces**

- 字体与排版：继续沿用目标页现有字体、字号层级和任务标题截断规则；任务标题与截止信息在同一水平轴线上。
- 间距与布局：`.target-v1__primary-strip` 使用单行网格；实测首要任务卡片为 `1367 × 130 CSS px`，不再保留上下分隔线。
- 颜色与视觉 token：复用原有深色背景、灰色边框、黄色进度条和黄色优先级星标。
- 图像与图标：本轮没有新增图片资产；菜单、星标和其他控件继续使用现有组件与图标。
- 文案与交互：日期、具体时间、百分比、进度条、截止剩余时间、任务名称和操作菜单均保持可见；菜单打开后仍提供“标记已完成”和“取消”。

**Implementation evidence**

- 浏览器现场截图已捕获：完整视口为 `2048 × 962 CSS px`，首要任务聚焦区域为 `1367 × 130 CSS px`；截图由 CUA 工具内存返回，未伪造宿主文件路径。
- AX/DOM 现场确认主卡片只有一个 `.target-v1__primary-strip`，旧的 `.target-v1__primary-meta` 与 `.target-v1__primary-body` 不再渲染。
- 菜单交互现场确认 `aria-expanded=true` 时显示“标记已完成 / 取消”，关闭后恢复原状态；控制台 error/warn 为 `[]`。

**Runtime checks**

- `pnpm test`：27 个测试文件、166/166 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅有工作区既有的 LF/CRLF 转换提示，无 whitespace error。

**Implementation Checklist**

- [x] 首要任务改为单个横向长条板块。
- [x] 尺寸从约 `114px` 增至约 `130px`，同时保留一行信息布局。
- [x] 复核进度条、操作菜单、AX 结构、测试、构建和控制台状态。

final result: passed

---

## 2026-09-20 — 功能区统一为设置页视觉风格

**Comparison target**

- 设置页视觉参考：`C:\Users\h\AppData\Local\Temp\codex-clipboard-83a2e392-0d5d-4c2b-b11c-f78343de5f81.png`；采用其蓝灰渐变底色、冷色细线、Segoe UI 字体层级、柔和圆角和金色选中态。
- 功能区布局参考：`C:\Users\h\AppData\Local\Temp\codex-clipboard-6aeb1724-01b6-4df7-82cf-dc03f0dd0232.png`；本轮严格保留目标、本机、仓库、文献和 H.D.D 的既有功能、分区和交互路径。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`，Chrome 现有 ObsUI 预览标签。

**Findings**

- [P1 fixed] 功能区原有中性灰工业风与设置页蓝灰风格割裂；现通过共享视觉主题统一外壳、页签、面板、卡片、输入框、按钮和选中态。
- [P2 fixed] 仓库筛选原先仍接近实心主按钮；现改为与设置页导航一致的半透明金色渐变和左侧金色强调线，实心金色继续只表达主操作。
- [P2 fixed] 五个功能区此前分别维护不同的灰色 token；现统一映射为设置页的背景、文字、弱文字、边线和金色 token，同时保留状态语义色与 H.D.D 橙色发送按钮。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 字体与排版：功能区统一使用 `Segoe UI Variable / Segoe UI / Microsoft YaHei UI` 字体栈，并调整标题和控件字重；未改变字号、文本内容和信息层级。
- 线条与容器：面板采用 `rgba(190, 208, 226, ...)` 冷色细线、11–12px 柔和圆角和轻量内高光；外壳继续保持原 14px 圆角。
- 颜色与状态：背景切换为设置页同源的深蓝灰渐变；页签、目标导航、仓库筛选和文献分类使用半透明金色选中态；主要操作保持实心金色。
- 布局边界：共享主题文件只包含颜色、字体、边框、圆角、阴影和视觉状态属性；测试明确禁止宽高、网格、间距、定位、溢出和 transform 等布局属性。
- 图标与资产：继续使用现有图标和图片资产，没有新增或替换功能区资产。

**Geometry evidence**

- 修改前后 `.obsui-v1-shell` 均为 `1638.4 × 769.28`，坐标 `(204.8, 96.16)`。
- 修改前后 `.tab-modal-v2__content-viewport` 均为 `1604.8 × 671.67`，坐标 `(221.6, 176.96)`；顶部栏均为 `1636.8 × 64`。
- 修改前后目标侧栏均为 `220 × 670.08`；首要任务条均为 `1365.6 × 128`，坐标与分栏完全一致。
- 五个标签均完成现场切换；文档根节点没有横向溢出。

**Runtime checks**

- Chrome 现场浏览目标、本机、仓库、文献和 H.D.D；卡片、筛选、输入区、按钮和选中状态均使用新主题，控制台 error/warn 为 `[]`。
- 本机模块确认仍有 5 张状态卡；文献模块确认 158 条列表数据可见；仓库空状态、H.D.D 空会话状态和目标任务均保持原功能结构。
- QA 操作中误触的“通电话”任务已按原 ID、日期、时间、优先级和创建时间完整恢复；最终现场仍为 `21:00 / 2 星 / 97%`，其他任务“回家”未改变，临时恢复代码已全部移除。
- `pnpm test`：28 个测试文件、168/168 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅有工作区既有的 LF/CRLF 转换提示，无 whitespace error。

**Implementation Checklist**

- [x] 仅新增共享视觉主题，不改功能组件、信息结构或布局规则。
- [x] 目标、本机、仓库、文献和 H.D.D 五区统一设置页风格。
- [x] 增加“主题层不得包含布局属性”的自动化回归测试。
- [x] 完成几何尺寸对照、五页浏览器验收、控制台、测试、构建和差异检查。

final result: passed

---

## 2026-09-21 — 功能区参考绝区零的炭灰与暖色主题

**Comparison target**

- 源视觉真值：`C:\Users\h\Desktop\素材\ZZZ素材\ZZZ素材\zzz原始截图\074d0adb-c4b1-45f2-9277-28e3bc4da219.png`（`1920 × 1080 px`），并用同目录 `e065a63b-67f9-45bc-89be-071a3e59f59c.png` 复核黑色面板、黄色选中、橙红行动和荧光绿完成态。
- 同画面对照输入：`C:\Users\h\.codex\visualizations\2026\09\21\01a0c254-38b2-7180-ac0a-0f206606677e\obsui-zzz-theme-comparison.jpg`，左侧为源图、右侧为实现截图。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`；CSS 视口 `2048 × 1018`，`devicePixelRatio = 1.25`；浏览器截图按工具输出为 `2048 × 1018 px`，未做额外密度缩放。
- 实现截图：`C:\Users\h\.codex\visualizations\2026\09\21\01a0c254-38b2-7180-ac0a-0f206606677e\obsui-zzz-theme-local.jpg`、`obsui-zzz-theme-hdd.jpg`，均为 `2048 × 1018 px`。
- 状态：功能面板打开；现场依次检查“目标 / 本机 / 仓库 / 文献 / H.D.D”，并重点复核本机和 H.D.D 空态。源图与实现内容并非同一产品布局，因此本轮只比较颜色、材质、层级和语义强调，不做组件位置的像素复刻。

**Findings**

- [P1 fixed] 功能区原先的蓝灰大面积底色与用户提供的参考风格不协调；现统一为炭灰/近黑基础面、米白文字和暖色细线，保留轻微斜纹与内嵌高光。
- [P2 fixed] 选中态和主操作统一为亮黄色；橙色用于提醒/信息和 H.D.D 用户态，荧光绿仅用于完成/健康状态，避免蓝色同时承担页面底色和状态色。
- [P1 fixed] 首轮改色后发现 H.D.D 的独立 `library-settings / messages / search-panel` 仍由结构样式提供深蓝背景；已补充工作区级覆盖，复核后该区域与其他功能页统一为炭灰斜纹面。
- [P3 acceptable] 首页底层壁纸仍保留原有蓝色角色图；它位于功能面板之外且被模糊处理，本轮没有替换用户未要求更换的背景资产。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 字体与排版：沿用现有 `Segoe UI Variable / Segoe UI / Microsoft YaHei UI` 字体栈、字号、字重和文案；本轮不改信息结构。
- 间距与布局：仅调整颜色、渐变、边框、阴影和纹理；目标、本机、仓库、文献、H.D.D 的布局、滚动、卡片层级和交互路径保持不变。
- 颜色与视觉 token：共享 `functional-theme.css` 现在以炭灰为底，亮黄为主选择，橙红为提醒/行动，荧光绿为完成态；功能区结构边缘保持中性。
- 图像质量与资产：没有复制或重绘参考图中的角色、Logo 或游戏图标；首页背景与现有功能图标均未更换。
- 文案与内容：AX 树现场仍显示真实设备、网络、本地模型和系统读数；只改变外观，不改数据来源或不可用状态。

**Comparison history**

- 首轮主题覆盖完成后，目标、本机、仓库、文献和 H.D.D 均已去除主面板蓝底；现场检查 H.D.D 仍可见独立深蓝主区域。
- 修复：新增 H.D.D 专用工作区、消息区、搜索区和模型选择控件的暖色/中性覆盖；复捕 `obsui-zzz-theme-hdd.jpg`，主区域与侧栏均为炭灰斜纹面，选中态为黄色。
- 最终本机截图 `obsui-zzz-theme-local.jpg` 与源图在 `obsui-zzz-theme-comparison.jpg` 中并排复核，未发现新的 P0/P1/P2 视觉问题。

**Runtime checks**

- Chrome 现场切换五个功能页；本机模型列表仍为连续平面行，不恢复表格列或 VRAM/RAM 信息。
- 浏览器控制台 error/warn 为 `[]`。
- `pnpm test`：28 个测试文件、171/171 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅输出工作区既有 LF/CRLF 转换提示。

**Implementation Checklist**

- [x] 以本地绝区零截图提取炭灰、米白、亮黄、橙红和荧光绿配色语义。
- [x] 只修改现有共享视觉主题，未新增平行主题、依赖、布局或数据逻辑。
- [x] 覆盖五个功能页和 H.D.D 独立深蓝表面。
- [x] 完成同画面对照、浏览器现场切换、控制台、测试、构建和差异检查。

final result: passed

---

## 2026-09-21 — 文献区域统一为单一炭灰表面

**Comparison target**

- 修改前用户截图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-99f1c789-bffe-4df5-8b01-783b5670867a.png`（`2167 × 1059 px`）。
- 同画面对照输入：`C:\Users\h\.codex\visualizations\2026\09\21\01a0c254-38b2-7180-ac0a-0f206606677e\obsui-zzz-literature-unified-comparison.jpg`；左侧为用户截图，右侧为实际页面。
- 实现截图：`C:\Users\h\.codex\visualizations\2026\09\21\01a0c254-38b2-7180-ac0a-0f206606677e\obsui-zzz-literature-unified-matched.jpg`（`2048 × 1018 px`）。CSS 视口为 `2048 × 1018`，`devicePixelRatio = 1.25`。
- 状态：文献页打开，选中与用户截图相同的“Influence of powder morphology...”条目，左侧分类、中间列表和右侧条目详情均可见。

**Findings**

- [P1 fixed] 文献页原先由深黑侧栏、深浅交替列表行、渐变详情卡和多种灰阶面板共同组成，视觉层级过多；现将工作区、页眉、左右三栏、普通列表行和详情卡收敛为同一 `#242321` 炭灰表面。
- [P2 fixed] 取消普通列表行的交替底色和详情卡渐变；黄色仅保留给当前选中条目/分类和主要操作，绿色同步状态仍保留其状态语义。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 颜色与材质：文献结构面统一为单一中性炭灰，保留细线、文字层级和必要的选中态；不再用不同灰阶区分结构层。
- 布局与交互：未改变文献栏宽度、列表结构、滚动、详情字段、数据、文案或交互路径。
- 字体与资产：沿用现有字体、图标、Zotero 状态和文献内容，没有新增依赖或替换图像资产。

**Runtime checks**

- Chrome 现场检查文献页：工作区、页眉、侧栏、列表普通行和详情卡的实际背景均为 `rgb(36, 35, 33)`；普通列表行不再交替变色，选中行保留黄色语义。
- 浏览器控制台 error/warn 为 `[]`。
- `pnpm test`：28 个测试文件、171/171 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅输出工作区既有的 LF/CRLF 转换提示。

**Implementation Checklist**

- [x] 只在现有共享视觉主题中增加文献区颜色收敛规则。
- [x] 保留选中态、主要操作和同步状态的语义颜色。
- [x] 完成同条目状态对照、浏览器现场检查、控制台、测试、构建和差异检查。

final result: passed

---

## 2026-09-21 — 顶部工作区切换动效参考绝区零

**Comparison target**

- 用户参考图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-d20284c1-4d80-4647-a8da-da6304a59b46.png`；重点是五等分顶部工作区栏、炭黑底、暖黄色选中填充和亮色下边缘。
- 用户参考视频：`C:\Users\h\Desktop\素材\ZZZ素材\ZZZ素材\zzz原始录屏\QQ20260824-215851-HD.mp4`；本地分析证据目录为 `C:\Users\h\AppData\Local\Codex\local-mp4-analysis\runs\20260921-142108-123-绝区零工作区切换动画提取`。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`，Chrome CUA 现场视口 `2048 × 1018`，`devicePixelRatio = 1.25`；现场截图由 CUA 工具内存返回，未伪造宿主文件路径。

**Findings**

- [P1 fixed] 顶部工作区原先只做颜色切换，缺少参考视频中的“选中态先落位、内容随后进入”的节奏；现在选中页签有短促的亮度回弹与落位，内容区同步做短距离上移淡入。
- [P2 fixed] 页签退场与新页签入场均保留在同一条五等分轨道中，过渡期间允许旧选中态淡出、新选中态建立，稳定后仍只有一个 `aria-selected` 工作区。
- [P3 acceptable] 参考视频的精确缓动曲线无法从约 125ms 采样间隔还原；实现采用同样的短时、克制、暖色强调节奏，没有复制游戏素材或增加独立动画依赖。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 动效节奏：页签 `240ms cubic-bezier(.22, .8, .26, 1)`；页面 `220ms cubic-bezier(.22, .8, .26, 1)`，与视频中短促的切换反馈和内容延后稳定相匹配。
- 颜色与材质：沿用现有绝区零风格的炭灰底、暖黄色选中态和亮色底边，不新增蓝色或第二套主题。
- 布局与交互：保留五个工作区、键盘左右切换、焦点移动和既有内容结构；动效只使用 opacity、transform、filter，不改变页面尺寸和布局。
- 可访问性：`prefers-reduced-motion: reduce` 下关闭页签和页面动画；稳定状态由现有 `aria-selected`/tabpanel 语义保证。

**Implementation evidence**

- 实际页面从“文献”切换到“本机”并回到“目标”时，现场确认新面板可见，稳定后选中工作区数量为 `1`。
- 切换约 `55ms` 采样仍可读到 `obsui-v1-top-tab-settle` 和 `obsui-v1-page-in`；页面计算样式显示 `opacity ≈ 0.985`、`translateY ≈ 0.275px`，说明不是瞬时跳变。
- 现场检查“目标 / 本机 / 文献”，顶部轨道保持五等分，选中态使用暖黄色填充和亮色底边；控制台 error/warn 为 `[]`。

**Runtime checks**

- `pnpm test`：28 个测试文件、171/171 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅输出工作区既有的 LF/CRLF 转换提示。
- 本地视频分析报告标记源文件 `verified_unchanged`；分析报告已补齐并完成清理，生成的 JPG/联系表已删除，仅保留 JSON、Markdown 和文本证据。

**Implementation Checklist**

- [x] 顶部工作区页签加入短促选中态回弹，并保留暖黄色视觉语言。
- [x] 页面切换加入短距离上移淡入，避免内容瞬时替换。
- [x] 支持减少动态效果，未修改功能、数据和页面布局。
- [x] 完成真实浏览器现场、控制台、测试、构建和差异检查。

final result: passed

---

## 2026-09-21 — 顶部 Tab 视觉与切换范围纠正

**Comparison target**

- 修改前截图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-fa03dd4b-53a2-4454-806c-c65eabca9f30.png`（`421 × 73 px`），显示暗黄色选中面、黄字和底部亮黄条。
- 绝区零参考截图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-7756f8e5-6dca-4dbe-af4c-e3090ad3dcc9.png`（`854 × 113 px`），目标是未选中灰底白色粗斜体、选中黄底黑色粗斜体、独立圆角 Tab 与黑色间隙。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`；Chrome CUA 现场视口 `2048 × 1018`，`devicePixelRatio = 1.25`，状态为“本机”选中。
- 实现截图由 CUA 工具以内存图像返回，没有伪造宿主文件路径；全画面和顶部 Tab 聚焦区域均已与两张源图在本轮中实际打开并检查。

**Findings**

- [P1 fixed] 上一轮误把内容区加入上移淡入；本轮恢复原有 `150ms ease-out` 纯透明度淡入，计算样式为 `transform: none`，修改范围只保留在顶部 Tab。
- [P1 fixed] 原选中态仍是暗橄榄底、黄色文字和 `inset 0 -3px` 黄条；现改为整块亮黄色背景、黑色文字，并彻底移除底部黄条。
- [P2 fixed] 原未选中 Tab 接近透明深底、灰字且连成一体；现改为独立中灰按钮、白色文字、4px 黑色间隙和轻量内嵌明暗边。
- [P2 fixed] 字体改为 `Microsoft YaHei UI` 优先、14px、900 字重，并对文字做 `-8deg` 斜切；未选中文字加入黑色描边阴影，选中文字保持清晰黑字。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 字体与排版：字号、粗细、倾斜方向和未选中文字黑色轮廓均按参考图收紧；H.D.D 使用同一字重与倾斜规则。
- 间距与布局：保留五等分总体宽度和 38px 高度，只在 Tab 之间加入 4px 间隙，并将单个 Tab 改为 `8px 8px 3px 3px` 圆角。
- 颜色与 token：未选中为 `rgb(75, 75, 75)` 配近白文字；选中为 `rgb(240, 198, 0)` 配 `rgb(22, 19, 10)` 黑字；没有黄色下边缘。
- 图像与资产：参考画面没有需要复制的独立图像资产；本轮只调整现有 HTML Tab 的字体、背景、边框和状态，不复制游戏 Logo、图标或纹理。
- 文案与内容：工作区名称、顺序、键盘操作、页面内容和数据均未改变。

**Comparison history**

- 早期实现保留了暗黄色选中面和底部亮黄条，并扩展了内容区动画；用户明确指出两者都不符合目标。
- 修复后现场截图显示五个独立灰色 Tab，“本机”为完整黄色块且文字为黑色；稳定状态只有一个选中 Tab。
- 本节取代上一节中“内容区同步上移淡入”和“亮色底边”的实现结论；上一节仅作为历史记录保留。

**Runtime checks**

- DOM/计算样式确认选中 Tab 数量为 `1`；内容区动画仍为 `obsui-v1-page-in 0.15s` 且 `transform: none`。
- 浏览器控制台 error/warn 为 `[]`。
- `pnpm test`：28 个测试文件、171/171 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅输出工作区既有 LF/CRLF 转换提示。

**Implementation Checklist**

- [x] 仅保留 Tab 状态动画，恢复原内容切换效果。
- [x] 未选中灰底白字；选中黄底黑字。
- [x] 移除底部黄条，补齐独立圆角、间隙和参考字体风格。
- [x] 完成真实页面、计算样式、控制台、测试、构建和差异检查。

final result: passed

---

## 2026-09-21 — 本机区域移除底部横向滑动示意区

**Comparison target**

- 修改前用户截图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-cfde41bb-9334-4291-9aad-8e3efd39d35f.png`（`2009 × 650 px`）。
- 底部滑动区局部截图：`C:\Users\h\AppData\Local\Temp\codex-clipboard-dd149fad-01a0-4bb1-ab7f-d530b5ed97b8.png`（`2011 × 72 px`）。
- 浏览器实现：`http://127.0.0.1:5173/?ui=tab-v2`；Chrome CUA 现场视口 `2048 × 1018`，`devicePixelRatio = 1.25`，状态为“本机”选中。
- 实现截图由 CUA 工具以内存图像返回；全画面与本机区域底部均已在本轮实际打开并检查，未伪造宿主文件路径。

**Findings**

- [P1 fixed] 本机状态卡片轨道原本显示蓝灰色原生横向滚动条，形成独立的底部滑动示意区；现仅对本机区域隐藏滚动条轨道和滑块，四张可见卡片下方不再出现横条。
- [P2 fixed] 未改变卡片轨道的横向溢出、拖拽、滚轮处理或第五张卡片数据；现场 DOM 仍确认 `scrollWidth = 2050`、`clientWidth = 1573`，横向内容能力保留。
- [P2 fixed] 系统状态卡片内部的温度纵向滚动条仍保留，避免误伤卡片内部信息浏览。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 布局与留白：本机状态卡片的高度、四卡可见布局和外层收口保持不变，仅移除底部横向滚动视觉。
- 交互：只增加本机区域的滚动条隐藏规则，不删除 `CardRail` 的拖拽、滚轮和横向溢出能力。
- 颜色与材质：移除蓝灰色滑动条后，本机区域底部与现有炭灰工作区背景自然衔接；未引入新颜色或新组件。
- 数据与文案：设备档案、系统状态、网络状态、本地模型及 Codex 自动化内容均未修改。

**Runtime checks**

- Chrome 现场检查：本机区域底部滚动条计算样式为 `scrollbar-width: none`，WebKit 滚动条为 `display: none`；横向溢出仍存在，内部温度滚动仍可见。
- `pnpm test`：28 个测试文件、171/171 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅输出工作区既有的 LF/CRLF 转换提示。

**Implementation Checklist**

- [x] 只对本机状态区域隐藏底部横向滑动示意区。
- [x] 保留横向卡片访问能力和卡片内部纵向滚动。
- [x] 完成源图对照、真实浏览器现场检查、测试、构建和差异检查。

final result: passed

---

## 2026-09-21 — 本机卡片区边缘导航箭头

**Comparison target**

- 源视觉：`C:\Users\h\Desktop\素材\ZZZ素材\ZZZ素材\zzz原始录屏\QQ20260824-215851-HD.mp4`（`1918 × 1078 px`，聚焦 `00:00:05-00:00:12`）；逐帧观察保留于 `C:\Users\h\AppData\Local\Codex\local-mp4-analysis\runs\20260921-153505-587-绝区零日常箭头动效质感复核\visual_observations.md`。
- 实现：`http://127.0.0.1:5173/?ui=tab-v2` 的 Chrome CUA 现场截图，`2048 × 966 px`，本机工作区。截图由浏览器工具以内存图像返回，未伪造本地截图路径。
- 归一化：两者的整体页面尺寸不同，比较聚焦卡片区左右边缘的箭头形状、纯白高对比、垂直居中和起点/中段/终点可见性，而不比较卡片本身的尺寸与内容。

**Findings**

- [P1 fixed] 隐藏原生横向滚动条后，卡片区缺少明确导航提示；现在以卡片轨道边缘的白色矢量尖角箭头取代，不会恢复底部滑动示意条。
- [P1 fixed] 起点只暴露“本机状态向右滚动”，拖到中段时左右箭头同时可用，点击右箭头到终点后只保留“本机状态向左滚动”；未保留误导性的禁用白箭头。
- [P2 fixed] 参考视频是中轴稳定的轻微水平呼吸，而非上下跳动；两侧箭头以同一 `1.15s` 节奏向轨道中心轻推 `4px` 后回弹。系统要求减少动态效果时关闭该动画。
- [P2 fixed] 箭头改用 `react-icons` 的 `IoChevron*Sharp` 矢量路径，采用纯白前景、明确尺寸和单像素深色投影；没有使用截图、低分辨率 PNG、字体字符或彩色发光。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 字体与文案：本轮为图标控制件，无新增可见文案；保留中文无障碍名称“本机状态向左/右滚动”。
- 布局与节奏：箭头绝对定位在卡片区两侧且垂直居中，不改变五张卡片、卡片高度、间距或内部纵向滚动。
- 颜色与材质：源参考为中性白，现场实现也为白色高对比箭头；深色单像素投影只用于避免在石墨卡片上丢失边缘。
- 图像质量：使用矢量图标路径，在 Chrome 现场截图中边缘清晰，没有位图放大、文字字形替代或卡片内容遮挡。
- 内容：设备档案、系统状态、网络状态、本地模型和自动化卡片数据均未改动。

**Comparison history**

- 源视频在起点仅显示右箭头、中间显示两侧箭头，并保持实心白色的同步横向提示；先前 ObsUI 只保留拖拽/滚轮，且底部原生滚动条已按用户要求移除。
- 本轮现场在起点、拖拽中段和终点逐一检查：可见按钮分别为“右”、“左+右”、“左”。中段截图同时可见两侧白色箭头，终点截图只保留左箭头。
- 聚焦区域检查未发现 P0/P1/P2 的形状、对比度、遮挡或状态错误；不复制游戏素材的精确像素尺寸和专有缓动曲线。

**Runtime checks**

- Chrome 真实页面：点击右箭头可移动到右端；点击左箭头可回到起点；鼠标横向拖拽可停在中段，三种状态的按钮语义与可见性正确。
- 浏览器控制台 `error` / `warn`：`[]`。
- `pnpm test`：28 个测试文件、172/172 通过；新增测试覆盖起点、中段、终点的边缘箭头可见性。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅输出工作区既有 LF/CRLF 转换提示。

**Implementation Checklist**

- [x] 仅为本机卡片轨道加入边缘导航箭头。
- [x] 依据滚动位置条件显示左右箭头，并支持点击滚动。
- [x] 使用清晰的纯白矢量尖角和同步水平呼吸动效。
- [x] 保留拖拽、滚轮、卡片内容及底部无原生横向滚动条的既有行为。

final result: passed

---

## 2026-09-21 — 本机卡片区边缘箭头比例复核

**Comparison target**

- 源视觉：`C:\Users\h\Desktop\素材\ZZZ素材\ZZZ素材\zzz原始录屏\QQ20260824-215851-HD.mp4`，重点为日常卡片区 `00:00:05-00:00:12`；原始帧的大小、白色材质和水平动态观察保留于 `C:\Users\h\AppData\Local\Codex\local-mp4-analysis\runs\20260921-153505-587-绝区零日常箭头动效质感复核\visual_observations.md`。
- 实现：`http://127.0.0.1:5173/?ui=tab-v2`，Chrome CUA 现场内存截图 `2048 × 966 px`；起点和右端均实际检查。浏览器工具未生成宿主文件，因此没有伪造截图路径。
- 归一化：源视频为 `1918 × 1078 px`，实现为桌面工作台视图；以卡片区相对高度、白色轮廓厚度、边缘位置和卡片可读性进行局部对照，不比较整体页面尺寸。

**Findings**

- [P1 fixed] 先前箭头 `28 × 44px` 且图标路径笔画为 `48px`，相对于卡片区和游戏参考显得过小、过细。现将可见矢量增至 `42 × 66px`，路径笔画增至 `68px`，点击区域为 `62 × 88px`。
- [P2 fixed] 放大后左侧箭头会短暂压到右端露出的卡片内容；已将两侧控制件外移 `24px`，在保持游戏式大比例的同时不遮挡传感器数据。
- [P3 acceptable] 原游戏的精确像素和纵横比受到视频画面与 ObsUI 卡片尺寸不同的限制；当前比例以同一视觉重量和清晰轮廓为目标，而非逐像素复制。
- 无待处理 P0、P1 或 P2。

**Fidelity surfaces**

- 字体与文案：无新增可见文字；箭头继续使用中文无障碍名称。
- 布局与节奏：大箭头仍垂直居中、贴近轨道外缘，卡片宽度、间距、数据区和内部纵向滚动不变。
- 颜色与材质：保持中性纯白、单像素深色轮廓保护和同步 `5px` 水平脉冲；没有加入颜色或泛光。
- 图像质量：保持 `react-icons` 的矢量路径；现场截图中笔画清晰、没有位图放大或字体字形锯齿。
- 内容：本机卡片数据、顺序和既有滚动行为均未改动。

**Comparison history**

- 用户复核指出第一版箭头过小过细，归类为 P1 视觉差异。
- 调整后，起点现场截图仅显示加粗的右箭头；点击到右端后仅显示外移的左箭头，均未盖住卡片数据。

**Runtime checks**

- Chrome 现场：放大后的左右箭头均可点击，起点和终点状态继续满足单边可见规则。
- `pnpm test`：28 个测试文件、172/172 通过；`pnpm run build`：TypeScript 与 Vite production build 通过。
- `git diff --check`：通过；仅输出工作区既有 LF/CRLF 转换提示。

**Implementation Checklist**

- [x] 按游戏箭头的相对视觉重量放大矢量尺寸与笔画。
- [x] 将控制件外移，避免遮挡本机卡片内容。
- [x] 保留白色材质、横向呼吸动效、边界可见性和点击滚动。

final result: passed

---

## 2026-09-22 — 月历日期操作边界与完成态删除线

**Comparison target**

- 源视觉：用户提供的 `C:\Users\h\AppData\Local\Temp\codex-clipboard-dde50990-11f8-4df7-9bc1-ae9ebcfd68ba.png`（`1001 × 943 px`，新建任务弹窗），以及同轮已提供的月历完成任务参考 `codex-clipboard-07de2534-85d2-4921-b19c-0390157d2fe9.png`、`codex-clipboard-78481ef9-7420-4573-b4c8-48a847115023.png`。
- 实现：`http://127.0.0.1:5173/?ui=tab-v2` 的 Codex In-app Browser 现场内存截图（`1280 × 720 CSS px`、`1×` 密度）；浏览器工具未生成宿主文件，未伪造本地截图路径。
- 状态与归一化：源图与实现均为深色桌面工作台。实现先选中 `2026.09.20`，再点击右侧 `ADD SCHEDULE / 新增日程`；两张截图尺寸不同，因此比较弹窗层级、字段为空白状态、选中日期详情和完成态的文字标记，而非整页像素尺寸。

**Findings**

- [P1 fixed] 月历日期格此前会直接打开任务表单；现场点击 `2026-09-20` 后只更新右侧 `SELECTED DATE` 及日程详情，未出现弹窗。
- [P1 fixed] 右侧“新增日程”在选中日期已有任务时会错误进入“修改任务”；现在只会打开标题为空、星级未选择的“新建任务”表单，日期继承选中日期。
- [P2 fixed] 删除按“当天任务全部完成”推导的淡绿色日期格底色，保留黄色选中框和既有深色网格，避免完成态覆盖绝区零式月历层级。
- [P2 fixed] 已完成任务仅对标题应用清晰的浅灰删除线：月历预览和右侧详情都使用相同语义类；时间、项目编号和状态按钮保持可读。
- [P3 accepted] 现场持久化数据没有已完成日程；为避免为了验收改写用户数据，删除线以组件测试中的完成任务状态和实际 CSS 选择器验证，而未通过临时修改本地日程来拍摄。

**Fidelity surfaces**

- 字体与文案：保留“新建任务”“ADD SCHEDULE / 新增日程”等原有中英层级；删除线只覆盖完成任务标题，不影响时间和辅助信息。
- 布局与节奏：日期格点击仍在原位选择，右侧详情随之更新；表单仅由底部新增入口触发，弹窗尺寸、字段顺序和留白保持既有深色面板节奏。
- 颜色与视觉令牌：完成日不再添加淡绿背景；删除线使用浅灰金属色，黄色选中态、状态黄条及石墨底色不变。
- 图像质量：本轮没有新增或替换图像、图标、Logo 或装饰素材。
- 内容：没有写入、取消或改动用户的现有日程数据。

**Comparison history**

- 将源截图与浏览器现场的新增表单并置对照：实现已从“修改任务 + 已填标题”变为“新建任务 + 空标题”，符合新增而非编辑的操作边界。
- 聚焦月历：选中 `2026-09-20` 后，右侧由 `2026.09.22` 变为 `2026.09.20` 并显示该日详情；无任务表单容器出现在可访问树中。
- 聚焦完成态：新增组件测试同时断言月历预览和右侧详情具有完成态样式类，且日期格不存在 `is-completed` 背景类。

**Runtime checks**

- In-app Browser：点击日期只切换详情；点击新增日程才打开空白“新建任务”表单；控制台 `error` / `warn` 为 `[]`。
- `pnpm test`：30 个测试文件、181/181 通过；新增测试覆盖日期格不打开表单、已有任务日期的新增表单为空、完成任务的月历/详情样式类与日期格无完成底色。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅输出工作区既有的 LF/CRLF 转换提示。

**Implementation Checklist**

- [x] 日期格只更新选中日期与右侧详情。
- [x] 新增日程始终打开空白新建表单。
- [x] 移除完成日期的淡绿色底色。
- [x] 为月历预览和右侧详情的完成任务标题添加删除线。

final result: passed

---

## 2026-09-22 — 左侧状态条选中项改为直角

**Comparison target**

- 源视觉：用户提供的 `C:\Users\h\AppData\Local\Temp\codex-clipboard-e160575a-6c9a-4cf3-9e28-57cd3d1fca39.png`（`292 × 192 px`）。其中“当前目标”的圆角选中容器被明确指定为不需要保留。
- 实现：`http://127.0.0.1:5173/?ui=tab-v2` 的 Codex In-app Browser 现场内存截图（`1280 × 720 CSS px`、`1×` 密度）；浏览器工具未生成宿主文件，未伪造截图路径。
- 状态与归一化：两者均为目标页深色工作台左侧栏。源图记录的是待移除的圆弧，实施图为“当前目标”选中后的最终直角状态；按左侧状态条、边框轮廓和文字层级进行局部并置对照，不比较整页尺寸。

**Findings**

- [P1 fixed] 带左侧黄色状态条的目标页选中项原为圆角容器，状态条在上下端形成圆弧收口。现为直角矩形，状态条与深色侧栏、金色选中底和细边框垂直对齐。
- [P2 fixed] 同一视觉语义在其他区域存在不同圆角实现。已统一仓库筛选/行、文献集合/条目、H.D.D 会话/根目录及功能左导航中带左侧状态条的选中项，避免同类状态混用胶囊和硬边。
- 无待处理 P0、P1 或 P2。顶部主标签没有左侧状态条，不在本轮范围内，保持其既有布局。

**Fidelity surfaces**

- 字体与文案：未改动“当前目标”“日历 / 月历”等字体、字重、行高和可访问名称。
- 布局与节奏：只移除目标元素的圆角；高度、内边距、状态条宽度、间距和选中切换不变。
- 颜色与视觉令牌：保留深炭灰侧栏、暖黄色状态条、金色文字和低对比边框；没有引入新颜色或渐变。
- 图像质量：本轮没有新增、替换或重绘图像、图标、Logo 或装饰素材。
- 内容与可用性：保留全部现有导航和选择行为；运行时计算样式确认目标页当前选中项 `border-radius` 为 `0px`。

**Comparison history**

- 源图显示圆角选中项，用户明确要求“只要长方形”。
- 修改后在同一深色目标页现场切换“日历 / 月历”与“当前目标”；两个选中状态均为直角，左侧状态条、深色选中底和文字层级保持稳定。
- 聚焦区域检查未发现边框断裂、状态条截断、文字位移或控制台异常。

**Runtime checks**

- In-app Browser：目标侧栏两个选中状态均现场检查；当前选中控件计算 `border-radius: 0px`；控制台 `error` / `warn` 为 `[]`。
- `pnpm test`：30 个测试文件、181/181 通过。
- `pnpm run build`：TypeScript 检查与 Vite production build 通过。
- `git diff --check`：通过；仅输出工作区既有的 LF/CRLF 转换提示。

**Implementation Checklist**

- [x] 移除目标页侧栏选中项的圆角。
- [x] 统一所有带左侧状态条的选中项为直角。
- [x] 保留颜色、状态条、导航语义和交互。
- [x] 完成浏览器截图、计算样式、控制台、测试、构建与差异复核。

final result: passed

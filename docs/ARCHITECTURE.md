# 架构与维护边界

当前活动输入已迁为 snapshot-v2：兼容39、小组件2、Web718；十五个旧正文退出当前 tree，旧 manifest/hash 和必要声明保留。Web 根路径保持，版本由 manifest 明示；app/index 的旧插件/图片引用已在 v2 输入中退役，最终输出身份保持。完整中文维护源为 src/localization/mpvplayer/zh-CN.json，保留24项继承译文和13项选定修订。见[迁移合同](SNAPSHOT_V2_MIGRATION.md)。下方先前“正文保留/仅评估”记录描述迁移前阶段。


旧 themes/logo.png 不再进入新 runtime；生产 index 继续使用既有 startup.svg，标题/屏保图保持。原 PNG/原 index 仍在冻结输入，完整来源树移除另需快照迁移；见[退役合同](LEGACY_RESOURCE_RETIREMENT.md)。

默认配置由 `src/config/system-defaults.json` 生成同字段/同默认值的首启 XML；中文播放器资源在冻结输入上叠加 `src/localization/mpvplayer/zh-CN.json` 的十三项文本，其余二十四项保留。两份维护输入进入既有小组件装配/provenance，用户配置和原翻译注册路径保持；见[维护合同](MAINTAINED_SMALL_RUNTIME.md)。

Current Model selection: the independent component now uses the fixed official Windows 3.0.20 Model member and can recover it from the same pinned ZIP as Host. Historical unchanged-Model statements below describe earlier stages. No playback/Host/Electron/libmpv source or configuration-default change accompanies this selection. See [current contract and acceptance limits](MODEL_COMPATIBILITY_INPUT.md).

Current compatibility-resource input: 48 manual/external files now use a fixed local component with per-file origin and notice records, preserving runtime paths and bytes. Normal old input count is five Carnival files and zero patch files. Material snapshots remain external to Git. See [snapshot contract and limits](COMPATIBILITY_RESOURCES_INPUT.md).

Current input update: libmpv is an independent verified local snapshot. Normal preparation/build/provenance require no vendor/patch directory or combined-patch archive. Remaining Carnival count is 53; patch count is zero. This changes acquisition paths only, with no DLL/Model/UI/version change. See [snapshot and recovery limits](LIBMPV_INPUT.md).

Current official component extension: the fixed Windows 3.0.20 ZIP supplies 19 unchanged files, including three companion XML files, windowsync and English strings. Dynamic whitelist assembly removes their old physical reads. Remaining Carnival assets: 53; libmpv patch: one. Model and product behavior remain unchanged. See [official inputs](WINDOWS_HOST_INPUT.md).

Current selection: package/preload/Host-config templates are maintained independently under tools/templates/runtime with locked transforms and provenance. Old physical input requirement is now 58 assets plus one current libmpv patch. See [template source and behavior](RUNTIME_TEMPLATES.md).

Current input update: 29 retained npm files are independently prepared from pinned official Electron 3.0.20 Git blobs; explicit newline conversion preserves exact output. Normal dependency copying/provenance also use this component. Old Carnival physical requirements are now 61, plus one current libmpv patch. See [inherited npm](INHERITED_NPM_INPUT.md).

Current production selection: 90 consumed Carnival files and one current libmpv patch remain physical requirements. The 144 replaced/retired Carnival and 48 unused patch records are historical metadata only. Required hashes and active path checks remain strict. See [current input selection](LEGACY_INPUT_SELECTION.md).

普通媒体链路为 Emby Web → PlaybackManager → libmpv adapter → Electron main Native Helper supervisor → Windows helper → 内嵌 libmpv。Native Helper 是唯一生产 bridge；旧 Pepper/PPAPI 不进入 runtime。

PlaybackManager 拥有 Item、MediaSource、MediaSourceId、PlaySessionId、Session/WebSocket、进度、远控与 Together 生命周期。STRM Resolver 只决定最终 loadfile source，不重建播放会话。Item.Path 是 sidecar identity，MediaSource.Path 是 source identity，options.url 是原生播放 source；普通媒体和 Transcode 保持原生链路。

STRM 按持久化 rules 的 cloud-first、mount-first 或 custom 顺序尝试 DirectUrl、CD2 同源 HTTP、Mount 和 Native。main 持有 Token、gRPC 与映射；renderer 只通过窄 IPC 请求结果。source/cloud/mount 三个前缀分开，严格路径边界、最长前缀匹配和拒绝路径穿越。DirectUrl 只开放经过校验的 file-local User-Agent，未知 additionalHeaders 回退同源 HTTP。

当前 CD2 stages 共享 1200ms absolute budget，连接最多 200ms、Find 最多 350ms、下载阶段最多 500ms。连续 direct/same-origin 尝试复用 Find 结果。RPC/mapping/响应失败继续 Mount/Native；Abort/superseded 向上终止。PlaybackManager request id、libmpv generation、AbortSignal、IPC request id 和 gRPC cancel 共同阻止迟到响应加载旧媒体。

新资源候选仅在目标 FindFileByPath 确认 NOT_FOUND 后允许一次有限恢复：父目录最多 3 层且不越映射边界，GetSubFiles 流必须完整结束及最终 OK，目标最多重查一次。目录探测/刷新块最多 1800ms，恢复总期限最多 3000ms；正常命中保持原 1200ms。单锁、30秒冷却和取消限制重复/迟到工作，详见 [恢复合同](CD2_NEW_RESOURCE_REFRESH.md)。

媒体替换复用 request-bound presentation intent 与原生 prepare/stop/arm/reveal，已有 intent 在前置异步阶段随新请求接管。未 arm 的准备持帧有独立 15 秒上限；terminal Stop、失败、音频切换和退休请求清理所属状态。Session 与远控仍由原链拥有。

透明主窗口拥有 UI/OSD/输入，独立 video host 承载 helper child HWND。窗口与全屏状态由 main 管理；Helper 失败不退回旧 bridge。销毁共享 Promise，并等待所属进程退出和资源清理，保留错误。

可选自动刷新率仍走原协议和工具，main对原固定DISPLAY1的全部动作使用进程范围FIFO，接收起5000ms包含排队；超时后另1000ms观察所属进程退出，未确认则保留隔离并禁新工具。renderer显示探测共用8000ms总预算，失败只禁本请求自动切率并继续原播放，取消仍退休旧Play。同adapter的FPS使用一个request-bound工作记录与最新pending目标，成功后保持原3000ms，invalidate清所属等待，内部finally在Promise结算前释放record。该局部归属不是跨renderer lease，renderer abort不表示main物理取消；目标窗口映射及完整app-exit显示恢复仍未闭合。

原恢复仍为fire-and-forget且不延迟Native销毁；先在共8000ms预算内观察current，同实例generation已变则跳过，第三值或不可观测不做补偿写。同值才沿原change恢复original，无效/不符回包只记固定unavailable，不重试也不声明硬件成功。该观察守卫不是原子事务或全局持有权，跨renderer同值及TOCTOU限制保持。

About 校验固定 provenance/manifest 与二进制身份，实时运行状态独立读取；缺失信息保留 UNKNOWN/NOT AVAILABLE。诊断旁路复用 logger 与 sender 校验，不改变 source 或播放时序。

About 的 M01 状态模型分别展示已校验包内 libmpv 文件 SHA、编译期预期版本/API/SHA 和 ready Helper 握手报告的运行版本/API/受限能力子集。包内文件 SHA 不表示当前加载映像 SHA；当前映像哈希与 Native 属性回读仍为 UNKNOWN。固定 Native render path 为 gpu-next/D3D11，mpv-vo/mpv-gpuapi 设置页值不作为 Native property 应用。

M02 内核候选管理保持 Native Helper 为唯一生产 bridge。包由 main 独占文件选择并通过 worker_threads 对固定四条目 ZIP、元数据、完整文件哈希、x64 PE32+ 与 17 个生产 Helper 必需导出做静态验证；包不携带可执行 Helper、脚本或任意旁依赖。候选对象只存于 ETE profile 的 SHA256 内容目录，导入不自动选择；IPC select 仅记下次重启选择。

每次应用构造只冻结一次启动 kernel selection。选中有效候选时在页面 load 前复用同一个 Native Helper startPromise 做隐藏 surface/握手预热；未选候选时维持原 baseline lazy startup。候选启动失败须确认该子进程退出后才锁存固定基线并一次回退；基线失败停止 Native Helper且不循环重试。进程内 effective kernel 不随 IPC 选择变化；候选运行期间 crash 不切库、不重建 PlaybackManager/Session、不重放 loadfile，之后显式 create 仍只尝试该 frozen candidate。关闭时验证 worker 必须先退出，迟到 profile 读不得再启动验证 worker；pending import dialog不阻塞应用关闭。

内核状态分开显示包内哈希、静态兼容、来源/notice 声明、当前进程 ready 握手和下次启动选择。Helper/DLL映像SHA、来源独立核验、许可审查与可发行性分别保持UNKNOWN或NOT_ASSESSED；静态PE通过和握手通过不等于加载映像哈希证据或许可结论。

构建由 tools/build.ps1 从固定 sourceCommit 的 Git blob、生成器和锁定外部输入组装。基础 payload 通过 assemble-runtime-base.cjs 从 manifest/合同推导文件清单，按文件复制仍保留的非Web旧输入，跳过后续替换及退役项；Web使用独立固定快照；ApiClient与toast为明确上游派生的两份直接维护源码，由已有Git blob装配器覆盖同名基底路径，其余Web overlay保持。生产不再应用这两份用户补丁及ApiClient生命周期补丁，不读取旧www。14份原样Host/辅助二进制改读官方Windows 3.0.20组件白名单，Model不替换。剩余非Web prepared Carnival 输入与历史来源校验继续保留。source-provenance、runtime-provenance 和 build-manifest 分层记录；完整运行时仍依赖仓库外输入。Electron 使用固定 44.4.2 Windows x64 完整树。边界见[文件级组装](RUNTIME_BASE_ASSEMBLY.md)、[固定Web输入](WEB_SNAPSHOT_INPUT.md)与[固定Host输入](WINDOWS_HOST_INPUT.md)。

CustomCssJS 可选第三方集成已退役：固定 app.js 生成变换仅删除其插件注册，Web 装配不再输出该模块，旧专属禁 JS 生成器及其合同已移除。普通 CSS、主题、原生 Branding/Css 条件和个人 storage 保持。原始 Web 快照及其新核对的上游/GPLv3 记录仍保存，不能据此声称源码已清；见[退役范围和证据](LEGACY_RESOURCE_RETIREMENT.md)。

固定源哈希的 item 详情 overlay 仅退役旧外置播放器按钮与 fromPlayEnded 计时器；externalplayers/autoplay 旧值保持不写不删，普通下一集仍由 PlaybackManager 的 Emby EnableNextEpisodeAutoPlay 与 PlayQueue/nextTrack 管理。构建排除旧 Pepper input；两份旧 Carnival 批处理因动态/外部 Host 消费者和手工工作流尚未闭合而继续保留。旧 AppHost sleep/shutdown/restart 协议动作已从 Web 能力广告、Web 调用入口、命令白名单和 main 分派移除；未知命令仍完成空响应，windowstate、exit、loaded、音视频通知与安全外链链路保持。

Native Helper 的 transport 终态与 owned process 退出分别确认。有 PID 的 child error 只终结 transport/request，进程继续归原 controller/service 管理；实际 exit 才兑现 exitPromise并移出活跃集合。无 PID 的 spawn failure可直接结算；重复error不会重复终结或变成未处理事件。

应用 before-quit 继续同步设置关闭状态、退役power owner并按原顺序注销各项能力；每项清理独立包含同步异常和异步拒绝，全部返回工作结算后才统一quit。失败诊断仅记录固定step，不记录原始异常负载。未确认退出的owned child或未结算startup仍属于等待范围；整体退出期限与强退策略未在本轮增加。

[STRM](STRM_RESOLVER.md) · [配置](STRM_RESOLVER_SETTINGS.md) · [DirectUrl](CD2_DIRECT_URL.md) · [Native Helper](NATIVE_HELPER_BRIDGE.md) · [构建](PACKAGING.md)

插件设置候选在受控 Web overlay 中增加窄路由/依赖映射及插件页导航事务，维护模块复用原 API client、字段编辑器和通知出口；共享播放、认证和 input/API 模块保持。来源、取消、错误与验收边界见 [兼容合同](PLUGIN_SETTINGS_COMPATIBILITY.md)。

服务端首页接线候选仍以原 HomeTab/BaseTab 为生命周期 owner，通过固定 HomeTab/app.js overlay 加载一个维护 controller。它复用现有 ApiClient 只读 HomeSections 和 Section Items，服务能力或布局不支持时回完整旧 homesections。renderer 保留原 CardBuilder、itemscontainer、focus/input、播放与Session归属；暂停/刷新/销毁取消请求，旧页面 stage 与迟到响应不能重新提交。接口、布局首批支持范围和验证边界见[服务端首页合同](SERVER_HOME_SECTIONS.md)。

冷启动首页在同一 refresh epoch 内等待既有连接身份就绪，最长 3 秒；暂停/清理/销毁取消探测。失败状态显示通用文字，pending 仅去重所属进行中请求，成功 active 状态保留原去重。

Windows 本地试验由 preload 提前捕获模块，原 play 入口传入原 PlaybackManager/events 幂等绑定。任务栏按钮、Web MediaSession 展示和可选 SMTC/DWM 共用原状态，命令仍经原 inputmanager。main-only 适配器校验 mainFrame、文档 token、sequence 与媒体代次，只捕获所属 video host，按需更新、最小化保帧、退出等待退休。固定 FFI 尚未进入正式构建，不改变 Native、Session 和窗口归属；见[当前记录](WINDOWS_MEDIA_CONTROLS.md)。

详情页选择器保持原Item controller与EmbySelect/ActionSheet归属。固定HTML overlay补全版本/视频的custom菜单声明；固定layout.css overlay追加详情区域的宽屏选择区宽度/对齐纠正，并精确拆分旧通用内容限宽规则。50em以上的 `.readOnlyContent, form` 继续默认90ch；通用 `.readOnlyContent` 不再强制90ch，使插件及页面自有上限生效。三行折叠与焦点简介自身的90ch重要声明保留，原始vendor只读；变换进入同一layout输出合同。版本、视频、音轨和字幕值及change事件仍由原链路消费，不改PlaybackManager、媒体来源标识或切轨逻辑。

v0.3.5详情生命周期overlay仍由原ItemPage/BaseView拥有页面；加载捕获递增代次及view，pause/destroy使旧代次失效。旧Item回复不再继续来源信息查询，主数据、reload后续和选择器异步回填在提交前核对归属；底层API保持既有请求协议。onBeginResume在实际onResume之前允许合法加载，不以paused状态替代事务标识。见[详情页合同](DETAIL_PAGE.md)。

v0.3.5合批搜索保留两条原路由：标准ItemsView/ListController与电视SearchView/SearchResults。SearchFields保留500ms防抖并在输入、暂停及销毁时退休旧提交；标准列表仅在type=search安装维护helper，复用既有itemscontainer/virtual-scroller归属检查，电视结果按代次提交。ActionSheet仅给原无选择关闭拒绝加明确标记，EmbySelect只处理该标记；真实错误、多选关闭提交与原视频禁用展示保持。见[搜索与菜单合同](SEARCH_AND_MENU.md)。

ActionSheet 空列表排版使用单独的固定源 `actionsheet.css` overlay；只清除空、非虚拟列表残留的末尾间距。原 ActionSheet JS、列表加载、按钮锚定、全屏、多选、选择/取消与播放远控归属保持。CSS 生成器和最终输出进入既有 build-input 与 provenance 合同，冻结输入只读。


Four small runtime inputs are an independent exact-byte component. Model alone still comes from the reduced historical directory; see [small input contract](SMALL_RUNTIME_INPUT.md).


Normal production inputs are now independent components only; the old Carnival and combined-patch directories are never read. Unmanaged retained legacy inputs fail rather than reviving a fallback. See [zero-input Model contract](MODEL_COMPATIBILITY_INPUT.md).

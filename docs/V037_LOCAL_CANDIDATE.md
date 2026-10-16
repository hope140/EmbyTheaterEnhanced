# v0.3.7 播放控制与连接本地候选

最新状态：v0.3.7 已作为 Pre-release 发布，产品Tag/sourceCommit 固定 `v0.3.7` / `bf6e48214820fac0558bdfe7f37526f1c7a3d7c2`，Stable/Latest保持v0.3.1。最终main发行核验见[发行核验](V037_RELEASE_VERIFICATION.md)。

以下本地候选、父审核和阶段性验收原文均为历史记录，保留原身份及边界；这些旧阶段的未发布状态不表示当前发行状态。旧wrapper ZIP仍是历史候选产物，最终main安装器身份见[发行核验](V037_RELEASE_VERIFICATION.md)。


最新进展：用户已对父清单第1—4及6项反馈正常，第5电源/退出组合由用户确认暂缓，并明确授权本版Pre-release发行。以下保留本地候选身份及当时验收状态，不把该wrapper ZIP当作最终main安装器；公开发行准备与后续核验见[发行核验](V037_RELEASE_VERIFICATION.md)。

产品源码固定为 `1246da1023c43981c7ed40a4e556cb95c7eb7e02`，本地分支 `codex/v037-controls`。A/B/C/D 已按审核范围合批，独立目录与 ZIP 已生成；没有推送、PR、合并、Tag/Release 或系统安装。后续文档 HEAD 与该产品来源分开，不重标 runtime 来源。

父会话已审核该产品来源及文档快照`619be41d095809830abbad6d3590239a4c9d7be8`，本地候选审核通过，当前仅人工验收待完成。父会话生产路径77/77通过，实际生成PM、runtime及审核副本一致，冻结边界和source后仅文档差异已核对。父独立只读artifact审计302/302通过，覆盖2159 payload/2160 runtime/2164 ZIP完整集合逐SHA、来源Git blobs、launcher/profile边界及ZIP完整字节/CRC；证据为私有`.work/v037-parent-final-artifact-audit/result.json`。本次收尾只读取既有回执，不重跑门禁或更改产物。真实前台、服务器播放/远控、OS电源与安装仍为人工未验证。

## 修改和保持的行为

- 原 OSD 倍率键表、500ms阈值与倍率保持；监听和待执行 timer 随视图及媒体开始/停止清理，迟到回调不能作用于新 owner，包括同一Player对象的切集。
- 视频/音频各持一个幂等电源阻止器句柄，原两类阻止语义保持；before-quit先退休新on并回收，再沿原Native/kernel/startup退出。普通电源API异常仍可能先于AppHost callback向上传播，未改变旧协议/异常契约。
- ApiClient保留原退避、订阅与HTTP/auth字段；socket回调与retry/deferred-close timer绑定当前代次，logout pending期间不复活，同实例合法重新登录可恢复。
- 音量OSD observer和50ms hide绑定原请求/player/Item资源；Stop、替换、失败和退役回调清理匹配owner。自管理stop按原request marker或exact Item对象匹配，保留原核心事件/状态处理语义。

原PlaybackManager/Item/MediaSource/PlaySession、队列、Session报告及远控归属保持。Resolver/CD2/Mount/DirectUrl、Native/协议、认证/IPC/窗口/依赖和默认内核没有扩展。菜单排序仅作为独立待办，缓存与切轨延迟没有进入本版。完整设计及历史审核见[范围合同](V037_SCOPE_AND_CONTRACT.md)。

## 同一最终来源的验证

| 检查 | 实际结果 |
| --- | --- |
| 公开离线门禁 | 977/977，0失败/跳过，来源1246da1；不借用此前975项旧结果 |
| 固定材料门禁 | 200/200，0失败/跳过，包含原6个材料组与17个材料selftest文件 |
| PlaybackManager核心 | 原58请求/Session + 扩展19 observer，77/77；生产生成输出与经审查副本SHA一致 |
| 静态 | 309个维护JS、28个PowerShell语法；360文件有限凭据模式扫描及diff-check通过 |
| 构建与正式包体验证 | tools/build.ps1从1246da1 Git blobs组装/编译；package.ps1 VerifyOnly通过 |
| 独立完整集合/SHA | 2159项payload、2160项完整runtime（含manifest），零缺失/多出/不符 |
| 实际隐藏应用OSD | 原VideoOsdView、完整AMD和原生组件18项；生命周期由夹具直接驱动，包含同Player start/stop与迟到timer |
| 实际隐藏应用连接 | 加载的ApiClient原型及真实Events17项；socket、timer和REST为合成替身 |
| 实际隐藏应用播放控制 | 加载的PlaybackManager构造器、真实队列/Events/原生MutationObserver18项；Player与API为合成替身，覆盖A→B→A、Stop/迟到回复、循环及原50ms隐藏 |
| 合成Session记录 | 7个唯一Session的start/stop逐项身份配对，7 start / 1 progress / 7 stop；未启动LATE项没有Session报告 |
| 隔离与清理 | 实际show、浏览器/Node外网、Native子进程均0；所属observer/timer终态0，进程退出 |
| 独立启动入口 | 实际launch.cjs隐藏探针确认0.3.7及独立appData/userData/argv资料路径；生成profile已保留在私有证据目录，交付中不带该profile |
| ZIP | 2164个文件，所有条目完整流回读及逐项SHA/集合通过，不带profile或私有harness |

独立只读payload审计27项通过，另行核对了source/delivery两份runtime、ZIP精确大小写路径和每条目流SHA、sidecar、三层ApiClient身份及launcher/profile边界，未发现差异。主线程再次回读完整runtime与ZIP SHA，确认生产PM输出与审核副本相同，四个最终隐藏/启动探针根进程均已退出。该复核仍只证明相应文件与合成验证层。

完整隐藏应用直接驱动OSD组件，并使用隔离PM及合成API/Player；它没有驱动真实媒体/服务器创建的Router/OSD链。连接检查也没有使用浏览器真实WebSocket传输。这些结果不能替代前台视觉、真实媒体/远控、OS电源、安装或硬件验收。

合成PM的8次UI playbackstop包含一个未启动pending请求的原停止事件，与7次Session stop报告分开；不能把UI事件数量当成服务端上报数量。原file: ServiceWorker Cache警告单列，最终非预期页面错误0。Native Helper未实际启动或加载DLL，下面的DLL SHA仅是包内文件身份。

## 本地交付和完整身份

- Runtime：`dist/EmbyTheaterEnhanced-v037-1246da1-20261016`。
- 独立目录：`dist/ETE-v0.3.7-controls-1246da1-20261016`，入口 `Start-v0.3.7.cmd`。
- ZIP：`dist/ETE-v0.3.7-controls-1246da1-20261016.zip`，240504661 bytes，SHA-256 `9e7ea2d64df19838e2942674f4efbe23be54cfeff8b0eadab74fea281180ed6c`，附同名`.sha256`。
- build-manifest SHA：`0e2c8f2ff20b8d78864bcb417a497cd8c77e3ba66e264716d39d821c64bf8500`。
- payload-set SHA：`094063a97dbcb84d9f500c1a35a5e185edc931522868ddd0c8ba7d73761941f2`。
- runtime-provenance SHA：`ff24c00c542b4240caef6cd83659d7a23fd3c306736ff997b9b45f613728518e`。
- source-provenance SHA：`4a472c4113da341b8ff5ddbe8c6015bccc24cf5c06b47a7f9e6373f5c4dfe2f2`。
- Helper SHA：`28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`；默认libmpv SHA：`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。

ApiClient来源仍分别绑定Carnival base、综合补丁原始input与变换output，未把output冒充raw input。固定prepared材料和工具链均通过原清单；指定旧工作树的Electron ZIP归档缺失，本轮未下载或重新执行prepare.ps1，只对固定完整prepared树验证并直接构建，不宣称再次回读该ZIP。

解压整个目录后用独立入口启动，首次服务器/登录由用户完成。资料会创建在本候选目录的test-profile，旧候选与个人profile保持。交付包含测试说明和VALIDATION摘要，私有probe、profile、原始日志与截图没有进入ZIP；runtime中原锁定依赖自带的文件按完整payload保留。

## 已保留的失败与人工项

原D草案漏当前load失败资源清理，父审64/65；补清理与queued-mutation guard后原65/65，扩展材料又发现player-only的旧self-managed stop可清新owner，最终按Item/request限定后77/77。旧结果与修正各有独立日志，不降低有效断言。

最终隐藏夹具首轮连接脚本漏局部REST计数变量；第二轮播放脚本使用fullscreen:false选择了原background模式，按原语义没有Session报告。修正私有夹具到正常播放模式后同一未改产品字节通过，原失败均保留。没有为这些夹具错误修改产品、吞掉页面错误或伪造真实播放结果。

按包内说明人工核对OSD、倍率键、队列前后项、停止/重新播放、断线恢复及原远控，分别记录媒体与实际现象。真实服务器/播放远控、前台、OS电源、安装/硬件仍为NOT_VERIFIED/NOT_EXECUTED；当前只是本地候选，不自动进入发布或后续版本。

私有恢复入口为`.work/V037_TASK_STATE.json`，最终门禁/构建/完整应用/启动与ZIP回执在`.work/v037-final/`。这些路径只指向本任务本地证据，不进入安装或公开发行载荷。

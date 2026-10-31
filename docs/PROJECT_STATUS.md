# 项目状态

## 2026-10-31 — 下载管理提示精简候选，待合并发布

下载任务标题旁不再显示固定的“状态自动更新”文字，并移除其专用样式。页面控制器保持原有每3秒刷新、操作后刷新及离页退休逻辑；进度、完成、失败和文件检查状态照常显示。下载管理既有5项DOM／控制器回归通过，自动刷新控制器与主线逐字节一致；未执行完整Windows客户端视觉验收。本项保留在独立候选分支，等待相关修改一起整合，不单独构建或发布。

## 2026-10-31 — v0.4.7测试版已发布

提前下载候选及收尾已快进合入main，`v0.4.7` Tag固定准确产品／构建来源`5190a7020d0d00ea06776676921469736859bfbd`。正常[发布工作流41171790099](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41171790099)从main手动执行testing，预检、复用同源码标准构建41169467426、五附件上传及公开均success；[v0.4.7测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.7)为prerelease、非draft，正式Latest保持v0.4.0同一对象。公开五附件实际重新下载，大小／SHA-256与API digest、安装器来源／校验、总校验表及准确源码notes一致。没有安装或操作前台；完整回执与范围见[本版核验](V047_RELEASE_VERIFICATION.md)。以下保留发布前准备和材料限制的当时记录。

## 2026-10-31 — 0.4.7标准发行材料已就绪，未发布

准确来源`5190a7020d0d00ea06776676921469736859bfbd`的Windows公开[41169421561](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41169421561)和标准发行构建[41169467426](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41169467426)均success；后者release_package=true／build_input_benchmark=false，完整发行材料门禁和上传成功，22分42秒。构建[附件13030807954](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41169467426/artifacts/13030807954)为164676752字节，API绑定同一源码／分支／run，2026-11-01 05:02:17 UTC过期。主线仍为a958d52，v0.4.7 Tag／Release未建立；这份材料不表示已公开测试版。

单独读取artifact ZIP被GitHub返回Forbidden、零字节，已停止且未换通道；尚未独立比对安装器字节、SHA或PE版本。仅确认CI内部门禁、上传和API来源；正常发布仍须满足main包含、准确Tag及原发布流程，不修改来源门禁或Latest。本轮不再要求使用者追加手动验收，也未操作前台。

## 2026-10-31 — 提前下载文案收尾与0.4.7测试发行准备

提前下载基础功能已有使用者验收反馈。本轮只将季／剧菜单及确认标题统一为“下载本季”“下载全剧”，完成toast带具体任务标题；电影显示片名，剧集沿既有剧名／季集号／集名，标题按toast的HTML接口转义，重复完成事件不重复提示。版本准备为0.4.7，未修改已验收下载、文件或播放行为。新CI和标准发行构建结果待追加；当前未包含于main，不满足原发布来源门禁，未发布或改工作流。见[0.4.7准备](V047_RELEASE_VERIFICATION.md)。

## 2026-10-30 — 原视频回退与整季下载验收包已生成

产品源码`00b409b5cd36c9875a2bf046bce718d97464cc68`的Windows完整公开[CI 41077852663](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41077852663)和普通验收包[41077932657](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41077932657)均success，后者23分31秒且上传完成。独立[验收附件](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41077932657/artifacts/12990161077)来源／完整SHA、分支、run与API元数据一致，大小164670908字节，过期时间2026-10-31 15:31:58 UTC。未创建Release、Tag或合main；后续仅有测试夹具／文档变化，产品和生成器保持该源码字节。

附件ZIP独立读取被GitHub返回Forbidden、零字节，已停止且没有换通道；仅能确认构建内部门禁、上传成功及API来源，未独立核对安装器字节、SHA或PE版本。按[本轮优先验收](ADVANCE_DOWNLOAD_ACCEPTANCE.md#本轮优先验收)手测真实关闭解析来源、整季队列、重开续传、本地播放及布局；合成服务与CI不替代真实Emby／dian115／CD2和可见客户端验收。

## 2026-10-30 — 原视频接口回退与整季下载候选

独立提前下载分支在原下载接口失败后，增加经重新授权的`Videos/{Id}/stream[.原容器]?Static=true&mediaSourceId=...`原视频候选。关闭STRM解析不会启用CD2，不借用正在播放的URL、会话或转码流；仍要求影片本体、长度和安全Range校验。服务器代理可能只支持播放路由而拒绝下载路由，静态接口也可能不受支持；真实代理、鉴权和具体媒体需要新包验收，不能把播放成功当成完整下载保证。

原季／剧菜单增加下载整季／下载整部剧，主进程核对权限、父子归属和分页，确认集数／目录后将当前剧集持久加入原串行队列；已有任务不重复添加，逐集失败可重试，不自动追更或猜测多版本。管理页失败显示重试，取消手动刷新、保持自动更新，右侧集中选择操作；设置顺序为缓存管理、下载管理、诊断、关于。当前定向121项为115 pass／0 fail／6 Windows skip；完整公开集、材料和Windows包结果待核对，不合main、不发布、不操作前台。

## 2026-10-30 — 下载管理任务操作候选

独立分支增加逐项暂停／继续、删除，顶部全部暂停／继续和勾选批量删除；删除由main确认、默认只清记录保留视频／.part，Windows可另行明确选择永久删除经身份和全文件哈希核验的自有任务文件。手动暂停跨重启保持；账户／凭据退休、登出和关闭会取消并收尾。已完成文件只读后台检查，分别显示未找到文件、文件变化、目录不可用／身份变化；不自动清理离线盘记录，恢复后重查。图四误导性的固定选目录提示已改；失败补HTTP状态和来源类别，新任务记录实际取源，旧任务不倒推。

产品源码`b4f858a06bb6da712d6bf73f9e40c5ee4cefbabb`的合成来源／实际临时磁盘／DOM和IPC定向107项为101 pass／0 fail／6 Windows skip；本地完整公开2284项为2253 pass／0 fail／31平台skip，固定6文件材料95/95，自生成真实视频取源／断流续传／解码1/1。JS546、PowerShell53语法、有限凭据模式643文件扫描及diff通过。准确源码的[Windows CI 41041272845](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41041272845)已通过，新增Windows精确句柄删除、错误哈希／身份拒绝的实际临时夹具测试已运行；不能替代用户目录、GUI或实际FAT／exFAT验收。[新验收包41041631953](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41041631953)已构建／上传success，耗时22m37s，未重复派发。[临时下载产物](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41041631953/artifacts/12970779372)绑定同一源码，API确认164696855字节、未过期，保留至2026-10-31T10:56:11Z。新ZIP正常回读返回Forbidden、0字节，已停止且未重试／换通道；安装器内部字节／实际版本／独立SHA未回读核验。未删除用户文件、操作Work前台、合main或发布。原下载接口HTTP错误的真实服务根因仍未知，不能声称已修好服务器下载。

## 2026-10-30 — 下载管理及预检诊断修正候选

独立分支将入口统一为下载管理，显示完整保存位置、任务进度／失败阶段和打开文件夹；原设备同步菜单隐藏，服务器任务和已有文件保持。目录选择前移，设置取消后再下载重新选择。资料显式请求JSON，STRM不再将可能的sidecar Size当影片大小；两类兼容问题已有合成复现，不能据此确定真实服务失败原因。真正传输任务持久化保持，未授权来源的预检失败只存当前进程诊断。

最终产品源码`db92cc53d00ba6a76844bc51c384abd3f5594034`本地公开2263项为2234 pass／0 fail／29平台skip，完整6文件材料95/95，自生成视频取源／断流续传／全文件和解码哈希1/1。JS541文件、PowerShell53文件语法、有限凭据模式638文件扫描及diff通过。准确来源的[Windows自动CI 41030906273](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41030906273)已通过；[独立验收包 41031006772](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41031006772)已构建并上传成功，耗时22m21s，未重复派发。临时[下载产物](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41031006772/artifacts/12965884825)绑定同一完整源码，API显示164697370字节、未过期，保留至2026-10-31T09:28:50Z。正常回读新ZIP返回Forbidden、0字节，已停止，未重试或换通道；安装器独立SHA／实际版本／内部来源清单未回读，不能称已独立验包。真实服务、完整GUI与原生选择器／Explorer未运行；未合main或发布。

## 2026-10-30 — 提前下载独立验收产物可用

候选源码`933eed8871e1acc21b1521b7f25e142243e5d20d`已同步main `a958d52`／0.4.6，不包含独立预载暂存分支。[Windows公开CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41023709274)为2250 pass／0 fail／5既有skip；修复材料夹具后的[独立包构建](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41023736236)及上传成功，未发布或合main。临时[下载产物](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41023736236/artifacts/12964046005)保留至`2026-10-31T08:24:12Z`；构建版本沿用0.4.6但文件名带test，不能用普通0.4.6发行包代替。

产物回读被Forbidden阻断、0字节，未重试／换通道；独立安装器SHA／实际版本／来源模块回读尚未完成，ZIP摘要目前仅有API元数据，不称已独立验包。具体身份、摘要与边界见[维护记录](DEVELOPMENT_LOG.md)；真实来源、正常重开续传、目录切换和本地命中按[手动清单](ADVANCE_DOWNLOAD_ACCEPTANCE.md)由使用者验收。

## 2026-10-30 — 提前下载独立验收包准备

提前下载分支同步最新main `a958d52ea1dc866c0852d3158c0063a9bf75a4c5`，继承0.4.6版本及STRM配置事务修复；只解决状态／维护记录冲突并保留两侧历史，不引入预载暂存分支。新增初次完整传输和续传时401换签的字节一致回归，以及本地文件删除／替换、权限撤销的拒绝回归。当前本地下载／配置持久化／播放器定向93项为89 pass／0 fail／4 Windows skip。整合源码32fdb4a的Windows公开2250 pass／0 fail／5 skip；首次独立包的材料夹具缺少新生成器，按门禁停止且没有安装包。修正夹具后本地完整材料95/95，必须从新源码重新构建；旧93ffb1a或32fdb4a结果不冒充新候选整包验收。

独立安装包沿用0.4.6，但文件名含test、源码和run身份；不是已发布普通0.4.6，也不创建Release。真实来源、重开续传、默认目录和本地播放的[手动验收清单](ADVANCE_DOWNLOAD_ACCEPTANCE.md)由使用者执行；本轮不操作前台或真实服务。

## 2026-10-30 — 无硬链接文件系统的安全提交候选

Windows硬链接能力不支持时，持久记录移动意图，独立隐藏助手核验并锁定物理源／目录，以句柄执行禁止替换目标的同目录重命名。同名文件或目录保留；移动后应答丢失按同一文件身份、完整长度／clean end及全文件SHA恢复索引，不凭内容认领旧文件。准确源码`93ffb1a38080a6c4d61320e57f62d8904af35114`的自动Windows完整公开CI已通过（[run 41001272123](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41001272123)，push／HEAD同一源码）：2243项为2238 pass／0 fail／5既有skip，原6材料文件继续排除；新增实际Win32提交、同名文件／目录保护、精确身份／时间拒绝、应答丢失恢复及强制无硬链接完整传输全部通过。JS／PowerShell语法、有限凭据扫描、快照及diff门禁通过；未运行打包／发布。历史失败见[开发日志](DEVELOPMENT_LOG.md)。FAT32单文件上限及实际FAT／exFAT文件ID／重挂载兼容仍需单独验收；本地Linux不能证明Windows API或真实服务通过。

## 2026-10-30 — 在线提前下载接线与跨应用恢复候选

独立分支接入原视频下载按钮、mainFrame IPC、账户绑定、默认目录设置／任务页、持久任务和同版本本地播放。关闭停止传输，重开并登录原账户后核对源身份、强ETag、Range与已提交文件前缀再续；不满足时提示并重下自己的临时文件。更改默认目录只影响新任务，完整下载不进入缓存清理，不接管旧文件、不移动或删除用户下载。未干扰预载修复；实现和条件限制见[下载合同](ADVANCE_DOWNLOAD_DESIGN.md)。

已完成原按钮到实际回环HTTP／磁盘／本地查找集成、正常关闭及强制结束后的两进程恢复测试。源码`db17efd`公开集2231项为2206 pass／0 fail／25平台skip（原6材料文件继续排除）；定向71/71，显式overlay／统计／真实媒体自测9/9。首轮失败及独立Chromium检查超时均保留于[开发日志](DEVELOPMENT_LOG.md)，未将浏览器检查计为通过。真实Emby／CD2连接信息未附，Windows、原生目录选择器及完整客户端仍待验收；最终发布依赖硬链接，不承诺FAT／exFAT兼容。未推送、合main、发布或部署。

## 2026-10-30 — 在线提前下载取源／目录／传输核心候选

规格明确为服务器在线时提前下载并在ETE播放，沿原下载按钮、首次选目录后记住，重点验证STRM／CD2；不要求离线启动／浏览，不接管旧文件或删除完整下载。独立分支新增重新核对服务端身份／下载权限的取源会话，复用原resolver与独立CD2 service，验证容器首部、换签及非零Range；另实现目录偏好、背压传输、断流重授权续传／重下及同名无覆盖落盘。未接生产IPC、原按钮或本地播放索引，不改预载／暂存和现有播放链；见[当前实现与边界](ADVANCE_DOWNLOAD_DESIGN.md)。

新增39项及原STRM／CD2定向共95/95通过；独立Linux真实媒体自测1/1通过，自生成两秒视频经断流续传后文件SHA和20帧解码哈希一致。首轮取源回退失败与缺锁定依赖的扩大回归失败分别保留，不改写为初次全过。真实Emby／CD2连接信息未附，实际片源、Windows、原生选择器、完整客户端、播放索引及构建未验证；未操作前台、推送、合main或发布。

## 2026-10-30 — 完整提前下载设计与无副作用基础合同

在 main `2d0acf3` 的独立分支收敛在线提前下载候选，区分真正离线、Emby 原生同步、指定目录与旧文件接管；产品范围和删除策略保持待决。仅新增未接线的纯 HTTP 响应／正文校验模块，防止错误 Range、表示变化、短体、401／403／重定向和416误判为可追加／完成；不联网、不写盘、不授予来源权限、不触碰预载或播放器。设计、缓存衔接、参考项目和决策清单见[提前下载候选](ADVANCE_DOWNLOAD_DESIGN.md)。

合成定向回归11/11通过，零失败／跳过／取消，语法和diff检查通过。没有真实下载、Electron集成、文件管理、重启恢复、Windows、构建或用户验收；未合main、推送、发布或部署。

## 2026-10-30 — v0.4.6 测试版已发布，自动发布链路核验完成

准确审核候选 `65356afdab1f7a9e01d8291d254b08583029d37c` 在 Windows 公开 CI 与标准发行构建成功后快进合入 main，v0.4.6 Tag 固定同一来源。现有 `Manual verified release` 的预检、复用同源码构建及真实上传／公开均成功；公开五附件重新下载后与构建逐项大小／SHA-256 相同，正式 Latest 仍为 v0.4.0。没有加入预载、暂存、提前下载等独立实验，也没有修改发布门禁或使用前台验收。完整证据及未执行范围见[本版核验](V046_RELEASE_VERIFICATION.md)。

## 2026-10-30 — v0.4.6 审核修复测试版准备

从已通过 Windows 公开 CI 的审核源码 `a6e26d5` 准备 0.4.6，产品改动仅为 STRM 配置保存失败处理，另含原审核文档。版本三处同步，发布说明独立编写，README 下载入口保持实际已发布的 v0.4.5。完整来源条件、后台证据与未执行范围见[本版记录](V046_RELEASE_VERIFICATION.md)。

当前候选未包含于 main，不满足现有自动发布流程的来源门禁，因此未创建 Tag／Release、未触发发布或更改工作流。版本准备不表示测试版已经发布。

## 2026-10-30 — 配置持久化与文档审核候选

基于 main `2d0acf314cd58d7dcb8b61e0e95ac5d1647b3d96`，修复 STRM 配置写入失败的临时文件残留，以及禁用／恢复／自动发现规则在写盘失败后提前改变 store 内存快照的问题。随机独占临时文件仅按所属身份清理，内存状态只在提交成功后切换；Token 存储格式、设置 IPC、播放生命周期及现有分支实验保持。回归方法与清理限制见[设置合同](STRM_RESOLVER_SETTINGS.md)。

README 补充安装起步和源码／构建入口；按公开 Release 元数据更新 v0.4.5 下载入口，并区分 v0.4.2–v0.4.4 与 v0.4.5 的安装交接。用户指南、索引、已知问题和开发合同同步，历史准备记录保留；没有据元数据补写附件全字节核验或新的客户端验收。当前候选未发行，原 v0.4.5 产品 Tag 与附件保持。

本轮修前失败、修后回归及检查范围见[维护记录](DEVELOPMENT_LOG.md)。真实 Emby／CD2、完整 Windows 客户端、安装及前台验收未执行；不能将此后台审核作为预载暂存或提前下载功能验收。

## 2026-10-29 — 手动 Actions 发布流程启用准备

新增 main 手动触发的 testing／stable 发布入口，沿原 ETE 构建；构建只读，只有发布作业获 contents:write，使用作业内 GITHUB_TOKEN、不新增 PAT。固定既有 Tag／source，核验五附件，保护已有 Release 与正式 Latest，并为旧 Tag 提供显式的同源码成功发行构建复用途径。用户已允许公开部署该流程，相关合成回归 29/29 通过，远端启用提交和 CI 按实际结果记录；部署不触发发布，不修改仓库安全设置。本轮上传拒绝仍等待相关权限审查，不因流程存在而改用其它执行端绕过。v0.4.5 兼容条件及权限明细见[流程合同](ACTIONS_RELEASE.md)。

## 2026-10-29 — v0.4.5 测试发行准备

用户验收 `7bfc147` 独立包后批准合 main 和测试发行，已验收功能已快进进入主线。版本三处同步 0.4.5，发行说明只包含候选修复和此前主线未发行增量，不合入未验收缓存实验。最终源码的新构建、准确 CI 与五附件仍须独立核验，见[本版记录](V045_RELEASE_VERIFICATION.md)；本条准备状态不表示已发布。

## 2026-10-28 — 首页数据更新后位置保持候选

基于组合验收提交 `fc0de171114cc48db01a92c75cf3ee9ab78f86f9` 修复标记已播放／删除后的首页回顶。默认首页收到普通 `UserDataChanged`／`LibraryChanged` 时，保留同身份原生布局、立即退休旧请求并禁用旧条目交互，仍重新读取服务端布局和条目；完成后恢复本轮外层及仍存在的行内位置。用户已主动滚动／输入则不恢复旧位置，内容变短由原滚动器限制到有效范围；身份、权限变化仍立即清空，失败仍走原错误／回退路径。不新增缓存或视图池。

合成数据的首页呈现、路由、布局缓存合同及删除／API基本回归 120/120 通过，语法和 diff 检查通过。滚动范围由夹具建模，尚未执行新包完整 Windows／浏览器像素验收；本候选待合包后重验用户操作。未改真实服务或媒体，未合 main、推送或发布。

## 2026-10-28 — 主页／删除／字幕整合候选

以 main `95dc3f3086e53a2e730eaa4a69d1fb271f7ca060` 整合主页同节点恢复保护、单条删除 DTO／版本端点修复及 `83f881a` 的字幕透明色代码与测试；PR #79 更新优化与 PR #85 首页年份修复由基线保留。仅移植明确修复，不合入新预载／缓存或其他平台功能。交接补丁的源码、测试与合同文件逐一核对 Git blob 身份，原任务证据保留在下列各节；本轮证据单列，不将原任务结果视作整合验收。

## 2026-10-28 — 当前首页重复导航空白修复候选

以 main `95dc3f3086e53a2e730eaa4a69d1fb271f7ca060` 为基线，确认侧栏主页命中当前驻留页后，原生恢复分支会在显示目标后将同一个节点当旧页隐藏。维护 overlay 增加节点相同保护，同步构建合同与隔离试验入口的组合输出 SHA；不增加缓存或改变原暂停／恢复、请求及导航取消归属。冻结输入、产品版本和已发布附件保持。

修前相同回归为 8 pass／1 fail，失败项可见页数为 0；候选定向回归 128/128、隔离入口 48/48 通过。源码提交 `7a3e78aef479c94907645df504f5f8caf3c7d854` 的 Linux 公开离线集 2131 项为 2106 pass／0 fail／25 平台 skip，按既有合同排除 6 个材料文件；另显式插件／首页材料、Web overlay 与构建输入／来源回归 95/95。受控 Chromium 原生侧栏点击的三模式修前／修后 6 组对照及原路由 15 组通过；独立审查未发现阻断问题。首次失败与复验分开保留，见[维护记录](DEVELOPMENT_LOG.md)。真实服务、Windows 完整客户端、用户截图比对、安装与发行构建未执行；当前仅为本地候选，未推送、合并或发布。方法与边界见[首页合同](SERVER_HOME_SECTIONS.md#当前首页重复导航)。

## 2026-10-28 — 单条删除 API 合同修复候选

基于 main `95dc3f3086e53a2e730eaa4a69d1fb271f7ca060`，恢复原 Web 删除入口的条目 DTO 合同；原维护 API 继承 MIT 标量 ID 方法，会把对象拼成 `Items/[object Object]` 并遗漏新版 POST 删除协议与成功事件。维护层改为读取 `item.Id`，沿既有版本边界选择端点，成功后复用本地 `LibraryChanged` 及视图失效。原确认、失败提示和导航保持原 owner；未修改服务端权限或数据。

真实冻结删除 UI／API 与 loopback 模拟 HTTP 对照 7/7 通过；同一组在修前 API 上 1 pass／6 fail，复现错误请求和成功失效缺失。API 整合、生命周期及缩略图相关集合 57/57 通过，独立只读审查复验通过。Linux 公开集合 2137 项：2112 pass／0 fail／25 平台 skip，仍排除原有 6 个材料依赖文件。完整客户端、Windows 及真实服务器删除验收未执行；未推送、合并或发布。可复现方法见[API 合同](INDEPENDENT_API_INPUT.md)。

## 2026-10-28 — 字幕透明色独立移植（待合包）

以 main `95dc3f3086e53a2e730eaa4a69d1fb271f7ca060` 为基线，仅移植 `83f881a1ddf2d5bf7971794b446f0068f3e435af` 的播放器颜色转换与回归：默认 `transparent` 转为 libmpv 的 `0/0/0/0`，已有十六进制色与透明度保持。未合入该提交祖先分支的新功能。Node 24.18.1 下 `tests/mpv-settings-assembly.test.cjs` 3/3 通过，零失败／跳过；这是源码与冻结用户设置组件验证，不代表真实 Windows 播放、安装或整包验收。版本和现有发行保持，待与导航／删除修复合包。

## 2026-10-26 — 代理协作文档候选

以 main `e6cc8bf8fd5ec42142a0deff6906f71b6652ad11` 为基线整理 [AGENTS 入口](../AGENTS.md)与[协作细则](AGENT_WORKFLOW.md)，统一模型建议、主／子代理边界、准确 SHA 验证及交接。Luna／Sol／Astra 原优先路由保留，GPT-6.1 Terra 仅列为基于官方定位、尚未经 ETE 对照验证的可选建议；模型与执行设置仍服从用户约定。

本候选仅修改文档，未改变产品、构建工作流、模型配置或权限；v0.4.4 Tag 与附件保持。候选检查和未执行项见本次交付，不沿用历史产品验收作为本轮结果。

## 2026-10-26 — 首页图片内文字隐藏恢复（待后续包）

在最新 main `345bb2cb` 上恢复旧首页图片内居中文字的隐藏范围：维护 CSS 只匹配 `.sections > .homeSectionsContainer` 内的 `innerCardFooter`，不改冻结 CardBuilder、不新增年份开关或给 stage 添加通用 `sections` 身份。普通海报下方年份／标题、非首页图片内文字及进度／角标保持旧表现；版本及已发布 Tag／附件不变，合并后等后续包。

同根审计确认旧组合类选择器是本次匹配差异；现有进度、已播／数量／计时器／直播角标、外层文字间距和 `.closest('.homeSectionsContainer')` 钩子未发现该失配。实际 CardBuilder／CSS 与维护 Home owner 的受控 Chromium 18 组对照通过；修改前同一对照复现图片内年份可见，修改后恢复旧隐藏。既有真实组件 Home／设置返回／缓存页路由 15 组通过。Linux 公开离线集 2130 项：2105 pass／0 fail／25 项平台 skip，按现有公开合同排除 6 个材料依赖文件。服务、图片和平台能力由夹具提供，未执行用户 NAS、Windows 完整客户端、播放或新包验收；远端 CI 结果按最终提交另核。方法见[首页合同](SERVER_HOME_SECTIONS.md#图片内文字与旧首页样式兼容)。

## 2026-10-26 — v0.4.4 测试版已发布

[v0.4.4 测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.4) 已于 2026-10-26 00:46:50 UTC 发布为 Pre-release，产品 Tag／sourceCommit 固定为 `b6fe06b984d74f60bdf82527d0666e920449dedb`，包含 PR #80／#81／#82 与版本准备 PR #83。Latest 正式版仍为 v0.4.0，不含 PR #79、FN 或共享媒体缓存实验。

准确 main／Tag CI 各 2080 pass／0 fail／3 skip；标准发行构建 [40248484001](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40248484001) 全套 2178/2178、材料 135/135 通过，Host／runtime 来源及安装器解包比对通过。发布协调端完成五附件下载核对，回读资产与 GitHub 摘要一致；安装器及来源记录见[本版核验](V044_RELEASE_VERIFICATION.md)。用户先前对 f7b60add 包反馈暂未发现问题；新版构建与附件核验不等于追加普通系统安装、真实播放退出或全部 NAS／硬件验收。后续文档 main 不改变产品 Tag 与原始附件。

## 2026-10-25 — v0.4.4 测试发行准备

用户对 f7b60add 独立包反馈暂未发现问题并批准测试发行。PR #82 按精确 head 合并到 main dd0fd523，承接 PR #80／#81；随后仅同步产品版本 0.4.4 与发行文档，不混入 FN、共享视频缓存或未合并更新优化。旧包 Windows 全回归 2178/2178、0 skip、安装器解包比对及六项受控 Electron 窗口退出探针通过，普通系统安装与真实播放退出仍分开。新版本必须从最终 main 重新构建并核对五附件，不改名旧包；Latest 正式版保持 v0.4.0。准确新来源及发布结果见[本版核验](V044_RELEASE_VERIFICATION.md)，准备阶段不宣称新版已构建或发布。

## 2026-10-25 — 更新优化独立验收包准备

本地0.4.4候选完整2225项：2200通过、0失败／取消、25平台跳过；此前版本／缓存／包绑定定向30项全过。最终发布提交合入前后的生产源码与版本字节一致，精确HEAD的Git blob包绑定仍另行复验。原生Windows无执行子集与真实安装／系统提示分别记证据，不把分段验收写成连续闭环。

在原 `feature/managed-app-update-install` 正常同步最终 main／tag v0.4.4 `b6fe06b984d74f60bdf82527d0666e920449dedb`（真实产品版本0.4.4），保留详情／首页修复、匿名诊断和资源退役，不合功能入 main，不混 FN／共享媒体缓存。原起点候选 `7d624bc`／0.4.3 及其已构建包保留；版本只继承实际发布基线，不下调版本或伪造官方源。已回读最终发布点；独立目标验收包须使用本功能分支新HEAD和新run/artifact，不复用旧7d624bc产物冒充本次来源。

目标首次启动清理必须具备本候选的启动接线；不含它的官方目标仅可验下载→退出→安装。验收分段使用真实官方附件留下的受管记录，再由用户在已授权测试安装的同目录／同profile人工安装含清理代码的独立目标包，验证新进程清理。人工安装这一步不能冒充连续的一键官方升级；本次采用分段验收，不新增官方prerelease或替换本次发布附件，连续链仍待验。相关缓存回归改为新store实例读取持久记录，Windows原生用例同样通过新实例清理；版本在这些单元／原生夹具中是明确合成值，不是产品安装证据。步骤见[独立验收清单](MANUAL_APP_UPDATE_ACCEPTANCE.md)。

## 2026-10-25 — 详情图片交接与首页驻留返回候选

同条件受控对照确认缓存新增紧凑预览→原生布局的跳变；本候选改用原生标题／海报／播放按钮几何，并将有界视觉覆盖与数据／播放就绪分离。旧图只由当前详情 owner 保留到新图就绪、失败或创建后1秒，身份／导航／清理退休均撤；无新增串行播放检查。有限静态比例／剧集名／序号兼容旧行，不缓存权限、用户进度、媒体源、HTML 或布局高度。

默认 Home 仅恢复符合完整身份与查询的原生驻留槽，取新布局／Items 时保留卡片，失效或淘汰仍冷载；不启用实验模式或更改 TTL。标准／TV 详情、一般列表／TV Episode 原生组件、真实路由／Home 的合成服务验证与完整 Windows／NAS 验收分开，未把原图下载失败描述成像素确认。详见[详情合同](DETAIL_PAGE_CACHE.md)与[首页合同](SERVER_HOME_SECTIONS.md)。候选以诊断修复合并后的 main 复核，供 draft PR／独立验收；不混入共享视频缓存或 FN 实验，不自行发布。

## 2026-10-25 — Native 播放诊断最小补全（待统一发布）

基于 main `2cb08e5` 补齐现有 mpv 数字错误码至诊断白名单及 renderer 错误链；同一 service 生命周期内以随机密钥 HMAC 关联 Item／MediaSource、request 与 generation，补充 loading／playing 阶段和明确 Stop 来源。旧字段缺失仍兼容，不从 error reason 推断 HTTP 状态或恢复丢失历史。播放策略、解码、超时、请求次数与回退／重试保持。隐私与字段合同见[Native Helper](NATIVE_HELPER_BRIDGE.md#有界诊断关联)。

Linux Node24.18.1 公开回归2063项：2050 pass／0 fail／13项明确平台 skip；其中相关定向116项全部通过。JavaScript／PowerShell语法、有限凭据模式、差异空白、四份快照及固定 libmpv 归档校验通过。验证仅使用合成夹具与公开源码门禁；Windows 实际播放、真实媒体／服务与安装未验，不接触登录态。远端 CI 结果见对应 PR；版本不变，不单独打包或发布。

## 2026-10-25 — Anime4K 额外画质资源退役候选

从最新 main `8745493` 建立独立清理候选，删除仍随包的39份 Anime4K shader（2,391,214 bytes）及其专属 Git 属性规则；兼容活动清单归零，移除已无用途的准备参数／恢复请求，组装与来源校验保留历史身份及零输出。此前已退役的 preset、字体、主题备份和 BAT 不复活。libmpv、Native Helper、播放器适配、解码依赖、正常设置及活动启动图保持，版本不变。

原始 v1 manifest/hash、37份 MIT 与2份 Unlicense 的历史正文和许可审计保留；不改旧 Release／Git 历史。默认源码无相关消费者；个人配置若引用旧包内 shader 路径，干净安装或手动清理旧文件后将失效，详见[退役合同](COMPATIBILITY_RESOURCES_INPUT.md)和[用户指南](USER_GUIDE.md#anime4k-资源与快捷键兼容)。不读取／改写个人 mpv 配置或 shader，安装器不新增旧文件清扫。

Linux 锁定 Node24.18.1／PowerShell7.4.13：公开回归2055项，2042 pass／0 fail／13项明确平台 skip；其中定向50项通过。JavaScript／PowerShell语法、有限凭据模式及差异空白检查通过。真实固定组件完成基础装配756项（不含owner文件），兼容输出0、无GLSL／Lua／旧preset，退役文件门禁通过；这是基础组件装配，不是完整可运行Windows包。完整产品构建受当前来源绑定的已验证源码Host缺失阻止，未伪造锁或使用旧Host回退。Windows完整包、默认启动画面、真实播放和系统安装尚未验收；待后续标准构建验证，不合main／发布。

## 2026-10-25 — 独立更新缓存与安装交接候选

`feature/managed-app-update-install` 直接基于 main `8745493d92fb4348d5af2d86d13797f0a8760e81`，不重合旧更新分支，不改0.4.3版本号／已发布Release。手动点击下载改用当前用户专用缓存，完整校验后正常退出并打开安装向导，下次同位置启动目标／更新版本才按已知文件身份清理。正式／测试通道、官方独立校验、代理边界和说明链接保持；无后台检查／下载、静默安装、目录设置或播放确认。

已增加受管缓存／私有交接／Windows句柄守卫及不可执行文本回归，包内入口扩至9项、绑定12份更新模块。实现合同、复验命令与实机清单见[手动更新](MANUAL_APP_UPDATE.md)。本地受控验证与Windows原生／真实安装分开记录；本任务不操作现用客户端、不自行打包／安装、合main或发布。

初轮Linux完整回归2181项：2159通过、0失败、22平台跳过；其中真实PowerShell交接脚本＋合成守卫正常顺序验证通过，Windows句柄与非子进程退出码断言待Windows运行，不执行安装器。缓存不可用仍可只读检查版本／通道，安装未完成与清理待重试分别提示。包内9项离线自检通过，12份模块源码投影绑定及门禁通过。Windows系统警告、真实退出／安装与下次启动清理仍需单独验收。

后续追加独立托管Windows短门禁，不修改原公开CI／正式打包路由；真实句柄、缓存取消重试与版本清理，以及无提权假安装器的实际ShellExecute交接由单独job执行。入口精确绑定head SHA，只允许托管Windows且要求零跳过；本地49项相关检查38通过、11平台跳过，Windows结论以随后绑定源码的runner回执为准，不把假安装器写成真实安装／UAC证据。

Windows短测发现分离启动不执行脚本及清理退出码误判，已采用普通隐藏启动、认证本机管道和显式清理回执。进一步对照确认精简环境的模块自动发现约耗30秒；直接从系统 `$PSHOME` 路径加载 Utility 模块的Windows受控编译／打印验证约4.9秒，无策略覆盖或runner缓存继承。真实文件锁与完整交接门禁恢复后另行记录，不以诊断通过代替产品验收。

修正后的完整Linux回归2189项（2165通过、0失败、24平台跳过），包内9项合成自检和12模块绑定／打包门禁投影7项通过。Windows实际句柄、身份／Zone／硬链接拒绝、缓存取消复用、版本确认清理与异常退出顺序共117项全部通过、零失败／取消／跳过（源码 `3a2756f50832c0a66f0672e9c3e9d6fc532b6979`，[独立短测](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40167813705)）。该回执仍是无执行阶段；受控asInvoker假安装器交接现恢复验证，不能据此声称真实安装／UAC通过。

安装器交接边界已实测：无执行的relay／PowerShell生命周期在合成客户端自然退出后正常完成；完整受控运行119项中118通过、1失败，停在实际ShellExecute，可见窗口和SmartScreen进程存在，调用未返回，假安装器无启动标记（[0031027源码回执](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40168743383)）。不宣称具体窗口／策略根因，不接受安全提示或再自动尝试该入口。自动job改为原生／marker-only子集，明确标记 `native-only-passed`；完整安装交接、实际客户端和UAC仍需隔离有交互Windows验证。源码及包内自检、原生子集通过不等于安装器端到端验收通过。

## 2026-10-25 — 文档入口与当前发行状态

已核对远端 main 与 v0.4.3 Tag 同为 `69e55b91a0cc6ba4b01ce60cb65d9aca41b0311e`（含 PR #77）。[v0.4.3](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.3) 于 2026-10-25 发布为测试版，Latest 正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/latest)，v0.4.2 为上一批测试版。

v0.4.2 的详情静态缓存、独立缓存管理、手动更新及正式／测试通道已发布；v0.4.3 保留这些并纳入一秒任务栏视频预览、Windows 系统媒体卡片、退出修复、清理按钮居中及“智能解析”展示名。原任务栏两个按钮已移除；预览不合成字幕或承诺连续视频。

README、用户指南、贡献指南和文档索引统一下载、配置、更新、常见问题与开发入口。后续实验状态见[后续范围](NEXT_RELEASE_SCOPE.md#未发布实验)，不写为已发布功能或承诺日期。许可与必要通知不变，保留材料不等于核验授权。此次只整理现有文档白名单，本地文档路由相关回归 47/47 通过，10 份改动文档的 232 个相对链接及 21 个标题锚点核对通过，5 段 PowerShell 示例仅做语法解析；正式 docs-only 门禁及远端 CI 结果以本次 PR 为准。没有新增客户端、安装、硬件或 NAS 验收。

## 历史记录阅读说明

以下日期段落保存当时的候选、计划和检查结果，其中“尚未发布”“未合 main”“待 runner 验证”等不代表当前待办。准确发布状态以上述当前入口和对应 Release 为准；历史证据不能替代新源码或新包的验证。

## 2026-10-24 — v0.4.2 第一批测试版准备

整合详情静态内容持久缓存、独立缓存管理和手动更新／正式测试通道，保留v0.4.1修复及main构建输入提速。详情数据按身份隔离，缓存不替代授权、最新进度或播放数据；首页布局试验默认保持，登录与设置不随缓存清理。

根产品版本一致为0.4.2；正常release路由、Framework来源预检、包内更新器自检和五附件来源校验保持。全仓／材料及受控浏览器回归与实际Windows包核验分别记录，不把旧包反馈当作新来源构建结果。来源与发布参数见[v0.4.2核验说明](V042_RELEASE_VERIFICATION.md)。

## 2026-10-24 — 恢复main正常手动打包默认值

合并就绪审查发现旧实验互锁会让main的默认普通／release dispatch跳过所有job。将build_input_benchmark默认改false，手动package仅在非benchmark模式运行，benchmark仅在显式模式运行，不再按perf ref禁包。release冲突和预期SHA不符仍在checkout前拒绝；原release输入转发、门禁、只读权限、固定工具和package并发保持。测试读取实际默认值验证main／perf／其它ref与release false／true，防止绿CI固化“普通包恒skip”。仅workflow／相关测试／文档改变，没有新性能实验、完整打包或客户端功能；合并由最终候选公共门禁及审核结果协调。

## 2026-10-24 — 恢复workflow结构回归

修复 `tests/manual-windows-workflow.test.cjs` 的job范围：按同级job头截取，不再把后续benchmark算入package。保留原3项测试及权限／精确SHA／固定Node／artifact断言，每job仍3个固定action；用事件／分支／模式矩阵验证手动路由，新增checkout前mode／SHA拒绝、4／3默认值和独立诊断上传检查。原workflow与构建实现未改。本地相关43/43、零跳过；两个安全正例通过，16个保护删除／权限／来源／上传变体均拒绝，独立只读复审通过。完整公共门禁以最终提交的CI结果为准；没有新增性能实验或完整打包，未合main。

## 2026-10-24 — Windows短基准结果归档

[40087708509](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40087708509)在c1c6e7dc成功，已核验artifact12557687964／88项清单。每套件每臂16操作、同job交替AB／BA、输入及输出身份一致：plan首次／热中位260.974／255.949→137.118／129.214ms；Host恢复3400.071／3424.941→134.905／125.319ms。夹具首次2422.970→2974.500ms更慢，热2206.576→530.105ms更快，按中位数成本模型第二次构造可摊销，非完整回归实测。建议保留候选Git批读及文件内seed，单次诊断可用既有fresh；不扩大共享缓存。Windows2022／4逻辑CPU，OS缓存未清，Host预准备29.768秒不计入操作。短基准0单元测试，不宣称整包／合并等待百分比；main仍88578，未新增实验或合并。见[结果、接入路径与边界](CI_BUILD_PERFORMANCE.md)。

同SHA公共CI40087539201实际1543 pass／2 fail／0 skip，两处为新增job后仍按旧if整行及旧job到文件尾范围判断的workflow断言；前轮漏跑相关验证。该归档轮当时只记录阻断，后续已恢复结构测试，见最新记录；短A/B成功始终不替代公共CI。

## 2026-10-24 — 短基准UI入口准备

仅实验分支的既有public-ci.yml增加明确build_input_benchmark输入及Windows短job，默认Trials4／WarmCalls3，同dispatch精确SHA／同job交替AB／BA，0项单元测试。perf/build-inputs不会进入完整打包job；现有包并发block、权限contents只读、固定actions／Node及所有来源／哈希／输出门禁保持。artifact仅白名单诊断子目录，不能替代公共CI回归。新字段的登录UI尚未实测，触发须选择该分支并核对SHA与输入；未自动dispatch或改main。详见[UI步骤及安全边界](CI_WINDOWS_AB.md)。

## 2026-10-24 — Windows输入性能验证准备

[Windows正确性CI40085107715](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40085107715)在2e310f47通过。增加独立Windows定向入口，同一精确SHA／干净输入／同job交替测旧与批读Git算法、fresh与seed夹具；默认每臂16次操作，0项单元测试，逐份验收、首次与热调用及验收／进程成本分别记录。原28个测试主体保留，夹具工厂共享至短基准；另补4项参数／路径／归档／隔离回归。workflow、并发、缓存、runner规格和生产门禁未改，未调度新的Windows基准；性能收益仍待实测。见[参数与复现](CI_WINDOWS_AB.md)。

## 2026-10-24 — 修正性能实验Windows换行夹具

实际Windows公共run40083575146在c16208a得到1540 pass／1 fail／0 skip，唯一失败在新增authority测试：将已有CRLF再次直接扩为CRLF，造成CRCRLF，原HEAD字节校验正确拒绝。只修测试转换为先规范LF再生成CRLF，重复两轮并新增CRCRLF仍拒绝断言；不改生产校验、测试选择／数量、workflow或并发。原红例在Linux同错误复现，修后相关38项／0跳过和core.autocrlf=true checkout该组6项／0跳过通过；新Windows结果仍需单独核验。原同输入A/B数据与边界保留，不能由换行修正声称Windows性能收益。详见[实验记录](CI_BUILD_PERFORMANCE.md)。


## 2026-10-24 — 构建输入提速实验：本地对照完成

独立perf/build-inputs候选基于main 88578c91，新增分阶段／测试热点日志，将固定Git读取扩到获取authority和55份Host来源；每次仍验证精确commit／blob／size／SHA、当前物理路径及工作树字节，没有跨调用缓存成功结果。原27项构建输入用例主体完整保留，种子只复用文件内不可变输入，每用例物理独立.git／工作树及新runtime；增加隔离和损坏输入负测。workflow、缓存、并发、runner规格、产品源码与材料版本保持。

同e8be676输入、每臂3次交替本地A/B：Git调用8→4、111→3；夹具组fresh／seed均28/28、0跳过，中位13.370／12.294秒，初次种子准备更慢、后续复用更快。完整范围、方差和首次／热调用见[性能实验](CI_BUILD_PERFORMANCE.md)，不把Linux局部差值称Windows整包收益。公共完整集1531 pass／0 fail／10既有Linux skip，runtime来源6/6及Host／Release／计时相邻65项通过；精确HEAD输入合同、语法和有限凭据模式检查通过。未手动触发Actions或打包；普通push后的CI另核，Windows A/B及端到端收益尚未验证，不将局部结果当发布或安装证据。


## 2026-10-23 — v0.4.0整合PR70来源与必要声明

将PR70固定提交6576f5d的16份来源／声明材料整合到既有发布分支，四处文档冲突采用保留双方有效内容。API／page完整MIT、Sizzle原文、VTT版权／固定源／实际差异、Material Icons来源、Socket组件与集成范围及npm36许可命名口径保留；原JSON／CSV证据字节及analysisRef不改。旧“尚未替换Host／仍运行Sharp和ServiceStack”等仅作为研究时点，不恢复旧链；当前源码Host／JSON／ZIP、CEC退役、API维护与业务来源指纹均不变。

本次只整合文档与必要notice，不新增功能、不改认证区域，不将用户保留决定写入README或Release。研究证据与许可覆盖仍分开；v0.4.0尚待正常PR检查／main集成、最终提交正式五附件构建及发布回读，未复用旧0.3.16测试产物。详见[研究索引](DEPENDENCY_RESEARCH.md)与[发行核验](V040_RELEASE_VERIFICATION.md)。


## 2026-10-23 — 云端测试包闭环通过，v0.4.0准备中

run39974691780在准确6858c711上15分52秒成功：Host实际验证、1609/1609回归（0跳过）、Native编译、runtime与安装器完整性／解包比对及artifact上传通过。独立下载内容复核尚待完成；该产物版本仍是0.3.16测试包。不同镜像Framework固定门禁问题保留，不称所有环境通过。

用户最终确定v0.4.0正式版，现更新版本／notes／文档，旧0.3.16不覆盖。准确新source须重新执行正式五附件构建和全套显式材料，再核验Tag／main／Release；未发布。Windows控制、缓存／预加载、FNConnect等后续功能独立进行。详见[本版核验](V040_RELEASE_VERIFICATION.md)。

## 2026-10-23 — 全套Windows回归通过，补齐Native编译环境

run `39970619136` 的Host验证通过，完整回归1606项全部通过／0跳过（662749ms），随后进入runtime组装；14:54:24 UTC任务失败，总21分04秒。失败为build-native-helper.ps1调用固定GCC返回1，日志无C++stderr，不能认定业务源码错误；无安装器或artifact。代码检查确认编译调用未设置固定UCRT64 bin优先的进程PATH，子编译器的DLL解析可能依赖runner原环境。现仅在完整工具链验证后、实际编译期间优先该已验证bin，并在finally恢复原PATH，不改系统环境、编译器、flags或业务源码。定向14项通过；此环境缺口是否为本次退出1的完整根因仍待新Windows构建验证，正式版v0.3.17改号／五附件准备保持在云闭环之后。

## 2026-10-23 — Host云验证通过，修正provenance测试的换行预期

诊断run `39967786650` 使用镜像20261021.343.1，Host实际验证报告PASSED并完成本次锁／接入。随后完整回归1605项中1604通过、1失败、0跳过，测试507208ms，任务13分45秒，未进入打包且无artifact。唯一失败是runtime-provenance测试把CRLF工作树哈希作为生成器Git blob身份预期；本地CRLF复现得到完全相同的两个哈希。仅改测试读取夹具提交的Git blob，显式覆盖LF／CRLF并保留DLL回流、manifest篡改及新增源码真实内容篡改拒绝。provenance文件6项通过；生产代码、业务指纹、固定Framework门禁未改。旧镜像20261012的实际拒绝值仍未知，本轮通过不反证旧失败；新整包闭环待下一run。

## 2026-10-23 — runner框架绑定失败诊断

手动run `39965790277` 的Host编译成功（0错误、6警告），随后最终绑定检查报 `Framework implementation mismatch`，任务5分45秒失败，未生成成功验证锁／整包artifact。本次映像20261012.333.1，前次通过此检查的是20261021.343.1；日志未给实际GAC/hash，不能据此认定仅为补丁差异。仅补充该拒绝的期望／实际GAC、SHA256、程序集身份、加载位置及reference标记，原固定GAC／hash条件和之前的文件／reference检查保持；不接受未知实现、不自动重试或回退。验证器清单同步绑定诊断字节，业务来源指纹不变；需新run获取实际拒绝证据后再判断兼容路线。

## 2026-10-23 — runner接入到build消费的CLI链路复验

手动run `39961791456` 的Host编译、实际验证和输出接入通过，后续独立preflight CLI暴露sourceIdentity未初始化循环。现修正source-built-input及另一组build-input-contract／provenance循环的导出顺序，安全函数和验证标准不变。有界审查覆盖构建链44个可达控制模块；真实子进程串起接入、preflight、owner、原Host装配、stage和runtime身份核对，并验证篡改、双锁、路径与run归属拒绝。相关98项定向测试通过；原失败run的锁不复用，完整云包仍需新run重建验证。

## 2026-10-23 — Host云编译验证已通过，修正CLI接入顺序

手动run `39959947978` 已在Windows2022恢复固定libmpv，使用MSBuild17.14.60成功编译Host（0错误、6警告），实际验证器报告PASSED并生成本次证据绑定锁。随后接入已验证输出时被Node模块循环依赖的未初始化 `physical` 导出阻断，未进入整包回归／打包且无artifact。现仅将plan模块导出提前到CLI分派前，真实子进程回归覆盖正常接入与回执、重定向、已存证据拒绝；相关45项本地通过。业务源码、指纹、验证器与门禁不变，失败run的锁不复用，下一run仍须自行重建验证。

## 2026-10-23 — Windows2022的libmpv解包适配

手动run `39958180700` 实际使用Windows2022，在libmpv准备时因系统tar不支持LZMA失败，尚未进入Host编译且无artifact。现仅让恢复入口优先选择固定安装位置的已有7-Zip，工具物理路径检查、唯一精确成员、内存解包与原归档／输出哈希门禁保持；没有下载工具或换libmpv。定向选择／解析和既有归档负例本地32项、构建输入合同26项通过；真实Windows解包、MSBuild17及后续云端闭环仍待新run。

## 2026-10-23 — 手动打包映像匹配固定编译器

公开离线CI `39954448981` 已通过1492项及后续语法、凭据模式、空白检查。手动运行 `39957149782` 已恢复固定材料／55份源码并确认统一指纹，但实际 `windows-2025-vs2026` 映像未匹配MSBuild17定位范围，编译前失败且无artifact。现仅将手动打包映像选择改为官方仍支持并列有VS2022／MSBuild17的 `windows-2022`，保留原编译器、来源及验证门禁；云端编译／验证／打包闭环仍待新run，不使用本机锁或旧回执。

## 2026-10-23 — Windows checkout 字节保持修正

提交 `0c73fa8c3a53a68cd4d26e8646ec654046a060be` 的公开离线CI运行 `39952554306` 在11分6秒测试后失败：1491项中1487通过、4失败、0跳过，未超时。4项均被固定Host来源指纹不符阻断；Git的Windows autocrlf转换可复现4份脚本／JSON换行漂移。现为这4份固定输入补齐 `-text` 属性，保留原始字节、来源指纹及全部断言；新增checkout回归先失败再修正，Host runner相关38项及构建输入合同26项本地通过。后续Windows CI与手动测试包仍须分别按实际run核验，不能由本地结果代替。

## 2026-10-23 — 候选包验收通过，统一收尾中

本轮隔离候选包实际来源提交为 `ad77308cd83bd629a7b75349d727044f9fa1d86b`。Windows 构建、安装器核验、升级、测试副本实际 STRM 播放和正常 Host 入口检查已获通过回报，用户确认本轮验收通过。该结论限定于此候选及实际执行范围，不表示全部环境、硬件或许可核验完成。

已公开交接的源码提交为 `d0ea97369e52dccacbb1e6bbf5dbd9419a0733cd`，其 tree 为 `54107e55fdbc4904df0dcda1815c892a250b8392`。后续38文件构建／测试修正及已验证Windows验证器已通过 `0a8bf15c25df507fe4c7b55431bb3bbd8e67f09f` 同步；不能把两次提交当成同一产品来源。来源指纹仍为 `81b18ab1264941b7121967770d9b791af7fd4436b6cf910da443c92f967eea45`。

当前整理 README、构建入口、Host 输入和退役范围说明，并纠正锁 schema 的历史指纹。runner 继续沿既有恢复／编译／验证／生成锁方案收尾；薄包装及PS7验证调度已在本地接入，缺失／篡改验证器仍明确失败，不导入外部回执冒充当前runner验证。未完成干净 GitHub Windows 构建；未合 main、未改版本号或发布新 Release。详见[本轮收尾与验证清单](SOURCE_CLEANUP_CLOSEOUT.md)。

## 历史阶段记录

以下条目保留其当时状态与验证边界；当前状态以上文为准。

## 2026-10-23 — Unified source integration, final Windows artifacts pending

The two exact API and JSON/ZIP transfer archives are hash-verified. The API selection uses four maintained AMD modules and a complete MIT notice; CM changes are restricted to transport in the original module, with original local text/reset ownership retained. A listener representation difference found by existing lifecycle assertions is corrected without relaxing those assertions. API/CM integration24/24 and assembly/provenance12/12 passed before the native JSON/ZIP integration; subsequent final checks are recorded separately.

The Host candidate now has6 replaced and2 added source files,57 source/resource/license inputs and46 Compile items. The exact four reviewed JSON/ZIP source bodies are retained, Newtonsoft13.0.4 net45 input is hash-verified, and ServiceStack/Sharp references and runtime paths are removed. Full official19-file recovery input and notices remain; the retained official projection is10 files, plus the separately pinned new dependency and source-built EXE/PDB selection. Existing ETE updates, ordinary tasks, user profiles/pending files and system drivers remain outside the cleanup.

Work is offline. Final source fingerprint: `81b18ab1264941b7121967770d9b791af7fd4436b6cf910da443c92f967eea45`; a new source-only Windows handoff is prepared. No earlier EXE/PDB or receipt may be relabeled as a matching unified artifact. Linux full regression first ran1538 cases (1523 pass,5 failures,10 existing Windows skips); the five observed failures are resolved in36 targeted cases and14 isolated staged-commit gate cases, all passing. The product branch remains uncommitted and its HEAD gates remain strict. Full-client/Windows installer acceptance and exact new compiler outputs remain pending. No commit, push, PR, package or release has been made.


## 2026-10-23 — CEC投影、首启及升级候选收尾

Windows纠正历史社区Model混入后，官方db22下原版/v1/v2/组合合同及六例启动保存退出范围已获通过摘要；选择v1无更新结果，撤销不必要的同步异常变化，不改Model。统一分支继续将官方Host19项投影为13项，五CEC二进制及五产品源码退出runtime；bootstrap/可选入口不再新写cancel，已有profile配置/标记保持。

新增源码派生Host输入门禁和EXE/PDB来源绑定：缺已验证锁与真实产物时，build在创建输出前失败，绝不回退旧Host。当前仍需接收Windows核验产物及构建回执。十一项升级旧程序文件以精确hash/注册归属/物理路径及锁检查处理，新载荷成功安装后才删除，不递归、不卸系统驱动、不触碰用户数据；Windows执行负例尚待验收。JSON替换的null数组修正已通过摘要核验，损坏/截断输入已选择明确报错，消费者边界验证及源码交接待完成，未称组合全部通过，未推送或发布。

## 2026-10-23 — 退休检查接口修订，等待 Windows 复验

Work首版候选构建和启动/保存/退出等范围通过，但旧CheckForApplicationUpdate构造结果时依赖加载失败；该项失败保留。当前最小修订只让检查方法同步抛NotSupportedException，明确区别于原先“成功返回无更新”的约定；保留锁定接口签名，未改Model/框架或添加垫片。唯一源码调用方SystemUpdateTask已退出编译；Host HTTP/ETE更新路径无此调用，六依赖未发现静态MemberRef，不宣称所有动态消费者不存在。

修订的直接/接口/反射调用必须实际得到预期NotSupportedException，FileNotFoundException/TypeLoadException仍为失败；还需重新验证8154/XML/退出、无cancel屏蔽与pending文件保持。当前只做本地源改/材料验证，未推送或替换正式runtime。

## 2026-10-23 — Host 源码退役候选，等待 Windows 对照

固定708fadc官方源码基线Windows构建/隔离运行已获通过回执；当前同一未提交分支新增native/windows-host四文件源码候选及精确输入/输出manifest。删除CEC安装入口/参数、pending更新处理，旧自更新检查返回无更新、安装明确不支持；两旧更新类退出编译（46→44），原工程九项CEC/更新helper Content退出。其它任务、共享InstallationManager及六份现有DLL保留，ETE发行/服务器更新路径不改。校验脚本先验证55份原始文件与四份候选，任何身份不符在创建输出前退出；不执行Host或安装器。

候选Windows编译/运行仍待Work对照，现有runtime Host和五CEC二进制暂保持；cancel写入及精确应用目录升级迁移待候选闭合。未提交推送/发布、未变更正式安装/profile/系统驱动。此前IL只读提案未采用，当前明确走源码维护，不将基线成功外推为候选或整机GUI验证。详见[源码合同](../native/windows-host/README.md)。

## 2026-10-23 — CEC Electron侧退役与Host最小方案

在同一未提交候选保留System.Configuration投影，移除五份CEC维护源码及Electron协议/自动spawn/参数/owner接线，启动枚举防旧cec插件残留复活；其它插件、五个设置rank、Windowsprofile位置、窗口/快捷键清理保持。范围回归46/46通过，Node24.18.1/Linux串行全套1492项：1482 pass、0 fail、10个既有Windows平台skip。官方Host及五份CEC二进制暂保持，安装器仍直启Host，未声称整个CEC已退役或首次profile无提示。

要覆盖所有入口，仅写cancel或换快捷方式不足。当前只读IL已把最小派生方案具体到InstallCecDriver/StartProcess及参数格式：保持映像大小，58字节差异；未写出或执行新Host，维护方式待确认。研究侧ADL/RefreshRate消费者边界已纳入；升级精确hash迁移亦待Host闭合，不执行系统驱动卸载或删除profile。当前仅本地代码与方案，不制作分拆测试包；[完整调用链、风险及统一验收清单](CEC_RETIREMENT.md)。

## 2026-10-23 — 私有 System.Configuration 测试投影候选

仅独立本地候选分支省略官方Host 3.0.20中93,200-byte的System.Configuration.dll；完整19文件来源、hash、恢复输入及声明保留，runtime为18项，XML与其它文件保持。装配、精确身份守卫、source provenance生成器绑定及最终验证同步；不改GAC/系统、正式安装、产品功能或现有构建门禁。范围与完整客户端验收产物见[Host输入合同](WINDOWS_HOST_INPUT.md)。

局部回归44/44通过，真实官方Host组件18项对照通过；以main原工具和候选工具分别装配的基础payload从804降至803项，唯一差集为该DLL，少93,200 bytes，其余803项路径/大小/SHA逐项相同。完整19项源输入前后保持。Node24.18.1/Linux串行全套1486项：1476 pass、0 fail、10项既有Windows平台skip。当前产物只是组件/基础payload，不可冒充包含Electron/Native Helper的完整客户端；未提交、推送或构建Windows整包，登录/实播与CEC零客户端/零安装路径等待固定提交的测试包验收。

## 2026-10-23 — PR70历史研究快照：明确许可组件通知与有限剩余项

以下段落保留PR70在当前Host/API清理之前的研究状态；现行退役、替换与Windows验证见本页上方及发行核验。仅更新声明和文档：补API/page完整MIT、Sizzle原通知及VTT版权/来源/真实差异；核对现有11个notice入口、33个npm包36许可成员、shader37MIT＋2Unlicense。统一Socket组件MIT/集成边界、Sharp当前DLL及专项条款、Common的Updater范围；helper和七AppSettings访问器已有明确底稿，不再因旧编译器未知列必需替换。当前main0a1dd65只比材料基线a33多CI40分钟调整，研究分支相对main没有运行代码或工作流改动。

保留Web后期独立表达、428-byte VTT CSS、Sharp/ServiceStack组合交付、DPInst/ADL材料和真实Host验证的具体边界；不将来源/方法匹配比例当许可完成率。完整事实、固定URL/hash和局部测试限制见[统一索引](DEPENDENCY_RESEARCH.md)及[证据](dependency-research/evidence/license-closure-20261023.json)。本次未替换组件、打包或发布，未将文档补齐称整体许可清零。

## 2026-10-22 — 构建输入 Git 批量读取本地候选

构建合同每次调用批量读取固定提交的 tree 与 blob，正常完整检查的 Git 子进程由177降为3；88个输入、输出结构、原始字节SHA与CRLF规则保持。HEAD、工作文件和物理路径仍逐次重查，不跨调用缓存成功结果；批量读取失败、超限或帧异常回到原逐文件读取，保留拒绝顺序和原单文件限制。其它使用 tracked-file-hash 的调用仍走原默认读取路径，不改产品、测试选择、并发、docs-only规则或40分钟时限。

原19项合同测试正文/断言完整保留，新增6项覆盖批量身份/字节、修改后重查、未跟踪替代/非普通模式、缺失对象和优先报错、异常协议及读取回退。固定材料校验与原preload生成后，本地Node24.18.1/Linux串行全套1476项：1466 pass、0 fail、10项既有Windows平台skip。Windows CI和实际端到端收益尚未验证，不把Linux测量外推为Windows节省时间。

## 2026-10-22 — 三份 Web 残留与二十份 npm 产物投影

按精确批准范围将三份无引用 Web 正文退出当前 v2 候选树/装配，Web713，兼容39/小组件2不变；保留实际目录选择器、localStorage/memory、空worker注册、playqueueconfirmation及语言/兼容入口。npm完整33包/1142文件与SRI/恢复输入保持，仅在新建有归属runtime复制时省略20个固定版本/路径/大小/hash产物，投影1122。provenance同时校验完整来源树、排除差集及其余字节，35份许可/notice不变。新增逐项负向、真实依赖复制、descriptor.json负对照、实际loader/存储初始化和Web装配回归；[完整范围与验收边界](SCOPED_RUNTIME_PROJECTION.md)。不改播放路径、CEC DLL、旧电源包，不合并、不打安装器或发布。

外部交接原件及夹具生成器均通过SHA256校验；原npm探针121成员/定义/wire对照通过，Chromium localhost原12组及批准三文件组合补4组通过，均为隔离组件/模拟API证据，不是Windows整机验收。首次Windows公共集1385 pass/1 fail暴露新增复制测试依赖未准备的外部继承材料；改为合成无关继承包，真实33个锁定npm包和全部投影/协议/负向断言保持。无外部材料的公开测试cleanroom三项通过，不增加跳过或缩小选择。详见[浏览器证据](evidence/web-residue-browser.json)。

## 2026-10-22 — 公共 CI 测试日志实时输出

公共测试运行器将子进程 stdout/stderr 直接继承到作业日志，避免整组结束前的输出被包装器缓存，便于在超时取消时定位最后完成的测试。测试发现/六项材料排除、Node 参数、串行执行、工作目录、退出码及启动错误传播保持，工作流时限未改。新增隔离子进程握手回归覆盖提前输出和成功/失败退出，另校验空状态与启动错误；四项脚本回归通过。新提交的正常 Windows CI 另行核验，不触发安装包、合并或发布。

## 2026-10-22 — 移动端本地相机上传设置页退役

追加移除 settings/cameraupload.js/.html，当前桌面host无本地上传能力、服务仅iOS/Android注册且旧设置路由已注释。仅删除该674-byte注释块，app其它原始/生成字节不变；不改共享设置存储、sync、通用/触屏布局或其他移动端候选。devices/cameraupload管理员路由、页面及devices配置读写API保留，真实controller的mock回归覆盖两字段和其它字段保留。

活动集合39/2/716、基础/中间807/922，共十七个旧正文退出候选tree，必要声明、原manifest/hash和历史保持。051f990的Windows1372/1372成功记录保留身份，不冒充本追加提交结果；新head另跑CI。详细路径、hash、桌面入口和验证边界见[相机设置退役合同](MOBILE_CAMERA_SETTINGS_RETIREMENT.md)。不构建安装器、不合并、不发布。

## 2026-10-22 — 合入 PR67 基线并迁移活动快照 v2

同步已合并 main 7a21ca5，保留 ApiClient/toast 维护源、行为与来源说明，并解决两份状态文档及构建/测试合同的必要冲突。按确认范围迁移兼容39、小组件2、Web718；十五个旧正文退出当前 tree，原三份 manifest 的精确字节/hash 独立保存。Web 沿用根路径但版本明确为v2，app/index 同步消除旧模块/图片引用，最终生成身份保持。中文维护源改为完整37键，仍只有13项选定修订，24项继承值逐项hash保持。

不将原有有效 Web 样式与备用样式的同字节关系当作新复制或扩大删除；保留必要声明、旧限制、CustomCssJS GPL与旧Git/tag。迁移边界、十五项清单及负向校验见[迁移合同](SNAPSHOT_V2_MIGRATION.md)。初轮迁移单测发现旧数量/旧正文断言与已提交输入守卫需按新阶段校正，失败日志保留；最终组合检查和CI另以提交为准，不触发安装器、合并69或发布。

迁移后本地公共集1372项：1362 pass、0 fail、10 Windows平台skip；修后全材料及六个依赖文件合计220/220、0 skip，基础809/中间924项完整对照通过。组件 provenance 明确记录v1 manifest身份和v2身份，历史SHA不以新输出SHA冒充。最终Windows CI另按提交核验。

## 2026-10-22 — 旧启动 logo 最小退役

追加剥离 modules/themes/logo.png（1238×377，32,892 bytes，624aa242…906c064）。沿用 PR70 的动态引用评估并补本地固定材料核对；生产 index 已由现有 ETE startup.svg 替代，其尺寸、透明背景和 contain/居中样式保持。真实 Web 装配/overlay 回归验证旧图缺席、自有图存在、生成 index 目标不悬空，保留屏保及明暗标题图。没有新设计图片或宣称 GUI/冷启/登录已实测。

现为十三项退役、两个维护输出，Web 基底718项、基础/共同变换集合809/924，业务 payload 净减少27,002,259 bytes；provenance/通知和压缩体积另计。冻结正文和 manifest 全部保持，原 PNG 仍在当前源码树，源文件删除所需的新快照迁移仍仅评估。最终组合及 Windows CI 另按新 head 核验，不触发安装器、合并或发布。

## 2026-10-22 — 默认配置与十三项中文文本维护

默认配置改为 ETE 维护的 typed JSON→确定性 XML；五个值、字段类型、root/namespace、首次缺配置才复制及已有文件不覆盖保持。播放器中文仅覆盖 T01/T04/T05/T07/T08/T09/T10/T13/T14/T15/T16/T17/T18，保持 37 keys 和其余 24 项原文，三项长说明采用单段。维护源、继承边界、输出 hash 及回归见[小组件维护合同](MAINTAINED_SMALL_RUNTIME.md)。vendor 原文/manifest 保留且全部校验，新 snapshot 迁移仍仅评估；不将旧作者或整份翻译署名为 ETE。

前一 Windows 资源退役候选 `cfbd6e4` 公共集 1350 pass / 1 fail / 0 skip；失败是官方 Model 恢复测试夹具漏复制 Web 校验器新增的 runtime-exclusions 依赖。仅补齐夹具并新增跨平台依赖加载回归，Model 字节和校验不改。新配置/译文与该修复以新提交重新验证；不沿用旧绿灯，不触发完整安装器、不合并或发布。

## 2026-10-22 — CustomCssJS 可选集成退役

按明确退役范围，从新客户端装配中移除 CustomCssJS 模块和 app.js 注册，删除专属禁 JS 生成器及其无用合同/测试。它历史上有条件可执行，不是所有桌面环境都无路径；本轮选择撤出该可选第三方功能。保留普通 CSS、主题、原生 Branding/Css 的既有条件、storage、profile CEC 标记和 Carnival 隐藏标记。

冻结 Web 输入仍为 720 项且全部哈希检查，实际基底输出 719 项；累计少 12 个运行资源，基础/共同变换后集合为 810/925。新增真实主界面插件阶段的可用/不可用接口回归、无端点请求、无模块输出及严格注册锚点检查。上游固定 commit、CRLF 同文本、接口/注入行为与 GPLv3 原文记录见[退役合同](LEGACY_RESOURCE_RETIREMENT.md)。当前源码树原文没有删除，新快照迁移仅评估；不合 main、不改已发布版本，Windows/GUI/实播证据按本候选另计。

Linux 公共集 1351 项为 1341 pass、0 fail、10 个 Windows 平台 skip；六个材料依赖文件另测 84/84，真实材料 3/3。默认配置及中文本地化均先提供逐项差异，最终确认前维持原产品字节，候选不参与构建。完整安装包待相关 PR 工作完成后统一构建，本轮未触发。
## 2026-10-22 — 两份 Web 修复直接纳入派生维护源码候选

ApiClient 和 toast 的现有最终字节直接纳入 `src/electronapp/www` 下两个明确开放的维护路径，由既有 Git blob 装配器复制；移除对应用户补丁、ApiClient 生命周期生成器及两个 overlay 入口，其余 overlay 保持。维护源码明确为固定历史 Web 的派生文件，保留用户原有重连/进度/toast 修复和后续 socket/注销/计时器归属修复，不将继承正文整体标作原创，不替换原上游版本。

原缺件已按固定官方 ZIP/Git blobs 和仓库原始归档恢复，材料门禁保持原校验。直接源码方案完整 npm test 为 1429 pass / 0 fail / 10 Windows 专属 skip；全部显式材料自测 136/136，0 fail/skip，完整门禁通过。822 个基底及937个中间文件对照通过；相对 main `6fee412` 的720个 Web 文件路径/SHA完全相同。HEAD输入合同84文件、JS语法385文件、有限模式检查442文件通过。未进行 Windows 整包、GUI、登录或用户媒体验收。vendor、remoteaudio/remotevideo、依赖和版本保持，发布分支、Tag/Release/附件不动。来源和复现见 [Web 输入合同](WEB_SNAPSHOT_INPUT.md)。

## 2026-10-22 — v0.3.16 云构建与发布前文档修订

产品 source 固定 `6fee412ad68934d0194303916cfe346e6254a228`，[Windows Actions run 39737710070](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39737710070) 成功，发行模式开启：全量 1439/1439、显式材料 131/131、标准构建、VerifyOnly、安装器编译和完整解包对照通过，失败/跳过/取消均为 0。独立下载回执确认原 artifact 的 CRC、13 文件集合、校验表与安装器哈希；2170 个完整 runtime 文件对照通过。本次没有新包 GUI、真实播放或安装验收。

按用户长期未再遇到的反馈，将音轨/字幕切换延迟记为已解决，更新当前问题、首页说明、后续范围和发行 notes，保留历史计划事实。产品 Tag 仍绑定 6fee412，安装器及两个 companion 不变；修订 notes 与 SHA256SUMS 是后续文档材料，不冒充构建 source 的原始 notes。具体身份、哈希及发布门禁见[发行核验](V0316_RELEASE_VERIFICATION.md)。

## 2026-10-22 — CEC 包内副本与桌面 CSS 条件复核

现用固定 Host IL 明确从 ProgramDataPath 读取 cec-driver/cancel；生产配置指向独立用户 profile，bootstrap 独立创建并保留该标记，不复制包内文件。因此把无消费者的包内 cancel 纳入剥离，profile 语义、CEC 启动链及用户文件保持；累计新 runtime 剥离 11 项/26,963,353 bytes，兼容/小组件输出 39/2 项。Host 先启动 Electron 再检查驱动，但没有等待 bootstrap 的握手；没有宣称首启时序或真实设备已验收。

CustomCssJS 通过真实 app/pluginmanager 构造与登录事件可在无 MainActivity 的桌面环境处理服务端 forced_on CSS。没有独立客户端编辑页；普通选择依赖既存 localStorage，local CSS 也依赖服务端接口成功。多服务器桌面会跳过 Branding/Css，不能把两者视为同一入口。新增真实固定材料的 AMD/DOM 隔离回归，证据不升级为 GUI/真实服务验收。逐项依据及静态 IL 方法见[资源退役合同](LEGACY_RESOURCE_RETIREMENT.md)。原始快照、声明、三个保留文件与 Carnival 状态不改。


## 2026-10-22 — 14 项旧资源用途与独立剥离候选

核对安装、启动、菜单和手工 BAT 后，从新装配输出剥离两份旧 BAT、四份备用 CSS、字体、全局 mpv 预设、Anime4K-off.conf 及旧注意事项，共 10 文件/26,963,353 bytes。保留 system.xml 种子、中文播放器翻译、CEC cancel 标记和 CustomCssJS CSS 定制；Carnival/MainActivity 候选保持。原始 vendor 和 manifest 只读、全部输入哈希及版权/许可声明保留；来源和许可未闭合项不会因发布包瘦身自动解决。

兼容/小组件实际输出为 39/3 项，新增 runtime 数量/字节/树身份及排除清单；重新夹回旧资源直接失败。真实材料参考侧用固定 manifest 与独立十项批准差值比较，812 个基础文件、927 个共同变换后的中间文件一致；CSS/禁 JS 与首次配置回归保持。运行时 provenance 夹具首轮仍复制旧 notice 而失败，修正夹具走同一排除阶段后单独复验，原失败保留。Windows 完整包、安装/升级、真实播放和硬件验收尚未执行，不套用 v0.3.16 云包证据。详细逐项理由、包体影响及复验入口见 [资源退役合同](LEGACY_RESOURCE_RETIREMENT.md)。


## 2026-10-22 — v0.3.16 测试版准备

在 main 37ee98e 基线上统一 0.3.16 元数据与发行文件，保持产品源码、固定组件、依赖、播放器逻辑和 notices。手动 Windows 工作流增加显式 release_package 布尔输入，同一只读作业可生成标准安装包名、运行完整显式材料集合并暂存标准五附件；默认测试包流程保持。不会自动发布或新增写权限。

基线相对已验收组合 609c32e 只有文档、CI 和测试变化。最终 source、Windows run、Tag 和五附件仍待核验，未做新包 GUI、真实播放或系统安装；详见[发行合同](V0316_RELEASE_CONTRACT.md)和[发行核验](V0316_RELEASE_VERIFICATION.md)。

## 2026-10-22 — 当前固定材料自测独立化

导航材料夹具改读已校验的独立 Web 快照，原 39 项行为用例全部执行，缺件不再跳过。默认 runtime 基线自测直接按固定组件 manifest 构造参考，比较 822 个基底文件及共同生产变换后的 937 个中间文件；原完整历史包比较保留为单独显式外部参考审计，不以当前组件对照替代其历史等价结论。

Linux 显式材料集合 131/131 通过，失败、跳过、取消均为 0。测试与说明变更不改变播放器、固定材料或依赖；未执行外部历史包审计、Windows 构建、GUI、安装或播放验收。命令与边界见 [测试说明](TESTING.md)。

## 2026-10-22 — 公共 CI 保守文档分流候选

在 `8a238f4` 基线的新云分支保留既有公共作业名称与完整回归步骤，仅为明确白名单内的普通文档增加轻量格式、增量本地链接与有限凭据模式检查。构建 notice/组件合同、测试输入、依赖声明和未知 Markdown 仍全测；PR 使用完整事件 base/head，push 使用 before/after，缺失或不完整差异保守全测。手动 Windows 全量打包作业保持。摘要明确文档路线的公共回归为 NOT EXECUTED，不生成虚假测试通过。

本轮 CI 分类/文档检查及相邻 CI 合同 44/44、构建输入合同 19/19 通过，三份编辑文档的轻量检查和 YAML 结构/脚本语法核对通过。未重建整包、运行 Windows 回归或变更 main/保护规则、产品播放代码和依赖。此前已验收的 Windows/Linux 结果不作为本候选新执行结果；历史额外材料自测的 1 fail / 39 skip 仍为独立清理项，仅核对与公共发现集合的关系。实现与复现边界见 [公共 CI](PUBLIC_CI.md)。

## 2026-10-22 — 官方 Model 与托管构建组合候选

以已成功干净云构建的 cb5dc47 为组合基线，三方整合官方 Model 951324d 的两项提交；保留仓库原始 libmpv 归档、Actions 入口及临时目录夹具修复。Model 固定为同一官方 Windows 3.0.20 ZIP 的 db22f8ea…45153，libmpv 归档与 DLL 哈希、Host/Electron/Native Helper 版本及 src/native/配置默认值不变。手动构建同时验证官方 Model 源 ZIP 和实际成员哈希，并将身份写入测试总结；组合候选须另跑完整云端流程，不沿用旧 Model 云包结果。

本轮本机仅做静态与无副作用夹具回归，不操作 GUI、ACL、真实用户配置或此前带副作用的 Host harness。实际声音、字幕切换、组合整包 GUI 启动/退出、长期运行和安装仍待后续明确验收；不合 main、不发 Release。

## 2026-10-22 — Release 标题统一版本与渠道

现有 27 个非草稿 Release 的标题统一为完整原 Tag 加“测试版”或“正式版”，以实际 `prerelease` 标志判定渠道，共 21 个测试版、6 个正式版。仅修改 GitHub `name`；逐项回读确认正文、104 个附件的身份及哈希、Tag 与目标来源、创建/发布时间和渠道标志保持，Latest 仍为 v0.3.1。

[发行规范](RELEASE_CONVENTIONS.md)和[正文模板](templates/RELEASE_TEMPLATE.md)覆盖所有现有及未来版本，不限版本系列；功能主题放在详情。历史正文及原始 notes 保持，不改变产品版本或构建产物。本轮验证为发布元数据与文档检查，未新增安装、播放或设备验收。

## 2026-10-22 — 托管全量回归临时目录夹具修复

首次仓库归档云运行已通过原始归档 Git 身份、相同 DLL 离线恢复及全部独立材料准备；全量 1401 项为 1398 pass / 3 fail / 0 skip，失败均在 runtime-provenance 夹具使用的临时目录别名，被生产物理路径守卫正确拒绝。仅规范化三个测试夹具根目录，新增受控父目录别名与子输入 junction 拒绝回归。受控别名下原三例 0/3，修后四例 4/4；生产守卫、归档/DLL/版本不改。新云运行结果另按精确提交核验。

## 2026-10-22 — 仓库原始归档与干净托管打包验证

明确披露成品源码说明覆盖范围未完全确认后，获准将固定原始 7z 连同来源、许可证和已知对应源码获取说明推入审阅分支。归档/DLL/版本均保持，不作完整合规认证或书面源码要约。手动标准 Windows 作业从 Git 验证原始归档，拒绝预置准备目录，并输出 Git blob、固定哈希和准备前后缓存状态回执。当前仍不合 main 或发 Release；公共 CI 与完整云构建以各自实际 run 为准。

## 2026-10-22 — 原始 libmpv 归档本地恢复试验

本地审阅分支保存原始 31,173,907 bytes 的固定 7z，版本、归档和 DLL 哈希保持。恢复先验证 size、7z magic、SHA256 和 HEAD blob，再仅解出原 DLL；缺失、损坏、工作树替换或路径重定向直接失败，不访问 SourceForge、不借旧缓存回退。针对性离线回归 29/29 通过。原始归档没有公开推送，干净 GitHub runner 全包尚未验证。

公共选择集本地运行已终态：1284 pass / 2 fail / 0 skip，两个失败均由审阅工作树漏装锁定 gRPC 测试依赖引起；补齐 npm ci 后，同工作树重测两个文件 60/60，连同原通过项目覆盖 1318 个独立用例。保留原失败，不称单次完整绿运行。379 JS、32 PowerShell 语法及 435 份文本有限模式检查通过。分发核对限于成品身份、适用许可证/通知与对应源码获取说明；完整 SBOM、逐作者许可、PDB 和字节级重建不作为通用前置。精确成品的源码获取安排完整性仍未独立确认。

已重新取得并校验固定 mpv、FFmpeg 和 builder 全源码 ZIP，核对原始公开构建日志和 108 份 recipe；95 份采用 Git，其中 62 份无显式 GIT_TAG，显式 tag 也不一律是不可变提交。实际缓存依赖和子模块的完整版本、实际链接配置/notice 清单及完整对应源码交付仍未闭合。这不是对所有 recipe 都进入 DLL 的断言。详见 [恢复合同](LIBMPV_INPUT.md) 和[原始归档说明](../vendor/archive/libmpv/20260809/README.md)。

## 2026-10-21 — 固定下载安全失败诊断

libmpv 失败回执增加安全跳转状态、响应白名单字段和单次调用计数；Node 层避免重复打印同一 stderr，并隐藏没有安全诊断的原始进程异常。仅使用回环 HTTP 夹具覆盖 302→403、脱敏、计数与正常 hash 校验，生产地址和校验、版本、UA、代理、权限均保持。真实下载继续暂停，不对外联系；公共 CI 结果按精确提交另行核验。见 [Actions 测试包](ACTIONS_TEST_PACKAGE.md)。

## 2026-10-21 — 手动托管 Windows 测试构建准备

基于组件交付 `b5370b3a5dcb73e7420d1c185ef1d28fdabc79cc` 准备标准 GitHub Windows runner 手动作业，固定输入冷恢复、完整回归、静态安装包解包校验和一天测试产物。仅分支验证，不合并组件或本构建 PR，不创建 Release、不升级内核。执行结果以实际 run 和产物回执为准，说明见 [Actions 测试包](ACTIONS_TEST_PACKAGE.md)。

## 2026-10-22 — 官方 Model 独立集成候选

基于 components 候选 ad14a95 的独立分支，Model 构建输入改为官方 Windows 3.0.20 原件，SHA-256 `db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153`。固定整个官方 ZIP 与单成员身份，缺件可独立恢复；正常构建不再要求原社区 Model 快照，旧件留在 Git 历史。Host、Electron、libmpv、配置默认值、版本及播放源码保持。

既有独立候选已完成 test 可视播放、暂停恢复、自然进度与播放后正常退出；本次仅做集成和自动回归，不将旧人工验收冒充本次新包验收。声音听检、字幕切换、长期运行与安装仍未覆盖，应用数据权限恢复差异单独跟踪，不修补 ACL 或归因 Model。不合 main、不发布，当前自动化结果单独记录。见[固定 Model 合同](MODEL_COMPATIBILITY_INPUT.md)。

本地官方 ZIP 空目录恢复、缺失/大小写/重复成员/篡改/不覆盖回归已执行；822 项基底静态对照与应用同样官方 Model 变换后的 937 项历史中间产物对照通过。隔离 .NET 组件回归 40/40，覆盖真实 8154 接口、配置及 7 组更新数据，21 次 GET 均由内存夹具提供，实际下载/安装为零；不运行 Program.Main/Electron/StartupTasks。完整测试集合和最终提交绑定构建的结果另有回执，不扩张成安装或本次 GUI 验收。

## 2026-10-21 — v0.3.15 播放后退出修复测试版已发布

[v0.3.15](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.15) 已公开为 Pre-release，Release ID `419704000`；PR #59 正常合并后的产品 source 为 `e150981d85369b9e61559ee53978a25cdad6f7ad`，annotated Tag 对象为 `5e718fe7c42fc38790142d95ee278ad011f75b15`。main/Tag CI 各1202/1202，最终本地公开集合1202/1202、材料212/212，失败/跳过/取消均0。

最终main重新构建并通过版本、来源、VerifyOnly、InnoUnp及全部2163文件逐路径/大小/SHA核对。安装器175756102字节、未签名，五附件匿名完整回读通过。v0.3.14网页只把两处计划表述改为已修复链接；旧Tag、资产和原始notes保持。Latest仍为v0.3.1，详细身份见[发行核验](V0315_RELEASE_VERIFICATION.md)。

本次真实Electron窗口生命周期四组通过，播放状态由IPC注入；未执行真实媒体、完整Host、服务器或系统安装验收。以下准备阶段记录保留当时身份。

## 2026-10-21 — 0.3.15 播放后退出修复候选

基于已发布 0.3.14 产品 source `ce9310e1c8392af174e4bb5cd3f84e8a6ab0c867`，仅修正任务栏媒体控制销毁：保存注册时的 WebContents 引用，先退休状态、重试与自有监听，仅对存活窗口清空按钮。迟到 IPC 和重复清理安全；不关闭媒体控制、不加全局异常屏蔽、不混入依赖拆分或 Host/Model 更新。

同断言原源码 13/17、修后 17/17。固定 Electron 44.4.2 隔离窗口复现第 74 行同栈异常，修后四组关闭顺序全部退出 0。夹具注入播放状态，未执行真实媒体、完整 Host 或安装验收。公开集合 1202/1202、材料集合 212/212 通过，失败/跳过/取消均0；候选包结果另行记录。用户已授权准备 0.3.15 Pre-release；合并前另行确认，当前尚未合并或发布。见[发行合同](V0315_RELEASE_CONTRACT.md)及[核验准备](V0315_RELEASE_VERIFICATION.md)。

## 2026-10-21 — 误发临时 Release 已按范围清理

0.3.14 发布并完成五附件全字节核验后，仅删除误发的 `v0.3.13-baseline-bb0c3a9` Release（ID 419485449）及其六个附件。单次删除返回 204；清理后 Release/六附件 API 与六个旧下载入口均为 404。该 Git Tag 仍指向 bb0c3a9，本地六份原文件及哈希保持。

正常 v0.3.13、v0.3.14 与其他历史发行对象未改；清理后共 26 个 Release、99 个附件，Latest 仍为 v0.3.1。此为发布后的独立清理事实，不改写下文公开回读时的旧对象保持结果，也不改变 0.3.14 产品 source、Tag 或附件。

## 2026-10-21 — v0.3.14 测试版已发布

[v0.3.14 菜单与首页恢复测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.14) 已公开为 Pre-release，Release ID 419543282。PR #57 正常合并后的产品 source 为 `ce9310e1c8392af174e4bb5cd3f84e8a6ab0c867`，annotated Tag 对象 `b6be8465f878e6c9e5b01705854e25fe8d3ad4ce` 精确解引用到该 source。Tag CI 成功后才公开，Stable/Latest 保持 v0.3.1。

准确 source 本地测试 1280/1280、显式材料 130/130，Main/Tag CI 各 1198/1198，均无失败、跳过或取消。2163 个完整 runtime/解包文件逐路径、大小与 SHA256 一致；标准五附件匿名全字节回读通过。安装器 175765706 字节，SHA256 `ab2b1e935bd46e9d4694d70696bb990652ee0c9bbb5cc08e11fd253a74ce00d2`，未签名。公开回读时旧 26 个 Release、100 个附件及旧 Tag 引用保持；后续误发对象清理与该核验时点分开记录。

产品功能仍为 bb0c3a9 基线，根版本统一 0.3.14；只六份 payload 版本/来源 JSON 与 build manifest 改变，其他功能文件字节保持。不混入依赖拆分，不包含 Windows FFI 试验依赖接线，未执行安装、应用启动、真实播放/远控或设备验收。用户此前功能反馈不等同于本包自动化实机验收。后续文档提交不替代产品 source；见[发行核验](V0314_RELEASE_VERIFICATION.md)。

## 2026-10-21 — 0.3.14 规范发行准备

用户要求改为 0.3.14 测试版。独立分支以已合并的 bb0c3a9 为功能基线，只统一根 package/lock 版本并准备用户说明、发行合同及核验初稿；产品源码、UI、播放行为、依赖和固定工具链不变，不混入依赖拆分。

本条为准备阶段记录，不将此前基线包的测试、哈希或用户反馈冒充本版新结果。候选验证、审查、最终 main source、annotated Tag/Tag CI、五附件与公开回读分别记录；不自动合并 main 或处理旧发布。见[发行合同](V0314_RELEASE_CONTRACT.md)。

## 2026-10-21 - Local manual/external resource snapshot

Manage 48 unchanged compatibility resources as one explicitly grouped snapshot, reducing old Carnival physical inputs from 53 to five. Preserve source/unknown and embedded copyright/notice distinctions; keep Model and the four small files unchanged. Old patch remains zero. This isolated material baseline must incorporate the separate 0.3.15 exit fix before final packaging; no app acceptance is claimed. See [component contract](COMPATIBILITY_RESOURCES_INPUT.md).

## 2026-10-21 - Independent local libmpv snapshot

Keep the current DLL unchanged as a single hash-locked local component, explicitly imported from the old patch material. Remove normal old-patch reads and automatic combined-patch extraction. Current physical requirements are 53 Carnival files and zero patch files. Online archive/cloud recovery remains unresolved; no official recovery is claimed. Model/UI/versions remain unchanged. See [libmpv input](LIBMPV_INPUT.md); final regression/equivalence evidence is separate.

## 2026-10-21 - Five exact official auxiliary resources

Extend the existing official Windows ZIP whitelist from 14 to 19 unchanged members: three XML documentation files, windowsync and English player strings. These five old physical inputs are no longer required, reducing Carnival from 58 to 53; libmpv remains one patch input. Model/UI/dependency versions and unknown-origin material publication remain unchanged. See [fixed official input](WINDOWS_HOST_INPUT.md); static equivalence and final full regression are recorded separately.

## 2026-10-21 - Maintained small build templates

Move package/preload/Host configuration to hash-locked maintained templates and preserve generated output bytes. Normal assembly, preload generation, config and runtime provenance no longer read the three old physical files. Remaining Carnival input is 58 assets plus one current libmpv patch. Preload origin remains explicitly unresolved and local-only; Model/UI/versions are unchanged. See [template contract](RUNTIME_TEMPLATES.md); final evidence is recorded separately.

## 2026-10-21 - Independent inherited npm input

Move 29 retained npm files to a component recovered from official Electron 3.0.20 Git blobs with explicit LF-to-CRLF conversion. Normal assembly and dependency provenance no longer read the old npm directory. Physical Carnival requirements are now 61 files; current libmpv remains one. Preserve all output bytes, seven package identities/notices and strict component checks. See [fixed inherited npm](INHERITED_NPM_INPUT.md); final validation evidence is recorded separately.

## 2026-10-21 - Retired physical input gates

Normal material validation and assembly now select 90 consumed Carnival inputs and one libmpv patch. Historical Electron/Pepper/base-libmpv provenance no longer reads retired bodies. Original materials, Model, UI and dependency versions are preserved. Targeted regressions passed; final full regression and static material comparison are recorded separately in the task receipt. See [selection and boundaries](LEGACY_INPUT_SELECTION.md).

## 2026-10-21 — Linux 公共离线测试兼容

仅调整测试：Native Helper 夹具使用宿主绝对路径，Mount 夹具保持 Windows 客户端身份并在非 Windows 使用精确路径合成文件系统；Windows 继续使用真实文件系统。可移植 PowerShell helper 在 Linux 使用 `pwsh`，Windows 保留原 `powershell.exe` / `pwsh.exe`。产品路径安全校验、播放行为、依赖和材料排除规则保持。

Linux 公共集合实跑 1198 项，1189 通过、9 跳过、0 失败/取消；原 39 个失败中 34 项恢复，5 项 Windows 集成合同明确按平台跳过，另 4 项原 Windows 专属跳过保留。新增 5 项覆盖 shell 选择、实际集成测试注册的 Windows 执行条件与文件系统夹具边界；345 份 JS、28 份 PowerShell 语法和 396 份文本有限模式扫描通过。Windows 集成未实跑，现有 Windows CI 保留全部覆盖；不代表 Windows 播放、材料构建或老包依赖拆分完成。平台边界见 [公共 CI](PUBLIC_CI.md)。

## 2026-10-21 — 文件级基线组装集成候选

基于远端已核验 `e286aee124f4cf7bd65d11d3febe7c01b4ac75cf` 独立集成构建整理。原菜单、首页及 Windows 媒体源码保持；按新 Git tree、25项 Web overlay、npm lock 和原 manifest 推导797项复制及212项替换/排除，不沿用旧基线计数。普通构建继续保持原Windows FFI试验边界，未改Host或播放行为。全部1009份prepared输入与历史provenance仍需保留；范围见[文件级组装](RUNTIME_BASE_ASSEMBLY.md)。

候选公开离线回归1193/1193、显式材料合同211/211通过，失败/跳过/取消均0；新旧路线937个中间产物逐路径/大小/SHA一致。固定Electron、GCC完整树及Inno输入身份、语法和有限凭据模式检查通过。正式构建/打包验证另以绑定sourceCommit的本地回执记录；安装、应用启动、真实媒体/设备及服务器验收不在本阶段范围。此次本地提交只用于隔离验证，不自动推送、合入原分支或改变main。

## 2026-10-21 — 菜单居中、首页启动恢复与 Windows 媒体试验

空设备 ActionSheet 通过固定源 CSS overlay 去除空列表末尾间距，有条目和虚拟列表保持原布局。首页在同一 refresh epoch 内等待既有 client/server/user 就绪，最长 3 秒；失败或取消后释放对应 pending，普通恢复可以重试。整页 fallback、分区顺序与原播放归属保持。

Windows 任务栏按钮接回原 inputmanager，preload 绑定原 PlaybackManager/events 并补充 Web MediaSession 状态。可选 SMTC/DWM 试验提供系统媒体状态、固定播放命令和所属 video host 缩略图；窗口显示后首次注册真实按钮，注册失败有限重试，最小化保留有效帧。用户已完成本轮有限人工接受；多屏/DPI 与长时稳定性未穷尽。

当前仅保存本地源码，未生成新安装包。原生模块通过试验开关启用，固定 FFI 依赖尚未纳入正式构建合同；后续打包前须完成该接线与来源校验。实现、验收层次及复现入口见 [Windows 媒体控制](WINDOWS_MEDIA_CONTROLS.md)。

## 2026-10-20 — v0.3.13 测试版已发布

[v0.3.13](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.13) 已公开为 Pre-release，Release ID 417908398；PR #52 合并后的产品 source 为 `d313e93a9d0920af7ed27cd1743d6bb9c9178d4d`，Tag 对象为 `70e236f58e89d21f00d89f066020185f24197b13`。Main/Tag CI 各 1142/1142，产品 push/PR CI 成功；固定材料 211/211，2160 项 runtime（2159 payload）、VerifyOnly、InnoUnp 与完整解包逐路径/大小/SHA 核验通过。安装器为 175752088 字节，SHA-256 `4d67499f5716bc10f4ca936757a274b0a57a7f621843d27043604ff49d00a923`，未签名。五附件匿名完整回读均通过；正式版与 Latest 保持 v0.3.1，旧 24 个 Release、89 个附件及 51 行 Tag 引用保持。具体来源与边界见[发行核验](V0313_RELEASE_VERIFICATION.md)。

有限试用反馈不代表系统安装、真实播放、远控或设备验收。整体退出期限与强退策略未改；R1 等待边界仍开放。

## 2026-10-20 — v0.3.13 发行准备阶段记录

用户反馈 F1/F2 本地包有限试用暂未发现明显问题，并授权发布测试版。准备阶段产品实现保持 d4f6e8b 候选；后续已按 PR #52 合并并使用最终 main source 发行，详见本页首条和[核验文档](V0313_RELEASE_VERIFICATION.md)。此阶段的“未提交/未构建”仅属当时状态；整体退出期限及其他审计风险仍单列。

## 2026-10-19 — Helper退出确认与应用收尾本地修正

基于main `39882d0`完成两项本地源码修正：有PID的Helper进程error只终结transport，保留实际exit确认与进程归属；before-quit保留同步power退役与注销顺序，各清理独立包含throw/reject，等待全部返回工作结算后quit一次。失败诊断只记录固定step，不输出异常负载。整体退出期限和强退策略仍单列，未结束的owned child仍保持等待。

新增两份回归在固定基线为2通过/17失败，修后19/19通过；完整公开离线集合1142/1142通过，失败/跳过/取消0。327份tracked脚本语法、378份tracked文本有限凭据模式扫描及两新增测试的额外检查通过，独立静态复核未发现新增问题。证据为源码/合成层，未执行实际Electron/Helper、安装、真实媒体或远控验收。此为发布前的本地修正记录，后续发行详见本页首条。

## 2026-10-19 — v0.3.12 测试版已发布

[v0.3.12](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.12)已公开为 Pre-release，Release 417039490；产品 source 为 `408f74df626f23c9ad1295090548d7d95bc0525f`，PR #50 已合并，main/Tag CI 各 1123/1123、材料 211/211 通过。正式安装器从最终 source 重建，2160 项完整 runtime/解包与五附件匿名全字节核对通过，产品字节与用户认可的本地包保持；来源分别记录。

旧 23 个 Release、84 个附件和 49 行 Tag 引用保持，Stable/Latest 仍为 v0.3.1。下载导航与[发行核验](V0312_RELEASE_VERIFICATION.md)按后续文档 PR 同步，产品来源不随文档 HEAD 变化；本轮未代用户执行系统安装、真实播放/远控或服务器操作。

## 2026-10-19 — 0.3.12 本地验收包已完成

用户授权本地提交并打包，已从产品 source `282d39e5558361d7ce0a443620dd0e9b566d13a5` 生成 0.3.12 本地安装器。完整测试 1205/1205、材料 129/129、327 个 JS/28 个 PS 语法、包内 48 个布局控件检查通过；2160 项安装器解包与 runtime 逐路径/大小/SHA 一致，独立来源复核通过。安装器 175714438 字节，SHA-256 `fc0972a1616e683b45e13d8608894e8534ea452718691132409a967a567c1490`；详情见[本地验收记录](V0312_LOCAL_ACCEPTANCE.md)。

本地交付后用户已认可并授权后续发行；本地阶段未代用户安装或修改现用客户端与服务器。正式发行结果单独记录。

## 2026-10-19 — STRM 下拉箭头局部修正

基于 `4dd912a` 完成本地候选：存储类型、解析策略使用 EmbySelect 的 `label` 属性，四个自定义顺序选择器补齐独立 `selectContainer` 与标签关联。六个箭头与控件在同一网格行居中，样式限定在 STRM 动态下拉框。选项、顺序索引、保存与事件链保持。

发行 runtime 的原始组件/CSS 隔离渲染复现主下拉箭头偏上及顺序箭头定位越界；修后明暗主题 × 1280/760/680/420px 共 48 个控件几何检查通过，中心差 0，标签、唯一 ID、禁用隐藏、编辑器隐藏及聚焦缩放检查通过。相关回归 44/44、JS 语法与 diff 检查通过；隔离卡片截图完成检查。另盘点音频/视频/CEC 的 10 个原生下拉框，未发现重复标签或缺少定位容器的同类结构。结果不代表原生控件像素级完全居中。

以上为本地修复阶段记录；后续已完成用户确认与正式发布，见本页当前发行条目。真实播放与远控未追加验收。

## 2026-10-19 — v0.3.11页面布局修正测试版已发布

[v0.3.11](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.11)已公开为Pre-release，产品source `3b308c7fcec44990d1a0820e1a982691d7d4e17b`、PR #48已合并。Main/Tag CI各1123/1123、材料211/211、完整runtime/安装器解包2160项及五附件匿名全字节回读通过。普通默认/折叠与其他设置页保持，修复插件自有宽度并局部收窄STRM表单；Stable/Latest仍031。具体来源、哈希及未执行的安装/真实播放等边界见[发行核验](V0311_RELEASE_VERIFICATION.md)。

## 2026-10-18 — README 功能介绍精简

README 聚焦相对上游新增或增强的用户功能，区分正式版与测试版范围。下载入口保持，安装升级、路径字段及技术细节统一链接到用户指南；普通播放能力与安装器不作为新增功能介绍。产品和已发布版本保持。

## 2026-10-18 — 用户文档与 Release 规范整理

在 v0.3.10 发行完成后，整理正式/测试下载入口、哈希核对、安装升级卸载及问题反馈步骤，增加[文档索引](README.md)和[Release 规范与模板](RELEASE_CONVENTIONS.md)，更新当前排期说明并保留日期历史。复核范围、展示文案维护关系与检查方法见[复核记录](POST_V0310_PUBLIC_DOCS_REVIEW_REPORT_20261018.md)。产品来源、原始 notes、附件、Tag、渠道和许可未决事项保持，未增加产品或系统验收。

文档经 [PR #46](https://github.com/hope140/EmbyTheaterEnhanced/pull/46) 正常合并至 `39f7cf22058a578423bb2c8ef2f913545f4452dd`，分支/PR CI 各 1119/1119。随后仅维护 v0.3.1、v0.3.9、v0.3.10 的网页正文，22 个 Release、79 个附件身份、47 行 Tag 引用及 Latest v0.3.1 回读保持；原 notes 附件与编辑后展示正文分别记录。

合并后 main [CI 39104724762](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39104724762) 已核原日志 1119/1119，失败、取消、跳过及 todo 均为 0。报告收尾文档的提交与产品 Tag/source 分开，最终文档 HEAD/CI 另按准确来源回读。

## 2026-10-18 — v0.3.10 发行收口

v0.3.10 Pre-release 已公开，产品 Tag 固定 v0.3.10 → 73a5379983e2be2a2bc0bdc8aec8f0fcb5f07d63；Stable/Latest 保持 v0.3.1。准确发行、CI、材料、包体与匿名附件证据见 [发行核验](V0310_RELEASE_VERIFICATION.md)。文档 HEAD 后续独立记录，不改变产品 Tag/source。系统安装、前台、真实 Helper ready/加载映像 SHA、播放/远控与设备验收保持 NOT_EXECUTED/UNKNOWN；许可未决按许可说明保留。

以下准备记录保留其当时停点。

## 2026-10-18 — v0.3.10维护测试版发行准备

用户明确发布v0.3.10。新隔离发行分支从准确main d6f19c0开始，三处产品版本元数据更新为0.3.10，交付PR #44已审四修及文档维护，源码行为与依赖保持。按[发行合同](V0310_RELEASE_CONTRACT.md)准备PR/CI/正常merge、准确最终main构建与固定Inno安装器、包体解包、五附件匿名全字节回读和主线文档收尾；当前尚未构建或发布0310，Stable/Latest仍031，签名暂缓。

系统安装、主动前台、真实Helper ready/加载映像SHA、播放/远控与网络设备不在本次执行范围。发行真实闭环后，按用户新增要求另做用户文档与Release规范的有限整理，不启动新开发。此前夜间e41候选及公开039来源保持独立，不能代替本版实际门禁。

## 2026-10-18 — 夜间有限复核主线完成

从准确31fdc新隔离分支完成有限A-F盘点，四项源码修正与两处文档事实更正已有独立小提交：诊断键脱敏8ace992、UDP helper一次终结74855b0、打包/许可历史语境dbf91ab、Native线程构造顺序e41a050。诊断同test修前1/7、修后7/7，相邻49/49；网络正式同test修前3/14、候选和实际产品14/14；Native受限源码合同修前1/3、修后3/3，相邻Node/fake集合78/78。网络和Native精确差异均先经技术审核，播放/Session及Native协议、运行loop和关闭归属保持。

最终候选source e41a050bcbe0987cc895e90c43c068203b240821在独立冻结树完成材料210/210、标准构建/VerifyOnly、109普通源码及Native CPP另行绑定、51输入/4notice、2159payload/2160完整runtime与全ZIP回读。生产Helper testing=false，SHA-256为baaef0f2c4599cd48a2bfbb7bc188071dc548d57ddf3ee794fe5baeca3589494；默认libmpv身份与公开039保持。候选ZIP240470557 bytes，SHA-256为e1d524aaa175fc68f58abe82f9bc559b755b7eef6203409c3bf3554a9b94debe。详情及回退见[复核报告](OVERNIGHT_REVIEW_REPORT_20261017.md)。

两个Native构造函数已改为所有成员初始化后在函数体启动线程，字段布局和生命周期保持。编译替代模型与源码合同只支持初始化顺序结论，实际生产Helper的ready、加载映像SHA与播放仍未执行。PR #44经父实际累计diff和候选核验后正常合并，代码集成main为`88fcac151d14a6e8d69ff5bd47db252b1d5b71c3`，分支/PR/main公共CI各1119/1119；修改文档和旧公开对象已按准确main读回。未执行系统安装/现用客户端/产品UDP或真实服务器业务，不新建二进制版本，公开039 source/tag/资产及Latest031保持。以下记录保留各阶段身份。

## 2026-10-17 — 发行闭环后的后续范围准备

039发行文档main `8f46ed48eda173796f597ff56f4a0fc18aef45fb` 的公共CI1095/1095通过，最终远端回读通过；产品source/Tag仍固定06d34a7/v0.3.9，公开附件、旧发布及Latest031保持。已形成[后续范围与启动条件](NEXT_RELEASE_SCOPE.md)，同步排期和安装已知问题；已交付Web/菜单/手动内核及完成安装场景移出待办。

CEC/WOL/发现/开机启动按当前维护源码分开记录存在、注册、条件可达与实际执行UNKNOWN；显示映射/跨renderer同值恢复/完整退出保持条件候选。下一项为已排有限夜间代码与文档复核，必须在本次准备父审闭环后从届时准确main新隔离树开始；没有040实现或新二进制发布。以下发行及历史过程记录保留。

## 2026-10-17 — v0.3.9公开发行与升级验证

[v0.3.9安装升级验证测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.9) 已公开，PR #43正常合并，产品source固定 `06d34a712e26e0d6d0b299b487cfd68625df71ed` / Tag `v0.3.9`。main/Tag公共CI各1095/1095，材料210/210；标准新安装器175736588 bytes、NotSigned，runtime2159 payload/2160完整文件，相对038只有7个版本/来源身份文件变化、2153文件字节一致。五附件已匿名完整下载重hash，原20个Release/附件与43行旧Tag引用保持，Latest仍031；详情见[发行核验](V039_RELEASE_VERIFICATION.md)。

H7一次同目标038→039升级及父独立5组安装后核验通过：root/child绑定句柄实际exit0，所属setup TEMP消失，当前039/source06d、2159声明payload/2163实际文件准确，994项资料及有效DeviceId文件不变，桌面和开始菜单入口保持，app/uninstall均0次。原036备份和036/038参考包完整保护。完整14项及前台/播放/服务器边界未扩张。功能沿038，签名暂缓；发布后下一步仅准备有限后续范围并交父审。

以下保留发行前各停点的过程历史；其中“尚未发布”“当前038”“父待核”和旧不发039选择均只描述各记录当时状态。

## 2026-10-17 — v0.3.9安装升级验证测试版发行准备

用户最新明确发布039并在发布后准备后续版本内容，覆盖此前无功能改动不发039的收口选择。已从父最终核准的5b0ccce建立隔离发行分支codex/v039-release-closeout，版本元数据更新为0.3.9；功能代码沿038，核心/依赖/安装器逻辑不改。按[发行合同](V039_RELEASE_CONTRACT.md)完成PR/公共CI/正常merge、准确main标准构建与完整包体门禁、父审后一次038→039升级、Pre-release五附件匿名全字节回读和主线文档闭环。当前尚未构建或发布039，Stable/Latest仍031，签名暂缓。

先前H0–H6有界主机验收已获父最终通过；其独立核验8组0失败，原036备份及994项资料/DeviceId保持。父随后按原件字节恢复桌面快捷方式，开始菜单保持；不改旧H6默认unchecked原回执。当前安装038继续保留到新039包父审通过，完整14项、UAC/取消、空资料首次启动与真实播放/服务器仍未测。后续仅在039发布闭环后准备规划文档，不实施040。

## 2026-10-17 — v0.3.9有界主机矩阵完成，可信038已恢复

状态为 `HOST_BOUNDED_MATRIX_COMPLETE_PARENT_FINAL_REVIEW_PENDING`。父已独立核准固定Inno6.7.3的精确两文件延后残留分类，原H5_A2的180秒目录归零失败保持；H6随后实际同目录重装038，root/child均由绑定句柄读到exit0，所属setup TEMP消失。最终独立读回为0.3.8/source `0bbc504fbb6ca98dfb7476e8078c4483347b4375`：2159声明payload及manifest字节准确，实际2163文件，另3项为uninstaller/dat和原debug.log。开始菜单指向已核Host；桌面任务按卸载后原默认unchecked，未擅加TASKS。未启动应用，不把文件门禁当启动/播放验收。

H0完整备份、H1_A2只读文件锁拒绝、H2升级、H3降级、H4返回038、H5有界卸载及H6保留资料重装均有实际证据。最终994项/93727294字节profile及有效DeviceId文件保持；原036完整程序/资料备份和可信036/038包再次全量SHA核验可读。实际setup启动6次（含初次H1观察失败）、uninstaller1次、app0次，当前所属进程0。本次唯一uninstall TEMP根仍保留已核self-copy及空marker，不能声称TEMP文件零或全盘清理通过。

无确认产品缺陷，src/native/tools/tests/installer及版本/依赖不变，没有039构建/PR/Tag/Release或远端写入，不造空版。空资料首次应用初始化、自选中文/迁移目录、标准账户/UAC接受拒绝、真实运行进程占用、目标ACL拒绝、向导/复制取消和复制失败恢复、前台/播放/远控仍未覆盖；不把有界H0–H6推广为原14项全通过。以下停点均是保留的过程历史，最终证据待父复核。

## 2026-10-17 — v0.3.9卸载完成与固定工具链残留复核

父已准精确目录末尾分隔符窄修，H5_A2实际启动并从绑定root/clone句柄读到exit0；所有声明payload/manifest、固定登记及两快捷方式已移除，994项资料/DeviceId文件字节保持。APP仅余原有debug.log。私有runner等待180秒后仍见本次TEMP根的两个文件，原attempt记为FAIL并保留；当前程序已卸载，H6尚未执行，不能继续沿用上一节的“038已安装”。

同版本官方Inno6.7.3源码说明 `_unins.tmp` 与空 `_unins-done.tmp` 是延后残留清理机制，清理在后续卸载启动调用，Setup启动调用被注释。本次self-copy大小/SHA等于刚验证的卸载器、marker为空、无其他TEMP项，root/clone已实际结束；原门禁把进程退出与TEMP文件立即消失绑定，属于待纠正的验收假设，不据此判产品故障。[官方卸载机制](https://github.com/jrsoftware/issrc/blob/is-6_7_3/Projects/Src/Setup.Uninstall.pas#L196-L218)与[残留清理实现及Setup调用说明](https://github.com/jrsoftware/issrc/blob/is-6_7_3/Projects/Src/Setup.MainFunc.pas#L1460-L1624)已记录供父核。具体哈希/目录只在私有回执；不手删、不再运行卸载器触发广泛旧TEMP清理。父接受此有界分类后再按已准H6恢复可信038，产品源码/版本不变。

## 2026-10-17 — v0.3.9 H0–H4通过与H5登记表示停点

父已核H1初次观察器失败，准予私有观察器修复和新attempt重验。H1_A2真实root退出7、TEMP子进程退出7，均由绑定进程句柄读取，错误32拒绝及程序/资料/登记/快捷方式不变通过；原失败仍保留。H2升级038、H3允许降回036、H4返回038均真实退出0、所属root/TEMP完成及声明payload逐SHA通过，完整994项资料/DeviceId文件保持；额外文件分别27/28/27另列，降级多出的038脚本不自动判缺陷或清理。

H5在启动卸载器前因私有比较器把InstallLocation原始字符串与APP直接比较而拒绝。独立诊断确认版本038正确，位置字符串自H0起字节未变，只有末尾反斜杠，规范路径仍精确APP。卸载未启动，停止后全量回读确认038程序/资料/登记/快捷方式不变、ETE进程0。已准备严格仅允许精确APP加可选一个末尾分隔符的新attempt草案，语法通过但未执行；按父对新证据的停点交技术核，不新增用户安装许可。H6未执行，没有039产品改动或发布。

## 2026-10-17 — v0.3.9备份通过与H1进程观察停点

父已核准仅对本任务新建空BACKUP设置受保护三主体DACL，允许父目录原有额外只读主体，不改既有父/系统ACL。H0最终通过：程序2186文件、资料994文件逐项大小/SHA及完整集合读回，备份树3620条目ACL通过；源前后、登记及两条快捷方式稳定。原排序误报、父ACL拒绝，以及新根设置后回执布尔写法错误三次失败保留；最后一次只读核验本任务根权限与唯一登记元数据后继续复制，没有重设既有根ACL。

H1实际运行可信038安装器一次，所持只读Host句柄使PrepareToInstall记录Windows错误32并拒绝，句柄已释放。所属进程观察器随后报路径核对错误，未保存冲突观测值且未取得准确root退出码；不推断根因、不提升为H1 PASS。按合同停在 `H1_STOPPED_PARENT_REVIEW`，H2–H6未开始。独立停止读回确认程序完整2186项、资料994项/DeviceId文件、登记及快捷方式与原036一致；本次root/TEMP子进程和所属TEMP目录均已消失。需要父复核具体观察器证据与诊断后再推进；不是新增安装权限或VM前提。

产品源码、版本及依赖不变，仍无确认产品缺陷；没有039构建、远端写入或发布。已验证的仅是H0及H1拒绝/停止后稳定事实，未覆盖完整生命周期、前台或播放。

## 2026-10-17 — v0.3.9本机备份隐私门禁停点

父已实际批准精确APP、PROFILE、BACKUP及H0–H6顺序。本机H0已尝试两次，尚未进入安装：首次因两个收集器排序方式不同而误判程序清单变化；独立重枚举和逐文件SHA确认2186项新增/缺失/变化均0，统一排序修订及原失败回执分别保留。第二次通过程序、资料及可信安装器身份检查，在创建BACKUP前因父目录额外读取主体被隐私门禁拒绝。

状态为 `H0_PRIVATE_ACL_STOPPED_PARENT_REVIEW`。旧预检仅检查常见宽泛权限组，不能证明没有其他读取主体；不得据此放宽门禁或修改现有父目录权限。BACKUP未创建、资料未复制，安装器/应用执行均0，现有036及登记/快捷方式未写入。具体权限证据仅在私有回执；先父核目的隐私方案，完整H0通过后才能继续H1–H6。此问题属于验收工具/备份前提，尚无确认产品缺陷，版本仍038，没有039候选或发布。

## 2026-10-17 — v0.3.9本机预检与具体路径审查

用户已明确允许本机ETE生命周期验证，旧guest停点撤销。[本机验收合同](V039_HOST_ACCEPTANCE_CONTRACT.md)和私有预检/精确计划已准备，当前待父核具体路径及备份恢复后执行；此处不再要求用户提供VM或重复普通许可。实际目录、资料/备份路径、进程、提升及空间数据只保存私有回执，公开文档不带私人路径或备份内容。

已核固定AppId安装、产品/卸载器归属、可信036/038来源SHA及工作树/候选/备份/发行目录保护；当前未运行安装器、关闭客户端或写系统配置，备份门禁仍须实际完成并读回。产品版本保持038，无确认源码缺陷或039空包，签名继续暂缓。以下环境交接是本机授权前的历史记录。

## 2026-10-17 — v0.3.9环境交接与人工停点

父已实际审核首合同a867081、原安装/资料保留规则及准备回执，准备范围通过；[环境交接](V039_MANUAL_ENVIRONMENT_HANDOFF.md)明确最小需要专用可丢弃Windows guest/测试机和回退点。用户提供/启动环境与guest内系统写入分开确认；父审具体边界后可自动执行适用矩阵，用户不必手测14项。宿主虚拟化/VM安装/前台均未批准，临时目录或静默参数不构成隔离。

可独立准备已完成，真实系统矩阵仍未执行，项目专用guest NOT_ESTABLISHED。当前无确认产品缺陷，版本仍038，未构建039空包；旧038包/source/SHA及恢复入口见交接，签名继续暂缓。父自有独立证据审核与最终通知另行记录，本执行侧不重跑历史15项或下载额外大包。

## 2026-10-17 — v0.3.9安装生命周期首合同

从准确main/docs `a1b2a04d21c023062934351f29868e9c1c908b7a` 建立独立 `codex/v039-install-lifecycle`；[范围与合同](V039_SCOPE_AND_CONTRACT.md)进入父审。当前未发现确认产品缺陷，版本仍0.3.8，没有039候选或发布。12项相关Git blob自night5341保持，可复用C包15项原静态/合成证据和D包有限资源结论，不重标为系统PASS。

已准备3套项目内合成BEFORE快照并确认收集器不改输入；限定只读探测及tracked声明盘点尚未建立项目专用可回退Windows环境。真实安装/覆盖/原允许降级/卸载重装/UAC/取消/失败恢复/退出码仍未执行；先父审具体环境与系统副作用，宿主及个人资料保持。用户已给符合条件的039测试版发布授权，不逐批重问；无确定改动不为版本号重包，签名及其它暂缓项保持，Latest仍031。

## 2026-10-17 — v0.3.8测试版已发布

[v0.3.8 GitHub Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.8) 已发布，PR [#42](https://github.com/hope140/EmbyTheaterEnhanced/pull/42) 已正常合并。产品Tag `v0.3.8` 固定准确main来源 `0bbc504fbb6ca98dfb7476e8078c4483347b4375`；后续文档HEAD与产品来源分开。Stable/Latest保持v0.3.1。

main与Tag公开CI各1095/1095、固定材料210/210通过；准确main隐藏组件62/62通过，实际窗口显示/网络/Native启动及所属残留均0。标准安装器为175754512 bytes，SHA-256 `2f0be46a17c16522f677e7a174da72815bec8d9a06ffb0181a5183670fdef2db`；解包{app}的2160文件与完整runtime逐路径/逐SHA一致。相对已审bd486f5候选仅6个来源身份元数据变化，其余2154文件字节相同。五附件已匿名全字节回读并核对大小、SHA、来源、校验文件和同源发布说明，详见[发行核验](V038_RELEASE_VERIFICATION.md)。

用户主要验收反馈为 `USER_REPORTED_NO_ISSUE`，其余 `MONITORING`，不扩展为逐设备或真实硬件/播放/远控/安装PASS。完整lease/CAS、可靠显示映射及完整app-exit恢复缺口保持；缓存和STRM字幕/音轨切换延迟暂缓。本次未执行系统安装、主动前台或真实服务器业务，不启动下一版。以下为发行准备和本地候选的历史记录。

## 2026-10-17 — v0.3.8测试版发布准备

用户已授权v0.3.8 Pre-release发布闭环，主要验收反馈记录为 `USER_REPORTED_NO_ISSUE`，其余场景 `MONITORING`；不展开为逐设备、真实硬件/播放/远控/安装PASS，不再等待补测。已父验bd486f5产品/0c8c051文档和夜间四项维护作为内容基线，在独立发行树准备PR/CI；最终安装器、Tag和来源记录须重新绑定合并后准确main，旧本地候选保持原身份。

产品范围冻结为夜间四修与A/B1/N1/N2。完整lease/CAS、可靠映射和完整app-exit缺口保持，缓存和切轨延迟暂缓；Stable/Latest保持v0.3.1。发布后另记录实际PR、CI、安装器解包和全部五附件匿名回读证据。本次授权不含系统安装、主动前台、服务器业务或读取个人凭据。

## 2026-10-17 — v0.3.8本地候选完成

状态为 `V038_LOCAL_CANDIDATE_COMPLETE`。产品source `bd486f5fa625496086248b80a3f8859dc19b19da`、版本0.3.8，包含夜间四项维护及已准A/B1/N1/N2局部修正。准确来源公开1095/1095、材料210/210、源构建、VerifyOnly通过；2159 payload/2160完整runtime、109产品/51输入/4notice来源绑定与逐文件SHA闭合，独立runtime审计578/578通过。隐藏实际组件62/62及候选入口隔离检查通过，实际显示/网络/Native子进程均0，所属进程正常退出、无残留。

候选 `dist/ETE-v0.3.8-display-bd486f5-20261017/Start-Candidate.cmd`；目录/ZIP各2165文件，ZIP为233738938 bytes，SHA-256 `5aa4bcf59b70cbcddf15575f7440b5a77859dc4bb47ed35d96f70aad43724cc8`，完整集合、逐项SHA及CRC回读通过。专用profile在候选同级，不进入ZIP；后续文档HEAD与上述产品来源分开。详情见[交付报告](V038_LOCAL_CANDIDATE.md)。历史初败、错误事务断言、证据覆盖事故和独立重建复验继续保留原记录。

完整B2 lease/CAS、跨renderer同值接管、显示目标映射与完整app-exit恢复仍为UNKNOWN；真实播放/远控/显示硬件/前台/系统安装为 `USER_DEFERRED_NOT_TESTED` 或未执行。本地交付不等待人工反馈，不代表硬件验收或发布；本轮只有本地提交，没有远端写入。

以下为阶段历史，旧来源与当时待办不替代上面的最终状态。

## 2026-10-17 — v0.3.8 N1同adapter FPS工作合并

父审通过N1-v2形状后，产品来源`c64923c891d07c947c62e28f6d3efdddeac541a4`仅落实同adapter/request的共享drain、latest pending、原3000ms稳定等待及invalidate退休清理；await后复核record/request，内部finally先释放record再结算Promise。两份完整AMD新回归各9/9，连同Native/字幕与既有Play/settings/两adapter相关合计70/70通过；精确旧源用相同测试分别1/9、4/9。收口微任务用例另能拒绝旧未应用外层finally草案，未把它称为原311的失败。

N2保持未应用，空/无效restore结果诊断的窄rebase草案也只完成语法检查，等待父矩阵与具体审核。[当前合同](V038_NARROW_DISPLAY_REVIEW.md)明确N1不提供跨renderer lease/main物理取消或完整恢复。版本仍0.3.7，没有038runtime；最终组合范围稳定后再做版本和完整门禁，未重复已绿的A+B1全量。

## 2026-10-17 — v0.3.8 A+B1来源复核与窄子项停点

产品来源`311e36690c2eff5ea014d98878d4899b0d82f587`完成绝对close边界修正、不可用切率结果收口及main全局FIFO。公开1061/1061、相关121/121、材料210/210、JS319/PS28和有限模式370通过；本来源2个所属惰性Node假进程实际close、残留0，未执行真实显示工具。父已实际审源并独立复跑相关14/14通过；后续b165592仅修测试cleanup调用，2/2通过，产品不变。不冒称硬件或逻辑lease完成。

4a首次完整npm集合1121/1122的唯一失败为require时缺生成preload；按固定生成器补齐后原夹具5/5通过，首轮失败保留。B1只提供物理串行。[N1/N2窄方案](V038_NARROW_DISPLAY_REVIEW.md)已补8场景/292trace修前事实及独立未应用diff：同adapter FPS合并、恢复前第三值观察守卫，具体失败选择待父审。版本仍0.3.7，没有038候选；跨实例同值接管、目标映射、完整app-exit恢复及真实硬件仍未闭合。

## 2026-10-17 — v0.3.8 A有界显示探测局部修正

父审adaad65后限定批准A：main接收起5000ms封口、1000ms所属进程确认与未退出隔离；XHR单次/Play探测总8000ms，失败仅降级可选显示探测，取消仍退休旧Play。原功能关闭查询与成功FPS的3000ms保持。FPS/旧恢复调用补必要错误收口，不把undefined或kill成功当作显示恢复证据。相关104/104及2个所属Node假进程真实close/残留0通过，未运行真实显示工具；最终公开门禁另记录。

B的精确[归属设计](V038_DISPLAY_OWNERSHIP_REVIEW.md)分开main物理FIFO与adapter局部lease。实际Web注册不能证明跨renderer唯一owner，当前协议也无可信实例归属；B只设计/有效失败用例，未实施。版本仍0.3.7、没有038runtime或候选；真实映射/硬件/完整app-exit恢复保持UNKNOWN或未测，独立可验证工作继续。

## 2026-10-17 — v0.3.8 显示兼容合同与离线复现

从已父验夜间 HEAD `e2b0eff8de31b51500af7adbf6e9e032cd4b5cb6` 建立独立本地 `codex/v038-display`，继承四项限定修正。当前只收集证据并形成[显示兼容合同](V038_SCOPE_AND_CONTRACT.md)，产品与版本仍为原 0.3.7，尚无 0.3.8 runtime。真实函数体探针确认无终态工具/XHR挂起，完整AMD夹具复现并发change、Stop/Next后旧物理变更及外部第三值被恢复覆盖；已有旧请求unpause保护的正反对照通过。协议16/16、设置2/2、全屏11/11通过，均为离线合成证据。

固定输入复制与四项身份门禁通过。固定参考源码已只读核查，现有生产合同仍缺窗口到Win32显示设备的可靠映射，保持UNKNOWN；硬件、前台与安装NOT_VERIFIED。跨层超时、恢复归属与退出具体修正先父审；预算为候选技术假设，未写入产品。不等待用户人工测试来阻塞独立工作，当前没有远端或系统写入。

## 2026-10-17 — 有限维护本地候选父审完成

产品source `5341f32985aabefa03f789b1428d8dfa2be5ba06` 完成四项限定修正，独立候选入口 `dist/ETE-night-maintenance-5341f32-20261017/Start-Night.cmd`。公开完整确认996/996、材料210/210、隐藏组件62、实际隔离入口、VerifyOnly和完整包体/ZIP回读通过。ZIP 240674258 bytes，SHA `3f39076954ae4b3ef18270a17ccfcb288c3b9cc2634d7a0ba6956f3f7db677c1`。来源109产品/51输入/4notice Git blobs闭合，2159 payload/2160runtime/2164ZIP文件流准确。后续文档HEAD与产品来源分开。

状态为PARENT_REVIEWED_LOCAL_CANDIDATE_COMPLETE。父会话实际源码/最终组合复核及独立artifact298/298通过，父审文档快照9799a65与产品5341f32分开；本次仅文档状态收尾，候选与ZIP保持。本轮仅本地提交，未推送/发布。人工菜单与电影库往返等待用户反馈；安装与旧资源有限审核无新增确定缺陷，未知消费者保留。显示器映射、恢复owner/超时及真实硬件/系统等保留原因和恢复条件，不继续等待或扩张。全部失败阶段及审计器schema/root-prefix错误保留，详见[最终报告](OVERNIGHT_REVIEW_REPORT_20261016.md)。

以下为本轮过程记录，当前状态以上述为准。

## 2026-10-17 — 设置栏本地排序与限定修正

隔离夜间树已落实指定七项排序的六个route.order字段，原聚合器与路由归属保持，3/3定向测试通过；组合来源构建和隐藏组件核对尚未执行。安装15/15隔离检查通过，未运行真实安装。显示P1、日志标签及电影分块双终态归属修正已获父审限定批准，分别实施与验证。范围、证据及未测见[夜间报告](OVERNIGHT_REVIEW_REPORT_20261016.md)；当前仅本地修正，037已发资产与渠道保持。


## 2026-10-16 — 发布后有限维护审核启动

已发布 main `45bea67` 为新隔离本地维护基线，分支 `codex/post-v037-night`。首个合同停点见[夜间审核报告](OVERNIGHT_REVIEW_REPORT_20261016.md)：覆盖指定七项设置栏排序、显示链、安装升级、旧资源消费者及当前仍可达维护代码。当前仅固化范围和开展只读定位，尚无产品修改或新候选；复杂显示/播放/异步/信任边界差异先父审。037发行状态及原资产保持，后续修正仅本地。


## 2026-10-16 — v0.3.7 测试版已发布

[v0.3.7 GitHub Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.7) 已发布，PR [#41](https://github.com/hope140/EmbyTheaterEnhanced/pull/41) 已合并。产品 Tag `v0.3.7` 固定准确 main 源码 `bf6e48214820fac0558bdfe7f37526f1c7a3d7c2`；Stable/Latest 保持 v0.3.1。主线与 Tag CI 均为 977/977，固定材料门禁 200/200。

最终 runtime 为 2159 个 payload / 2160 个完整文件；安装器解包 `{app}` 为 2160 个文件，与 runtime 完整集合及逐文件 SHA 一致。独立安装器审计确认产品路径与已审候选字节一致，差异仅限 6 个 source/provenance 身份文件。标准安装器 `EmbyTheaterEnhanced-0.3.7-win-x64-setup.exe` 为 175733823 bytes，SHA-256 `aca0ff577ad111f726bf769706b23d5e0e2d7d1706e7bfa768c2d15e9db1f49d`；build-manifest SHA-256 `1439f6521e32d40758b049f4e15eb4ed171a9698bdbc27d776c9dfb303cec19e`。五个附件均已匿名完整回读，详情见[发行核验](V037_RELEASE_VERIFICATION.md)。

最终来源的 53 项隐藏检查通过；这些是隔离合成检查，实际窗口显示、网络请求、Native 子进程及所属残留均为 0。用户对父会话清单第1—4与第6项反馈正常，记录为已测场景 `USER_REPORTED_NORMAL`；第5项电源/退出组合按用户要求暂缓，`USER_DEFERRED_NOT_TESTED`，不作为本次发行门禁。本执行会话未独立开展真实服务器播放/远控、前台、OS电源、系统安装或硬件验收；用户已测场景按USER_REPORTED_NORMAL记录，不扩大未说明矩阵的PASS。

后续文档 HEAD 与产品来源分开，不改变 Tag 或安装包来源。以下 v0.3.7 本地候选和审核过程为历史记录；已发布状态以上述为准。


## 2026-10-16 — v0.3.7用户验收反馈与Pre-release授权

用户明确授权在执行会话发布v0.3.7测试版，包含必要push/PR、CI和父审后merge、最终main准确来源构建/标准安装器、Tag/Release五附件及匿名完整回读、main文档收尾。Stable/Latest保持v0.3.1。当前进入发行准备，尚未发布；验收与发行合同见[发行核验](V037_RELEASE_VERIFICATION.md)。

用户按父会话清单第1—4及第6项反馈正常，仅记录已测场景USER_REPORTED_NORMAL；第5项电源/退出组合因缺环境未测，用户随后明确暂缓，后续使用发现问题再反馈，不再设为本次发布等待条件。未说明的媒体、硬件与系统层仍不补写PASS。旧候选目录/profile/log保持，不读不删；本轮不安装、不主动前台、不读取个人凭据、不写真实服务器、不开始038。以下保留本地候选和审核历史。

## 2026-10-16 — v0.3.7本地候选父审核通过，人工验收待完成

父会话完成产品source `1246da1023c43981c7ed40a4e556cb95c7eb7e02`、文档快照`619be41`的最终审核：生产路径77/77，生成PM/runtime/审核副本一致，冻结边界与source后仅文档差异通过。父独立只读artifact审计302/302通过，完整核对2159 payload、2160 runtime、2164 ZIP及来源Git blobs、launcher/profile边界与ZIP字节/CRC。ZIP仍为240504661 bytes、SHA `9e7ea2d64df19838e2942674f4efbe23be54cfeff8b0eadab74fea281180ed6c`，未更改。

当前状态为parent reviewed / manual review pending；人工前台、真实服务器播放/远控、OS电源与安装仍未验证。此次只更新文档和私有状态，读取既有父审回执，不重跑已过门禁、不改产品/runtime/ZIP/VALIDATION或旧profile。候选身份与证据入口见[本地候选](V037_LOCAL_CANDIDATE.md)；父会话负责交付和本任务heartbeat收尾。

## 2026-10-16 — v0.3.7本地候选完成

A/B/C/D局部修正按审核范围合批，产品源码固定`1246da1023c43981c7ed40a4e556cb95c7eb7e02`。最终公开离线977/977、材料200/200、D及原请求/Session77/77通过；源构建2159 payload/2160完整runtime、VerifyOnly、独立完整集合/逐项SHA与ZIP2164文件流回读通过。独立目录入口为`dist/ETE-v0.3.7-controls-1246da1-20261016/Start-v0.3.7.cmd`，ZIP为同名目录加`.zip`；具体SHA、来源关系和人工清单见[本地候选](V037_LOCAL_CANDIDATE.md)。后续文档HEAD与该产品来源分开。

源构建隐藏实际应用OSD18、ApiClient原型/真实Events17、PM/真实队列/Events/原生DOM18项通过，API/Player/socket均为合成替身、OSD生命周期手动驱动。7个合成Session的start/stop身份配对，7 start/1 progress/7 stop；显示/外网/Native均0、资源及所属进程收口。独立启动探针确认0.3.7和资料路径隔离，生成profile不入交付。真实前台、服务器播放/远控、OS电源、安装与硬件仍未验收。

本轮没有push/PR/merge/Tag/Release或系统安装，Stable/已发布版本状态保持原记录。菜单仅独立待办，未开始后续版本；先前失败和审核停点保留其历史归属。

## 2026-10-16 — v0.3.7 D条件审核闭合，准备合批本地候选

父会话明确允许补测后落实D窄变换。扩展observer材料19项在旧输出5通过/14修前失败，父审输出18/19；唯一新增缺口为同一self-managed Player旧A stop清新B资源。最终用既有Item/request身份限定资源退休，保留原核心stop状态/事件语义，19/19通过。主线程审查副本与实际生产生成器均58请求/Session+19 observer合计77/77，输出SHA一致。

当前A/B/C/D局部实现就绪，进入0.3.7准确来源构建和独立本地交付准备，尚未构建新候选或发布。真实服务器/播放远控、OS电源、前台、安装与硬件仍未验收；菜单仅独立记录。先前D审核停点、修前失败和历史975门禁保留各自来源，不作为最终候选新来源PASS。

## 2026-10-16 — v0.3.7 A/B/C局部修正，D核心差异待审

父会话核验9b8cbd3合同并批准A/B/C；OSD倍率键监听/timer归属、main独立电源owner及退出清理、ApiClient关闭/重连代次已按限定范围实施。原键表/500ms、协议/认证字段、connected含义、订阅与原队列/Session归属保持。隐藏完整应用复核额外发现同一Player切集仍可执行旧timer，已接原OSD start/stop清理并在实际完整AMD/组件中修前复现、修后18项通过，显示/网络/Native为0。

本轮公开离线975/975；最后同Player局部修正后的定向50/50、A材料自测和来源材料6/6通过。D只新增材料测试及逐分支草案，原生成器保持：当前7项中1通过、6项修前失败，未修复；草案仅语法检查，未执行。准确挂接点、缺口与保留的50ms行为见[更新合同](V037_SCOPE_AND_CONTRACT.md)。当前在`D_CORE_REVIEW_REQUIRED`停点等待父审，不构建未定核心的整套候选；版本号保持0.3.6，尚无v0.3.7来源候选/发行。完整应用证据来自明确替换的隔离夹具，不替代准确来源构建、真实播放远控、系统电源/安装/硬件验收。

独立后续待办已记录：仅Emby Theater Enhanced栏按操作快捷键→HDMI-CEC→视频设置→音频设置→STRM智能解析→诊断与日志→关于Enhanced排序。版本未指定，本轮不改菜单，其它栏/分类/路由/功能保持。

## 2026-10-16 — v0.3.7范围合同待审核

从实时远端main `dd198ac037abd7658e78931dc52da285cf61d174` 建立独立工作树，已完成播放控制与连接生命周期的只读调用图、固定材料核验及限定隔离复现。四项问题为OSD倍率键盘监听/迟到timer、电源锁共享句柄、logout期间旧socket重连，以及PlaybackManager音量OSD observer跨Stop存活；最小候选文件、核心触及理由、回退与逐项验收见[范围合同](V037_SCOPE_AND_CONTRACT.md)。正常队列/InputManager/Session与现有对称清理保留，队列升级轮询仍为静态观察项。

当前为`SCOPE_REVIEW_REQUIRED`，在规划会话审核停点停止，尚未修改生产代码或生成v0.3.7候选。PlaybackManager基线58/58与AppHost定向20/20通过；四项复现分别来自隔离VM或完整模块合成fixture，不代表完整应用、真实播放远控或OS电源验收。未执行前台、真实服务器、Native、安装或硬件操作；原工作区、旧产物和profile保持。版本与已发布状态仍按v0.3.6记录，当前没有远端写入。

## 2026-10-16 — v0.3.6启动页测试版已发布

[v0.3.6启动页更新测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.6)已公开，PR #40已合并，产品Tag和安装器固定最终main来源`de1a731aa3e915b00988134b6f5331bfc867a84a`；Stable/Latest保持v0.3.1。五个附件均匿名完整回读通过，Release为非draft的Pre-release。原Emby PNG字节保留，副标改为THEATER ENHANCED，原loader/页面结构保持。

最终main及Tag公开CI955/955、材料163/163（无跳过）、2158 payload/2159完整runtime与2159解包文件逐路径SHA通过；安装器175752059 bytes、SHA-256 `020df218195e9999d443ad0832df6cd1be9a8c9f8dc8d7780b75b6c25893edc1`，未签名。实际隐藏启动390/800/1280及原loader继续加载通过，实际显示/网络/Native启动0；没有补写前台、真实服务器/播放远控或系统安装验收。详情见[发行核验](V036_RELEASE_VERIFICATION.md)。后续文档HEAD与产品来源分开；以下保留过程记录。


## 2026-10-16 — v0.3.6启动页实施与发布授权

用户明确“直接完成并发布0.3.6吧”。范围为沿用原Emby标识、更换旧署名为THEATER ENHANCED与启动尺寸适配；新独立工作树从文档main 0f7f3a5起步。必要提交、push/PR、门禁后合并、最终主线来源构建/标准安装器、Tag与Pre-release及匿名附件回读、文档收尾包含在本次授权中，Latest保持v0.3.1。当前实施/验证中，尚未发布；旧包/profile、vendor及共享标识保持。详见[启动页合同](STARTUP_BRANDING.md)。

2026-10-16：[v0.3.5 详情与搜索测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.5)已发布，PR #39已合入main。产品Tag与标准安装器固定最终主线源码`b0234c8a0e8d4fb264b21cf39f8ce68c9146d115`；Stable/Latest保持v0.3.1。五个公开附件全部匿名完整回读通过，Release为非draft的Pre-release；本版没有OPEN PR。

最终产品来源公开CI951/951、固定材料162/162（exit 0）通过；真实AMD默认搜索24项及空结果三视口恰好1条通过。2157 payload、2158完整runtime和2158个{app}解包文件逐路径/SHA一致。安装器175741577 bytes，SHA-256 `03f8cf5f2b18f854cc6548a7fe2d60cd641a8187479c4fd2e3ad22c8dfd87414`，未签名。用户已完成此前cc7f542候选所测场景测试并授权发布；不补写真实远控、系统安装或旧服务器矩阵逐项PASS。准确来源、下载与验收边界见[发行核验](V035_RELEASE_VERIFICATION.md)。后续文档HEAD与产品来源分开，原候选和失败记录保留。

## 发行前历史记录

以下内容记录当时的准备、候选和失败状态，不代表当前发行状态。

2026-10-16：用户对cc7f542当前本地候选所测场景反馈“测试完成了，可以发布了”，记录为USER_REPORTED_TEST_COMPLETE，并明确授权v0.3.5 Pre-release发行。该反馈不补写未说明媒体、真实远控、系统安装或旧服务器矩阵逐项PASS。当前进入PR/门禁、最终main来源构建、标准安装器及公开回读流程；Stable保留v0.3.1。

## 本地候选历史记录


2026-10-16：用户截图反馈搜索空结果重复提示，旧2c9410c已在默认原路由复现2条。新产品来源`cc7f542cf12a236bba22948030b5043a8a736e08`删除helper重复成功空态，保留原ListController统一空提示和独立请求错误。定向15/15、材料162/162、默认完整应用24项、三视口恰好1条及包体/启动隔离通过，ZIP2162文件完整流回读通过。新独立候选见[搜索反馈修正](V035_SEARCH_FEEDBACK_FIX.md)，旧包/profile保留，未发布。

2026-10-16：父审核确认441eafb默认搜索入口P1并拒绝该交付，旧18项只覆盖显式serverId。修正产品来源`2c9410c1bfd9ab27e7f3fe9943f9841b20494829`按原controller选择owner/显式/当前ApiClient并复核client+userid归属；原getRouteUrl('search')生成的默认路由完整应用20项及显式18项通过，未附serverId或owner client。新来源材料162/162、关键合批回归、2158完整runtime与启动隔离通过；公开首轮950/951，唯一Git fixture失败项隔离复验1/1通过；ZIP2162文件流回读通过，未发布。详情及人工清单见[当前修正候选](V035_DEFAULT_SEARCH_FIX.md)。下方441eafb为被阻断历史来源，旧包保留。

2026-10-16：用户已接受将搜索与菜单取消局部修正并入未发布v0.3.5。当前合批产品来源`441eafb5dd5434174bad739eb0e1ed01abb0ae4f`，本地候选已构建；标准搜索18项、电视搜索9项、详情24项与三条真实菜单取消、原电影库/首页回归、162项材料及完整2158文件核对通过，最终公开948/948与ZIP2162文件流回读通过。原视频禁用展示保持；真实服务/前台/播放远控/安装NOT_VERIFIED，未发布。准确身份和人工清单见[合批候选](V035_BROWSE_CANDIDATE.md)。下方51ae2e4为历史详情候选。

2026-10-16：v0.3.5详情页本地候选已完成实现与来源绑定验证，产品源码`51ae2e4df281a460e58af15255630e159bcb0ec7`。修正详情离页/销毁/刷新后的迟到回填，保留原四类型页面、菜单与播放入口。最终公开941/941、固定材料157/157、隐藏完整应用24项及四类型12组三视口通过；真实Tab/Shift+Tab通过，显示/外网/Native启动0。runtime含2156 payload/2157完整文件，VerifyOnly与独立哈希核对通过，空profile启动隔离通过；交付目录`dist/ETE-v0.3.5-details-51ae2e4-20261016`。原生菜单取消诊断缺口仍OBSERVED；真实服务器、前台、播放/远控与安装NOT_VERIFIED。准确身份和ZIP回读见[本地候选](V035_LOCAL_CANDIDATE.md)。未推送/PR/合并/发布，Stable/Latest仍v0.3.1。

2026-10-16：[v0.3.4测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.4)已发布。PR #38合入main，产品Tag与标准安装器固定最终主线源码`98c26e4a123f0b8c623451ee7603fc431b28bddf`；Stable/Latest继续v0.3.1。范围为电影库请求取消、迟到结果与返回焦点保护、电影分类入口及首页受支持媒体库标题跳转。

## 2026-10-16 — v0.3.5用户反馈

用户在收到51ae2e4本地候选及详情页测试说明后反馈“现在看起来没问题”。记录为当前已测场景USER_REPORTED_NO_ISSUE / MONITORING，不补写具体媒体、菜单取消、实际播放/远控/安装逐项通过。用户同时询问能否合并其他Web相关版本，当前仅进入批次调整讨论，尚未接受搜索或共享控件的新实施范围，也没有新的发布授权。

最终来源公开CI940项、材料156项通过；空profile与合成API的隔离完整应用首页17项、电影库25项及三视口检查通过，窗口实际显示、外网请求和Native启动均0。2156项payload与含manifest的2157项runtime、安装器解包文件逐路径及SHA核对一致。安装器175753774 bytes，SHA-256为`eedf03e83b0f4b2b2ef674134af4fefc5068573b5bb82466e3ad4191c46d0c3d`，未签名。五个公开附件全部匿名回读通过，provenance及两份校验文件关系一致；v0.3.3附件与Stable保持原状。系统安装、真实服务器/播放/远控及前台验收未执行；以下本地候选记录保留其当时状态，本次文档收尾不改变Tag和包来源。

## 2026-10-16 — 当前v0.3.4候选用户观察

用户在收到ae245f6标题跳转候选后反馈“现在没看到有什么问题”。按上下文归属于当前v0.3.4候选的有限使用观察，记录为USER_REPORTED_NO_ISSUE / MONITORING；本次标题缺项转入观察。用户未逐项说明点击/Enter/See All/返回焦点、媒体类型或设备组合，不补写逐项PASS，也不扩大为真实播放、远控、旧服务器矩阵或安装验收。缓存继续不做，既有包体/sourceCommit保持，未因此发布或启动后续版本。

2026-10-16：首页标题跳转续办已完成新本地测试交付，最终产品源码为`ae245f623fa32957c155cfb8b5dd1f1e7aa78987`，版本继续0.3.4。桌面latestmedia电影/电视剧父媒体库标题使用原native标题与canonical router进入suggestions，TV和缺少受支持父级的分区保留普通标题；返回恢复标题/See All焦点，若See All随条目数隐藏则恢复可见标题。缓存与搜索布局不变，requestWait/clear/refresh函数体与b646374逐字一致。原ed00a97目录、ZIP及用户profile保持。

本批公开门禁940/940、定向/固定材料39/39、空profile合成完整应用17/17与390/800/1280视口检查通过；真实Enter事件从电视剧标题进入原tv suggestions并返回焦点。actual main/loader/router、native标题及See All升级、电影点击、账号失效阻止、TV普通标题均验证，实际show/外网/Node网络/Native启动0，非预期页面错误0，保留原file: Cache警告。旧源码无标题链接的完整应用基线已复现。真实服务器ParentItem DTO、前台体验、播放/远控及安装仍未验收。

新runtime为`dist/EmbyTheaterEnhanced-v034-home-titles-ae245f6-20261016`，2156项payload与2157完整runtime文件集通过source/runtime provenance、VerifyOnly和独立哈希核对。manifest SHA `b3cd0fe004b96ccaee8e3fe925579373f82cd1b86a4176a7c829d0c5445ad350`，payload-set SHA `acf43a44d4488ffa598d9101604c0cef47a6943dad0149c78211a8c96ca7442f`。新入口位于`dist/ETE-v0.3.4-home-titles-ae245f6-20261016/Start-v0.3.4.cmd`；同名ZIP共2161文件完整回读通过，SHA `6e4abb611e896af0de8ec232d6290043354cd58e4204b4d8233e50cca68c12c2`，启动隔离探针通过且不带profile。详情见[当前本地候选](V034_LOCAL_CANDIDATE.md)。后续文档HEAD与该产品来源分开；没有推送/PR/合并/发布/安装或真实服务器写入。

2026-10-16：v0.3.4电影库试点已完成本地测试交付，分支为`codex/v034-library`，产品源码提交为`ed00a97c11490a36e2a844c531772750deb22524`。用户已批准本批本地提交、构建和必要可回退修正；14文件按审核范围提交，之后未修改产品。实际调用图、最小差异与回退见[电影库合同](MOVIE_BROWSER.md)，产物身份与人工清单见[本地候选交付](V034_LOCAL_CANDIDATE.md)。保留原分页、筛选排序、卡片/列表和返回恢复，补齐Movie请求取消与迟到结果/焦点归属，电影分类明确进入videos页签。版本为0.3.4，默认libmpv字节保持原固定值。

来源绑定runtime为`dist/EmbyTheaterEnhanced-v034-ed00a97-20261016-r2`，2156项payload及2157项runtime完整文件集（含manifest）核对通过；build-manifest SHA-256为`9cf1211f4c367f82445cac59883037b165c1cce18072a9c7383d5cfd811f577b`，payload-set SHA-256为`8a70575381f2ea59a64dab112b6a10d5d5bf19a7acd189bf948d9a33abcccbac`。公开离线931/931、电影单元/材料22/22、来源夹具6/6通过；包体验证16项通过。已取得的检查未重复跑全量。

隐藏完整应用使用该runtime的真实main/app.js/router/controller和原卡片/列表，空隔离profile与合成API的23项检查通过，覆盖分页、筛选排序、卡片/列表、重复刷新、离页取消/迟到响应、接口失败恢复、合成旧版本提示及详情进入/返回；实际返回位置1460→1460，焦点保留同一合成影片。390/800/1280 CSS视口无页面横向溢出并完成截图检查；390仅由夹具临时解除最小窗口宽度，产品约束不变。窗口实际显示、外部请求、Node网络、Native子进程和所属进程残留均0。保留原file: Service Worker Cache警告，非预期页面错误0；这些证据不等于真实服务器、前台、播放/远控或安装验收。

本地测试目录为`dist/ETE-v0.3.4-local-ed00a97-20261016`，入口`Start-v0.3.4.cmd`通过独立launch.cjs在启动前固定appData/userData/config到`test-profile`。隐藏入口探针确认隔离路径及版本，且显示/网络/子进程0；探针生成profile已移出交付。最终r2 ZIP共2161文件逐项回读通过，4359项独立审计断言通过，SHA为`81962ab3d5f521925408ecb07a89d14de27861735781dc65b727d8c1fdb8b735`。锁定依赖原带12个protobufjs测试文件与v0.3.3同字节，保留完整依赖树；没有本轮profile/harness/fixture。真实登录、服务器矩阵、前台键盘/遥控、播放及安装仍为NOT_VERIFIED。后续仅同步文档HEAD，不重标runtime来源；未推送、创建PR、合并、发布或系统安装。

2026-10-15：[v0.3.3测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.3)已发布，PR #37合入main，Tag固定产品源码`11f29056c64abe2fb8133a409781a83e11cf9a60`；Stable/Latest仍为v0.3.1。最终main公开CI919项、材料144项及完整2155项payload检查通过；安装器解包2156文件（含manifest）逐项匹配。About三视口18状态、四原生选择器菜单及宽屏控件布局通过隔离检查，不代替真实详情业务、完整播放/回退或安装验收。安装包SHA-256为`066143a7a89fbf56ad9009b27298c4eb4c1e63f51c20b7642f463d43cc635589`，175696187 bytes，NotSigned；准确身份及下载校验见Release与随包provenance。本条文档收尾不改变已发布Tag或包来源。

v0.3.3测试版范围为服务端首页分区、手动内核管理、About原生界面、插件兼容及详情选择器一致性；安装包使用标准产品入口和原固定内核，个人profile与导入对象不随包分发。最终main来源、Tag、安装器SHA及包体关系以该版本Release和随包provenance固定，Stable/Latest保持v0.3.1。本轮用户已要求完成后发布测试版；离线延迟工具仍留独立分支，切轨延迟无限期延期。

2026-10-15详情选择器跟进：版本/视频缺少原生custom菜单标识，而音轨/字幕已有；候选通过固定HTML overlay统一四控件使用现有Emby ActionSheet。旧Carnival宽屏规则将选择区限制为24em并额外增加上边距，新增布局overlay仅在详情页80em以上恢复可用宽度和对齐，保留原CSS其余字节。5项定向及28项控件/overlay/构建合同检查通过；About修订已本地提交59b34cd并完成独立构建，后续一起形成最终来源绑定候选。用户已明确允许本任务可回退操作，无需再次逐项审批；没有据此推送、发布、安装或修改服务器数据。

2026-10-15用户确认新版内核可播放，截图显示20261015候选已通过本次启动握手，按USER_REPORTED基本播放与截图握手反馈记录；未据此宣称所有媒体、音轨字幕、回退或已加载映像SHA验收通过。About界面整理候选复用Emby原生按钮和listItem，区分本次/下次启动版本，技术声明与哈希收于默认折叠详情；19项定向、920项公开检查通过，原生组件源预览在390/800/1280三视口及18组状态通过，未显示真实窗口或访问网络。用户已授权本批9文件本地提交、来源绑定构建及独立启动入口整理。Web已交付插件兼容及服务端首页接线，媒体库/详情/搜索/喜欢/OSD仍主要沿用原组件，整套现代Web替换未实施。

2026-10-15首页说明修订后台完成：产品来源44edab5已构建并核对2155项payload，公开918/918、材料82/82及JS280项通过。隐藏完整应用实际切换主页/喜欢/主页，首页13分区、额外说明节点0；真实空收藏查询成功且页签可进入。独立内存合成收藏用例生成1张卡片，不代表真实收藏验收。已另行整理复用登录与当前播放配置的直接启动入口，窗口显示和Native子进程启动均未由后台验证触发。测试内核ZIP独立提供，固定基线和现用客户端未被替换；真实候选导入/重启/播放仍待用户验收。此后文档提交不改变44edab5产物来源。

2026-10-15首页验收补正候选：移除额外的服务端管理说明，仅保留服务器分区内容；28项首页回归通过。用户随后明确原网页也没有收藏，只读核对中12类原生收藏查询以及IsFavorite/IsFavoriteOrLikes等价查询均返回0，故本次喜欢空白是无收藏内容，不能记为加载故障或已有收藏渲染验收。将继续用完整应用验证主页/喜欢/主页切换并来源绑定构建；切轨延迟保持无限期延期。已单独准备最新Windows x64内核导入材料，通过静态包校验；尚未导入、运行或验收新DLL。

2026-10-15首页空白修复后台完成：产品来源f087a4e已重新构建，公开918/918、材料82/82及完整2155 payload校验通过。28项定向回归使用原生拆包函数；修正后的组件隐藏检查在800/1280各14项通过。新增完整应用检查加载真实main、app.js、router、HomeTab和BaseTab，以已有登录副本只读获取数据，实际出现13分区和卡片，布局有效、无首页帧错误；测试中窗口显示/子进程启动为0，写请求被阻止。已整理独立可打开入口，等待用户复测主页；旧be8e8c4用户失败记录不改写。切轨延迟继续无限期延期，内核导入缺新材料仍未验收。

2026-10-15用户验收反馈：首页空白，不能记为通过；喜欢可打开、插件暂未发现问题、尝试播放暂时正常，分别保留为有限USER_REPORTED结果。现场renderer错误落在HomeTab构造阶段，原生getDynamicImport已拆出default，而接线又取.default.create导致TypeError。已用原app.js加载函数复现同位置失败并形成修复候选，28项定向测试通过；后续新构建及完整应用检查单独记录。切轨延迟按用户要求无限期延期，移出当前工作队列，只有用户明确重新提出才恢复；内核导入保持缺少新候选材料、尚未验收，不阻塞首页修复。

2026-10-15首页首批后台阶段完成：最终产品来源be8e8c4已完成隔离runtime构建，2155项payload及来源/完整文件集合验证通过；本地ZIP共2156条目（含manifest），全部逐项读回核对。最终来源公开918/918、材料82/82、JS280/PowerShell28及331文本有限凭据模式检查通过。隐藏窗口使用构建后的HomeTab、维护模块、原CardBuilder/itemscontainer/imageloader/scroller，在实际CSS视口800与1280各通过14项断言，show/focus/外部请求均0，测试进程无残余；API、BaseTab及宿主播放服务为受控fixture，不等于完整客户端或业务验收。现阶段支持当前服务的默认水平卡片分区；特殊布局仍完整回旧首页。前台、真实播放/远控、登录复用及系统安装未验收。既有main及Release未由本批更新；本条文档收尾不改变be8e8c4包来源。

2026-10-15首次隐藏真实组件验证发现初始itemscontainer仍处于暂停状态，直接refreshItems没有实际生成卡片；候选改为沿原公开resume({refresh:true})入口激活。回归fixture同步从paused状态起步，28/28通过。5444670的初次隐藏结果保留失败，后续新来源构建和隐藏结果独立记录，不能沿用原构建的通过身份。

2026-10-15首页接线候选：HomeTab的resume/refresh/pause/destroy已接入自有服务端首页controller，按服务器分区顺序调用原卡片与虚拟滚动组件；旧版本、未支持布局和失败整体回退。真实只读HTTP核对中，4.10.0.40的电视/桌面模式均返回13个支持的卡片分区，三类条目接口读取成功，没有服务器配置写入或UI操作。28项接口/渲染生命周期测试、23项构建输入/overlay检查通过。当前接线尚未提交、未构建页面包；隐藏实际页面、前台、播放/远控和安装均未验收，早期接口候选记录保持原阶段身份。

2026-10-15首页方向已确定为读取服务端分区与顺序，并保留完整旧首页回退。当前新增独立只读API适配模块，11项离线测试覆盖版本提示、DTO、顺序、分页、请求取消、过期owner、超时及AMD导出。模块尚未接到HomeTab，首页画面和设置行为未变化；目标服务器响应、renderer、固定overlay及来源绑定页面候选待后续完成。首批不包含服务端配置写入。详见[服务端首页合同](SERVER_HOME_SECTIONS.md)。

2026-10-15主线集成：[PR #36](https://github.com/hope140/EmbyTheaterEnhanced/pull/36)汇总已完成的旧功能/M01、L02、M02和插件布局。本批功能实现、来源核对及后台验证已完成，集成状态和最终main构建来源以PR最终收尾记录为准；下面的94dbcef产物与验证记录保留原快照身份。首页迁移未实施，切轨延迟保持暂停；这次集成不发布Release或安装现用客户端。真实Helper/DLL、播放/远控、插件业务、前台和安装验收仍独立记录。

2026-10-15整体收尾快照：累计已完成旧功能/M01、L02、M02及插件布局的59条路径已核对完整，17项变更产品源码与94dbcef runtime的Git blob/文件SHA匹配；首页迁移未混入，切轨延迟按用户要求暂停。275项JavaScript、28项PowerShell语法、326项维护文本的有限凭据模式检查和累计diff-check通过。本地验收ZIP已生成，2154个文件（含manifest）均从ZIP内逐项读回核对；本条记录的是提交集成前的本地验证，后续状态见上条。

About先前未闭合的隐藏夹具已在最新94dbcef runtime单独补验：8个合成状态全部通过，覆盖未ready/ready/failed/缺字段/来源不可用及M02当前、pending、store不可用；内容窗口宽800（Electron坐标）、缩放125%，实测CSS视口640×702，无横向溢出，按钮可滚动/键盘到达。窗口show/focus/activate均0、退出后无所属进程，runtime payload零变化。该结果不改写历史69e8141的NOT_VERIFIED，也不代替真实Helper/DLL、服务器、播放/业务、前台或安装验收。正式source/runtime provenance validator以真实产品sourceCommit94dbcef为参数通过；文档HEAD单列。

2026-10-15构建收尾：本批9文件已本地提交为`94dbcef4b6f50469e535fb91fe86209d16670ae4`，分支`codex/plugin-layout-followup-20261015`。来源绑定runtime为`dist/EmbyTheaterEnhanced-plugin-layout-94dbcef-20261015`，产品版本保持0.3.2；公开门禁890/890、材料门禁82/82、`package.ps1 -VerifyOnly`及父会话最终2153项payload逐SHA/完整集合核对通过。build-manifest SHA-256为`8b22c2110084946abfb955ae15666c6b11281e5bec884caaa076ad67e533b289`，payload-set SHA-256为`bf8ea4d3e2abee07e6084a786f804e64410d72202d767173f18a7bbf791715d7`。直接读取该runtime的隐藏Electron合成门禁131项、静态模板三视口12组几何复验通过；前台动作、真实插件JS/服务器业务、Helper/DLL执行和安装均未执行。首次材料测试早于准备文件生成而出现ENOENT，保留原失败后在构建完成状态重试通过。后续文档提交只同步结果，不改变产品来源；未推送、发布或生成安装器。

2026-10-15：Chapter API 的 Path 列表宽度缺陷已形成独立修复候选。当前插件静态模板使用 33%/66% 的表格分栏；维护层对所有传统表格设置 `display:block` 会破坏该布局。候选保留原生表格布局，将超宽控件的横向滚动交给既有 `.content-primary`，不指定插件固定宽度。四个页面的静态模板、长合成内容在2030/1280/800三种视口共12组独立几何复核通过；包括目录滚动、窄Options键盘焦点局部横滚及外层纵向滚动。候选阶段只有静态模板与合成数据证据；之后的来源绑定构建和runtime复验见上条，真实网页/客户端前台及业务操作仍未执行。

同批补齐当前基础编辑器的验证：FilePath、FolderPath、SpacerItem、独立RadioGroup，以及ItemsSourceId/StaticItemsSourceId选项和命令值。父会话相关Node复核55/55通过，隐藏Electron合成门禁131项通过，包含传统表格布局检查；未打开路径选择器，仅向本地合成服务提交一次命令。未发现这些用例需要额外产品修复，不据此宣称任意插件完整兼容或已迁入新版Web整树。

M02本地阶段完成最终独立读回：产品`8d06f0b`、测试`d894e4e`、文档`dd34ac3`，2153项payload及manifest/provenance完整匹配。排期04保留历史耗时证据，当前缺少可读取的目标字幕/音频原始录制，不能确认T4或提出性能补丁；05现有基础控件证据已补充，06首页API/配置语义仍待方案确认。上述候选与已发布v0.3.2、M02构建身份分别记录。

2026-10-14：M02 手动内核候选产品变更已在隔离分支 `codex/m02-kernel-management` 按28文件提交为 `8d06f0b53280a86c3b74c94c452cb6469d428312`。仅支持用户手选固定四条目 ZIP；由 worker_threads 校验 schema/哈希/x64 PE32+/17个必需导出，存入 ETE profile 的不可变 SHA 目录；About 选择只影响下次应用启动。启动时冻结一次候选，只有候选启动前需预热；baseline启动保持lazy。候选失败确认退出后锁存baseline并至多回退一次；baseline失败停止重试。后续两项 test-only 断言适配单独提交为 `d894e4ea093af026f8e463aaeb12677f99dfd4cc`，不改变产品源码和runtime来源。

M02离线验证结果：16个定向测试文件164/164；完整公开门禁107文件、888/888；六项material-required测试82/82。独立Astra 90/90、后续父会话delta 13/13各自绑定不同源码/差异，不合并计数。source-bound runtime来自产品提交 `8d06f0b`，目录 `dist/EmbyTheaterEnhanced-m02-8d06f0b-20261014` 包含2153文件；build-manifest SHA-256 `b76274946b9012315eda1a5af181b59235c145c598f0130e51600200e0bad42f`，payload-set SHA-256 `5cf12c1679489cc5e4cc54af29c94e5779522619670fde7007238910747a98bd`。`package.ps1 -VerifyOnly`完整payload/provenance核对通过。产品runtime里的固定baseline DLL SHA-256为 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，Helper SHA-256为 `28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`；模拟及静态读取未加载或执行它们。

未执行安装器/系统安装、真实Helper或候选DLL加载、真实 profile、客户端前台、Emby播放/Session/远控或服务器访问；候选SOURCE/NOTICE仍是随包声明，许可与可发行性未评估。具体首次失败、test-only修订、隔离模拟及构建回执保存在仓库外M02_BUILD_RESULT中；未推送、创建PR或发布。

2026-10-14：用户选择停用旧 AppHost sleep/shutdown/restart 协议动作；父会话审查通过。前置30路径候选与L02 9路径变更分别本地提交为aab528b和69e8141。L02从 Web 能力广告/方法、main命令白名单与系统动作分派移除三条入口；未知动作仍回调完成，windowstate、exit、loaded、音视频通知与openurl保留。源 parser/main handler/AppHost VM测试22/22；从最终构建读取的 AppHost VM检查21项、真实 main dispatcher合成测试13/13通过。source-bound构建以产品 sourceCommit 69e8141完成，runtime位于dist/EmbyTheaterEnhanced-phase01-l02-20261014，build-manifest SHA-256 048eb6973d54de5d337f26e383ed1a556c1fcd707db1b53e07c632987b085580，列出2147个payload文件，payload-set SHA-256 41b786dc862cab51d4a385b862f2de612831afc5e696d608ae1d77fac585a852；package.ps1 -VerifyOnly通过。公共门禁在独立test-only HEAD cca8f52复跑通过：104发现文件中排除6项材料依赖，98项执行、819/819通过，JS259文件、PowerShell28文件、有限凭据扫描310文件和diff-check均通过；测试修订未改产品源码，runtime来源仍为69e8141。隐藏About DOM验收状态为NOT_VERIFIED：隔离Electron 44.4.2直接加载runtime About页面，show/focus/activate均为0；本地和父会话各一次最终诊断均在私有几何回执生成器引用未定义buildManifest变量时中止，因此没有800px/125%矩形及未ready/失败/缺字段的完整DOM回执，不能判为通过，也不能据此判定产品失败。所有owned Electron进程及子进程均退出。未启动生产客户端、访问真实profile/服务器、执行系统动作或生成安装器；没有推送、PR、合并、Tag或发布。

2026-10-14：M01 身份/配置候选已按父审核归一化补丁整合进同一隔离组合候选。补丁9路径（6产品、3测试），Native ready 状态/API/经握手校验的能力、包内与预期libmpv身份分层展示；实际加载映像SHA及render属性回读保持UNKNOWN。exclusiveAudio按页面大小写键优先、仅缺键回退旧小写键，显式false不被覆盖。M01相关Native/配置/About测试72/72通过；与批次01组合后的overlay/provenance/build-input、Next/Session等定向测试也通过。完整构建、真实Helper/DLL、MPV_HOME、真实播放/客户端仍未验收；原M01候选补丁和worktree保持未改。该记录形成时组合候选尚未提交；之后30路径父审候选已在隔离分支本地提交为aab528b。该阶段剩余的L02语义审核决定已由用户选择停用旧动作，具体实现见首条状态。

2026-10-14：批次01续办到候选复核停点。L01 CustomCssJS 错误隔离/重试缺口已修复：固定输入SHA-256 2177DE28DCC4E715F07C63329DC361C5B4DDD37EB7E59F273830B22ACEA37912，overlay输出SHA-256 B9F6268F3E3126426F189F38F1E57FF4CD03D8F9A213305157E1F6842F251103；AMD/VM合成行为16/16、固定material selftest、Web overlay准备4/4和build input consumer/tamper用例1/1通过。L03固定Host托管IL未发现两份BAT的直接引用，但动态/外部调用和手工依赖仍UNKNOWN；本轮不排除两份BAT，也不清理既有安装。L04退役全局Anime4K按键拦截，不再重命名全局mpv文件或隐式Stop；按键不重新分配。L05详情overlay移除旧外置按钮和timer，设置值保留，item VM4/4与Next/Session 76/76通过。AppHost/外链18/18、Pepper retirement 4/4、runtime provenance 2/2、build-input audit 20/20通过。唯一未决停点是L02旧sleep/shutdown/restart协议是否失效或改用主进程明确确认；当前仍未验证请求方/来源，未触发系统动作。未运行完整build、客户端、真实Emby、安装或BAT；没有提交、推送或发行。

2026-10-14：ROADMAP 批次01推进到 CustomCssJS 信任边界候选，基线为实时核对的 main e862288。固定源哈希 overlay 让服务器/本地 CSS 保持原选择行为，服务器 forced_on、已选择 JS 和旧本地配置留存但不再执行；出现活动脚本配置或无效 JS 配置时提示，坏 JS 配置不阻断 CSS。定向变换用例3/3、完整 Web overlay 准备4/4、AppHost 命令规范化5/5通过，git diff --check通过。尚未构建完整 runtime、启动客户端、连接真实 Emby 或验证发布包；现有 v0.3.2 Tag/附件、Stable/Latest 未改变。批次仍在进行：AppHost sleep/shutdown/restart 协议的主动操作与请求方合同待设计；两个旧 BAT 因 Carnival Host 精确依赖未知而未排除；Anime4K 快捷键的替代/按键传递语义未决定；外置播放器旧详情计时器行为和用户依赖未实测，均未修改。

2026-10-14：本次主线集成范围为已发布v0.3.2测试版的插件兼容源码、对应测试/构建合同与项目总排期。产品内容保持373209b的已发布身份，新增修改仅为文档；历史主要修复的集成核对未发现另一个明确的产品遗漏。Stable/Latest仍为v0.3.1，v0.3.2保持Pre-release，既有Tag、安装包及附件来源保持。集成通过PR和公开CI核对，不包含研究实验、重新打包或系统安装；实际合并记录见Git历史。

2026-10-14：主分支集成核对确认远端main仍为v0.3.1的`080d352`，34个既有PR均已合并。v0.3.2已发布测试版，但`codex/plugin-settings-compat`的17个提交尚未合入main；刚调整的总排期仍为本地文档修改。历史主要修复经祖先、等价补丁及内容核对已承接，未发现另一个明确遗漏的产品实现；研究探针和窗口激活实验保持候选，两个合成安装快照辅助文件是否保留待判断。本轮仅核对并记录，未合并、提交或推送。

2026-10-14：用户明确要求整个项目总排期，并不再为已发布界面版单列验收阶段。[项目总排期](ROADMAP.md)已汇总旧功能/信任边界、mpv身份配置/管理升级、字幕音轨延迟、Web渲染/浏览迁移、播放连接生命周期、显示硬件、可选系统集成及安装资源收口；主线先旧功能与mpv，再延迟修复和分批Web，来源/测试准备可并行。当前界面修复及v0.3.2发布移到已完成；未执行验证仍保留原状态，不阻塞为重复排期，也不改写为PASS。本轮只改总计划，未实施、提交/推送、服务器写入或新发布。

2026-10-14：[v0.3.2 插件兼容测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.2)已发布为非 Draft、Pre-release，Stable/Latest 保持 v0.3.1。产品 Tag 和安装包来源固定为 `373209b641e966eb0672e54ceb415080cb5f126d`；安装器 `EmbyTheaterEnhanced-0.3.2-373209b-win-x64-setup.exe` 的 SHA-256 为 `a4c83e3fae09f87da4a1090192096a6cd067cd515bda7e4819212294db05e872`，签名状态 NotSigned。最终本地完整门禁 923/923，公开 CI 788/788，发行 runtime 隐藏 DOM 104 项及连续三次实际隐藏 bootstrap 通过；2148 个解包文件完整匹配。五个附件已匿名下载核对字节、SHA-256、来源及校验/说明关系，原 Stable 的 Tag 与附件身份保持。收尾文档提交单独记录发布结果，不改变产品 Tag 或重标安装包来源。最终前台、Host/系统安装、真实业务命令、播放与远控仍未验收。

2026-10-14：插件兼容进入 v0.3.2 测试版收尾，版本、锁文件与发行说明已同步。修复基线为 8d19eb8；该修订的 114 次正式页面/模板/合成模态后台对照、98/98 定向测试和 104 项隐藏 DOM 证据已有来源回执，最终测试安装器从本轮版本化提交重新构建并独立校验。e248b59 的 504 次响应式工作对照与 873/873 回归保留原修订归属。最终前台仍为 NOT_CHECKED，分组说明和窄屏嵌套列表仍为 NOT_EXERCISED；真实保存/备份/恢复、播放/远控及安装未验收。测试版明确 Pre-release，Stable 与 Latest 仍为 v0.3.1。

2026-10-14：按钮视觉合同补齐。真实网页PageSave为全宽、主色、胶囊，旧适配统一raised导致约8%宽度的普通小按钮。现在保留block/btnSave及启用时button-submit，禁用时撤掉主色；DialogOk为主要确认、向导步骤为中性胶囊、取消为标题栏图标。传统Backup及其对话框的旧圆角也统一为胶囊，仅作用于维护标记页面/对话框。当前14个GenericUI页面正常/800px/125%共84次按钮对照、7个传统页面及2个模板18次对照、普通/全屏Dialog与两类Wizard12次合成对照有工作证据；保存及业务操作未执行。定向98/98与隐藏104项通过，准确正式产物复验见私有交付回执，前台待确认。

2026-10-14：e248b59私有客户端再次收到启动失败。现场仍仅多出Electron二进制目录下debug.log，全部manifest文件及哈希保持；日志环境绑定并未覆盖早期诊断输出。此次私有verifier明确将这一条物理普通日志路径视为运行输出，其他文件集合、程序字节与来源校验不变，链接日志仍拒绝；没有修改产品payload或重建。该日志存在时校验、隐藏产品启动及连续启动前检查通过，额外程序、payload字节变化、日志链接的拒绝边界有独立测试。准确重复启动回执在私有修复记录，前台仍待确认。

2026-10-14：响应式集中检查确认3类共用缺陷：页签换行时缺少withTabs正文占位、长Dialog/Wizard无有效滚动区、传统插件表格在窄内容区撑出页面。已补原生布局标记及离页清理、分离对话框滚动内容与命令区、为传统表格提供组件内横向滚动，并在传统页面加载前引入维护样式。当前6个插件共21页、12组宽度/缩放组合的504次工作对照通过；30字段长对话框的小窗/全屏合成对照通过。公开873/873、材料48/48、定向50/50及隐藏101项通过。分组说明和嵌套列表两项样式候选在现有真实页面未触发，不能记为已验证一致；主题/字体与插件自带结构保留。来源绑定复验和前台验收以本轮交付为准，详见显示审计。

2026-10-14：仪表盘底部PageBack显示与网页不符，真实对照为网页0个、旧适配1个。普通页面不再将该内部导航命令呈现为底部按钮，保留顶栏返回及Dialog/Wizard返回；模态缺省返回名称走原Back翻译。动作失败使用独立提示，页面读取失败仍保留原提示。真实后台顶栏点击已返回设置页且无错误，命令请求及非读取HTTP为0，因此私有入口不需放宽命令限制。定向29/29与隐藏100项通过，准确产物及前台效果以本轮交付为准。

2026-10-14：真实仪表盘刷新已复现页签丢失：首次UI/View有6项导航，同ViewId的非页面切换通知却有空TabPageInfos，旧适配将其全量重绘并清掉导航。现仅为此增量情况保留页面导航，显式页面切换仍可清空；离开GenericUI同步清理自身标题，避免Chapter API继承Madby的“运行状态”。工作实验连续4次真实刷新保持6个页签，定向28/28与隐藏合成100项通过。Chapter API自带传统HTML、4个英文页签与原生表单的结构差异在网页端也存在，保留插件设计；正式产物与前台结果以本轮交付为准。

2026-10-14：25bef64私有验收入口收到USER_REPORTED_START_FAIL。复现原因为Electron生成debug.log进入runtime目录，严格文件集合校验因此拒绝启动，正式payload无缺失或字节变化。仅修复私有启动/校验脚本，将Chromium日志在子进程创建前绑定到独立运行目录，并更新这两个脚本的bundle哈希；产品仍绑定25bef64。隐藏产品启动、连续两次启动前检查和强制日志定位验证通过，原额外日志保留为私有诊断，前台重新打开待用户确认。

2026-10-14：多选展开面板新增独立高度门禁。后台同窗口对照确认网页虚拟弹层上限为min(30em,70vh)，旧客户端仅按窗口剩余空间铺满；五项语言菜单在1280×900下由约630px收敛至394px，网页约395px（含边框）。仅为当前插件页的非全屏虚拟弹层补上相同上限，选择、滚动及命令链保持。隐藏合成100项和定向32项通过；正式来源绑定构建及尺寸复验以本轮回执为准，前台待确认。

2026-10-14：收到54ad2bd候选的多选文字垂直错位反馈。已复现空标题控件的固定占位行把选中值与箭头推到框外；插件选择控件改为共享实际输入框网格行，保留标签、说明、选择值及原事件链。隐藏合成96项与定向40项通过，真实14个单选/多选控件新增文字/箭头边界及说明重叠检查；旧水平溢出检查不能替代该几何门禁。准确产物与各尺寸复验由本次交付回执提供，前台仍待确认。

2026-10-13：插件显示进入集中收口：神医6页、Madby8页、Backup及两个对话框模板完成后台对照，另外验证6个传统插件邻接页面。共用适配修正重复标题、状态图标/卡片、StandardIcon、开关、分组/条件/只读/隐藏、列表归属及关闭组件。公开回归787/787、材料定向54/54、隐藏合成92项和动态来源专项通过；准确源码及正式构建结果以交付产物清单为准。产品仍为0.3.1，当前整体显示前台状态为 DISPLAY_PARITY_NOT_ACCEPTED。详见[显示审计](PLUGIN_DISPLAY_AUDIT.md)。

2026-10-13：用户确认ceba1fd的三个插件页面可打开，状态为PAGE_OPEN_PASS / TAB_UX_NOT_ACCEPTED。上一轮额外页签检查直接调用路由，只证明读取/渲染，未覆盖点击。此次复用原生居中页签管理器与胶囊选中态，补齐Caption与应用页头同步；真实后台工作实验通过神医5个、Madby7个额外页签的按钮点击及返回，共24次点击/路由/页面读取，每步标题、当前PageId、选中态及单页可见一致，普通设置清理旧页签。准确提交、来源绑定构建、回归及后台回执由独立验收包固定。产品版本保持0.3.1；新修订前台视觉待用户验收，Host、安装、真实播放及业务命令未验收。详见 [兼容合同](PLUGIN_SETTINGS_COMPATIBILITY.md)。

2026-10-12：当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)，Windows x64。准确发行源码、安装器 SHA-256 和来源记录见 Release；同名 Tag 固定最终 main 源码。

已提供原生 libmpv 播放、STRM/CD2 与挂载回退、智能路径映射、诊断导出及设置页维护功能。v0.3.0 增加中英文安装器，并修复 Together 同步切集的透明屏及媒体替换状态清理。

用户已反馈 Together 使用、覆盖升级和升级后启动正常，安装器语言及目录页已有反馈；这些反馈不覆盖全部硬件、媒体和系统安装组合。全屏合成采样未得出确定结论；卸载/重装、配置与 DeviceId 逐项比对、静默安装、普通用户/UAC 等仍缺完整实测。详见 [已知问题](KNOWN_ISSUES.md)。

公开文档整理通过 PR #32 合并，CD2 新资源刷新通过 PR #33 合并至 main 2479d02，对应公开 CI 成功。v0.3.1 在该已验收实现上同步产品版本和发行文档；固定依赖、工具链及播放架构保持。

[用户指南](USER_GUIDE.md) · [贡献](CONTRIBUTING.md) · [许可及材料风险](LICENSING.md) · [公开资料整理范围](PUBLIC_DOCUMENTATION.md)

## CD2 新资源刷新

仅目标 FindFileByPath 确认 NOT_FOUND 后有限刷新父目录，完整消费流后最多重查一次。正常 1200ms、恢复总上限 3000ms、3层父目录、单锁与30秒冷却保持。Stop/Next/close 取消和 CD2 → Mount → Native 回退保持，播放会话及 DirectUrl header 合同不变。

反向 custom 顺序的单次重查回归保留。六项真实 CD2 验收结果为 USER_REPORTED_PASS，不改写为独立机器实测。设计见 [刷新合同](CD2_NEW_RESOURCE_REFRESH.md)，验证方法见 [隔离验收](CD2_REAL_ACCEPTANCE.md)。新版本安装器从最终 main 单独构建并核对版本、完整 payload 与来源，既有用户反馈不替代新产物身份校验或完整系统安装验收。
# Web输入独立化候选

独立Web组件固定720份历史基底和两份既有用户Web补丁，生产路径与来源记录改读组件清单。旧www及旧补丁对应两份Web文件不再是生产材料门禁的必需输入。现有overlay和PlaybackManager变换保持；材料正文仅本地保存且Git忽略，来源/公开分发待核对。当前候选验证结果见交付记录，不代表完成全部旧包移除、上游源码重建或Windows播放验收。合同见[固定Web输入](WEB_SNAPSHOT_INPUT.md)。
## 固定Host输入候选

14份与现状同字节的Host/辅助二进制改由官方Windows 3.0.20 ZIP白名单准备；Model、UI、Native与依赖版本不变。旧目录必需非Web文件由248降到234，旧补丁仍49份。正文被Git忽略，构建/来源记录绑定独立组件清单；静态组装、单元和完整运行验收分开记录。合同见[固定Host输入](WINDOWS_HOST_INPUT.md)。


Current local material stage: four small packaged inputs (5,216 bytes) are independently snapshotted, reducing old Carnival requirements 5 -> 1 (unchanged Model), patch remains 0. Configuration including auto-update stays byte-identical. No product/version change or public body upload. Full-package acceptance must first coordinate the separate 0.3.15 exit fix. See [contract](SMALL_RUNTIME_INPUT.md); static/unit evidence is kept separately from runtime acceptance.

User feedback 2026-10-21: audio-track/subtitle switching latency is provisionally closed after a long period without recurrence. This is a user-reported acceptance status, not proof of permanent technical elimination; no dedicated product change is included here.


Zero-old-input stage: the original 424,960-byte Model DLL is independently snapshotted without official replacement. Carnival requirements 1 -> 0; patch remains 0. Normal preparation has no old-installer extraction and can restore independent Web/Model snapshots explicitly. Model, UI, config/auto-update and versions stay unchanged. Source bodies remain local/ignored. Subsequent integration must retain main 0.3.15 exit fix and use matching 0.3.15 source for comparisons; no app run is included in this stage.


2026-10-21 local integration: the independent-component material work is combined with main e150981d (product 0.3.15), retaining the published exit fix and its regressions. Normal old Carnival/patch requirements are zero; original Model/config/UI/dependency identities are preserved. Prior material-stage baseline and release entries below remain historical records. Current full regression, matching-0.3.15 material comparison and any build/package results are separate evidence; no app launch, new release, push or remote-main merge is included.

## 2026-10-21 - Pinned libmpv recovery and repository snapshots

Current libmpv is recovered from the fixed SourceForge asset using standard HTTPS redirects, exact archive magic/size/SHA256 and exact extracted DLL identity. Work cold recovery with no old package or snapshot DLL succeeded; Linux/cloud execution is not yet verified. DLL/version/API/Model/UI bytes are unchanged. Four required snapshot roots are now selected for user-authorized same-repository storage (775 files, 51,953,202 bytes) with byte-preserving Git attributes; libmpv and generated/cache/toolchain inputs stay ignored. Third-party source uncertainties remain explicitly recorded. No main merge or release is authorized by this change.

## 2026-10-21 - Public CI path and snapshot-format regression

GitHub Windows public CI exposed one preload fixture using a nonphysical TEMP alias. The fixture now canonicalizes its root, with a junction regression proving redirected product callers remain rejected; production validators are unchanged. Snapshot bytes must remain exact, including existing CRLF/trailing formatting: narrow per-file attributes describe inherited formatting, while a new CI step strictly validates all four snapshot trees against their manifests before tests/lint. Maintained source whitespace rules and all content/path/hash gates remain intact. No runtime, Model, playback or dependency-version change.


2026-10-23 candidate: manual Windows packaging has a source-built Host recovery/compile/verification entry point, with pinned 55-file source and NuGet acquisition and generated per-run evidence. GitHub execution remains unverified. Work's validated builder argument delta has been synchronized exactly; a portable runner-side Host verification harness is still required; the missing harness fails closed before compilation/packaging. No external Work binary/verification receipt is imported by this path.

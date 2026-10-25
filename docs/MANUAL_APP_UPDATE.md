# ETE 手动软件更新

检查、通道、说明链接和校验下载已随 v0.4.2／v0.4.3 整合。本次下载／安装流程优化独立位于 `feature/managed-app-update-install`，直接基于 main `8745493d92fb4348d5af2d86d13797f0a8760e81`；没有重新合入旧更新分支，没有修改已发布版本或 Release。以下新交接合同尚需 Windows 实机验收；已发布包的旧流程见用户指南。

## 现有入口与最小行为

原 About 的维护区已经有手动检查、GitHub / Releases 外链和检查结果；原 `maintenance.js` 请求固定仓库的 Latest API、比较版本，但未再次核对 draft/prerelease，也没有下载、说明正文或取消。设置导航仍沿现有 About 路由。服务端 API 中的系统更新接口属于 Emby 服务器，与本功能无关。

现在仅用户点击“检查更新”请求官方元数据，原位显示当前版本、正式渠道版本和可展开的说明；不弹通知、不在进入页面或启动时检查。说明默认作为文本，有限识别 HTTP/HTTPS 链接，不执行 HTML、脚本或图片。当前版本高于正式渠道时明确显示“高于正式渠道”，不误称最新或提供降级下载。

发现所选通道更高版本且安装附件身份可用后才启用“下载更新”。点击后重新向官方确认准确 Tag 的附件身份，自动使用当前用户 ETE profile 的专用 `updates` 缓存（默认 `%APPDATA%\EmbyTheaterEnhanced\updates`），不打开保存路径对话框，不增加目录设置。主界面没有下载源菜单或自定义地址。校验完整后准备独立交接，正常退出客户端后打开安装向导；不静默安装、不自动完成向导、不增加播放确认。进度、取消和实际来源详情保持。

“取消检查”仅在检查进行中显示，“取消下载”覆盖官方重核验、传输、缓存复核和交接提交前的准备。点击后禁用以去重，等待原操作收尾；闲置、完成、错误及页面退休时隐藏。交接确认后隐藏取消并锁定更新动作，沿原正常退出收尾。离页取消尚未提交的操作，移除进度监听并退休迟到回复。原说明展开、主题、键盘及安全链接行为保持。

说明中的 `[文字](http/https地址)` 显示简短可点击文字；裸 HTTP/HTTPS 链接也可点击，过长地址显示主机加省略号，完整目标保留在悬停提示及无障碍名称中。其余 Markdown（含标题）、HTML、图片语法均保持文本，不加入完整 Markdown 引擎、图片请求或网页预览。渲染仅创建文本节点及固定属性的 `a` 元素，不使用 `innerHTML`；main 与 renderer 共用同一受限解析器。正文上限仍为65536字符，URL最多2048字符，拒绝非法地址、控制／空白／反斜线、嵌入凭据和非HTTP(S)协议。

正文链接仅用户点击或Enter激活，经单独 IPC 请求系统浏览器；中键／Ctrl点击同样拦截客户端默认导航。main 校验当前打包主frame、完整单字段参数，并要求地址属于本次官方检查正文识别出的集合；新检查及关闭退休旧集合。原固定仓库发布页 IPC 白名单保持。文档、compare及安装附件URL均可作为正文链接在系统浏览器打开；浏览器下载不计入应用“校验完成”状态，不在客户端启动安装。打开失败只在说明下原位反馈，离页后的迟到结果不改写页面。

## 更新通道

原生 EmbySelect 提供“正式通道”和“测试通道”，默认正式。选择保存在 ETE profile 的 config/app-update.json（schemaVersion=1，channel=stable/testing）；进入页面只读取本地选择和未完成安装提示，不发起版本请求。选择变更仍原子保存；写入失败保留旧文件及原通道，未知配置格式／重定向路径拒绝。查询候选不持久化；专用更新缓存另外记录附件身份、所属文件 ID 和安装意图，不存凭据。

检查期间切换通道会先退休页面代次，main 中止并等待旧检查收尾，清空旧候选及说明链接集合，再保存新选择；保存成功也须再次主动点击检查。下载／交接期间禁用选择器，main 同样拒绝切换；取消并收尾后才能更改。页面重入等待进行中的通道保存完成再读取，不让迟到查询／保存回复改写新状态。

## 正式渠道与五附件

- 仓库固定 `hope140/EmbyTheaterEnhanced`，检查固定 `/releases/latest`，并要求 `draft=false`、`prerelease=false`、Tag 为无 prerelease 的合法 SemVer。Latest 是维护者指定的正式渠道，不扫描所有 Tag 来猜最高版本。
- 测试通道只读同仓库 `/releases?per_page=5&page=N`，包含非draft的正式版及prerelease；要求明确布尔标志、合法SemVer及准确仓库Tag页面，按SemVer选最高，等优先级时优先非prerelease。分页必须完整结束，最多100页／500条，达到上限或任一页失败不宣称“最新”；整次用户检查30秒预算，每页仍受原8秒／256KiB限制。页面顺序、发布时间和字符串字典序不作版本顺序。
- 采用 SemVer 2.0.0 顺序：核心十进制和数值 prerelease 均无浮点精度损失；禁止数值标识前导零；正式版高于同核心 prerelease；build metadata 不参与比较。项目允许 Tag 的小写 `v` 前缀。
- 与当前版本相同（含build metadata差异）不提供更新，切回正式通道若版本更低只提示高于该通道，不提供降级；同版本由测试版标志转正式也不触发重装。下载前若发布标志或附件身份已变，要求重新检查。
- 下载只接受准确SemVer（含测试通道的prerelease后缀）对应的 Windows x64 标准安装器名 `EmbyTheaterEnhanced-<version>-win-x64-setup.exe`。历史带提交号名称、缺附件、重名、未上传完成、大小不合法或无官方 `sha256:` digest 均禁用应用内下载，可查看发布页。合法但采用其它命名合同的 Tag 不猜测附件路径。
- 沿用现有安装器、`.provenance.json`、`.sha256`、`RELEASE_NOTES.md`、`SHA256SUMS.txt` 五附件，不要求新建 updater manifest、签名服务或自动更新框架。说明展示官方网页 `body`；原始 notes 附件可以与维护后的网页正文不同，见[发行规范](RELEASE_CONVENTIONS.md)。
- 下载校验基准来自官方 HTTPS Release API 的具体安装附件 ID、名称、URL、精确 size 和 SHA-256 digest。下载前按已检查 Tag 再取一次；身份变化要求重新点击检查，不偷偷换成新附件。官方不可达时明确“无法独立验证”，不从代理取 checksum 来冒充独立信任，也不允许无校验下载。
- API digest 表示下载字节与当次官方发布身份一致，不等于数字签名、不可变 Tag、已验证构建源码或许可认证。

规则依据：[SemVer](https://semver.org/)、[GitHub Latest Release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)、[GitHub Release assets](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)。

## 备用源候选与证据

用户已确认交互策略为“官方优先、连接失败后顺序备用、详情显示实际来源”；具体公共服务列表和顺序仍应在功能集成前由维护者确认。此独立分支使用以下候选实现和验证可替换的内部 `SOURCES` 策略；不把候选列表视为稳定承诺。

| 顺序 | 候选 | 2026-10-23 查阅的第一方资料 | 证据边界 |
| --- | --- | --- | --- |
| 1 | GitHub 官方 | 固定仓库 Release API | 唯一版本与校验身份来源，默认首次下载来源 |
| 2 | `gh-proxy.com` | [第一方使用文档](https://gh-proxy.com/en/docs/github-accelerator/)、[隐私政策](https://gh-proxy.com/privacy)、[服务条款](https://gh-proxy.com/terms) | 可读文档明确给出公开 Release URL 前缀；服务自述不构成独立可靠性或隐私审计 |
| 未启用 | `ghfast.top` | [服务站](https://ghfast.top/)、[站点地址发布页](https://ghproxy.link/) | 搜索摘要曾列此地址，但本轮正文仅得到依赖 JavaScript 的页面壳，未充分复核当前服务说明与隐私边界，已从启用列表移除 |

未采用旧示例域名或第三方“可用大全”。没有提交账号、Token、Cookie、认证头或私人 URL；仅访问公开资料。没有实际下载软件或验证代理大文件性能，不能声称上述服务的长期稳定性已实测通过。源选择留在 main 模块，后续确认列表仅需改内部固定条目。

隐私边界：代理必然接收用户发起连接的网络信息以及公开仓库／Tag／文件名路径。`gh-proxy.com` 的隐私政策自述会记录有限技术日志，包括脱敏 IP、请求路径、UA、状态和时间；这里不把“无账号”解释为“无日志”。其使用文档提及 CDN 缓存，而隐私页称不落盘持久化，两者不是独立审计证据，不作无缓存或无留存保证。ETE 不发送来源页 Referer、Cookie、Authorization、用户 Token 或带认证 query 的 URL；固定代理请求只能是准确的公开资产包装 URL。只向官方 CDN 跟随合法 HTTPS 签名下载跳转，不把 CDN query 再包装给代理，不自动信任服务方宣称的其它节点域名。若后续可核验清单为空，`SOURCES` 仅留官方项，原顺序接口与失败停止规则仍成立。

只有 DNS、连接不可达、连接重置及连接超时可以前往下一个条目，各源至多一次、串行、重新从零开始，不并发、不断点续传。HTTP 403/429 等任何非 200、证书/TLS 失败、未知跳转、校验失败、文件系统错误与用户取消均停止，不通过换源绕过拒绝。元数据和校验身份永远不代理。

## 下载与生命周期合同

- 独立 HTTPS 客户端只发送固定 UA、Accept 和 identity encoding，保留默认 TLS 校验，不接收 renderer 的 URL、请求头、路径或 checksum。IPC 继续验证当前 main frame 与打包应用文档。
- 元数据总期限 8 秒、正文上限 256 KiB；安装器上限 512 MiB、下载总期限 10 分钟、每个连接空闲上限 15 秒。每次数据与最终提交还核对绝对 deadline。
- 最多 4 次重定向；只接受准确资产 URL、当前固定代理包装 URL，或官方 `release-assets.githubusercontent.com` / `objects.githubusercontent.com` HTTPS 资产主机。拒绝 HTTP 降级、用户信息、端口、fragment、未知主机；不跨元数据端点跟随跳转。来源详情记录发起此次完整下载的源，不记录带签名的 CDN 跳转 URL。
- 从官方精确长度约束流，逐块 SHA-256。临时文件在选定绝对物理目录中以随机 `.part`、独占创建；保存目录和临时文件的设备／文件身份采用 BigInt，在写 Internet zone 和最终提交前复核，避免64位文件ID被Number舍入合并。最终使用原子 no-replace hard link 提交，同名已存在或提交时竞争均不覆盖已有文件。finally 仅尝试删除身份仍相符的本次临时文件，不清扫其它文件；路径被交换时拒绝提交并保留不再能安全定位的文件，不猜新路径删除。目录不支持所需文件系统操作时失败，不降级为覆盖写入。这些检查不等于对同权限恶意进程的完整原子文件系统隔离。
- Windows 下载提交前写入并回读 `Zone.Identifier` 的 Internet Zone 3，保留固定公开来源；本机路径必须为磁盘路径，不接受 UNC 或重定向目录。ADS 不支持或被拒绝则不产出最终安装器。此步骤不关闭 Attachment Manager、SmartScreen 或浏览器警告；真实 Windows 文件系统与警告行为需单独验收。格式依据：[Microsoft Zone.Identifier](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/6e3f7352-d11c-4d76-8c39-2516a9df36e8)。
- main 只持有一个检查/下载操作；重复请求返回 busy，不排队创建额外下载。取消中断网络，页面暂停退休代次、移除进度监听，迟到结果不得修改新页面。应用退出中断并等待未提交的网络／文件／交接进程；已提交的交接等客户端退出后打开向导。
- maintenance 的读取／复制／检查／下载／取消 IPC 均拒绝附加 payload；外链 IPC 只接受单字段字符串 `{url}`，安全出口仅为固定仓库的 releases 根页、latest 或合法版本 Tag 页面，不允许资产执行路径、认证信息、query 或 fragment。页面直接 destroy 即使未经 pause，也会取消更新并移除进度监听。
- 不增加后台版本检查、自动下载、TTL、静默安装或内核管理。启动时只做本地已安装版本与缓存记录对账；网络仍只能由用户点击触发。

## 专用缓存与安装交接候选

每个附件使用随机 `update-<32hex>` 子目录，保存有限 schema 的 receipt、已创建临时文件的设备／文件 ID、附件官方身份、SHA／长度和目标版本。renderer 不能传路径、执行参数或摘要。磁盘预算先检查可用空间，实际 ENOSPC／配额／权限错误仍停止且保留旧好包；本地缓存不可用不会阻断只读版本检查和通道读取。网络失败／取消收尾原有 `.part`，空的受管尝试可复用；已完成好包重试前重新读取官方 Tag，再复核文件身份与完整 SHA，避免重复下载。新版本使用独立目录，成功启动新版本之前不替换／删除旧好包。

最终交接使用系统 Windows PowerShell 5.1 的固定源码命令及包内 C# 文件守卫，不依赖已退役 Host 更新逻辑，不保持安装目录中的可执行映像或脚本文件句柄。Windows实测发现 `detached:true` 会让该系统PowerShell返回0却不执行脚本；故使用普通隐藏启动的受管relay，.NET创建独立守卫。保留libuv原有作业归属，不修改job限制或申请breakaway／提权。relay持有守卫实际进程句柄，取消须终止并确认所属守卫退出；提交收到守卫确认后才放行其等待客户端退出。

源码来自本包，通过随机本机named pipe传递；256位一次性令牌认证成功前不发送源码或附件身份，拒绝未知协议帧，设备路径／摘要只由main生成。数据用ASCII JSON（Unicode路径转义），没有renderer命令输入或外部网络能力。只用系统PowerShell支持的编码bootstrap承载固定源码，不改变策略或语言模式。环境只保留Windows／用户目录所需字段，不继承Token／代理／Node注入环境；外部job或系统策略阻止时失败关闭。清理必须同时有显式完成标记和所属进程退出，不能仅凭退出码0宣称成功。

守卫逐级打开目录，拒绝 reparse point，禁止目录写入／重命名／删除；按卷序号和 64 位文件 ID 核对专用根和尝试目录。安装包只共享读取，拒绝多硬链接、写入和替换，**在持有同一文件句柄时**核对长度与官方 SHA；另锁定并回读原 Zone 3。只在准备成功并完成私有提交握手后才安排 `app.quit()`；保留现有 before-quit 资源 drain。交接捕获实际 Electron 进程及同安装目录 Host 的进程句柄，确认它们真实退出后才 `UseShellExecute=true`、无参数打开向导，保留 UAC／系统安全检查。准备限30秒、提交握手限5秒；正常退出若120秒仍受阻则交接放弃，不强杀客户端，也不等某次不相关的未来退出。准备取消须等所属子进程实际退出；提交后取消入口锁定。向导退出之前保持安装文件锁。

向导取消、UAC拒绝或执行失败不会被记为安装成功。重新启动旧版时显示未完成更新提示；再点击检查／下载，官方身份仍一致才复用已校验包。新进程从实际运行包的 `app.getVersion()` 读取版本，只有同一 executable 位置、有效 SemVer 且版本达到／超过记录目标，才清理相应受管记录。**这表示该位置启动了目标或更新版本，不表示安装器返回成功、不表示 Authenticode 签名验证**。向导自行选择另一安装目录时，旧位置不会据此确认完成。

清理经 Windows 句柄执行：只接受已记录的固定安装包名、受管 `.part` 和 receipt，检查卷／文件 ID／单硬链接，完整文件及 receipt 另核长度／SHA，通过 handle disposition 删除同一对象；只删空的受管尝试目录，不递归删除。路径交换、未知文件、损坏 receipt 或忙碌安装包均保留，不把 Downloads 文件纳入扫描。若安装器结束前启动了新版导致文件仍忙，本次保留，下次启动再核验。崩溃恰在创建文件与落账之间可能留下无法证明归属的文件；保守保留，不猜测清扫。该合同不声称能防御已控制同一用户进程／安装源码／全部收据的攻击者。

API依据：[Windows文件共享与reparse规则](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea)、[按句柄删除](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle)、[系统Shell执行](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.useshellexecute?view=netframework-4.8.1)、[Electron正常退出](https://www.electronjs.org/docs/latest/api/app#appquit)、[libuv Windows卷／文件ID映射](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c)。

## 验证与待验收

仓库离线回归：

```sh
node --test tests/app-update-preferences.test.cjs tests/release-note-links.test.cjs tests/manual-app-update*.test.cjs tests/update-install*.test.cjs
```

受控网络、合成非可执行文本、临时文件和模拟进程分别验证通道／官方重核验／代理、目录归属、重复点击、取消收尾、磁盘和执行失败、旧包保留、目标版本确认及篡改拒绝。`update-install-windows.test.cjs` 仅在 Windows 调用实际系统 PowerShell 5.1／C#／文件句柄，验证 Unicode 路径、锁、摘要／卷／文件 ID／Zone／硬链接拒绝、取消和按句柄清理；**不提交交接、不运行安装包或退出客户端**。Linux 明确跳过这些 Windows 原生用例，只编译 C#、解析 PowerShell 并测试受控状态机。

`update-install-exit-order.test.cjs` 另外执行真实交接 PowerShell 脚本，但明确替换为只能写合成标记的 C# 测试守卫，等待自己创建的不可见 Node 进程退出，验证先 Electron／再同目录 Host 的顺序。Windows 同时断言非零退出绝不写标记；Unix 的 .NET 无法取得非子进程退出码，两个非零断言仅在 Windows 运行，不以 Unix 观测到的零冒充通过。该测试没有 ShellExecute、真实安装器或客户端进程。

## 独立测试包与实机交接

### 独立云 Windows 短验证

`managed-update-validation.yml` 仅对本功能分支的普通 push／PR 执行独立 `windows-2022` job，不依赖手动 dispatch，不占用正式打包 job。checkout 精确 head SHA、固定 Node24.18.1、只读 token 且不保留 Git 凭据，无 npm 安装、发布或产品安装步骤。原 `public-ci.yml` 保持基线字节不变。

入口为 `node tools/verify-managed-update-windows.cjs --expected-source <精确40位SHA>`；只允许当前仓库的 GitHub 托管 Windows，拒绝本地／Work／self-hosted、错误源码 SHA 或未知参数。选择更新相关测试，要求完整且唯一的 TAP 汇总、零失败／取消／跳过，并保存绑定 sourceCommit 的 `receipt.json`、TAP及受限 stderr。结果上传独立、一天保留期的 artifact，不扩大 Release 五附件。

真实 NTFS／Windows PowerShell5.1 用例覆盖目录和文件替换拒绝、卷／64位文件 ID、摘要／Zone／硬链接拒绝、取消后保留并复用好包、旧版启动保留，以及目标版确认后按句柄清理。

显式短 job 另启用 `update-install-controlled-wizard.test.cjs`：在一次性临时目录用系统已有 C# 编译器生成**只写标记和等待结束信号的 asInvoker 假安装器**。合成客户端通过真实缓存和交接源码提交后自然退出；真实 C# 守卫保持 Zone3和文件锁，真实 ShellExecute 无参数启动这个受控程序。断言客户端已退出、启动参数为空，捕获所属交接进程句柄并等其退出后，分别验证旧版保留和合成目标版本清理。官方发布元数据和安装后版本在此明确使用合成夹具；它不证明真实产品安装或 UAC。

不移除 Zone、不改变安全策略、不接受 UAC或点击安全警告。若系统拒绝／安全界面阻挡受控程序，门禁失败并保存现场，等待另行安排有交互的隔离验收，不换路规避。所有生成文件及进程归当前 CI VM，实际客户端／用户 profile／Downloads和已发布附件均不访问；真实 UAC与产品安装继续单独验收。

新增 JS／PowerShell／C# 都在 `src/electronapp` 既有 Git blob／provenance 范围内，不修改 vendor、Host、安装器或发布附件数量。没有产品 mock URL／忽略 TLS／绕过校验开关。独立分支准确提交可由协调者使用既有 workflow_dispatch、`release_package=false` 构建独立测试 artifact；本次不自行 dispatch、安装、退出 Work 当前进程或发布。

包内无参数离线入口仍为：

```powershell
node .\electronapp\enhanced\manual-app-update-selftest.js
```

入口执行9项合成检查，绑定12份更新模块（含缓存、交接源码、relay和守卫）与包内 build-manifest，零真实网络、真实 profile、GUI 或安装执行。新增一项验证专用临时缓存复用与替换拒绝，不启动交接进程。`ci-windows-test-package.ps1` 在安装器编译前要求9项成功、sourceCommit一致及原零副作用条件；回执仍 `manual-app-update-selftest.json`，不扩大发布五附件。包内 manifest 绑定不等于独立签名。

打包接线可复验：

```sh
node --test tests/manual-app-update-package.test.cjs tests/manual-app-update-package-gate.test.cjs
```

后者从当前 HEAD Git blobs 物化合成源码投影，使用 PowerShell AST 执行原门禁及回执条件；源码须已提交。它不构建真实 Windows 安装器。

实机最短清单（另行安排隔离 Windows 测试账户／VM）：

1. 核对准确分支 SHA／artifact／provenance；不要覆盖正式客户端。profile 使用 `appData`，仅传 Electron `--user-data-dir` 不足以隔离。使用单独 Windows 用户或现有经过来源校验的隔离启动入口，不修改 Work 现用配置。
2. 进入 About 不联网；正式／测试通道、说明链接、取消和来源详情保持。测试包版本仍为基线0.4.3，不伪造更高公开版本或降低版本比较。完整真实下载／安装须有官方较高目标；缺少目标时明确无法完成端到端验收，不改生产URL或校验开关。
3. 有合法更高目标后，点击下载不弹路径；验证进度／取消／断网／空间不足／快速重复点击。官方无法独立确认时停止。完成后应先正常退出 Electron 与同目录 Host，再出现可见安装向导，保留 UAC／SmartScreen，不静默安装。
4. 取消向导或UAC、启动失败后重开旧版，检查更新再点下载应复核官方身份并复用好包；新版本另有缓存目录，不覆盖旧包。确认旧版启动不会清包。
5. 在同位置完成安装并启动目标／更新版本后，仅对应受管文件清除；Downloads 中手动下载的同名文件保持。另选安装目录、仍忙碌的向导、改动的文件／receipt、未知文件都保留，不能误报清理成功。

真实 Windows 安装／UAC／SmartScreen、完整客户端退出与 Host 实际退出顺序、代理大文件与长期稳定性仍需独立证据；受控自测不能替代这些结论。

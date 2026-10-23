# ETE 手动软件更新候选

本功能属于正式版之后的独立候选，基于 `6858c71103605ff66c630f1cd7e1e9fdbdeab000`，分支 `feature/manual-app-update`。真实 v0.4.0 发布提交确定后再正常重基；不改变当前产品版本、Host 退役合同或发布流程。

## 现有入口与最小行为

原 About 的维护区已经有手动检查、GitHub / Releases 外链和检查结果；原 `maintenance.js` 请求固定仓库的 Latest API、比较版本，但未再次核对 draft/prerelease，也没有下载、说明正文或取消。设置导航仍沿现有 About 路由。服务端 API 中的系统更新接口属于 Emby 服务器，与本功能无关。

现在仅用户点击“检查更新”请求官方元数据，原位显示当前版本、正式渠道版本和可展开的说明；不弹通知、不在进入页面或启动时检查。说明以纯文本展示，不执行 HTML/Markdown、图片或链接。当前版本高于正式渠道时明确显示“高于正式渠道”，不误称最新或提供降级下载。

发现更高正式版且安装附件身份可用后才启用“下载更新”。点击后重新向官方确认准确 Tag 的附件身份，再由 main 打开目录选择器。主界面没有下载源菜单或自定义地址。进度和取消属于这次点击启动的操作；实际来源、文件名、保存目录和 SHA-256 在下载详情中展示。下载完成只给出正常退出客户端、用户自行运行安装器的说明；没有执行、提权、重启、替换安装、管理员持久设置或凭据操作。

## 正式渠道与五附件

- 仓库固定 `hope140/EmbyTheaterEnhanced`，检查固定 `/releases/latest`，并要求 `draft=false`、`prerelease=false`、Tag 为无 prerelease 的合法 SemVer。Latest 是维护者指定的正式渠道，不扫描所有 Tag 来猜最高版本。
- 采用 SemVer 2.0.0 顺序：核心十进制和数值 prerelease 均无浮点精度损失；禁止数值标识前导零；正式版高于同核心 prerelease；build metadata 不参与比较。项目允许 Tag 的小写 `v` 前缀。
- 下载目前只接受三段稳定版本的 Windows x64 标准安装器名 `EmbyTheaterEnhanced-<version>-win-x64-setup.exe`。历史带提交号名称、缺附件、重名、未上传完成、大小不合法或无官方 `sha256:` digest 均禁用应用内下载，可查看官方发布页。合法但采用其它命名合同的 Tag 不猜测附件路径。
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
- 从官方精确长度约束流，逐块 SHA-256。临时文件在选定绝对物理目录中以随机 `.part`、独占创建；保存目录和临时文件的设备／文件身份，在写 Internet zone 和最终提交前复核。最终使用原子 no-replace hard link 提交，同名已存在或提交时竞争均不覆盖已有文件。finally 仅尝试删除身份仍相符的本次临时文件，不清扫其它文件；路径被交换时拒绝提交并保留不再能安全定位的文件，不猜新路径删除。目录不支持所需文件系统操作时失败，不降级为覆盖写入。这些检查不等于对同权限恶意进程的完整原子文件系统隔离。
- Windows 下载提交前写入并回读 `Zone.Identifier` 的 Internet Zone 3，保留固定公开来源；本机路径必须为磁盘路径，不接受 UNC 或重定向目录。ADS 不支持或被拒绝则不产出最终安装器。此步骤不关闭 Attachment Manager、SmartScreen 或浏览器警告；真实 Windows 文件系统与警告行为需单独验收。格式依据：[Microsoft Zone.Identifier](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/6e3f7352-d11c-4d76-8c39-2516a9df36e8)。
- main 只持有一个检查/下载操作；重复请求返回 busy，不排队创建额外下载。取消中断网络，页面暂停退休代次、移除进度监听，迟到结果不得修改新页面。应用退出中断并等待所属网络/文件操作；原生目录对话框不能程序关闭，但退出不等待其 UI Promise，迟到选择不能重新下载。
- maintenance 的读取／复制／检查／下载／取消 IPC 均拒绝附加 payload；外链 IPC 只接受单字段字符串 `{url}`，安全出口仅为固定仓库的 releases 根页、latest 或合法版本 Tag 页面，不允许资产执行路径、认证信息、query 或 fragment。页面直接 destroy 即使未经 pause，也会取消更新并移除进度监听。
- 不持久化更新偏好，不增加后台定时器、自动检查/下载、TTL、安装调度或内核管理功能。操作期限和进度节流仅属于用户点击后的请求。

## 验证与待验收

`node --test tests/manual-app-update*.test.cjs tests/settings-visual-system.test.cjs tests/settings-night-audit.test.cjs` 使用注入的受控 HTTPS 响应、合成非可执行文本、临时文件和 AMD 控制器模拟，覆盖 SemVer、稳定渠道、官方重核验、错误大小/哈希、危险重定向、证书失败、HTTP 拒绝不回退、串行备用、进度取消、同名保护、退出与迟到回复、纯文本 notes 和无自动安装。Windows 条件分支会在 Windows 测试中回读最终文件的 Internet-zone ADS；Linux 结果不替代该分支。

真实在线证据、Windows 整包构建、GUI、系统安装、代理大文件与长期稳定性分别记录。单元测试成功不代表这些范围已通过。待完成：候选代理名单最终确认、Windows ADS/no-replace/目录对话框及实际 Electron UI 验证；不访问真实 NAS 或正式安装目录。

## 独立测试包交接

产品接线为 About → maintenance IPC → 固定官方元数据/独立下载模块；`main.js` 已传入 Electron 目录选择器，新增维护模块由既有 `src/electronapp` Git blob 复制与 provenance 范围自动纳入，不需改 vendor 或扩大发布附件。没有产品环境的 mock URL/跳过 TLS/跳过校验开关；网络和 UI 的注入只存在于 Node 测试调用参数中，renderer 无权提供。

协调者在独立分支准确提交上使用现有 `.github/workflows/public-ci.yml` 的 `workflow_dispatch`，**`release_package=false`**。原工作流会用 `github.sha` 精确 checkout、独立编译/验证 Host、全回归，再构建测试名安装器并只上传 artifact；不运行安装器、不发布 Release。runtime、安装器和 artifact 名含 sourceCommit/run/attempt，保留原不可覆盖门禁。无需修改工作流或版本号。

包内离线入口为 `electronapp/enhanced/manual-app-update-selftest.js`，不由 main／preload／renderer 导入，不接收任何参数，不提供 mock URL、凭据或安全绕过开关。使用已有、获准的 Node 可运行：

```powershell
node .\electronapp\enhanced\manual-app-update-selftest.js
```

此入口只加载包内更新模块、生成不可执行的合成文本、在新建临时目录验证下载写入／校验／同名保护／取消／清理及匿名顺序源／IPC 拒绝，8项检查结束删除所属临时目录；真实网络请求为零，无应用 bootstrap、profile、Host、Electron GUI 或安装器执行。在 Windows 会实际写／回读该合成文件的 Zone 3。输出 `packageManifestBinding` 核对5份实际模块与本包 build-manifest，并记录 sourceCommit；这是包内字节绑定，不是独立签名。仓库直接运行缺 manifest 时明确 `not-present / UNKNOWN`。

本分支的 `ci-windows-test-package.ps1` 已在完整runtime验证后、安装器编译前，用现有锁定 Node 自动调用此包内入口，要求 sourceCommit匹配、8项成功、零网络／profile／安装执行及临时文件清理；失败不继续打包。结果存为测试 artifact 的 `manual-app-update-selftest.json`，不增加用户 Release 的五附件合同。此接线尚待集中安排的真实Windows构建执行；Linux源文件或合成manifest试验不冒充已打出的Windows包。

最短人工范围（隔离 Windows 测试账户或 VM）：

1. 核对 artifact/sourceCommit/provenance；先只解包核对，不安装到正式客户端目录。现有 profile 基于 `appData`，不能仅凭 Electron `--user-data-dir` 宣称已隔离真实配置。
2. About 进入不检查；点击检查后仅原位显示官方正式版与纯文本说明；当前测试版本高于 Latest 时显示高于正式渠道，不启用降级下载；取消/返回无迟到改写。
3. 真实更高稳定版可用时另行授权下载验收，确认目录选择、进度、取消、来源详情、同名不覆盖、官方 digest 一致和 Zone 3；不得把 mock 的下载通过写成这项已完成。安装始终由用户自行运行，本候选不执行。

本分支不触发工作流或发布操作；由协调者在正式版任务优先和最终发布点明确后安排测试包及重基。

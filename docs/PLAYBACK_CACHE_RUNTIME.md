# 隔离启动的完整文件缓存试验

当前独立分支已正常重基到正式主线 `88578c91ab19d44eecddcfae096d37dc917ef1f4`；只合并重基中两份状态文档的有效内容，没有改main或合入auditfix。现在有真实应用入口及有限下载器，前期“只能内部注入”的说明保留为历史阶段；此文为当前试验合同。

## 显式启动与隔离

必须同时传入三个参数：`--ete-cache-trial`、`--ete-cache-trial-config=<绝对JSON路径>`、`--ete-cache-trial-profile=<绝对隔离目录>`。策略所有字段均需明确提供，未知/缺失字段、非法值、符号路径或已有普通profile均拒绝。试验profile须为空或带本试验owner标记；JSON放在profile外，否则非空目录不能首次认领。没有参数时普通应用保持关闭；参数不完整时在bootstrap打开任何应用profile之前退出，不回到正式profile。

开启后，应用bootstrap数据和Electron appData/userData/sessionData都位于该隔离根；仅本次进程的APPDATA、LOCALAPPDATA和MPV_HOME也指向自有试验子目录，避免preload/helper继承个人路径。不会修改系统环境或复制个人mpv配置。不会复制正式profile、账号数据或mpv个人配置，也不启动安装器。账号通过现有登录界面在隔离profile内正常使用；缓存模块不另存凭据，不改变原认证/注册流程。不要把此试验目录指向现有应用数据目录。

[示例策略](templates/PLAYBACK_CACHE_TRIAL_CONFIG.json) 所有值都是操作者显式选择的试验例子，**不是正式默认策略**。示例为32MiB逻辑容量、4条目、1小时TTL、1GiB最低空闲、单文件8MiB、256KiB/s、32KiB块、120秒任务上限及2000ms新验证交接窗口。实现试验硬上限：总逻辑媒体64MiB、16条目、单文件16MiB、块64KiB、任务1小时。超过用户限额或实现上限直接跳过，不读取整片再决定。

`authorizationMaxAgeMs` 是从本次成功HTTP验证到读写/首次派发的本地最长交接窗口，不是虚构的服务器token有效期。每次新命中和下载续块都重新验证；过期URL的401/403不能用旧缓存绕过。`partialPolicy` 也必须明确选择 `discard-on-cancel` 或 `retain-checkpoint-until-ttl`，缺项关闭；前者只删除本任务最后拥有且尚未完成的checkpoint，不能删除新writer、完整对象或活动reader，后者保留至后续TTL/机会清理。网络中断仍保留已验证checkpoint，重新确认才能续写。`activeLeasePolicy` 必须显式选择 `retain-until-media-close`：不在播放中因TTL清理删除文件。真正撤权/账户退出的停止行为仍由原播放owner管理；这不是正式选定的撤权策略。

## 用户入口与下载边界

1. 用隔离runtime启动，通过既有ApiClient登录并选择自己有权访问的短媒体。只有现有PlaybackManager提供的 `DirectPlay` 或明确唯一 `Static=true` 的 `DirectStream`、Item/MediaSource ID及PlaySessionId齐全、容器为已知完整文件类型，且最终HTTP(S) source与当前ApiClient服务器同源时才有资格。Mount、STRM跨源CD2地址、动态DirectStream/Transcode、HLS和未知会话不符合条件。
2. 暂停播放，按 **Ctrl+Shift+D**，在原生对话框确认下载当前暂停媒体。没有确认不下载；每次确认绑定当时的context，换Item/账号/会话后不能使用旧对话框确认。当前代码不会自动下载当前媒体、下一集、库条目或NAS文件。
3. 下载只在暂停状态开始。**Ctrl+Shift+X** 明确取消；恢复播放、Stop、Next、退休、关闭和退出都会取消等待/请求，等所属socket关闭后结算。速率额度在每次有限Range读取前领取；这是应用下载任务的速率限制，不是整台机器/原mpv预读的带宽保证。
4. 暂停时按 **Ctrl+Shift+N**，仅在原PlayQueueManager已经给出同服务器、同剧集的下一集时显示确认。确认后以原ApiClient实际授权方法读取下一集信息；只接受唯一MediaSource的直接文件，不推测版本、不创建目标PlaySession、不推进队列。下一集首次正常播放仍走原PlaybackManager/session，只在新验证成功后命中完整缓存。此处是显式确认的预加载，未实现自动下一集策略。
5. 完整文件就绪时有结果对话框。停止后再次播放同一对象，先以新URL做1-byte Range授权/版本确认，才选择完整本地source；原Item/MediaSource/Session/队列和helper代次不重建。失败保持原source或至多一次回退，不把部分前缀送给mpv。

下一集信息读取限定同源、2秒、256KiB；使用维护ApiClient的header或query-string授权方法，实际fetch拒绝重定向并随owner取消，不使用可能自动切换端点的请求重试。无确认不读取信息/媒体；多版本不明、队列变化、账号/ApiClient对象更换均停止。

只支持同源直接文件：原URL及其凭据仅在当前播放/请求内存中使用，绝不追随重定向、跨源转发、Cookie jar、代理覆写、TLS校验例外或自定义认证头。身份来自应用原ApiClient的serverId/currentUserId及既有播放Item、MediaSource、PlaySession，不能由renderer提交“authorized:true”。再次按快捷键会重新核对当前ApiClient仍是捕获账号/服务器，不能把旧URL重新标成新用户；实际HTTP 206证明该URL现在仍可读取，服务器身份标签则来自可信应用路径，两者不混为独立账号鉴别服务。

下载与命中都要求精确206、Content-Range/总长、Content-Length、identity编码及强ETag。拒绝200/416、未知/超额长度、弱/仅日期validator、multipart、no-store及未知Vary；只接受无Vary或仅Accept-Encoding。所有chunk完整验证后才提交；中断只保留此前checkpoint，须再次显式确认才能续写。遵守no-store并保守限制Vary的依据见 [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.5)。

每个chunk使用刚完成的真实响应产生短期proof，再复用相同ETag/长度/身份的writer；这没有伪造服务器授权期限。版本ID来自强ETag，服务器ID与API origin组合隔离；账号、Item、MediaSource及资源路径/查询表示均参与磁盘hash索引。只移除已知api_key、X-Emby-Token、PlaySessionId，未知查询参数保留原编码及重复字段顺序；不把不同URI的相同ETag当同一对象。原始URL、token、账号ID、session和ETag不进入缓存元数据；媒体正文是明文。当前进程只有用户确认过的对象才允许自动尝试命中。重启后需再次确认以新授权重新认可既有完整对象，可以复用磁盘字节但不会自动扫描/下载媒体。

TTL控制新命中与有归属的机会清理（启动、后续写入/配额回收）；不承诺闲置关闭应用时按秒删除。实际活动lease继续按helper/generation/mediaIdentity和exitPromise释放。同步磁盘/hash仍仅适合上述小型试验上限，不能宣称已完成大影片生产缓存或无抖动性能验证。下一集现有显式确认入口及有限下载，未增加自动下一集下载。

## 自动证据

`tests/playback-cache-runtime.test.cjs` 的31项含：启动缺项/隔离、原ApiClient身份及对象更换失效、Static直接文件资格、暂停/确认门禁、完整下载/命中、原PlayQueueManager下一集及维护ApiClient两种授权方式、拒绝多版本/重定向、信息请求取消、账号/服务器/origin/版本/资源隔离、协议拒绝、中断重确认续传、显式取消半成品清理及完整/活动对象保护、恢复/Stop/Next/退出回收。全部HTTP由本测试进程的 `127.0.0.1` 临时端口提供，正文为60-byte合成PCM WAV，模拟helper从维护service分派的命中路径读出相同字节；无真实账号/媒体/NAS或外部目标下载。
端到端正常路径首先恰好传输60字节正文，下次播放只再读1字节校验，再由维护service分派本地对象。它证明网络字节与完整source链路，**不是Windows固定DLL解码、可见帧、声音、字幕、Session服务器回报或缓冲延迟实测**。status使用固定值 `ready`、`local-source-selected`、`local-media-opened`、`original-source-fallback`，不报告媒体标识/URL；`local-media-opened`也不等于已显示视频帧。

本阶段Node24.18.1/Linux相关回归236/236通过、0跳过；此前189及120项属于之前阶段，不能复用作本次Windows产物证据。测试命令：

```sh
node --test tests/playback-cache-*.test.cjs tests/native-helper-*.test.cjs tests/strm-resolver.test.cjs tests/nexttrack-transition.test.cjs tests/mpv-kernel-service.test.cjs tests/mpv-kernel-bootstrap.test.cjs tests/libmpv-stats.test.cjs tests/renderer-boundary.test.cjs tests/independent-apiclient-integration.test.cjs
```

补充真实本地解码/播放验证脚本（需要已存在的ffmpeg/ffplay，不安装或替换固定runtime）：

```sh
node tools/playback-cache-local-smoke.cjs --ffmpeg=/absolute/ffmpeg --ffplay=/absolute/ffplay --policy=/absolute/PLAYBACK_CACHE_TRIAL_CONFIG.json --out=/absolute/new-empty-evidence-directory
```

脚本生成半秒合成MP4，以维护ApiClient生成的同源URL经真实Range下载、重新验证并选择完整本地source，比较原文件/缓存的完整解码frame MD5，再启动真实FFplay消费缓存，等待所属进程退出及lease/socket回收。所有child的APPDATA、LOCALAPPDATA、MPV_HOME和XDG路径在独立profile，SDL dummy使其无声、无可见窗口。回执含精确源码commit、工具hash、网络字节及解码hash；它是独立解码器/播放器证据，不能替代固定Windows Native Helper/libmpv、Electron界面、字幕或真实Session服务器回报验收。既有证据目录拒绝覆盖。

## 父协调构建与最短人工验收

父通过已允许的云UI，在独立feature分支准确最终commit上运行 `.github/workflows/public-ci.yml` 的 `workflow_dispatch`，输入 **`release_package=false`**。使用现有 `manual-windows-test-package`/`tools/ci-windows-test-package.ps1`；它重新编译验证Host/Native、全回归、组装、打包并核验解包，不复用正式成品。artifact名称自带准确SHA/run/attempt，使用新run，不覆盖既有artifact。此分支版本仍源自v0.4.0，包必须标注“feature缓存试验”，不创建正式Release或main合并。

下载新测试安装包后，只用仓库锁定innounp解到全新目录并校验payload身份，**不运行安装器、不覆盖正式安装**。运行的是解包payload下 `x64/electron/electron.exe`，应用入口是同payload的 `electronapp`。例如Windows PowerShell中（路径由操作者替换；示例JSON在profile外）：

```powershell
$payload = 'C:\isolated-test-payload\{app}'
$trial = Join-Path $env:TEMP ('ETE-cache-trial-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $trial | Out-Null
$policy = $trial + '-policy.json'
Copy-Item '<feature-checkout>\docs\templates\PLAYBACK_CACHE_TRIAL_CONFIG.json' $policy
& (Join-Path $payload 'x64\electron\electron.exe') (Join-Path $payload 'electronapp') `
  '--ete-cache-trial' "--ete-cache-trial-config=$policy" "--ete-cache-trial-profile=$trial"
```

只需验收：确认新隔离profile；用户选有权访问且满足限额的短静态直接文件媒体；暂停/快捷键/确认/结果；Stop再播放验证命中及原Session/音字幕行为；原队列中明确的下一集按Ctrl+Shift+N确认并验证随后正常播放命中；下载中恢复或取消及半成品策略；关闭后所属进程和连接退出。真实服务器不满足强ETag/Range等应安全回原source，不能改策略绕过。需要用户账号、真实服务器/NAS或体验的步骤留给用户明确操作；本环境未执行这些步骤。

本轮与auditfix潜在冲突扩大为：`main.js`、`plugins/libmpv.js`、`native-helper/client.js`、`native-helper/service.js`，以及前期 `native-helper/controller.js` 和共享状态文档。均需逐段合并，不能整文件覆盖对方；Native C++、认证实现、构建workflow、版本和正式安装逻辑不改。

隔离路径需在Electron ready之前设置；实现采用官方app.setPath支持的appData/userData/sessionData，并在目录创建/物理归属检查后激活。[Electron路径合同](https://www.electronjs.org/docs/latest/api/app#appsetpathname-path)。这是源码合同与受控app/env替身验证，固定Electron实际启动仍按测试包单独验收。

# 共享播放缓存：普通应用隔离试验入口

## 普通 Emby 接入候选（2026-10-29，尚未构建）

本地后继补齐65b普通来源不保留M的缺口：通过原parseContext严格同源、DirectPlay／静态DirectStream、非直播及容器资格的来源，由main在当前文档／helper／generation／角色下签发内部普通transport，进入原共享底层。原无凭据legacy仅作为没有该main提供者或不合格来源的兼容路径。已有但失效的proof不能走普通授权；CD2／DirectUrl行为不改。这里沿用已有可信renderer的同源／账号变化取消边界，不是额外的独立服务器身份认证。

普通transport以不可伪造分类区分，未声明大小只允许该分类。大小取自同一次原0–0请求的精确206响应，不信renderer Size，且在强ETag、安全总量、完整1B与请求关闭后才发布grant；后续读取固定total／ETag，换版本走新metadata。普通来源不准注入文件UA、refresh或额外headers，不跟随重定向；凭据不进入索引或诊断。现有CD2transport缺少expectedSize仍失败。

共享选择继续受50ms保护，所有迟到当前准备必须保持原来源且关闭其route；next仍独立授权和读取真实预算，不能复活当前来源。现有每块30ms磁盘保护及actual／未播next收尾保持。满足协议资格的来源现在能进入共享M＋P，不等于每次命中：实际Native预算无效、弱ETag、磁盘或准备失败仍可能安全回退，普通预载因此也受共享预算资格约束。默认及设置档位不变。

本地154项受控检查不代表实际HTTP、物理OS guard或Native播放。新真实HTTP／磁盘测试在允许环境运行后，仍须新包普通启动、自然下一集、退出重开后实际本地读字节与源正文对照，以及可见首帧／拖动延迟验收。以下原状态与按来源分流说明是65b及更早合同，仅作历史。

状态：显式隔离试验仍使用严格共享路径。本地普通启动候选由既有开关选择按来源路由，默认仍关闭；下面的旧试验接线说明保留历史身份。候选尚未生成新安装包或完成 Windows 普通入口／Native 自然切集验收，不复用旧包冒充本次来源。

## 普通启动的来源兼容候选

既有开关保持默认关闭、70%／300MiB及原档位。开启后每个显式 Play 锁定一种路径：未提供共享凭据的来源继续原 next-prefix 的同源、静态来源及强 ETag／206校验；提供凭据的来源使用严格共享路径，main 角色授权、真实 Native 预算、来源大小、验证器及50ms／30ms保护均保持。凭据错误、过期或共享准备失败不能转到旧路径重试，只能正常直读。当前正式共享凭据由 CD2 来源解析签发，不新增普通 Emby 授权提供者。

原队列的 next 跟随本次 Play 的引擎：legacy 当前视频的带凭据 next 仍由原 legacy transport 校验，之后真正播放它时才可改选共享；shared 当前视频的无凭据 next 不预载，之后真正播放它时可选 legacy。跨引擎不复用先前 prefix。这个限制避免两条磁盘路径同时取得一份 P，不保证混合来源队列的每个 next 都可预载。

切引擎先等待旧实例关闭：legacy→shared先释放旧 P；shared→legacy准备时保留实际 A，等 legacy B 的真实开始事件后，才维护固定的已存在共享目录。目录不存在则不创建、不为维护读预算；存在时取得并 commit真实 M，使用 existing-only／on-demand恢复及原 owner／OS guard校验，同媒体裁剪到 M，不同媒体清旧 actual，finally关闭后才能准入 legacy P。维护不访问媒体源，不阻塞当前正常播放。取消、重复退休、换代及退出共享一条持久维护屏障；关闭失败保留错误并阻断后续缓存准入。开关关闭不主动删除已保留数据。

普通启动的本地收尾候选：legacy B 已实际开始、身份可归属且真实预算成功 commit 后，该次已获准的固定目录维护独立于播放 owner 收尾。Stop、换代或退出仍取消原播放和 next，但不会跳过已经获准的删旧块；新 Play 与退出等待实际 store 关闭，不复活旧来源或补记命中。同媒体仍保留 M，不同媒体清旧 actual。若在预算 commit 前退休、预算无效或磁盘失败，旧 actual 仍可能保留；这属于未完成维护，不能宣称所有取消时点均满足 last-actual-only。50/30ms、来源授权与媒体正文策略不变。该候选尚未进入新的 Windows 测试包，不能代替普通启动、真实自然切集或实际延迟验收。

renderer 的 context=null 仅退休原 owner，不切引擎或丢未播放 next。状态区分实际引擎与 source-aware 路由；尚未核实的旧共享磁盘大小保留 null，不填0或称命中。UI说明区分仅预载与共享保留，P仅下一集、M＋P为媒体上限，索引另计，不承诺每次命中或提速。

50ms仍仅为原shared.select的准备保护，不能覆盖range-context／退休的所属维护等待。跨引擎快速换片若遇慢文件操作，下一次load可能等待旧维护关闭。维护本身不发pause／stop；但切换时旧route可能已退休，不能保证旧视频仍持续流畅播放。需单独记录切换请求至load总时间及等待段，并覆盖慢维护期间立即切集、Stop与退出，不能把本地功能回归当作Windows交互延迟通过。

## 一份实现与真实来源归属

共享 store／index／proxy 移至 [维护目录](../src/electronapp/enhanced/shared-playback-cache)；原 tools 三文件只作兼容包装，不保留第二份实现。所有实验回执将实际 src 核心也纳入源码摘要。普通产品构建按已有 committed-source 流程收集新文件，没有新增外部依赖或编译内核。

原链继续为 PlaybackManager → libmpv adapter → Native service → helper。renderer 原队列、会话、进度及下一集解析不重建。仅在隔离试验下，service 的 createRangeSession 选择共享 adapter；旧 next-prefix 路径保持原实现。

首版明确限制：

- 仅接已有 main source authority 签发并绑定 principal／request／generation 的 branded transport；实际来源必须与原 loadfile 及 file-local UA 匹配。没有另取直链或以 renderer URL 伪造授权。
- Size 来自该 transport 既有可信 expectedSize；缺失、非HTTP(S)、302、非206、长度不符或原选项不支持时，本次 loadfile 继续原 source。普通没有 sourceProof 的 Emby source 本轮不接管，不宣传所有来源已支持。
- 每次真实回源前调同一 transport.access 获取当前有效 URL，严格同 origin／UA／大小；route 随 owner／principal 信号撤销，不用5分钟缓存 URL代替活授权。不会从每个缓存块重新解析下载地址。
- 新 route 使用可取消的真实1字节206探测取得 total／HTTP validators，才能重用本地数据；不将 Emby对象 ETag 冒充HTTP ETag。URL／Token／Cookie 不落盘，无浏览器Cookie转发或跨域凭据传播。
- 无强HTTP校验器仍是已说明的稳定媒体库假设；同身份／同大小／同可用修改时间的替换可能漏检，不承诺内容数学不可变。授权隔离不降级。

恢复候选的M由同generation生产helper直接读取demuxer-max-bytes。既有MPV_FORMAT_NODE／INT64序列化对3072MiB保持精确，删除先清快照／expand／读字符串的旧桥绕路；只接受256KiB至3072MiB的安全整数，缺失、字符串、越界和旧generation均不给缓存配额。不改变helper／内核或权限。来源准备总软期限现为50ms（旧候选为25ms），涵盖实际预算读取、adapter创建、fresh探测及已恢复后端的route key准备；到期仅取消缓存准备，原source继续，不中断播放请求。减少两条命令不等于已实测解决Windows超时。

当前档位按恢复要求为100／300／500MiB（默认300），触发50／60／70／80／90%（默认70）；内部preloadMB字段仅保留兼容名称，不增加新选项。UI和实际P均按1024×1024字节计，旧decimal-MB实验记录不追改。当前仍是默认关闭的隔离共享底层候选；普通入口的next-prefix路径与共享trial分别验收，不能将本候选宣称为普通入口已交付。

该上限不是零开销承诺；事件循环调度与真实Native首帧仍待验。来源在被接管后发生授权拒绝会终止该route，不继续交付旧缓存；没有添加可能串代次的同generation自动重载。缓存块损坏／缺失则在代理内部回原源取对应缺口。

## 后台／按需恢复

共享 adapter 用 deferred store 在后台启动 on-demand 恢复。创建代理／网络前台不等待整盘恢复：后端未就绪时不能提供hit或新磁盘写入，授权网络仍可流式交付；元数据操作在后台串行完成，受既有捕获／待写预算约束。磁盘不可用亦不阻断授权网络。

恢复只读有界快照／日志并核文件类型、归属、长度，未读取正文SHA的候选仍计入 M+P。span 只是候选范围；第一次本地读取必须完整核长度和SHA，成功后才能交付并计hit。坏块剔除后回源。没有另外累计媒体镜像或降低完整性门禁。

后端已就绪时，adapter等本route的key准备后才发布URL；受50ms总期限约束。这样已完成的B预载不会因“key还没返回”而被首个请求跳过。后端尚在恢复时不等待全局ready。Stop仅等待本route的body／预载／写任务及实际源连接关闭，不等待另一个视频仍在播放的HTTP流；全局退出才等待全部初始化和存储释放。

### 3GiB真实文件的新进程对照

同一自有合成真盘缓存，无复制，按 verified → on-demand 顺序用两个新Node进程；OS页缓存未清，单次对照，不是20对性能门禁。A在越额回收一块后占3071.75MiB。两个进程均退出0、store关闭、租约／待写归零：

| 指标 | verified启动 | on-demand启动 |
| --- | --- | --- |
| createStore耗时 | 8929.78ms | 480.59ms |
| 启动读取媒体正文 | 3220963328B | 0B |
| 子进程RSS采样峰值 | 119967744B（114.41MiB） | 78315520B（74.69MiB） |
| 首次256KiB读取耗时 | 3.72ms | 1.11ms |
| 首次读取SHA | 通过 | 通过 |
| 未验证占用，读取前／后 | 0／0 | 3220963328／3220701184B |

峰值作用域包含恢复、首读和close；Node allocator、OS缓存及采样间隔有影响，不是Electron或mpv总RAM保证。此前252MiB来自含填充历史的父进程，不能直接冒充此表的同口径基线。481ms元数据恢复由共享adapter后台执行，不作为首播同步等待；本地测试还用人为延迟初始化证明网络body先到、恢复未放行的区间不命中。

这次配额场景也再次同时填满 M3072MiB＋P500MiB，媒体文件峰值保持3572MiB；未验证数据没有腾出虚假额度。它是存储压力值，**不是改变应用P单位**。

## 生命周期、预算与自然下一集

应用沿原 selection：进度50／60／70／80／90%、默认70%；预载100／300／500，默认300。现有应用P按十进制MB转换，M沿原MiB设置；本轮未静默把P改为MiB，也没增加产品设置。头80%／尾20%仍是前一原型的预算内实验范围，不声称智能识别所有容器索引。

候选始终以next进入；native同generation core-idle=false才走markPlaying→actual。准备和预载不清最后实际A，Stop保留最后实际对象，退出丢未播next。无法接管的另一视频实际播放时也按媒体身份清旧缓存；该清理只删除缓存，不授予新来源访问权。异步清理执行时重核owner，旧代次不能清掉新actual。

本轮真实Alameda／PlaybackManager／resolver／main CD2 authority／service／session／HTTP／共享store合成全链通过：

1. synthetic helper按现有精确诊断命令返回M=314572800B，并发出普通进度／core事件；
2. 达70%后由真实renderer发现原队列B，原来源解析和proof绑定成功，B预载40B；实际A的8B与B的40B同时计占用；
3. 真实PlaybackManager自然EOF执行next，未直接调用预载或next来伪造；
4. B打开后实际上游只收到一次0–0授权探测，未重取已暖0–7正文；
5. 退出重开仅保留B的40B，next为0。

helper时钟与文档是合成的，不是Native DLL解码。测试曾真实复现“next未传M”和“warm key未ready先发URL”两个接线问题，已分别由session预算传递和available后端的本route ready等待修正；单独adapter及整链均转绿。

## Windows候选准备，尚未执行

已补仅工具层的[真实helper合成短验流程](SHARED_PLAYBACK_CACHE_WINDOWS_SMOKE.md)。该流程不执行普通main bootstrap，首次Windows CI失败仍需新提交回归，未派发旧包。

不需要额外构建参数来默认启用：源文件正常入包，普通启动仍关闭。候选必须是本提交新构建，保留正式版及既有artifact。试验必须使用独立profile；校验覆盖关键来源文件的runtime-provenance行、源码／runtime双摘要及实际exe／app路径。

先用同提交checkout的固定Node准备全新profile（既有目录拒绝，未启动程序、未启用设置）：

~~~powershell
node tools/shared-playback-cache/prepare-trial.cjs --out "$TrialRoot"
~~~

之后仅在隔离runner中显式启动新候选：

~~~powershell
& "$RuntimeRoot/x64/electron/electron.exe" "$RuntimeRoot/electronapp" "--ete-shared-cache-trial=$TrialRoot"
~~~

启动前会核owner、物理目录、来源及冲突模式；失败直接阻止bootstrap，绝不回普通账号profile。APPDATA、LOCALAPPDATA、MPV_HOME、session、临时目录及日志均隔离；原Host位置参数不能覆盖trial userData。重启同owned profile允许验证暂存。没有flag时没有共享试验文件／环境副作用。

然后在该隔离profile使用**既有预载设置页**启用开关，选70%／300等原选项；flag和开关缺一均不启用共享实验。不要导入真实账号或系统配置。本轮未新增正常用户设置或自动登录入口。

父协调的下一次Windows短验至少核：

- 新候选source/hash、启动隔离及正式profile未触及；
- 仅loopback合成Emby/CD2来源，真实helper首帧／seek，冷恢复不阻塞前台，未验证块不交付；
- 普通进度→原队列自然B晋升，无预载正文重复；Stop／退出重开／换媒体；
- 撤销权限、旧回复和取消竞态无串播，所有所属helper／Electron／HTTP／文件句柄退出。

还没有这份Windows执行回执，不能把本地Node合成结果称为用户安装／真实NAS或全性能验收。没有自动dispatch、merge或Release。

## 复现与验证范围

~~~sh
node --test tests/shared-playback-app-entry.test.cjs tests/shared-playback-app-trial.test.cjs tests/shared-playback-app-adapter.test.cjs tests/shared-playback-app-session.test.cjs tests/shared-playback-on-demand.test.cjs
node --test --test-name-pattern=trusted-cd2-shared tests/playback-prefix-alameda-auto.test.cjs
node tools/shared-playback-cache/quota.cjs --run --recovery-probe --out "$PRIVATE_FRESH_OUTPUT" --deadline-ms 600000
~~~

完整串行离线回归2609项：2596通过、0失败、13项既有平台跳过。新增入口／隔离／adapter／session／按需恢复及自然链通过；真实helper回读、可见首帧、Windows、实体慢盘、TLS／真实服务、掉电持久性未验。原始回执和私有路径在仓库外，不公开上传。

## Cold initialization and fresh probe overlap

The source-bound226f tool entry40487057090 correctly rejected the cache-enabled arm at the existing50ms preparation limit. Its actual Native budget read completed in2.94ms; store construction began only after the fresh one-byte probe, then metadata opening completed after the selection had already fallen back. This establishes that run's timeout and serial cold-path order, without reclassifying earlier failures or proving a future timing guarantee.

The new product candidate starts the owned backend initialization inside the same actual `open()` after branded access, expected size, original load options and current-byte budget have been validated. Backend recovery and the fresh one-byte probe overlap. No store/manager is created at app startup or before source selection; no media body is prefetched. Source metadata/key creation and proxy publication remain after a successful fresh probe and live-owner checks. A rejected probe still publishes no route and cannot use recovered bytes. Late initialization remains owned by the cache; close joins it, and cancelled records cannot create keys, promote actual media or revive a local hit.

The session50ms preparation limit, Native budget checks,30ms disk-read grace, restored-metadata ready wait, source/validator/identity checks and all cancellation/cleanup contracts remain unchanged. A genuine slow or unavailable backend still causes original-source fallback and fails strict shared-cache acceptance. This removes an unnecessary serial dependency; it does not guarantee that every cold machine fits50ms. Only the shared-cache adapter product source changes. The existing83f package predates this change and cannot validate it; build a new exact-source candidate, then bind verification tools and installer hashes to that new product before ordinary-entry or matrix assessment.

Validation: focused real-HTTP/adapter/session/budget63/63 pass. Controlled old-source contrast fails both new overlap-start assertions; current source is restored before the complete run. Final serial regression2,915 total/2,890 pass/0 fail/cancel/25 existing platform or material skips (145.0s); JavaScript607/PowerShell55 syntax, finite credential-pattern scan706, three changed-document checks and diff checks pass. The only changed protected product file is shared-playback-cache/adapter.js. No Windows candidate execution, package build, latency improvement or acceptance pass is inferred from these local tests.


## Cold fallback and backend lifecycle contract

A shared selection is optional preparation with the existing 50 ms limit. Its elapsed time uses a monotonic clock, including the actual same-generation Native budget read, fresh source probe and restored key readiness. Results observed at or after the deadline cannot be admitted even if the timer callback has not run. The 30 ms foreground disk-read grace is unchanged. Timer scheduling is not a hard real-time guarantee that the caller resumes in exactly 50 ms.

Each explicit Play has one shared-selection attempt. A timeout, refusal or cancelled undispatched proxy leaves that Play on its original source; backend readiness cannot retry it, reload it, switch its source or retroactively count a hit. The selection record and its media transport remain bound to their generation. An initialization already started by validated access may finish under the cache's lifetime; close joins it. No initialization is added at application startup, no new retry or hidden media-body warmup is introduced, and late budget results cannot start initialization after expiry.

Status separates `backend.state` (`idle`, `initializing`, `ready`, `failed`, `closing`, `closed`) from `current.route` (`idle`, `original`, `proxy`). `ready` describes infrastructure only. It neither authorizes a media resource nor proves cached body bytes or a local hit. The existing current activity state, source diagnostic, disk bytes and next-prefix progress retain their separate meanings.

A later explicit Play may reuse an already initialized backend in the same application/configuration. It must acquire a fresh current-generation actual Native budget, current source authority and successful one-byte validator probe, then wait for its own key readiness. A changed budget can require reset and fallback. Changed source identity/account/validator and revoked authority still reject or invalidate old data. Direct original-source fallback does not itself fill the shared cache. Reusing infrastructure therefore does not guarantee a body hit on that later Play, and a new process is not an already initialized backend.

### Independently authorized next episode after a cold fallback

The current Play remaining on its original source does not disqualify the original queue's next episode from preloading. After the existing progress threshold, the shared session may prepare only that separately resolved next candidate. It requires its own main-issued next-role transport proof, the same live helper/generation and server/account/play-session ownership, and a still-current actual Native budget. The budget is committed before prefix transfer. Cancellation, a stale budget or invalid proof cannot start late routes or bodies. The current route and its original timeout diagnostic remain unchanged; next progress is displayed separately from current direct playback.

Natural next remains owned by PlaybackManager. Actual playback of B is a new generation and must perform the existing budget, authority and one-byte source validation before using B's preloaded bytes. Preparing B does not promote it to actual or retain the direct-played A. Exit before B plays discards B; after B actually plays, Stop/exit retains only B and on-demand reopening verifies its stored bytes. The 50 ms current-selection cap and 30 ms foreground disk grace are unchanged.

Local coverage uses real loopback HTTP, authority, shared store, Native-budget-reader logic and the original Alameda/PlaybackManager queue with a synthetic helper. It covers cold A direct playback, independently warmed B, natural EOF, fresh B probe without repeated prefix body, cancellation, invalid budgets/proofs, and both exit/reopen outcomes. This is not a new Windows package or natural-next Native result. Unconditionally replacing the ordinary legacy path would reject previously supported proofless Emby preloads. The source-aware candidate described above preserves that path without relaxing main-issued transport authority.

### Prospective acceptance layers

These layers are specified before further runtime verification. They do not change the existing strict ordinary-entry or 46-process matrix verdict, accept a fallback as shared-cache selection, or rewrite any earlier failure.

1. Ready-state function: explicitly identify the same-process backend readiness barrier and every setup Play; readiness setup is outside measured samples and its time/source bytes are reported. Each measured explicit Play still passes fresh generation/budget/source/validator checks. Unique media/frame identity, real restart/new-frame events, original deadlines, actual verified local bytes, repeated-body refusal, resource ownership and physical cleanup remain mandatory. Proxy selection alone is not a hit. A failure to reach the readiness barrier is a recorded setup failure, never a replacement run.
2. Cold fallback correctness: controlled budget/probe/store delays and refusals must retain original playback, unchanged timeout diagnostics, no late record/key promotion or source switch, no claimed local hit and complete owned cleanup. Later backend readiness may only be tested through a new explicit Play. A passing fallback-correctness result is not a passing shared-hit or ready-state result.
3. Stratified stability/performance: label cold-process and same-process ready-state cohorts independently, preserving every planned case, admission/fallback count, failure/null sample and denominator. Report source bytes, verified local bytes, latency, memory and disk separately. Successful paired subsets may be described only alongside all failures and their complete denominator; they cannot establish overall acceptance or improvement. A seek with zero source bytes and zero local-hit bytes proves neither shared-cache service nor a cache speedup. The existing matrix remains 3 warmup pairs + 20 measured pairs / 46 fresh processes; changing its protocol or adding a ready-state cohort requires an explicit new plan rather than editing its historical results.

Local controlled-clock tests cover both expiry callbacks and late budget/store completion before a callback, permanent current-Play fallback, later-generation fresh authorization/budget, representation change and failed backend state. They are synthetic loopback/real-store evidence, not a Windows package, visible presentation, NAS or overall performance result.

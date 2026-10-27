# 共享播放缓存：普通应用隔离试验入口

状态：已接入普通应用的既有会话链，但仅显式隔离试验启用。默认普通启动不读取或初始化共享缓存；本轮未生成安装包、未启动真实 Windows Electron／Native DLL、未访问 NAS 或115。父任务可据精确提交准备新的 Windows 候选，不复用历史过期包。

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

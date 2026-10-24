# 四项审查修复与EWT两项修复：组合候选

## 当前九项接续

本页保留61dc318六项来源与验收合同。当前追加来源66c6a32d的三项缩略图修复，准确组合SHA和执行结果另记；九项范围及新增简验见[九项组合验收](NINE_FIX_ACCEPTANCE.md)。61dc已有Windows结果仅限六项，不能代替新九项包。

组合来源：发布基线`88578c91ab19d44eecddcfae096d37dc917ef1f4`；四项审查源`2570c3263bf2dc3fe43168edcf6b64c9f2eacda5`；EWT源`cb0ebf78e59c4d2d38f7f7573c5f2cf3a79674ea`。构建提交693d5257仅移植已复核来源6dc6c270的Framework预检/验证器，不包含该来源上的缓存功能。两个纯源分支保留，最终组合SHA及测试包/run按交接记录。

## 六项修复和最小回归

| 候选修复 | 最小受控回归 | 当前边界 |
| --- | --- | --- |
| helper create/Stop/再Play资源owner | 挂起首次create，Stop后排队B；释放A后只清理A，B独立load。再检查第二Stop、最新C、Next、旧destroy及退出。`native-helper-create-owner.test.cjs`。 | 真实adapter/Endpoint/service，窗口/部分helper为替身；Windows实际helper重播/退出待包验证。 |
| FPS恢复尊重显式暂停 | 切率回复/稳定等待期间pause或toggle，旧任务不能自动resume。`refresh-rate-fps-work.test.cjs`。 | 时钟/XHR/bridge为替身；实际显示工具与暂停体验待有显示能力的Windows验证。 |
| 独立secrets重启恢复 | 新临时root只保存合成Token而无普通config，重建store仍已配置；clear及legacy/既有config优先级保持。`strm-resolver-settings.test.cjs`。 | 已可用真实临时文件系统自动验证，不改保存/认证策略，不需真实账户或GUI。 |
| controller有界历史 | 20万time-pos、2万请求仍只保留4096/1024，丢弃计数、事件全交付、ready/sticky及一次结算保持。`native-helper-history.test.cjs`。 | 云端真实JS dispatcher可验，无必需人工长时播放；不冒称Windows实际长时内存效果。 |
| EWT seek小数精度 | 绝对12.345秒仍传12.345，相对后退250ms仍传-0.25；0保留。`playbackmanager-request-session.test.cjs`中EWT用例。 | 执行真实input/API/生成PlaybackManager/adapter；合成IPC，实际mpv落点待测。 |
| EWT暂停seek完成上报 | 接受命令时不报告目标；当前媒体原生SEEK后的PLAYBACK_RESTART读取真实time-pos，再沿原Session报seek，0/真实落点/暂停状态正确。无完成、失败、反序应答、旧generation/Stop不能伪造进度。上述EWT用例及native-completion/client/service测试。 | Native静态合同与受控IPC不等于Windows实际libmpv完成、Emby服务端Session或双端EWT通过。 |

四项原缺陷的基线对照、精确测试入口及限制见[四项验收](AUDIT_FIX_ACCEPTANCE.md)；EWT路径与单位、上报时机、能力声明未改及原独立来源证据见[EWT合同](EWT_CLIENT_SYNC.md)。两类问题都按修复候选报告：能证明受控复现原来失败、当前对应断言通过，不归因用户某次事故，也不宣称难复现历史问题已彻底消失。

## 交叉合同

- 合并保留旧create/destroy共享屏障与新请求复核；新EWT上报不能重建或接管PlaybackManager、PlaySession、MediaSource归属。
- Seek提交只记录accepted/failed固定诊断；不得将requested target写成本地/服务端已观察位置。当前generation实际完成事件才能更新状态并触发原seek进度上报。
- Stop/Next/退出退休旧endpoint/generation后，旧seek应答或完成不能污染替代项目。真实owner与完成过滤都需保留。
- Seek完成只更新真实位置，不能将暂停意图当作自动恢复许可；仍保留最新显式pause/cycle控制。诊断环不允许上报依赖无限历史。
- EWT Native新增仅限seek完成采样与原媒体归属；不带原生预览新功能。缓存、手动更新、版本/依赖/安装器均不改。

## 云端及构建流程

准确组合提交执行六项最小回归、完整`tests/*.test.cjs`及全部`tests/*-material-selftest.cjs`，核查生成PlaybackManager、observer夹具边界、Native源码/固定header身份、来源范围、HEAD构建输入、验证器、JS/PS语法及有限凭据模式。原四项baseline的同一测试已重新失败；EWT基线对照使用显式生产源/patcher选择，不改断言。结果按本轮实际日志及最终SHA给出，重复集合不累加；Windows平台skip如实列出。

父负责按准确独立候选排Windows包，release_package=false，新run/artifact；保留原哈希门禁、来源预检、实际Host完整验证、Helper编译、build/VerifyOnly及解包比对。普通push/PR的自动离线CI不替代手动完整包。预检/合成签名不证明实际Windows来源，失败不绕过校验或盲目重试。

## 给用户的简单验收

只在父确认来源正确的新独立测试副本及约定实机时段操作，当前用户前台保持暂停。先以合成本地媒体/专用测试Session自动运行；需要回家真实环境观察时由用户选择媒体/会话，不控制现用设备或别人正在播放的Session。

1. 普通播放→快速Stop再Play→连续Next→退出：确认能重新播放、没有挂起或遗留helper；不要求人为必现旧竞态。
2. 使用既有自动切率时在启动/稳定等待内暂停，等候后仍暂停，再明确恢复可继续。若显示设备不支持本次切率，记录未覆盖硬件层，不写成通过。
3. EWT专用测试会话暂停后seek到0、12.345秒，再快速连续两个目标：客户端保持暂停，实际落点与原Session进度应一致；偏差须区分mpv实际落点与命令目标，不能用伪造进度掩盖。
4. 同一专用会话测试Stop/换集后旧seek不把位置带到新项目，正常播放上报和无Seek启动保持。记录来源SHA、操作、实际结果及是否出现异常，回家环境继续观察难复现问题。

R3/R4不用额外人工配置或长时守候；这些已能云端自动验证。没有新功能验收、真实NAS写入或要求上传账户配置。

使用全新Windows VM/独立OS用户/解包目录，不覆盖正式安装、不复制已登录profile。测试启动器仅在子进程设置APPDATA、LOCALAPPDATA、MPV_HOME、TMP、TEMP及产品bootstrap前的Electron路径；不能只改userData，也不借用缓存试验CLI。合成正式配置sentinel必须保持。不写系统环境或安全设置。

保持draft，用户简单验收及父最终条件核对前不合main或发布Release。可交付独立测试版供用户回家观察；测试版成功构建、Windows实际运行、真实服务/双端与GUI体验分开记录，未执行保持NOT EXECUTED。

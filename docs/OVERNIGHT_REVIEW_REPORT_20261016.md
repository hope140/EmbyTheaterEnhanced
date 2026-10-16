# v0.3.7 发布后的有限维护审核

## 当前基线与阶段

本轮有限覆盖与可验证修正已完成，本地候选为 `LOCAL_CANDIDATE_READY_FOR_PARENT_REVIEW`。基线 main 为 `45bea67bb6f3c9e825c44c6e1a5e0f908f74b8d0`，分支 `codex/post-v037-night`；最终产品source为 `5341f32985aabefa03f789b1428d8dfa2be5ba06`。后续文档HEAD单列，不替换该runtime来源。四项修正为设置栏排序、显示P1错误收口、E1诊断标签及E2电影分块归属；未修改已发布037 Tag/Release或资产，未推送本轮分支。

本报告只覆盖当前仍可达的维护代码与构建入口。历史提交用作线索；旧版本曾经的缺陷、文件存在和模块注册均不直接代表当前缺陷或已观察到的运行行为。

## 工作包与实施门槛

| 工作包 | 有限覆盖 | 当前状态 | 验收与停点 |
| --- | --- | --- | --- |
| A 设置栏排序 | 原navdrawer聚合/排序器、插件route.order、原生列表 | 六个order局部修改，3/3定向及9项隐藏原生菜单检查通过 | 原键盘order2，CEC3/视频4/音频5/STRM6/诊断7/关于8；DOM顺序/路由元数据/原生焦点owner保持，未声称人工前台PASS |
| B 显示链 | 刷新率目标/current/list/change、恢复owner、错误/超时、窗口调用图 | 限定P1本地修正，29/29定向通过 | 一次回调/异常响应完成；DISPLAY1映射、超时和恢复owner未扩改，真实多屏/HDR/Mixed-DPI未测 |
| C 安装升级 | installer、配置与DeviceId、权限/目录/退出码、保留规则 | 未发现确定产品缺陷；15/15隔离/静态测试通过 | 合成目录变更和DeviceId测试不代表真实安装；不新增未指定的禁止降级策略 |
| D 旧资源 | BAT、工具、字体/主题、插件和payload引用/排除合同 | 有限清单审核完成，未发现确定遗漏；最终包体完整集合通过 | 未知手工/外部消费者保留，不声称死资源均已确认 |
| E 当前维护代码 | 诊断/配置/内核导入、插件/Web生命周期、STRM/CD2边界与生成器 | E1/E2修正与最终组合、来源门禁通过 | E1诊断45/45、E2最终组合19/19；完整Native内部及真实业务未穷尽 |

E1、B/P1及E2定向证据保持各自范围。8cc的公开996/996和材料200/207保留为首次阶段记录，未生成该来源候选。最终来源5341f32的公开完整确认996/996、材料210/210、隐藏受控组件62项及完整包体验证通过；最终Movie→Search输出54537E...C3802F。具体历史和限定合同见[异步及隐私审查](OVERNIGHT_ASYNC_PRIVACY_REVIEW_20261016.md)。

每项实现前补齐准确允许文件、输入输出、原行为不变量、修前证据和修后用例。worker 先提供限定证据，主线程检查真实源码和差异后决定实施；没有确定问题时记录未发现问题，不为覆盖数或版本数增加修改。

## 不变量与运行边界

- Item.Path 为 sidecar identity，MediaSource.Path 为 source identity；PlaybackManager、Item、MediaSource、PlaySession、队列及 Session/Together 报告仍由原链路拥有。STRM 只替换最终 source，失败继续既有回退，取消不提交迟到结果。
- 设置栏仅采用既有组件、路由、标签和键盘导航；DOM 顺序与显示顺序一致，不另造焦点排序或分类。
- 原始vendor、旧客户端、旧候选、旧profile和个人配置保持；只准备manifest固定输入副本和新合成资料，不读取个人凭据或真实profile，不访问真实服务器业务，不主动显示或激活应用窗口。
- 仅本地可回退修改及必要小提交；不自动 push、PR、merge、Tag 或 Release，不系统安装/卸载，不更改驱动、启动项或电源设置，不升级依赖。
- 缓存/预热、字幕音轨切换延迟、窗口圆角与037电源实测仍暂缓；整树Web替换和新功能不进入本次审核。

## 证据与恢复

基线工作树检查为空，已读取当前AGENTS、架构、状态和维护经验。5341f32已由锁定Node/工具链及 `tools/build.ps1` 构建；VerifyOnly、独立Git blob与完整集合回读通过。

首轮安装与资源静态审核未发现可确认产品缺陷。没有防降级比较属于未指定策略，不据此增加限制；BAT手工/外部消费者仍UNKNOWN并保留。固定物理输入已准备，Electron/Native/Inno门禁通过，Electron原ZIP仍未重新回读。

显示链B1/B2/B3、E1标签处理及E2修订后的成功/失败双终态token合同已获父审限定批准，按独立小修实施；未批准的显示器映射、超时和恢复owner仍停在审查层。详见[显示审查](OVERNIGHT_DISPLAY_REVIEW_20261016.md)与[异步及隐私审查](OVERNIGHT_ASYNC_PRIVACY_REVIEW_20261016.md)。

A修前有效用例1通过/2失败，修后3/3，覆盖sync关闭/开启、用户设置及元数据保持。摄像头注释代码未注册，下载项受sync能力控制；静态对象清单不能冒充激活菜单。最终源构建隐藏应用通过实际router/plugin注册、navdrawer、itemscontainer和listview，呈现七项准确顺序，9项菜单检查通过；只使用合成用户API和CEC协议替身。

主线程另有限核对STRM/CD2的source/sidecar分工、DirectUrl与User-Agent校验、同源回退、绝对deadline、取消与目录恢复边界；该已读范围内未发现新增确定缺陷。Native内部实现未作全量重新审核，真实服务/设备仍未验证，不把既有测试门禁等同于穷尽历史缺陷。每个问题按Observed、Expected、Evidence、Files、Tests、Blocker记录；缺条件继续独立项。

私有恢复状态为 `.work/OVERNIGHT_TASK_STATE.json`，原始证据位于 `.work/overnight/`。隐藏应用和入口探针只创建本任务资料及隐藏窗口，实际show/网络/真实Native子进程均0；所属进程收口，资料保留在交付目录之外。没有创建系统作业。执行已完成，下一步为父会话核对最终diff/产物和用户人工最小清单；不自动开始新版本或发布。

## 最终来源与本地交付

| 项目 | 实际结果 |
| --- | --- |
| 产品source | `5341f32985aabefa03f789b1428d8dfa2be5ba06`，版本保持0.3.7，仅本地候选 |
| 公开离线完整确认 | 996/996，0失败/跳过 |
| 固定材料 | 210/210，0失败/跳过 |
| 静态检查 | JS313、PowerShell28、有限凭据模式364份文本通过；不等于完整秘密扫描 |
| 源构建/VerifyOnly | 2159 payload / 2160完整runtime，通过 |
| 独立来源回读 | 109产品Git blobs、51构建输入、4 notices与提交及runtime字节一致 |
| Runtime manifest | SHA-256 `4088be6423c03177b871a5c5272f24ca3fe72e5ae6f509c847bb136d5d500d3e` |
| Payload set | SHA-256 `04e1704e02af4a606453a6f36df931cdd035dd9f5e5987b16f5cd13e7013092a` |
| 隐藏组件 | 菜单9 + 原OSD18/API17/PM18，共62；合成Session 7 start / 1 progress / 7 stop，7组身份配对，所属observer/timer/power句柄清理0 |
| 独立启动入口 | 实际入口隐藏启动通过，appData/userData/参数profile在独立同级资料中，show/网络/Native子进程0 |
| ZIP | 240674258 bytes，2164个文件流完整集合、逐SHA和CRC通过 |
| ZIP SHA-256 | `3f39076954ae4b3ef18270a17ccfcb288c3b9cc2634d7a0ba6956f3f7db677c1` |

本地目录 `dist/ETE-night-maintenance-5341f32-20261017`，入口 `Start-Night.cmd`；压缩包为同名`.zip`，另有`.zip.sha256`。目录包含完整runtime和4份审核入口/说明文件，不携带profile。测试资料位于同级同名加`-profile`目录，用户首次启动创建；本任务的隔离入口探针已创建其自有空白测试资料并保留，未读取个人或旧资料。重新解压到另一新目录名会使用对应独立资料。

相对已发布037 runtime，仅5个获准产品输出（main、cec/libmpv插件、diagnostics、最终VirtualScroller）与6个来源元数据文件变化，其余完整路径与字节一致。Helper及默认libmpv SHA保持；Electron prepared完整树身份通过，原ZIP本轮未独立回读。

首次534公开批次995/996，唯一临时Git夹具子进程退出4294967295，根因UNKNOWN；隔离1/1通过后执行最终完整确认996/996。首次隐藏探针因夹具提前destroy原生组件造成mergeOptions异常；修正为等待所属refresh完成再pause，重验通过，未改产品。两次失败日志、首次8cc材料失败和全部测试资料均保留，不用最终PASS覆盖历史。

## 保留项与最小人工清单

| 保留项 | 当前证据 / 原因 / 恢复条件 |
| --- | --- |
| 刷新率目标显示器 | main仍按原DISPLAY1参数，真实窗口到Win32显示设备映射未闭合；需准确映射合同及对应多屏设备后再父审，不推断已修 |
| 长期子进程与刷新率恢复owner | 原调用图/无timeout/非await恢复已记录，P1只收口确定异常；需Stop/Next/退出race与预算合同及设备证据，不据局部修正宣称完整恢复 |
| 安装生命周期 | 当前静态与15项合成检查支持独立profile布局；真实升级/降级/卸载重装/UAC/退出码未执行，需单独可回退系统环境与授权 |
| 有限审核边界 | 当前已读模块未发现额外确定缺陷；不保证穷尽所有历史、Native内部、真实业务或硬件组合 |

用户最小核对：设置七项顺序；电影库加载中离页返回原缓存页并继续滚动，快速换查询无旧结果；代表媒体播放/停止/切集与远控保持。OS电源组合仍按原决定暂缓，不纳入该清单。

后续系统安装验收准备：在单独可回退目录和合成profile记录安装前payload/配置/DeviceId哈希；授权后分别执行安装、覆盖升级、卸载、重装并记录退出码/目录与登记状态；核对profile/DeviceId保留以及权限拒绝/占用失败。降级沿原允许行为，不额外发明限制。本轮没有执行这些系统步骤。

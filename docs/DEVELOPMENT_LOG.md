# 维护记录

## 2026-10-14 仪表盘刷新导航与离页标题

- 首次真实仪表盘协议含6项TabPageInfos；只读WebSocket观察复现5次同PageId/ViewId、IsPageChangeInfo=false且TabPageInfos为空的更新，旧适配顶部持续为0。网页组件对应分支只刷新内容，不清导航；没有执行业务命令，完成的非读取HTTP为0。
- 同一页面的增量通知在缺失/空导航时继承现有普通页面导航，不修改传入通知，不影响有内容的页签更新、Dialog/Wizard或显式页面切换清空。工作实验4次真实更新后导航始终6项。离页只在active且无其他页签owner时清理标题，重复pause不清新标题；迟到响应及新owner保护测试保持。
- 网页/候选对照确认Chapter API自带4个英文页签和传统原生表单，结构差异来自插件模板；ETE从Madby进入该页留下“运行状态”是另一个适配缺陷，已在当前离页清理中修正。保留传统插件布局及宿主主题，不强制改写插件HTML。
- 定向28/28、隐藏真实AMD合成100项及语法通过；Task Risk/Uncertainty为Tier 2，Playback/Session Impact为NONE，主线程沿用当前模型处理导航更新与owner边界，无架构或共享模块修改。正式来源绑定后台复验与独立客户端交付以私有回执固定，前台仍待用户确认。

## 2026-10-14 私有验收入口日志隔离修复

- 新入口启动失败已在同一私有客户端复现：完整集合比对仅多出runtime下debug.log，manifest规定的文件均存在且哈希匹配。用户启动记录为child-exit-failure，不能把此前隐藏启动及dry-run通过视作实际前台启动通过。
- 保留完整校验合同和product sourceCommit=25bef64，只为私有Start/Verify子进程环境显式设置ELECTRON_LOG_FILE，提前创建独立logs目录。原日志移至独立诊断目录；两个脚本经原manifest哈希核对后精确修改，只有对应harness条目的大小及哈希更新，product payload保持。
- 复验bundle完整性PASS、隐藏真实产品bootstrap PASS（授权登录副本已复制、前台动作NONE）、连续两次Start dry-run PASS。额外隐藏Electron探针强制产生固定日志标记，验证日志落入独立运行目录且runtime没有新debug.log，之后bundle再次PASS。入口和桌面目标保持，前台重新打开仍待用户确认。
- Task Risk/Uncertainty为Tier 1，Playback/Session Impact为NONE；沿用主线程运行配置，无架构或产品源码变化。未重新构建产品，私有harness修复以独立哈希回执记录，不更改25bef64产物来源或复用旧机器结果冒充前台证据。

## 2026-10-14 多选弹层高度修正

- 用户反馈五项语言菜单展开高度不一致。读取当前网页组件样式并进行后台绘制的同尺寸真实DOM对照，确认网页虚拟弹层max-height为min(30em,70vh)，旧客户端按calc(98% - top)指定高度且仅有84%上限。1280×900下原五项菜单约630px、网页约395px；工作实验新增限制后约394px，差额来自主题边框。
- 仅修改维护插件CSS，以当前可见插件页与虚拟itemsContainer限定body级弹层；排除全屏模式。没有修改共享actionsheet、选择控件、选项provider、选择值、事件、路由或播放链。隐藏合成100项通过，新增有效上限、离开插件页、普通菜单及全屏菜单的实际计算尺寸边界；定向32/32通过。
- Task Risk/Uncertainty与Cross-module Scope为Tier 1，Playback/Session Impact为NONE；主线程沿用当前运行配置，局部CSS与验收任务无需架构委派。真实非读取请求及UI/Command计数均0，后台结果不代替前台验收。准确提交、源码绑定构建、不同窗口复验及独立客户端交付由本轮私有回执固定。

## 2026-10-14 选择控件垂直几何修正

- 用户反馈选择值落到控件下方与说明重叠。真实神医元数据页及隐藏合成均有RED；旧native selectedName/arrow用隐藏占位行估计标签高度，空标签及换行会失准。
- display只给选择控件父层添加专属类，插件CSS将标签、输入、说明和覆盖层分配网格行；移除覆盖层的隐藏占位，不移动节点、不改选择值/provider/事件或共享vendor CSS。
- 隐藏Electron实际DOM检查选中值、箭头在输入边界内，空标签、180px长标签及原字段/命令契约继续通过，共96项；定向40/40。真实14个控件补齐几何与说明重叠门禁，并在正常、窄窗口、125%缩放对照。
- 保留此前整套证据身份，不将旧水平溢出PASS称为垂直布局PASS；新源码绑定产物以交付回执为准。没有前台自动操作、业务保存、推送、发布或安装。

## 2026-10-13 三插件显示整体收口

- 按用户要求集中对照全部14个GenericUI页、Backup主页与两对话框，以及6个邻接传统页面；真实网页与候选截图、计算样式分别核对，正常、窄窗口和125%缩放均有证据。私有值、服务端原始资源及截图不进提交或共享包。
- 窄display适配复用旧字段编辑器与原开关组件；纯文本和HTML消费者分别保持边界，状态和StandardIcon不解析任意HTML。修正父子图标归属、无标题父组说明、按钮组以及live Boolean替换后的状态Map；Boolean只读/隐藏实际RED后修正，当前隐藏合成92项通过。
- Backup真实模板声明的新关闭组件通过受控AMD别名和插件preparse加载补齐；保留epoch/signal门禁，只关闭所属dialog，不触发表单提交。隐藏动画验证通过后台绘制推进，前台动作NONE。
- 主会话接管模型容量中断后的收尾。定向测试42/42、公开787/787、材料54/54通过；GPT-6 Astra High只读生产审查无明确P1/P2。GPT-6 Luna High完成纯文本/动态来源DOM审计及关闭组件的隔离补丁，主会话核对真实diff和native行为。
- 生成器仅新增close组件加载；固定vendor输入不变，审核生成字节后同步app/viewmanager输出hash，未降低dirty generator、source/runtime provenance门禁。获授权本地提交和来源绑定构建，最终准确身份及回读结果由独立产物清单提供。
- 保留客户端宿主主题、字体与冻结核心。当前用户状态仍为DISPLAY_PARITY_NOT_ACCEPTED，后台检查不替代整体验收；没有发布、部署、安装、远端写入或业务操作。

## 2026-10-13 插件设置兼容候选

- 基线为 v0.3.1 / 080d352。主目录旧 Settings 支线及其已有改动未修改，候选使用独立 managed worktree / codex/plugin-settings-compat。
- Model Tier：Tier 2；Model：主线程用户配置，独立核心审核 GPT-5.6 Sol High，明确测试任务 GPT-6 Luna High；Reason：模块兼容与页面异步生命周期，播放/认证边界冻结；Escalated：无，未重开播放架构。
- 模型选型建议更新为 GPT-6 Luna / GPT-6.1 Sol / GPT-6 Astra，分别对应明确规格执行、跨模块实现与高风险设计/最终复核；既有完成审核保留实际型号。此前 GPT-5.6 Sol High 派发依据为原项目旧 Tier 2 推荐。
- 最终准确候选另交 GPT-6.1 Sol High 做只读审核，范围为本次源码/变换及取消、字段、通知、命令边界；这是一轮独立后续审核，不改写此前审核的型号或结果。
- 真实 frozen viewmanager 的确定性 RED 复现 controller reject 叠页及取消后迟到覆盖。受控变换增加隐藏暂存、取消/代际检查和安全失败清理；独立审核补齐普通/插件混合导航、权限/controller 前置迟到与当前页面 resume 的归属检查。router 仅添加该取消检查，原权限表达式、input/API 与播放模块保持。
- 新维护模块补齐传统两个依赖与 GenericUI 页面、页签、字段、命令、通知、Dialog/Wizard 生命周期。NAS 只读资源用于协议对照；没有复制其实现、执行 DLL、保存设置或触发命令。
- 首轮公开离线测试 741/741；后续公开集合一次运行 760 项，759 通过、1 项旧 transform 断言失败，该断言已同步并在增量集合复测通过。材料层完整适用测试 82/82，最后生成器变更再验 overlay/provenance fixture；最新插件相关增量集合 70/70。按收尾指示保留原始结果，不重复已完成矩阵或合并成一次准确候选全套绿色声明。
- 隐藏 Electron 44.4.2 合成 fixture 42 项通过，真实 AMD/字段编辑器与控件、13 组传统依赖 identity 均有机器证据，配置/命令只发往 loopback。最后取消入口先拒绝已 abort signal；子菜单显示副本安全转义，命令和确认由 canonical metadata 恢复，ItemList 动作提示补齐。真实三个插件前台结果仍待验收。
- 提交前源码绑定构建曾拒绝未提交生成器，门禁保持；该阶段实验未取得正式 package/provenance 通过证据。后续本地提交及构建结果见下方交付记录。

## 2026-10-13 最终审核两项 P2 收口

- 主会话对上一封存修订完成源码/构建差异/receipt 复核及准确公开回归 761/761；该结果保留原修订身份，不作为本次增量源码的全套回归声明。
- responseHelper 失败和取消统一拒绝清理后的 typed Error，只保留静态分类及安全 status；原 response 与 alert/module 错误不向下游传播。
- 插件导航与 GenericUI router 的错误 toast 在实际 AMD 回调执行时重新校验请求归属；新增 deferred 模块测试保留 RED 42/46、修复后 GREEN 46/46。当前有效失败提示及 signal 单独取消均有断言。
- 两项修复由主线程实现，明确 toast 测试由 GPT-6 Luna High 执行；冻结核心、依赖、认证与业务接口保持。后续证据与重新封存文件以本次 P2 报告为准。
- 收口定向 56/56，受影响 overlay/provenance fixture 6/6；隐藏 Electron 45 项通过，其中新增3项直接检查浏览器中的 typed rejection、敏感字段清理及 AbortError 静默。7个受影响脚本语法/有限凭据扫描与 diff-check 通过。旧761/761保持上一封存修订身份，未重复完整公开矩阵。

## 2026-10-13 本地提交与隔离验收交付

- 用户授权精确审核的31文件本地提交及必要状态同步、构建与后台验证。实现提交 d4440ed；仅整理7个测试文件末尾多余空行，保留代码逻辑与原换行。没有推送、PR、合并、Tag、Release、部署或系统安装。
- 提交后公开离线测试 764/764、材料层测试 130/130、隐藏 Electron 合成验证45项通过，前台动作为 NONE。旧761/761继续保留此前封存修订身份。
- 固定输入与完整工具链通过校验，源码绑定构建、2144项 payload 集合和三层 provenance 校验通过；native helper 为正常构建，testing=false。状态同步后从最终提交重新构建，准确交付身份见产物清单。
- 隔离入口在 bootstrap 前绑定 appData、userData、sessionData、temp、日志、crashDumps 与 MPV_HOME，生成新 DeviceId，不复制现用 profile 或凭据。后台探针加载实际主页面并抑制显示调用；启动 dry-run 通过。
- 明确脚本任务由 GPT-6 Luna High 执行，隔离脚本最终只读审核由 GPT-6 Astra High 完成。审核发现的状态文件链接写入、根目录父层重解析边界及 Electron ASAR 物理文件校验问题已修复；环境字典保持对象返回，避免 PowerShell 枚举破坏子进程隔离环境。
- 本验收包直接运行 Electron，不能称为 Host 或安装等价验证。HTTP(S) 护栏限定默认 Chromium session，拒绝 UI/Command 与非浏览请求（登录/能力注册除外）；不证明任意插件 GET 或其它协议都无副作用。真实三个插件视觉、播放及远控结果尚未执行。

## 2026-10-13 真实插件失败复现与修正

- 268598b 的前台三插件结果为 USER_REPORTED_FAIL，静态 fallback 提示不代表修复。旧764/764及合成45项继续保留原来源及覆盖范围。
- 初始授权登录种子与最新已关闭隔离会话的选择比较为 server MATCH、user DIFFERENT；最新副本经只读 API 验证为管理员。仅使用用户授权的登录副本，复制源文件前后哈希保持，不读取其他 profile，不输出身份、URL、凭据或配置值。
- 神医和 Madby 的真实 UI/View 均HTTP200，协议类型为 RegularPage；旧 schema 拒绝该类型，形成明确RED。维护schema仅增加该普通页面枚举并保留wire value，未知类型拒绝保持。
- 真实完整产品路由在 controller-import/view-load 阶段又复现失败。维护模块的 ../../www/modules 相对引用在 Alameda 中形成 ../www/modules 第二身份，得到未初始化的共享实例。仅将三个维护模块的共享依赖改为原 modules/... 身份，自有schema/helper仍使用相对引用；未修改共享模块、认证或播放链。
- 新增最小合成协议与真实 Alameda 身份回归，保留 RegularPage RED及三模块 identity RED。旧fake/hidden registry同步canonical身份，既有行为和安全断言保持。定向35/35、新合同6/6、公共770/770、材料130/130、隐藏45项通过；语法及有限凭据模式扫描通过。
- 工作实验只覆盖四个维护模块，完整产品其余字节保持。真实后台GREEN包括神医/Madby首载表单与各两个额外页签、Backup真实HTML/controller及BackupRestore/BackupInfo HTTP200、普通设置往返；controller和DOM均有证据，每次只有一个可见当前页。实验不冒充source-bound产物；最终提交重建与产物回执另行固定准确身份。
- 本轮风险/不确定性为Tier 2，Playback/Session影响为NONE。主线程沿用用户配置；明确测试及离线检查由GPT-6 Luna High执行，最终源码只读审核为GPT-6 Astra High，本次限定diff未发现明确P1/P2。没有扩大为架构重写。
- 新私有验收入口继续使用独立appData/userData/sessionData/temp/MPV_HOME和新DeviceId，只复制自身布置的已授权登录种子，提供Open.cmd。可分享ZIP不含登录种子或机器_state。所有机器操作均为后台，真实前台结果、Host/系统安装/播放/远控及业务命令仍未执行；没有推送、PR、合并、Tag、Release、部署或NAS业务写入。

## 2026-10-13 页签真实点击与标题修正

- 用户对ceba1fd反馈三个页面能打开，记录为PAGE_OPEN_PASS / TAB_UX_NOT_ACCEPTED；不推断保存、全部页签或视觉已通过。上一轮页签矩阵使用direct router.show，仅保留读取/渲染证据。
- 隐藏完整产品的HTMLElement.click复现RED：正文6个普通anchor，真实点击1次但tabchange/router/UI/View增量均0、目标和返回未提交；应用标题保持上一页。仅取得最小网页GenericUI模块的只读合同标识，未复制实现或私人截图。
- 维护GenericUI复用原maintabsmanager/appheader/approuter的canonical实例，原生居中按钮经tabchange送入原router；正文链接移除，沿用原胶囊与focus样式，不新增全局CSS或overlay。有效普通页面Caption同步页头；header输入转义，document.title为纯文本，Dialog/Wizard保留父页标题。
- 页签元素、异步路由恢复和标题依附controller/代际；通知只重建自己的元数据，pause/destroy不清理新owner。独立审核复现原selectedTabIndex同步派发tabchange导致失败恢复再导航，局部try/finally抑制重入，mock同步派发后原“只导航一次”断言通过。
- 工作实验真实后台点击覆盖神医5个额外页签往返10次、Madby7个往返14次，总24次HTMLElement.click、24次router、24次UI/View；每步PageId、Caption/页头、选中pill、居中及一页可见匹配，离开到普通设置时旧组已清理，业务命令及非只读HTTP为0。实验与后续来源绑定复验分别记录，不能记为前台视觉PASS。
- 定向28/28、公开773/773、材料130/130、隐藏合成45项通过；JS243文件/PS28文件语法、294个tracked文本的有限凭据扫描通过。CI diff wrapper首次缺环境参数属于harness输入错误，按既有合同与有效本地base重跑PASS；工作diff-check通过。
- Task Risk/Uncertainty为Tier 2，Playback/Session影响NONE。主线程沿用用户配置，明确测试由GPT-6 Luna High执行，最终源码只读审核由GPT-6 Astra High执行，恢复重入P2已关闭。没有修改普通设置、播放、认证、窗口、依赖或产品版本。
- 本地提交与来源绑定新产物仍采用独立路径，保留ceba客户端及授权登录副本。直接Electron入口和后台结果不代表Host、安装、真实播放或新修订视觉验收；没有推送、PR、合并、Tag、Release、部署或NAS业务写入。

## 2026-10-12

- 整理 README 与 CHANGELOG，更新 v0.3.0 下载和版本导航。
- 增加用户配置与贡献指南，分离历史内部迭代资料；原件已在仓库外逐文件校验归档。
- 保留版权、第三方通知、固定输入清单、必要技术合同和许可风险事实。Git 历史及既有发行附件保持。
- 验证结果由该文档 PR 的检查记录提供。真实播放、系统安装和完整发行重建不属于此次文档整理的验证范围。
- Release 正文及过时标题整理后，已回读确认附件和 Tag 保持；文档 PR #32 已以 Merge Commit 合并，main CI 通过。

## CD2 新资源整合与 v0.3.1

- PR #33 合入 PR #32 的真实 main，产品与已审核的 2b146ad / 4e183e9 保持；文档冲突沿用精简公开状态。
- 复核 Proto、取消、预算、单次重查、回退及 UA/header 边界；准确候选提交接受完整公开 CI 与独立复核。
- 增加首次冷资源、二次命中、Stop/Next、播放画面及 Session 的隔离验收步骤。六项真实 CD2 验收为 USER_REPORTED_PASS，工程测试与用户反馈保持各自证据边界。
- PR #32、#33 已合并，对应 main 公开 CI 成功。v0.3.1 同步产品版本、下载导航、更新说明和已知限制；运行公开离线测试、语法及凭据检查，结果以发布准备 PR 的 CI 为准。
- 正式产物从最终 main 使用原固定输入及工具链单独构建；发布身份与回读证据保存在 Release 附件及本地审计记录中。

# 0.2.7 项目维护收口

后续进度：测试版已发布，完整维护已合入main，见 [发布记录](RELEASE_027.md) 与 [主线收尾](MAIN_CLOSEOUT_027.md)。本页保留各阶段执行当时的来源与结论。

2026-10-10第二阶段已在父会话审核通过后完成本地测试包，见 [0.2.7交付](LOCAL_PACKAGE_027.md)。以下保持第一阶段READY_FOR_PARENT_REVIEW记录与当时执行计划。

日期：2026-10-10（UTC+8）。阶段一状态：**READY_FOR_PARENT_REVIEW**。

本轮继承完整维护HEAD dbee15af，审阅并保留grpc-js 1.14.6、About包内版本来源、异步校验及实际IPC观测全部前置。新产品sourceCommit为 d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0，正式runtime为 dist/ETE-0.2.7-maintenance-d8fcb0f-win-x64。最终工具提交为 0e87d4f5b85ee136d1fe3d0ab47eaac25d64ac9d，文档最终HEAD按本分支Git日志读取；它们是不同证据身份。

## 已完成与审阅范围

- 相对远端main bc50d181核对完整维护栈；包内四固定路径、有界64KiB读取/hash、整轮文件身份、in-flight-only共享、UNKNOWN恢复、动态Helper状态、可信sender及renderer迟到结果归属保持。PlaybackManager/Item/MediaSource/PlaySession、generation/取消、UA/凭据隔离、正常关闭所有权均维持原实现。src/native Git树与dbee15af相同。本轮不增加产品功能。
- 版本使用未占用的0.2.7；根package、lock两处版本与runtime/build manifest一致。observer以同源manifest/package/native记录确定版本，拒绝旧版本及缺失预期身份。夹具bootstrap前固定并读回Electron appData/userData及MPV_HOME，真实profile不参与。
- 项目S1–S5局部应用。型号集中到AI_MODEL_POLICY，按任务能力选择；旧renderer/Pepper/0.1.1段明确历史作用域；PR20已合并退出NOW；有实质变化时一次收尾；待复用证据所依赖的产品、构建和测试输入均未改变且身份已核对；决定采用委派时才进入worker流程，计入协调成本。70%/5%目标保持，不按配额牺牲质量。S6为EXCLUDED_BY_USER / KEEP_CANDIDATE。
- 原独立优先级复核事实和JSON只读融合，原阶段的候选/未提交状态保留为历史记录；About本地交付和用户正在日常使用的事实不会被回退为待实现，也不扩大真实场景PASS。

## 本轮实际验证

| 层级 | 结果 |
|---|---|
| 完整单测 | 初次650/650；夹具补充后最终651/651，0失败/取消/跳过 |
| 定向 | 版本/About/CD2等83/83；最终工具/正常关闭/IPC42/42 |
| 正式runtime | 从新sourceCommit构建；source/runtime/native/Electron、34项构建输入、精确依赖、版本及package VerifyOnly通过 |
| payload | 2,136文件；含build manifest共2,137，最终运行后路径集合/全部hash回读一致 |
| 原八组新版本矩阵 | idle、playing、stopped、miss400、hit0、hit400、hit800、direct400均PASS；自然exit0、无强清理、残留0 |
| 最终夹具读回 | 新idle及hit400各自PASS；appData/userData/MPV_HOME三个marker均true；原八组保持未记录该新增marker的边界 |
| 实际维护IPC | 初始包内Helper1.0.0/libmpv v0.41.0-920-gdd5d17d32；ready后握手字段与实时状态一致，copy同对象、实际export输入/输出匹配；查询上下文Helper spawn/Native调用均0 |
| Session与诊断 | 每个完整pipeline从原records独立配对5对身份及顺序；最终诊断129条/12准确请求关联，两类renderer位置和脱敏通过 |
| 来源材料 | 160/160实体哈希匹配，missing/mismatch0；原五项外部输入/工具链blob相同，原签名观察保留为历史证据 |

About timer是隐藏Electron main的本地样本，按原始[机器证据](evidence/maintenance-027-20261010.json)查看单次/并发及ready样本；它不能替代可见视频连续性，也不是延迟上界承诺。旧完整维护阶段首次observer错误要求持续ready而导致FAIL/强清理的原证据保持；本轮所有新run单独归属新产品。早期直接app.exit根因仍UNKNOWN。

## 外部材料与实际环境边界

[第三方有界收尾](THIRD_PARTY_MATERIALS_CLOSEOUT_027.md)记录三轮定向公开核查，无新精确材料。libmpv准确winbuild/依赖/patch/通知、Host/DLL构建关系、离线Web/字体/图像来源、三项历史MSYS2 recipe分别WAITING_EXTERNAL，所需记录/已查来源/下一步明确。本轮不宣称完整许可或对应源码可重建闭合，也未联系外部人员。

[安装与显示准备](INSTALL_DISPLAY_READINESS_027.md)完成ISS/payload/profile/DeviceId静态审查，以及干净安装、原位升级、卸载、重装四阶段与快照回滚计划。现有Sandbox/Hyper-V功能disabled，VMMS/管理命令unavailable，未确认可立即使用的隔离VM；四阶段NOT_EXECUTED。HDR/混合DPI多屏DEFERRED；全屏动态圆角沿用REPRODUCIBLE/DEFERRED准确场景，DWM仅嫌疑，不造显示补丁。系统安装、真实Emby/CD2/远控和前台可见验收未执行。

## 第二阶段执行输入

本阶段最终EXE为NOT_GENERATED。父会话独立审核通过后，从获审核产品sourceCommit与现有完整runtime生成全新Inno安装器、SHA256、provenance和中文说明，执行Inno完整性、解包全payload路径/哈希、companion/source/version回读和进程收尾，并交付独立目录。构建输入或产品变化应返回对应审核与验证；纯文档或隔离观测工具变化不重建相同产品。

package.ps1绑定执行时HEAD与产品sourceCommit，因此第二阶段在本工作树clean时临时以已审阅的d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0 detached HEAD执行package，结束返回维护分支；不得改动其它树或旧产物。也可使用同sourceCommit的专属托管打包树，准确复制并重验prepared inputs/runtime，不从旧安装包回填。最终提交、产品身份、runtime manifest及所有原始日志hash见机器证据；原始目录在本树 .work/maintenance027/ 和对应 .work/p1-runtime-*/。

公开main、v0.2.6 tag/assets与Latest保持；本轮交付范围为本地可审阅分支及审核后的测试安装包。

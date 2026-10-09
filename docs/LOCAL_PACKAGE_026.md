# 0.2.6 本地测试包

本页保留本地打包、失败定位与有界验收的阶段记录。后续用户授权的GitHub公开发布已完成，当前下载与完整发布回读见 [0.2.6发布记录](RELEASE_026.md)；最终本地结果见 [结构化交付证据](evidence/local-package-026-20261009.json)。

最终状态：**本地可安装测试包交付完成**。产品sourceCommit为
`355f4e6ba434074d1cd5c17e24cd79bad0f5eb1f`，runtime为
`dist/ETE-0.2.6-local-355f4e6-win-x64`，交付目录为
`dist/delivery-0.2.6-355f4e6/`。后续文档HEAD不替代产品身份。

安装器 `EmbyTheaterEnhanced-0.2.6-test-355f4e6-win-x64-setup.exe`，
175621807 bytes，SHA256
`bc878b4e929016071b8d7a41f9b281ad3118e62e8a1e469b0a5c9858718b1532`。
安装前退出已有客户端；Inno不自动关闭它，安装需要管理员确认。未做代码签名。

全量631/631；最后同一来源8组全部PASS、自然exit0、无强制清理和残留。
五组完整pipeline各有普通/STRM/queue A-B-C共5对Started/Stopped，原Next、
generation、精确取消与DirectUrl UA隔离均保留并由原始records复算。
安装器完整性、2136文件解包逐项一致、运行后payload检查及交付hash读回通过。
结构化来源/工具hash/运行索引与保留失败见
[local-package-026-20261009.json](evidence/local-package-026-20261009.json)。

| 最终场景 | 完整runner | 耗时 | 候选残留 |
|---|---|---:|---:|
| idle关闭 | PASS / natural exit0 | 7552ms | 0 |
| playing关闭 | PASS / natural exit0 | 8189ms | 0 |
| stopped关闭 | PASS / natural exit0 | 8054ms | 0 |
| miss400完整pipeline | PASS / normal close | 10323ms | 0 |
| hit0完整pipeline | PASS / normal close | 12699ms | 0 |
| hit400完整pipeline | PASS / normal close | 13416ms | 0 |
| hit800完整pipeline | PASS / normal close | 16328ms | 0 |
| direct400完整pipeline | PASS / normal close | 14403ms | 0 |

当前正常关闭通过不消除初版8700039及旧d480eb8的app.exit UNKNOWN。系统实际
安装/升级/卸载、真实Emby/CD2/远控、可见首帧/连续性、HDR/多屏未执行。
本轮没有推送/合并/tag/Release，原候选和失败记录保持。以下为过程与固定计划。

日期：2026-10-09（UTC+8）。从准确 `99cb8506c98793182b060a0acd523d7937dd2c32`
建立独立 `codex/local-package-026-20261009`。本轮目标是可安装的 Windows x64
本地测试包。必要本地提交、版本整理、正式构建与安装器验证均在当前授权内。

## 固定验收计划

先以只读的 `68eb024` runtime 执行一次 idle / playing / stopped 正常关闭预检。
新产物从最终已提交输入正式生成。最终 runtime 串行执行 miss400、hit0、
hit400、hit800、direct400 五组原播放矩阵，再串行执行三个正常关闭场景。
每次新建 appData、userData、MPV_HOME；使用 fake API/CD2 和本地合成媒体。
窗口 show/showInactive/focus 在隔离 harness 内阻止，产品文件保持原样。
禁止与全量测试或构建同时执行这些 runtime 验收。

正常关闭先确认准确 application renderer 和场景状态：idle 没有播放，playing
已有完整身份的 Started 且尚未 Stop，stopped 已收到完整 Stopped 且当前 item
为空。随后调用同一产品 BrowserWindow.close，沿原 window-all-closed、
before-quit、五类 IPC unregister、Native Helper shutdown、app.quit 链关闭。
fixture HTTP 只在 will-quit 后清理。observer 返回原 unregister 结果，不接管
产品 Promise、关闭决策或错误。验收独立核对清理顺序、自然 OS exit0、完整
输出与候选进程残留0；强清理或任一未知结果均不通过。

独立review后强化最终门槛：直接记录window-all-closed，并旁路观察真实
NativeHelperClient.kill原Promise完成和exited状态，任何内部child.kill强杀均
失败。app.quit调用由原main源码与实际window-all-closed/before/will/quit序列
共同支持；不包装或替换该入口。测试HTTP的记录准确称为close-requested，
资源终止另由OS自然退出确认。旧三次预检保留原工具hash，不追改成强化门槛结果。

保留每轮原始证据、工具文件 SHA256 与 product sourceCommit。outer deadline
维持120秒；失败停止该组，不重复跑到通过。只有阶段证据确认工具/产品缺陷、
局部修正后，才另记后续有界计划。历史 d480eb8 的 app.exit 返回后 OS 退出
停滞根因保持 UNKNOWN；正常关闭通过不代表历史直接退出异常解决。

## 来源与版本

远端只读核对最高测试版为 v0.2.5，Latest stable 为 v0.2.2，main 为
`46e995ef83fca7f7a882e3dc633bdcc2d2d521c7`；beta ref 不存在。本候选为0.2.6。
保留原请求快照、pending Stop报告与 Stop owner补丁；产品仅修复正常关闭的
重复destroy等待归属，见下方后续计划。

必要第三方通知与材料审计从 `05a08e9113ae1485256a505c64d7aba7d9edd67b`
按文件整合；原审计的0.2.4 / `1a05f88`身份及 JSON 保持。四份随包通知重新
绑定本次提交。研究归档未进安装器，libmpv/Host/Web/fonts 的完整源码、构建与
许可材料缺口仍保留，不将旧审计当成0.2.6重建证据。

## 验收边界

安装器完整性和解包逐文件一致性、隐藏隔离 runtime 与系统实际安装是不同
层次。此任务不执行现用客户端安装/升级/卸载，不操作真实服务器，也不发布
GitHub。真实 Emby/CD2、真实远控、可见首帧/连续性、HDR/多屏仍另列未验收。

## 失败证据与后续有界计划

初版8700039完整构建与安装器保留。直接退出矩阵miss400通过，hit0在12193ms
落盘成功、12209ms返回app.exit后，OS根进程到120秒仍存在；强清理后0残留，
完整runner FAIL。此UNKNOWN也发生在本次0.2.6，不能只归于旧d480eb8。

随后强化正常关闭idle通过；playing虽然自然exit0/残留0，但native-client-
shutdown-start之后没有完成记录，native-unregister却提前返回。产品service
destroy把“已开始”误作完成，使before-quit没有等待closed发起的首次清理。
新增缓存完整Promise，同步封住admission，异步原清理只执行一次，拒绝和原
错误短路保持。独立Sol High复核无P1/P2；相同31例修改前28/3、修改后31/31。

从新提交重建新命名runtime与installer，初版不覆盖。固定执行idle、playing、
stopped各一次，再执行miss400、hit0、hit400、hit800、direct400完整pipeline
各一次，后者走正常窗口关闭终态。原pipelinePassed、Next、generation、精确
取消与五对Session断言全部保留并独立重算。验证真实native completion和
unregister completion早于will-quit、自然OS exit0、无强制清理及零残留。
该计划不重跑直接app.exit，也不声称修复其未知根因。

最终实测结果与产物身份在下方补充。

### renderer destroy先行的后续定位

7b3a2dc全量625/625及正式runtime保留；idle通过，playing仍缺native completion，
这一轮完整FAIL未覆盖。随后仅一次调用分类观测记录caller=destroy-client，
排除了terminal callback作为本次先行kill来源。renderer endpoint的destroyClient
已经把client清空，完整service destroy仍需等待那次尚未完成的kill。

补充pendingClientDestructions集合；完整destroy同步封住admission后捕获集合，
在解绑surface前等待。原kill错误短路、controller策略和renderer endpoint语义
不变。最终同一33例以准确7b3a2dc Git blob作对照，修改前31 PASS/2 FAIL，
修改后33/33。最初测试误把已经settled的失败纳入pending contract，原32/33
日志保留，修正为先snapshot再deferred reject后重新做精确前后验证。

再次从新提交构建，使用新runtime名；最终仍严格限制为三场景关闭加五组完整
pipeline各一次。此前8700039、7b3a2dc及caller诊断的失败独立保留，不重复
app.exit实验，不由最终正常关闭PASS消除该UNKNOWN。

三份失败运行各只有一次helper-ready、一次关闭请求后的kill-start且零完成记录，
没有取到关闭前另一个client记录的情形。最终observer用WeakMap给client分配
仅本轮有效的序号，并给retire/start/complete/force事件绑定同一序号；verifier
按该身份逐对核对，不依赖第一条事件。额外回归验证旧client提前完成不影响
当前client判断，而错配或缺少当前client完成必须失败。调用栈只在内存中转成
固定caller枚举，输出不包含raw stack或私人路径。

### 最终错误路径收口

ac865c4正常关闭三场景与五组完整pipeline已全部PASS并原身份保存。该轮Stop
后关闭首次曾被verifier误判：同clientId=1在7246ms已经exited=true，7249ms
才请求关窗；修正为playing要求关闭后完成，stopped/pipeline允许关闭前已
完整退出，但所有实例仍须身份配对、will-quit前排空且无强杀。工具专项36/36。

父会话独立复核另要求补齐多实例拒绝边界：A/B均pending时A失败不得越过仍
在退出的B。current与捕获的pending统一allSettled后再传播原错误，surface
错误短路不变。最终同一35例修改前34 PASS/1 FAIL，修改后35/35；B为current
的邻近用例也保留。该错误路径补丁纳入新的最终提交，必须重建和执行同一
八组矩阵，ac865c4的PASS不替代最终来源证据。

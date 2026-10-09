# 0.2.6 本地测试包

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
保留原请求快照、pending Stop报告与 Stop owner补丁；本轮未改产品播放代码。

必要第三方通知与材料审计从 `05a08e9113ae1485256a505c64d7aba7d9edd67b`
按文件整合；原审计的0.2.4 / `1a05f88`身份及 JSON 保持。四份随包通知重新
绑定本次提交。研究归档未进安装器，libmpv/Host/Web/fonts 的完整源码、构建与
许可材料缺口仍保留，不将旧审计当成0.2.6重建证据。

## 验收边界

安装器完整性和解包逐文件一致性、隐藏隔离 runtime 与系统实际安装是不同
层次。此任务不执行现用客户端安装/升级/卸载，不操作真实服务器，也不发布
GitHub。真实 Emby/CD2、真实远控、可见首帧/连续性、HDR/多屏仍另列未验收。

实际结果与最终产物身份在构建及验收后补充。

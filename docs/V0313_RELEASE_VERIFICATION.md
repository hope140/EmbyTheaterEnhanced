# v0.3.13 发行核验

## 当前准备状态

目标为“v0.3.13 · 退出清理维护测试版”，Windows x64 Pre-release。用户反馈有限试用暂时未发现明显问题，并授权直接发布测试版。Stable/Latest 保持 v0.3.1。

F1/F2 候选 source 为 `d4f6e8baf6263235942c815d1c2fbd6a1de0728e`。该候选不是最终发行来源；PR 合并后的最终 main source、Tag、CI、runtime、安装器和附件均待固定与核验。当前没有可填写的 v0.3.13 Release ID、Tag 对象、最终 source、CI 链接或附件哈希。

## 本地候选证据

- F1/F2 相关回归：固定基线 2/19，候选 19/19。
- 公开离线测试集合：1142/1142；固定材料门禁：211/211。
- 候选 runtime 的 manifest 有 2159 个 payload 文件，含 `build-manifest.json` 共 2160 个文件；逐项清单哈希和路径核对通过。此为候选 runtime 证据，不是最终 main 安装器解包结果。
- 候选 provenance 中 Native Helper 为生产 `testing=false`，其二进制哈希保持 v0.3.12 的 `baaef0f2c4599cd48a2bfbb7bc188071dc548d57ddf3ee794fe5baeca3589494`。包内文件身份不证明 Helper 已运行或实际加载映像哈希。

## 最终发行门禁

以下项目须按合并后的准确 main source 实际完成后填写；当前均未由本记录宣称通过：

- PR 合并后的最终 main source、annotated Tag 对象与 tag peel commit。
- 最终 source 的公开 CI、固定材料测试、相关回归、语法检查及原始日志身份。
- 完整 runtime、source/runtime/native provenance、版本和完整 manifest；`VerifyOnly` 结果。
- 新编译安装器的资源版本、签名状态、大小与 SHA-256；InnoUnp 完整性检查及完整 `{app}` 解包路径/大小/SHA 对照。
- 五附件身份及其与最终 source notes/checksum/provenance 的关系；Tag CI；匿名下载的完整字节、长度和 SHA-256 回读。
- 旧 Release、附件、Tag 引用和 Stable/Latest 状态的最终只读回读。

标准安装器附件名为 `EmbyTheaterEnhanced-0.3.13-win-x64-setup.exe`，对应校验文件名为 `EmbyTheaterEnhanced-0.3.13-win-x64-setup.exe.sha256`。实际 URL、大小、哈希、Release ID 与检查链接须从最终 Release 和回读结果填写，不预先猜测。

## 功能与验收边界

F1 修正有 PID 的 Helper 子进程 `error` 事件不再冒充真实退出；实际 `exit` 才确认进程结束并结算 owner。F2 对应用关闭时的每项清理分别处理同步异常和异步拒绝，继续结算其他清理，全部结束后统一调用一次 `quit`。

整体退出期限和强退策略未变；未确认退出的 owned child 或未结算 startup 仍可能等待。有限试用反馈不是退出故障注入、完整退出矩阵或系统安装验收，也不证明修复全部挂起或安装问题。真实安装、Emby/CD2 播放、远控、Helper ready、实际 loaded-image SHA 与设备结果需各自取证，不能由 CI、包体哈希或用户有限试用反馈代替。

已知限制继续包括 STRM/115 字幕与音轨切换延迟、多显示器目标映射及完整退出显示恢复的验收边界，以及未决第三方对应源码和许可事项。具体状态以[已知问题](KNOWN_ISSUES.md)和[许可说明](LICENSING.md)为准。

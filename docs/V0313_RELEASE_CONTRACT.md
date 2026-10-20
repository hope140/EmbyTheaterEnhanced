# v0.3.13 退出清理维护测试版发行合同

## 范围与用户确认

用户反馈有限试用暂未发现明显问题，并明确授权发布 v0.3.13 Pre-release；不表示系统安装、真实播放、远控、真实 Helper 运行或设备验收通过。

本版只包含 F1/F2 两项退出清理维护：

- **F1 — 保留实际进程退出确认。** Native Helper 子进程已有 PID 时，`error` 事件只终结 transport/request，不兑现进程退出 Promise，也不移除活动进程归属；实际 `exit` 事件负责确认退出和结算。无 PID 的 spawn failure 可直接结算。
- **F2 — 结算全部退出清理。** `before-quit` 对每项清理分别包含同步异常和异步拒绝；单项失败记录固定 step 并继续处理其他项。所有清理工作结算后统一调用一次 `app.quit()`。

本轮未增加整体退出期限或强退策略。尚未确认退出的 owned child 和未结算 startup 仍会等待；不据此宣称解决全部 Electron 挂起、安装检测或退出问题。PlaybackManager、Session、Resolver、Native Helper 协议与既有进程所有权保持。

## 渠道与版本

目标为 Windows x64 Pre-release 测试版，标题为“v0.3.13 · 退出清理维护测试版”。Stable/Latest 保持 v0.3.1；测试版手动下载，内置更新检查仍读取 Stable 渠道。依赖、锁文件、Electron、libmpv 与 Native Helper 二进制版本不升级。

## 来源与构建合同

F1/F2 候选目前位于 `d4f6e8baf6263235942c815d1c2fbd6a1de0728e`，它不是最终 v0.3.13 产品来源。代码须通过 PR、审查、公开 CI 与正常合并；之后固定最终 main commit，以该 commit 重新生成版本 0.3.13 的 runtime 和安装器。不得复用 v0.3.12 安装器或把现有候选 runtime 标作最终来源。Stable/Latest、旧 Tag 和既有发行资产保持。

当前候选的既有证据仅用于说明变更已初步验证：F1/F2 回归在固定基线为 2/19、候选为 19/19；公开离线集合 1142/1142、固定材料门禁 211/211。候选 runtime 清单为 2159 个 payload 文件，含 build-manifest 共 2160 个文件；这些数值不代替最终 main 的新 CI、构建、安装器解包或公开附件核验。

## 发布门禁

最终 main 合并后，按锁定工具链运行适用的公开离线 CI、完整材料门禁、语法与回归检查，记录准确来源和原始结果。按常规流程从最终 source 构建、`VerifyOnly` 并编译安装器；检查安装器版本与签名状态，使用固定 InnoUnp 解包，核对 `{app}` 与 runtime 的路径、大小和 SHA-256。五附件为标准安装器、provenance、单文件 `.sha256`、产品 source 中的 `RELEASE_NOTES.md` 和 `SHA256SUMS.txt`。Tag 绑定最终产品 source；先核对 Tag CI 和附件身份，再公开为 Pre-release。公开后匿名完整回读五附件，核对长度、哈希及 notes/checksum/provenance 关系。

发布后同步实际发行身份到 CHANGELOG、首页、用户指南、项目状态、维护日志和发行核验；文档提交与产品 source 分开记录。不得用候选证据填充最终 source、CI、包体或附件字段。

## 验收边界

本次有限试用反馈不覆盖系统安装矩阵、真实 Emby 播放/远控、CD2 服务连接、Helper ready、实际 loaded-image SHA 或真实设备。包体哈希、ready 握手和 loaded-image SHA 是不同证据。整体退出超时与强退策略保持原状。字幕/音轨切换延迟、显示目标映射与完整退出恢复等既有问题继续按已知问题记录。第三方来源、对应源码和许可未决事项保持原意，不因发布改变。

## 回退

本合同和发行说明按独立文档提交回退；产品代码、版本元数据、Tag 和附件只依各自已授权的小范围变更处理。不要覆盖或替换 v0.3.12 Tag、附件或其他历史发行对象。

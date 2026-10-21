# v0.3.15 播放后退出修复测试版发行合同

## 范围与授权

基于已发布 0.3.14 产品 source `ce9310e1c8392af174e4bb5cd3f84e8a6ab0c867`，仅修复 Windows 任务栏媒体控制在窗口销毁后的访问和幂等清理，补回归并统一 0.3.15 版本及发行文档。不关闭媒体控制、不加全局吞异常、不升级依赖或工具链、不混入依赖拆分和 Host/Model 更新。

用户授权本地测试、正常提交、push、草稿 PR，以及修复验证后发布 0.3.15 测试版。准备到合并时另行确认，未获确认前不得合并 main；不得覆盖用户安装或旧 Tag/Release/附件。

## 版本、来源与附件

根 package、lock 两处根版本、生成 runtime package、build manifest 和安装器资源统一 `0.3.15`。标题为“v0.3.15 · 播放后退出修复测试版”，Windows x64 Pre-release，Stable/Latest 保持 v0.3.1，手动下载。

分支安装器仅用于候选验证。审查及公开 CI 通过、经确认正常合并后，固定最终 main source，重新执行门禁并从该提交构建。候选 SHA、最终产品 source 与后续文档提交分别记录，不能沿用旧包或候选结果冒充最终 main 结果。

五附件为 `EmbyTheaterEnhanced-0.3.15-win-x64-setup.exe`、对应 `.exe.provenance.json`、对应 `.exe.sha256`、最终产品 source 的 `docs/RELEASE_NOTES.md` 原始字节及 `SHA256SUMS.txt`；校验表列出前四件。

## 门禁

准确源码完成完整公开离线集合、六项材料文件和显式材料自测、JS/PowerShell 语法、有限凭据模式及 diff 检查。保留原发布源码必失败、修复通过的同断言及真实 Electron 窗口生命周期对照。

从固定 Git blob、已核验 prepared 材料与锁定工具链重建，核对来源绑定、版本、VerifyOnly、标准安装器编译及签名状态。固定 InnoUnp 解包，完整 `{app}` 与 runtime 逐路径、大小、SHA-256 一致。

新 annotated `v0.3.15` 精确绑定批准的最终产品 source。先等 Tag CI 成功、五附件身份及 source notes 原始字节核对通过，才公开 Pre-release，明确非 Latest；公开后匿名完整回读五附件，核对校验表、来源与旧对象保持。待完成项保持待完成，不用候选回执填充最终字段。

## 验收边界

独立 Electron harness 不启动 ETE Host、不读取真实配置或触发更新、不占产品端口、不操作已有进程。播放/暂停状态由受信任 IPC 注入；真实媒体、服务器、Helper、远控、系统安装与完整应用退出是独立验收层，不能由该夹具替代。

整体退出期限、强退策略和既有显示恢复等问题保持；可选 FFI 普通打包边界与第三方来源、对应源码、许可未决事项保持原意。

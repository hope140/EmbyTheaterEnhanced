# v0.3.14 菜单与首页恢复测试版发行合同

## 范围与授权

用户明确要求改为 0.3.14。功能基线固定为已合并的 `bb0c3a962389c5f6767cdb4eb44e0077790bec8a`；本轮只修改版本元数据和发行文档，不修改产品源码、UI、播放行为、依赖或固定工具链，不混入后续依赖拆分。

独立修复分支的提交、推送及发行准备已获授权；本轮不擅自合并 main、移动旧 Tag、删除或覆盖旧 Release/附件。旧临时 baseline 发布的处理单独审核，不隐去历史。

## 版本、Tag 与附件

根 package、lock 的两处根版本、生成 runtime package、build manifest 和安装器资源统一为 `0.3.14`。标题为“v0.3.14 · 菜单与首页恢复测试版”；新的 annotated Tag `v0.3.14` 指向最终批准的产品 source。

标准五附件为 `EmbyTheaterEnhanced-0.3.14-win-x64-setup.exe`、对应 `.exe.provenance.json`、对应 `.exe.sha256`、产品 source 的 `docs/RELEASE_NOTES.md` 原始字节及 `SHA256SUMS.txt`。校验表列出前四件，不添加临时工程说明或本地日志。正文按既有模板突出用户实际变化，详细校验留在核验记录。

GitHub 使用 Pre-release，Stable/Latest 保持 v0.3.1。

## 来源与发布门禁

版本准备提交通过正常审查和公开 CI，批准合入后的 main commit 才是正式产品 source。未合并分支的安装器仅用于候选验证，不冒充最终 main 产品。

准确 source 上重新执行完整本地测试、显式材料测试、语法、有限模式及 diff 检查；按固定工具链重建，核对版本、签名、来源绑定与 VerifyOnly。固定 InnoUnp 完整性和解包测试通过，完整 `{app}` 与 runtime 逐路径、大小、SHA256 一致。

公开前确认五附件 uploaded、大小与 SHA256 匹配；annotated Tag 精确解引用到最终 source，Tag CI 已完成并成功。不得在 Tag CI 尚未完成时公开草稿。网页初始正文和 RELEASE_NOTES 附件均取最终产品 source 的原始字节，新核验文档先在引用路径可读。

公开后匿名完整回读五附件，核对长度、哈希和 notes/checksum/provenance 关系；回读 Pre-release、非 Latest、准确 tag SHA 与旧发行对象保持。随后独立同步 CHANGELOG、下载导航、用户指南、项目状态、维护日志和最终核验，区分产品 source 与后续文档提交。

## 验收与材料边界

原旧包 prepared 材料仍需要，未完成材料独立化。可选 Windows FFI SMTC/DWM 试验保持原普通打包边界。本轮不安装或启动应用、不访问影音账号、不执行真实媒体、服务器或硬件操作。此前用户功能验收与本次新包的自动化实机验证分别记录，第三方来源、对应源码及许可未决事项保持原意。

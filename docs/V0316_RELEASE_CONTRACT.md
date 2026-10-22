# v0.3.16 测试版发行合同

## 范围

从 main `37ee98e4dfa154d09bec6ebdf7cdd167634b168a` 准备 0.3.16 元数据和发行文件，按正常 PR、检查及合并流程固定最终产品 source。相对已验收组合来源 `609c32e7c1107d06d3fc8aca46bc1e970337efe8`，该 main 的 24 个差异文件仅涉及文档、CI、测试及其检查工具；src、native、vendor、版本、安装器、生产构建和手动打包脚本均一致。

本版沿用该组合及 v0.3.15 退出修复。只调整版本、发行文档与 Actions 打包交付：手动布尔输入 `release_package=true` 在同一只读 Windows 作业内使用标准安装包名，额外执行全部显式材料自测并暂存五附件；默认仍生成含提交/run 身份的测试包。不自动创建 Tag 或 Release，不新增 secrets 或写权限。

不升级 libmpv 或其他依赖，不改播放器/功能逻辑、remoteaudio/remotevideo、Carnival 标记、用户配置及安全设置，不再开展依赖来源普查。

## 来源与构建

根 package 和 lock 两处根版本统一 0.3.16，生成 runtime、build manifest 和安装器版本必须与之相同。最终产品 source 必须是通过正常检查及合并后的准确 main 提交，使用 GitHub Actions `Public offline CI` 的 `manual-windows-test-package`，`release_package=true`。不复用旧包或旧 run 冒充新 source。

构建从新 checkout 的固定组件和锁定工具链恢复，libmpv 使用已入库原始归档，校验 size、SHA256 和 Git blob，再离线恢复原 DLL；禁止旧 Carnival/patch 输入，不依赖 SourceForge 临时可用性。官方 Model ZIP 和成员哈希继续按原合同核对。

## 发布门禁

- 完整公开 CI、Windows 全量测试、全部显式材料自测、JS/PowerShell 语法、有限凭据模式及 diff 检查成功；各类实际测试数按 run 记录，不作为用户新功能。
- 标准 build、VerifyOnly、安装器编译、固定 InnoUnp 完整性及完整解包 runtime 的路径/大小/SHA256 一致性通过；核对版本、来源及签名状态。
- 新 annotated `v0.3.16` 只绑定最终产品 source，等待该 Tag CI；版本已存在则停止，不移动、删除或覆盖已有对象。
- 原始 Actions artifact 保留产品 source 的 notes Git blob（2559 bytes，SHA-256 `ac2ac00eb259e36efda84dfc180a5ac71b8436312bf75574d11a98cea75a8d00`）。用户随后要求将长期未复现的音轨/字幕延迟记为已解决，批准发布前修正文档：Release 采用本次文档修正中的 notes，并只更新校验表的 notes 项。明确记录文档提交、原始/修订 notes 及校验表各自哈希，不声称修订 notes 仍是产品 source 的原始字节。安装器及两个 companion 保持；标准五附件名称和校验表列前四项、自身 SHA 单列的规则保持。
- 核对实际文件名、全字节 SHA256 与来源绑定后，才以标题 **v0.3.16 测试版** 发布 `prerelease=true`、`make_latest=false`；公开后回读五附件和全部相关字段。保留旧 v0.3.15、全部历史 Tag/附件和 Latest v0.3.1。

## 验收边界

已验收的是此前 609c32e 组合包的有限安装、浏览、播放、退出和重开登录态保持。本次云端不运行客户端或用户媒体、不做 GUI/实际播放/系统安装验收，不把之前反馈或静态解包核验移作新安装包验收。第三方通知及来源、对应源码和许可未决事项继续保留。

尚未取得的最终 source、run、Tag、附件及哈希只记为待完成；不以候选或历史回执填写。

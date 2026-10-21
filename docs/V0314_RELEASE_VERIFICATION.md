# v0.3.14 发行核验

## 发行身份

[v0.3.14 · 菜单与首页恢复测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.14) 于 `2026-10-21T12:46:07Z`（UTC）公开为 Pre-release，Release ID `419543282`。产品 sourceCommit 为 `ce9310e1c8392af174e4bb5cd3f84e8a6ab0c867`，来自正常合并的 [PR #57](https://github.com/hope140/EmbyTheaterEnhanced/pull/57)。annotated Tag 对象 `b6be8465f878e6c9e5b01705854e25fe8d3ad4ce` 解引用到该准确提交。Stable/Latest 仍为 v0.3.1。

本页为发行后记录；文档 HEAD 不替代上述产品 source，不移动 Tag 或重传附件。版本准备提交 bff8a5c 的候选包与最终 main 安装器分别保存，候选哈希不作为本次发行哈希。

## 变更与验收范围

本版包含已合并的设备菜单空态标题居中、首页启动与返回时的加载恢复，功能固定于 bb0c3a9；仅统一 0.3.14 版本和发行文档，不混入后续依赖拆分。普通打包仍依赖原固定 prepared 材料，Windows FFI SMTC/DWM 试验依赖接线未纳入正式构建。

用户已表示此前现有功能验收完成，该反馈不等于本次安装器字节的自动化实机验收。本轮未安装、升级、卸载或启动应用，未操作影音账号、真实 Emby/CD2、媒体、远控、HDR、多屏或长时硬件验收。既有[已知问题](KNOWN_ISSUES.md)和[第三方来源、对应源码与许可缺项](SOURCE_MATERIALS.md)保持。

## CI 与本地门禁

- [Main CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39599019968) 和 [Tag CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39599493595) 均绑定准确产品 source，各 1198/1198，失败/跳过/取消均 0。
- Tag CI 于 `2026-10-21T12:37:02Z` 成功，早于 Release 公开时间 `2026-10-21T12:46:07Z`，公开前已保存成功状态及附件身份。
- 最终 main 提交完整本地 npm test 1280/1280，显式材料合同 130/130，失败/跳过/取消均 0；345 份 JS、28 份 PowerShell 语法、396 份文本有限凭据模式及 diff 检查通过。有限模式不等同于完整秘密或安全审计。
- 固定 Electron 44.4.2、GCC 16.1.0 Rev5、Inno 6.7.3 身份通过，未升级依赖或工具；已有 prepared 输入重新核验，不把它描述为本轮重新取得或完整回读 Electron 原归档。

## Runtime 与安装器

从最终 source 的 Git blobs 新建 runtime 并重新编译 Native Helper，source/runtime/input/native provenance 与 VerifyOnly 通过。payload 2162 文件，含 build-manifest 共 2163 文件；固定 InnoUnp 完整性及解包检查通过，全部 `{app}` 与 runtime 路径、大小、SHA256 一致。build-manifest SHA256 为 `de8658273bb0500df6b7a8fa74f952b0692535867a1b9b054d6656977770a73f`。

相对批准 bb0c3a9 runtime，仅六份 payload 版本/来源 JSON 及 build manifest 改变，其余 2156 项 payload（包括全部 JS/CSS/HTML、Host、Native Helper、Electron、libmpv 与资产）字节保持。Native Helper SHA256 为 `baaef0f2c4599cd48a2bfbb7bc188071dc548d57ddf3ee794fe5baeca3589494`，生产 testing=false。根 package/lock、runtime package、manifest、安装器文件与产品版本统一为 0.3.14，Authenticode 为 NotSigned。

## 标准五附件与匿名全字节回读

五附件远端均 uploaded，大小/digest 与本地一致；公开后不发送 Authorization，从实际附件 URL 完整下载并核对全部字节。安装器不是抽样或仅校验远端 digest。网页初始正文及 RELEASE_NOTES 附件均等于产品 source 的 `docs/RELEASE_NOTES.md` 原始 Git blob。SHA256SUMS 列出其余四件，自身哈希在下表独立列出。

| 附件 | 字节数 | SHA256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.3.14-win-x64-setup.exe` | 175765706 | `ab2b1e935bd46e9d4694d70696bb990652ee0c9bbb5cc08e11fd253a74ce00d2` |
| `EmbyTheaterEnhanced-0.3.14-win-x64-setup.exe.provenance.json` | 3945 | `c06d21e985feb98d55d12829c231ddbb4698903597e1d06ae94b9a47ee4e15cf` |
| `EmbyTheaterEnhanced-0.3.14-win-x64-setup.exe.sha256` | 111 | `4254740560ec55c8cf31e1fe44f40b29baee8f65d7779a4507ea3be0a546e5e5` |
| `RELEASE_NOTES.md` | 2294 | `3a72b4a3e03bb4759d2660bec59b6b8c4e7eaa3a39b77ea420b874aa169d48f8` |
| `SHA256SUMS.txt` | 439 | `91be3b21722a4aff89a58d316ccd911ed7c1453a90e89bede2259abff12ca0ad` |

## 历史对象与文档身份

公开回读时核对旧 26 个 Release、100 个附件及原 54 行 Tag 引用保持，新版仅新增 annotated v0.3.14 的 Tag/解引用两行和标准五附件；Latest 仍为 v0.3.1。该时点尚未清理旧临时 baseline，分支 codex/release-0.3.14-bb0c3a9 保留。

### 后续误发对象清理

0.3.14 公开核验完成后，仅对误发的 `v0.3.13-baseline-bb0c3a9` Release（ID 419485449）及六附件执行一次删除，返回 204。随后 Release ID/Tag 查询及六附件 API 均为 404，六个旧安装包/说明下载入口也均为 404。该 Git Tag 仍指向 `bb0c3a962389c5f6767cdb4eb44e0077790bec8a`，全部 Tag 引用以及六份本地原文件的大小、SHA256 保持。

正常 v0.3.13（Release 417908398）、v0.3.14（Release 419543282）和其余历史对象的身份、正文、资产大小与哈希保持。清理后共 26 个 Release、99 个附件，Stable/Latest 仍为 v0.3.1。此项删除不改变上述发布时核验的历史事实，也不移动产品 Tag 或替换任何正常版本附件。

后续下载导航、项目状态及本页记录通过独立文档变更维护，不以文档提交 SHA 代替产品 source `ce9310e1c8392af174e4bb5cd3f84e8a6ab0c867`，不重建或替换已经公开的安装器。

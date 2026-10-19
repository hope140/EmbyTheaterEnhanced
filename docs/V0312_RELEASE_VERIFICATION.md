# v0.3.12 发行核验

## 发行身份

[v0.3.12](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.12)已公开为 Pre-release，Release ID 为 417039490。产品 sourceCommit 为 `408f74df626f23c9ad1295090548d7d95bc0525f`，annotated Tag 对象为 `fda6e8b2553ca04517f39f36e65899123eb108ae`；产品 PR #50 已合并，Stable/Latest 保持 v0.3.1。后续文档提交不替代产品来源，也不移动 Tag 或更换原附件。

## CI、材料与界面证据

- [Main CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39219163301)和[Tag CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39219191085)各 1123/1123 通过，失败与跳过均为 0，均绑定准确产品 source。产品分支和 PR CI 也各 1123/1123 通过。
- 固定材料门禁 211/211 通过，失败、取消、跳过和 todo 均为 0；原日志 SHA-256 为 `13562d7508926ad28d95ebf5b607f48f5c5dfe0b4537fe61743c3417b304bcda`。原始归档、完整 prepared 树和锁定工具链按清单核对，未升级依赖或工具。
- 用户已认可[本地验收包](V0312_LOCAL_ACCEPTANCE.md)的界面修正并授权发布。正式 runtime 的全部产品字节与该包保持，变化只涉及来源元数据；本地包与正式包各自保留准确来源和完整哈希。
- 正式包内组件/CSS 的隔离渲染覆盖明暗两主题、1280/760/680/420px 四宽度，共 48 个控件中心差为 0，标签、唯一 ID、禁用隐藏、编辑器隐藏与聚焦缩放检查通过。这不替代所有真实客户端和硬件场景。

## Runtime 与安装器

完整 runtime 为 2160 个文件，payload 为 2159 项；InnoUnp 完整性检查通过，解包 `{app}` 的 2160 项路径、大小和 SHA-256 与 runtime 逐项一致。VerifyOnly 和独立来源复核通过，build-manifest SHA-256 为 `426f78a0147d1750ee754423ace7e33e94c3fb7e827fa81cd4ddd9f733b21834`。

相对 v0.3.11，产品变化限 STRM 两份标签/布局源码、应用版本及来源元数据。Native Helper 完整字节保持，SHA-256 为 `baaef0f2c4599cd48a2bfbb7bc188071dc548d57ddf3ee794fe5baeca3589494`，生产 `testing=false`。固定 Electron 44.4.2、默认 libmpv、依赖、schema 和播放/Session 合同保持；包内 STRM 两份文件与产品提交的 Git blobs 逐字节一致。未混入临时验收脚本、profile 或个人资料。

安装器资源显示版本为 0.3.12，Authenticode 为 `NotSigned`。包内文件哈希、ready 握手和实际加载映像 SHA 分别解释。

## 五附件与公开回读

五附件的远端大小和 digest 与本地一致，发行初次正文与 RELEASE_NOTES 附件均等于产品 source 的 Git blob。匿名下载未发送 Authorization；安装器通过 21 个连续 Range 覆盖全部字节，顺序拼接后计算完整 SHA，另四件完整 GET 核对。上传成功、元数据 digest 或局部抽样不代替完整回读。

| 附件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.3.12-win-x64-setup.exe` | 175744489 | `7318242c49044d7dd54524a07aaf2dd399ef401c6f37df9696a6d1f6010eeaa7` |
| `EmbyTheaterEnhanced-0.3.12-win-x64-setup.exe.provenance.json` | 2156 | `53179ccf90b4da5e6ab5de2da3aeb051ab257f3923b86f0170edaacf9bd0c104` |
| `EmbyTheaterEnhanced-0.3.12-win-x64-setup.exe.sha256` | 111 | `e3dbd58f417a458aad001ed2c72bc6c7e349bb5e379cfc4b8356d082bec438c9` |
| `RELEASE_NOTES.md` | 1909 | `11d619713fc98bd0737cabe91b0d10abf351582fc7f92bf3735dcb0d090b7da1` |
| `SHA256SUMS.txt` | 439 | `012ba17df0cd6c9752b932d1ba43f2402f80fa147ce16a41d7f77fb7ae23807f` |

旧 23 个 Release、84 个附件及 49 行 Tag 引用逐项读回保持；Latest 仍为 v0.3.1。SHA256SUMS 列出其余四件附件；其自身 SHA 在表中单独记录。

## 验收边界

用户确认限本地包的界面修正。本轮未代用户执行系统安装矩阵、真实 Emby 播放/远控、CD2 服务连接或设备验收；这些层次没有新增通过结论。Helper ready 和实际加载映像 SHA 保持 NOT_EXECUTED/UNKNOWN。许可及对应源码未决事项按[许可说明](LICENSING.md)保持。

下载导航与后续文档提交由对应 PR 和 Checks 记录；最终远端 main 的文档 HEAD 与上述产品 source 分开。

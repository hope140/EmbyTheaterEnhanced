# v0.3.10 发行核验

## 发行身份

v0.3.10 已作为 GitHub Pre-release 公开，Release 416257802，产品 Tag `v0.3.10` 指向准确产品 source `73a5379983e2be2a2bc0bdc8aec8f0fcb5f07d63`，annotated tag object 为 `00e9b47f2b48c6784dd4ffa6635f5b4b3e3c6c85`。本次产品来源与文档后续提交分开记录；本报告不把尚未产生的文档 HEAD 写成自身来源。Stable 与 Latest 仍为 v0.3.1，Release 使用 Pre-release 渠道。

Release：[v0.3.10](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.10)。初次 Release 正文与 source `docs/RELEASE_NOTES.md` Git blob 字节一致；公开 `RELEASE_NOTES.md` 附件的全字节匿名下载 SHA 与该 blob 及 `PACKAGE_RESULT.json` 一致。

## CI 与固定材料

- Tag CI：[run 39101070181](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39101070181)，source `73a5379983e2be2a2bc0bdc8aec8f0fcb5f07d63`，1119/1119 通过，fail/cancelled/skipped 均为 0。
- Main CI：[run 39099388720](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39099388720)，source `73a5379983e2be2a2bc0bdc8aec8f0fcb5f07d63`，1119/1119 通过，fail/cancelled/skipped 均为 0。
- 固定材料：210/210 通过，fail/cancelled/skipped 均为 0；原始日志 SHA-256 `c0aad4ad6ca06e6ebbbd6b60c7173c2db96555368d6c54e871a65f7b99d9904a`。复制记录 JSON 与 PowerShell TSV 汇总曾出现口径差异，按保留的原始记录及材料根复核结果记录，不改写旧记录。

固定物理输入只读复制到新树并完整重哈希。Electron 按固定 prepared 完整树 73 文件核验，本轮未重新取得 Electron ZIP 归档；公开仓库仍需外部构建输入。

## Runtime、Native 与安装器

- 完整 runtime 为 2160 个文件，其中 payload 2159 个；安装器解包的 `{app}` 完整集合为 2160 个文件，与 runtime 的路径、大小和 SHA 集合逐项一致。
- 普通 Git source 109 个；Native C++ 单独核对：`native/mpv-helper/ete-mpv-helper.cpp`，Git blob `9cf5fc1d795cce1ea15fc7b8bf0dfebcb092cae0`，SHA-256 `8b0c79588390cc735639e4ea26beb9f0e10719c3ab52a14520cbb96d25966de3`。生产 Helper `electronapp/native-helper/ete-mpv-helper.exe` 为 3339824 bytes，SHA-256 `baaef0f2c4599cd48a2bfbb7bc188071dc548d57ddf3ee794fe5baeca3589494`，`testing=false`。Native 与普通 Git source 分层计数。
- 固定构建输入 51 项、Notice 4 项；完整工具链、Electron 与默认 libmpv 按本次 source 及 runtime 收据核对。许可状态仍按[许可说明](LICENSING.md)中的未决项保留。
- 安装器 PE 数值版本为 `0.3.10.0`；资源中的原始版本字符串有尾部空格，展示字段归一化为 `0.3.10`，不将它描述成原始字符串值。Authenticode 状态为 `NotSigned`。
- Core audit 首次观察器失败原件保留；失败来自观察器对 LICENSE 输入字节及 PE 展示值的断言。修正观察器后 core-run-02 七项通过；产品 source、材料和产品包未因此重打或重跑。

## 公开附件匿名全字节回读

五项公开附件均从匿名端点完成全字节读取、独立保存并按长度与 SHA-256 对照包体收据。四个 sidecar/notes 附件使用完整 GET；安装器使用 21 个连续 Range，覆盖 175752088 bytes，顺序拼接后独立复算完整长度和 SHA-256。

匿名下载原回执及全部字节保留。后置汇总曾覆盖已完成的元数据检查字段，现已从同次保存的 API 原件补齐独立回执；没有重新下载附件。

- `EmbyTheaterEnhanced-0.3.10-win-x64-setup.exe`：175752088 bytes，SHA-256 `eeb8ad3f09afaf5632891548f04427160bd541c2aa89ac433154db25b1475064`；匿名连续 Range 全字节独立保存与复算通过。
- `EmbyTheaterEnhanced-0.3.10-win-x64-setup.exe.provenance.json`：2156 bytes，SHA-256 `c17885118fa29bb33878452de09975245bf3ce8b62a2957fe926b5a09a91c70e`；匿名完整 GET独立保存与复算通过。
- `EmbyTheaterEnhanced-0.3.10-win-x64-setup.exe.sha256`：111 bytes，SHA-256 `7074eec2ae8633fef6a117f7027f48f1eed563acb89b0bec706fa91083664a2d`；匿名完整 GET独立保存与复算通过。
- `RELEASE_NOTES.md`：1830 bytes，SHA-256 `8fe5f1253d2efb2f24ae0bd5b70748d190e2c824a084cab0ed8b6d0effa88944`；匿名完整 GET独立保存与复算通过。
- `SHA256SUMS.txt`：439 bytes，SHA-256 `f073a82e5e3b1c8dbe98c158c55b300d6f310a985a4c986b17cd3f3701822244`；匿名完整 GET独立保存与复算通过。

历史回读确认 21 个旧 Release、74 个旧附件和 45 行旧 Tag 引用 保持，Latest 仍为 v0.3.1。

## 验收边界

本次未执行系统安装、前台窗口操作、真实 Helper ready、加载映像 SHA、真实播放/远控或服务器/设备验收；这些项目保持 `NOT_EXECUTED` / `UNKNOWN`。发布、包体、解包和匿名下载证据不替代这些运行验收。

文档同步发生在产品 Tag/source 之后，后续文档 HEAD 单独由 Git 记录。文档提交的 Checks 以该提交的 GitHub Checks 和私有最终收据为准；此处不预报尚未产生的最终文档 CI 结果。

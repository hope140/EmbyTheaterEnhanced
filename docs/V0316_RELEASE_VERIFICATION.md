# v0.3.16 发行核验

## 产品 source、文档与 Tag

产品 source 固定为 `6fee412ad68934d0194303916cfe346e6254a228`，由 [PR #66](https://github.com/hope140/EmbyTheaterEnhanced/pull/66) 正常合并。annotated `v0.3.16` 对象为 `0d3e8f2cac03863189e1c59e66fff510322345e0`，准确解引用到该产品 source；[Tag CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39744283506) 另按实际终态核对。

准备基线为 `37ee98e4dfa154d09bec6ebdf7cdd167634b168a`，相对已验收组合 `609c32e7c1107d06d3fc8aca46bc1e970337efe8` 的 24 个差异文件仅涉及文档、CI 和测试。本次产品版本准备保持 src/native、固定 vendor、生产 build/package 和 libmpv 字节；本页及问题状态修正属于后续文档，不能替代产品 source。

本页记录发布前的产物与文档核验；Release 网页公开、五附件上传和公开回读须另按实际对象记录，不把预发布准备等同于已经上线。测试版标题准确为 **v0.3.16 测试版**，Pre-release、非 Latest，正式版/Latest 保持 v0.3.1，保留既有 v0.3.15。

## CI、标准构建与包体

[分支 CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39732184934)、[PR CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39732227513) 和[产品 main CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39734232900) 均为 1355/1355，失败、跳过和取消均为 0，后续语法、有限凭据模式和 diff 门禁通过。

[Windows Actions run 39737710070](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39737710070) 在标准 `windows-2025` 上以准确 source 和 `release_package=true` 完成。全量 1439/1439、显式材料 131/131，失败、跳过、取消均为 0；384 JS、33 PowerShell 语法及有限凭据模式门禁通过。标准 build、VerifyOnly、安装器编译、固定 InnoUnp 完整性及完整解包对照均通过。

VerifyOnly 为 2169 个 payload 文件；`installer-verification.json` 记录 source 为 6fee412、status 为 passed，完整 runtime 为 2170 文件，包括 build-manifest。完整文件集合、大小和逐文件 SHA256 由该准确 run 对照。独立下载回执确认 ZIP CRC、准确 13 文件集合及原 SHA256SUMS 全部匹配；该回执与构建执行记录分别保留。

## 原始 artifact 与固定输入

[原始 Actions artifact](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39737710070/artifacts/12409385654) ID 为 `12409385654`，176336463 bytes，SHA-256 `dfd28f95f948170116def1435d224c6ccc98d81c9f23a5db9bbfdebdfc927e5e`。其 13 文件由五个发行文件和八份辅助报告组成；原始 ZIP 不覆盖、不重打包。

八份辅助报告为 build-manifest、build-input-provenance、source-provenance、runtime-provenance、native-helper-provenance、installer-verification、libmpv-repository-input 和 test-build-summary（均为 `.json`）。报告供版本、源码、runtime、工具链和输入关系核对，不全部上传为 Release 附件。

libmpv 仍为仓库内固定原始 7z：31173907 bytes，归档 SHA-256 `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`，Git blob `1f945d92afe773b73ee2091ca481b9d25c7b25a9`。原 DLL SHA-256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，版本保持；生产恢复使用仓库归档，不依赖 SourceForge 临时可用性。官方 Windows 3.0.20 ZIP 和 Model 成员继续使用原固定输入，未更改依赖、remoteaudio/remotevideo 或 Carnival 标记。

## 发布前 notes 修订与五附件

安装器 `EmbyTheaterEnhanced-0.3.16-win-x64-setup.exe` 为 175779298 bytes，SHA-256 `2a7d6a787c50faa0224cb5a2e0b00902dac1da7b1dba315cacb3a9176b57a210`。安装器及其 `.exe.provenance.json`、`.exe.sha256` 两个 companion 保留已核验的原始字节，不重编译、不改 source 绑定。

原 artifact 的 `RELEASE_NOTES.md` 为产品 source 的 Git blob：2559 bytes、SHA-256 `ac2ac00eb259e36efda84dfc180a5ac71b8436312bf75574d11a98cea75a8d00`。用户随后明确将长期未再出现的音轨/字幕切换延迟记为已解决，并批准发布前文档修正。本次采用修订后的 notes：2595 bytes、SHA-256 `008b8764c6a53ebe8210813e7a13abcfd6a6412844138e4d97b86cbeb5d3150d`；其来源是本次独立文档修正，不声称仍等于产品 source 的原始 notes。原 artifact、旧 notes 和原校验表保留供追溯。

标准五附件仍为安装器、其 `.exe.provenance.json`、`.exe.sha256`、修订 `RELEASE_NOTES.md` 和修订 `SHA256SUMS.txt`。修订校验表保留前三件的原哈希，仅替换 notes 项，表自身 SHA256 单独核对；最终上传前须使用修订文件完整复算并确认实际附件集合，不混用原/新校验表。

## 实际验收范围

本次完成云端自动化、标准构建、包体静态比较及独立下载校验，没有运行最终客户端或访问用户媒体，没有追加新 0.3.16 安装器 GUI、实际播放、真实服务器或系统安装矩阵验收。此前 609c32e 组合包的有限安装、浏览、播放、退出和重开登录态保持反馈不移作新安装包验收。

音轨、字幕切换延迟按长期未再出现的使用反馈记为已解决；这次只修正文档状态，未追加性能修复代码。整体退出期限、强退策略、显示恢复及其它硬件缺口保持；第三方 notices、来源、对应源码和许可未决事项保持，SHA256 校验不等于数字签名或许可认证。

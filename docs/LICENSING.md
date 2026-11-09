# 许可与公开范围

## 历史源码版本与风险接受记录

v0.3.0 正式发布对应源码为 `sourceCommit=20e42511b54989550165511a7604aa1b73519ff2`。该版本是在维护者接受仍未解决的许可证与第三方材料风险后发布；风险接受不构成法律合规认证、第三方授权或对未知事项的确认。

## 项目许可

本仓库维护层按 **GPL-2.0-only** 发布，完整条款见根目录 [`LICENSE`](../LICENSE)。参考的 [Emby Theater Electron 3.0.21 提交](https://github.com/MediaBrowser/emby-theater-electron/tree/db0f4c814ee1e7d9b5f50010065c5cb64a20357e) 与 [Emby Theater Windows 3.0.20 提交](https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13) 提供 GPL v2 文本；已审阅的维护源码中没有发现明确的 “version 2 or any later version” 声明，因此不据此宣称 GPL-2.0-or-later。历史 Electron package 元数据中的 `MIT` 字段不能单独决定整个衍生维护工程的许可。

已纳入公开源码的上游修改及其来源标注见 [`docs/MODIFIED_UPSTREAM_FILES.md`](MODIFIED_UPSTREAM_FILES.md) 和 [`vendor/runtime-manifest.json`](../vendor/runtime-manifest.json)。第三方组件仍适用各自的许可证及通知义务，根许可证不会替代这些义务。

## 材料与来源边界

2026-11-09 的[当前来源与许可证据](https://github.com/hope140/EmbyTheaterEnhanced/blob/e843309cbfe47f3ddfd8c6df2bd0d0f288ccd1c0/docs/LICENSE_PROVENANCE_CURRENT.md)固定 main `f007802`、最新测试版 v0.4.19 与旧 v0.4.7，区分新增/改变/不变输入、官方许可依据和实际交付。重新提取的 v0.4.19 共 2232 个清单文件全部匹配，64 个明确检查的通知路径符合各自来源；此范围核对不代表所有许可义务或完整对应源码已经闭合，也不是 SignPath 已获批。

当前未决范围包括保留的 preload、部分 Web/字幕增量及图像的来源/适用条款，Model/Common 的实际发布源码关系，以及 libmpv/FFmpeg 实际链接依赖、补丁/配置、必要通知、完整对应源码和 GPL-2.0-only Helper 的具体组合。已确认的官方分发、GPL/MIT/Apache 等组件依据继续适用其明确范围；不能仅因未复现旧构建而列为无许可。

[v0.3.0 GPL 与来源履行评估](V030_PR31_GPL_RELEASE_REVIEW.md)及下列历史矩阵保留当时证据。CEC、SharpCompress、ServiceStack、私有 System.Configuration DLL、修改版思源字体和部分旧资产已退出当前包；其历史 SDK/RFN 等问题不列为当前活动补件。退役不追溯证明旧版本已满足全部义务，其他保留组件的边界仍按当前逐项证据处理。

[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) 与 [`docs/redistribution-notices/`](redistribution-notices/) 保存现有通知和版权文本。组件来源、固定版本、哈希、对应源码关系及未决义务分别见 [`构建输入审计`](BUILD_INPUT_AUDIT.md)、[`第三方材料审计`](THIRD_PARTY_MATERIALS_AUDIT.md)、[`发行材料矩阵`](V030_DISTRIBUTION_MATERIALS_FINAL.md) 与 [`源码材料索引`](SOURCE_MATERIALS.md)。

Carnival、综合补丁、完整离线 Web、部分 Host/辅助二进制及图形资产的来源、完整对应源码或适用通知仍有未确认事项。`EXACT`、`REFERENCE`、`MISSING`、`UNKNOWN` 描述的是各审计中界定的材料关系，不是合规评级。已取得上游参考源码或通知文本本身，不证明它与特定二进制完整对应，也不补足未知授权。

Git 跟踪范围不等于安装包范围。当前活动 Web、兼容资源、小组件和官方 Model 的明确选择已随仓库提供；历史完整包、移出活动树的正文、生成二进制及其它外部输入仍按各自合同处理。入库不代表准确上游版本、修改授权或完整对应源码已核实；具体计数见[仓库输入](REPOSITORY_INPUTS.md)，payload 及重建边界见 [`PACKAGING.md`](PACKAGING.md)。本页汇总现有许可依据和未决边界，不作法律合规认证。

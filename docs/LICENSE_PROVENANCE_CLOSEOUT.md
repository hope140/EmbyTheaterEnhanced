# 许可证溯源有界收尾（2026-11-09）

本轮以 `7e419402391d0eda1de2d15dbe8601bb60c3e798` 的[源码与链接线索](LICENSE_PROVENANCE_LINKAGE.md)为基线，检查尚有希望补证的官方 Host 项目、两个原生依赖配方、固定源码树和 Common 的指定路径历史，并复读项目已有构建与分析记录。[机器回执](evidence/license-provenance-closeout-20261109.json)记录 7 个新取官方文件的固定 URL、Git blob ID、SHA256，以及 10 个既有项目文件的固定身份。前三份许可证回执保持原字节。

**新增证据收紧了包引用和构建边界，但未取得原 DLL 的完整依赖/配置/链接记录、libplacebo dirty diff 或 Model/Common 的发布源码映射。本轮到此停止推测性搜索，下一次推进需要具体新来源或已有原始材料。** 不能精确重现历史构建不等于没有许可；既有官方许可证依据继续按其明确范围保留。

## 本轮新证据

### libplacebo 替代目录的 revision 不能从干净源码树推出

固定源码 [`4d82c689…` 的完整树](https://api.github.com/repos/haasn/libplacebo/git/trees/4d82c6898551068d4ae6a6b5538efcddc2c7cf64?recursive=1)未截断，其中 gitlink 为：

| 路径 | 源码树记录的 commit | 固定 builder 的独立输入 |
| --- | --- | --- |
| `3rdparty/glad` | `73db193f853e2ee079bf3ca8a64aa2eaf6459043` | [glad recipe](https://github.com/shinchiro/mpv-winbuild-cmake/blob/cd1edc11dc6887a50f705717619d879f5a93a488/packages/glad.cmake)使用 `Dav1dde/glad` 的 `glad2` 分支 |
| `3rdparty/fast_float` | `97b54ca9e75f5303507699d27c6b4f4efe4641a1` | [fast_float recipe](https://github.com/shinchiro/mpv-winbuild-cmake/blob/cd1edc11dc6887a50f705717619d879f5a93a488/packages/fast_float.cmake)使用 `fastfloat/fast_float` 的 `main` 分支 |

前阶段已核实 builder 用独立目录替换这两个子模块路径；本轮确认独立配方保存的是移动分支名。表中 gitlink 不能直接充当当时替代目录的实际 SHA，今天的分支头也不能补填历史值。仍需对应构建的解析 revision、修改和 dirty diff；本轮没有证明 dirty 仅由替换目录造成。

### 官方 Host 确认消费 3.3.10 包，未提供包生产源码映射

官方 Host 固定 [`708fadc0…` 的 csproj](https://github.com/MediaBrowser/emby-theater-windows/blob/708fadc068cbf66ced6aece4a32f3e12bb2c4e13/Emby.Theater/Emby.Theater.csproj)同时引用 Common 和 Model，HintPath 均位于 `packages/MediaBrowser.Common.3.3.10/lib/netstandard1.3/`；[packages.config](https://github.com/MediaBrowser/emby-theater-windows/blob/708fadc068cbf66ced6aece4a32f3e12bb2c4e13/Emby.Theater/packages.config)明确选择 Common 3.3.10。完整树列出的项目是 Host/RefreshRate，没有 Common/Model 编译项目。这补充官方包消费关系，不能把 Host commit 当成 DLL 源码 revision。

针对公开 Emby 固定 `a304b3cd…` 祖先中的 `MediaBrowser.Common/Updates/GithubUpdater.cs` 查询，返回两个历史版本：[2017-06-10](https://github.com/MediaBrowser/Emby/blob/f3de5bb7216ab271248fe6db3d1c81e31935c7dc/MediaBrowser.Common/Updates/GithubUpdater.cs)、[2016-11-19](https://github.com/MediaBrowser/Emby/blob/5809536066de6e97578b746e0233723f5fcf2e5d/MediaBrowser.Common/Updates/GithubUpdater.cs)。两版 `IsAsset` 均取文件名后以 `IndexOf(..., OrdinalIgnoreCase) != -1` 判断，并有精确相等回退；均未给出既有分析记录中的目标二进制 prefix-or-exact 实现。目标侧沿用[既有闭合回执](dependency-research/evidence/license-closure-20261023.json)，没有重跑 IL 比对。查询仅覆盖该祖先和路径，不能断言所有分支均无对应实现，也不能把局部差异计数当成无许可代码数量。

### 项目已有构建校验固定输入，不生成上游源码映射

[`prepare-libmpv.cjs`](../tools/prepare-libmpv.cjs)校验、解包并重命名固定 DLL；[`prepare-model-compatibility.ps1`](../tools/prepare-model-compatibility.ps1)校验、提取官方 ZIP 成员，均不编译这些组件。[Host 引用锁](../tools/windows-host-build/REFERENCES.json)固定 Common/Model 的实际 DLL 哈希，[Host 构建脚本](../tools/windows-host-build/Build-UnifiedHost.ps1)校验引用后编译 Host。重跑 Host 构建不会生成这两个引用 DLL 的发布源码映射。已有 v0.4.20 来源记录也明确 libmpv 是 `upstream-fixed-archive`，未声称保存全部原生构建输入。

## 具体可行的后续路径

| 优先路径 | 最小材料与用途 | 现有证据为什么不够 |
| --- | --- | --- |
| 保留并整理已知通知 | 前阶段固定的 libass ISC、libplacebo LGPL 文本，以及组件到交付路径的表；未来若授权调整包，再核实际 notice 成员 | 官方许可原文已存在；64 个指定路径中字面未命中是交付映射待查，不能扩大为整个包没有许可。本轮不改 runtime 通知装配 |
| 恢复项目已持有的原 job 记录（如有备份） | [旧回执](evidence/v030-mpv-unblock.json)记载 `.work/mpv-unblock/target-run-logs-auth.zip`，82,245 bytes，SHA256 `9c66d17745ef7592dad1721cf86f9edee0227f1b2950fa4e353724d2a9475ff4`。由所有者选定已有副本放到新证据目录，先核哈希，再看源码更新/构建行 | 归档及展开日志不在本隔离工作区；旧记录明确 full configure logs 为 NOT_ACQUIRED。恢复 transcript 可能细化部分 revision，不能承诺闭合所有配置或链接。不读取旧任务工作区，也不重试已拒远端请求 |
| 补原生 DLL 实际输入关系 | 原构建缓存/导出中的解析 SHA、补丁、libplacebo dirty diff、glad/fast_float 实际 SHA；FFmpeg `config.h`/`config.mak`/`config.log`，以及 `build.ninja`、链接响应文件或等效记录 | DLL 字符串和配方各有证明范围；移动分支、干净基础包及普通导入表不能还原全部静态输入。用材料回答具体配置/源码/通知范围，不把完整 SBOM 或独立授权书设为普遍许可前提 |
| 补 Model/Common 包生产关系 | 3.3.10 对应 netstandard1.3 项目/打包 revision，以及已有 Updater 局部差异来源映射；匹配 GUID 的 PDB、文档校验和或 SourceLink 可辅助 | 已有 NuGet/官方 ZIP 字节匹配、消费项目、MVID 和部分 IL 映射均不是生产源码 commit；PDB 有用但并非普遍许可条件。不再请求两条已返回 403 的符号 URL |
| 历史材料无法恢复时，由用户另行决策未来构建 | 单独确定可固定源码的组件构建范围、许可集合及行为/ABI/打包验证计划，然后再决定是否替换 | 新构建只能为未来输入建立可核关系，不能倒推证明旧 DLL；本轮未设计或执行替换，也未授权发布 |

已有 [LICENSE_DECISIONS](dependency-research/LICENSE_DECISIONS.md)及[逐符号映射回执](dependency-research/evidence/licensed-callable-mapping-20261022.json)仍可复读，不必从零重复昂贵分析。当前缺口主要是精确源码/修改/链接和通知交付映射；libass ISC、libplacebo LGPL 以及此前已固定的官方 GPL/MIT/Apache 等依据并未因这些缺口消失。本轮不作无依据的兼容或违规结论。

## 复核与停止条件

基线 `7e419402391d0eda1de2d15dbe8601bb60c3e798` 的 [CI 42600271780](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/42600271780)最终成功，Windows job 日志确认 2632 项、2627 通过、0 失败、5 跳过。此结果不移作本轮后续提交或其他发布的测试证据。本轮 5 份变更文档的 23 个新增链接目标、UTF-8/末尾换行、JSON、有限凭据模式及 patch whitespace 检查通过。

对新取 7 个原文件按 Git blob SHA-1 和 SHA256 双重核对，读取并固定 10 个项目文件，核对前三份回执未改；只做文档格式、相对链接、有限凭据模式和 patch whitespace 检查。没有重跑安装器解包、完整本地回归或产品构建；没有重试/绕过 403、联系第三方、访问旧工作区、改产品/依赖/工作流、合并或发布。具体检查及上一提交 CI 状态见本轮机器回执；CI 结果只属于其准确提交。

停止点不是“互联网已全部穷尽”，而是本轮合理的新入口已核查且未补出关键原始记录。后续仅在取得上表材料或新的具体官方来源后重开相应小项，避免重复搜索相同失败入口。

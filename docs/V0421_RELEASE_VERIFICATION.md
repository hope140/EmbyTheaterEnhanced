# v0.4.21 测试版发行核验

## 当前阶段

截至 2026-11-11，[v0.4.21 测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.21) 已公开发布，正式 Latest 仍为 v0.4.0。发行源码为 bd3b32e69b7ac6a2243ebf831ac60f58d4aff0d9，产品代码与已验收的 a83f9fa81702 一致；公开标准包和旧验收包分别记录来源与哈希。

本次 [PR #105](https://github.com/hope140/EmbyTheaterEnhanced/pull/105) 已合并，合并提交 d5f3f98766d70ead9d81fa67dc3fd4dd8bc26ca6。Tag 固定 bd3b32e；[push CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/42965234412) 和 [PR CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/42965279107) 通过，后者为临时合并快照、2683 通过／7 跳过。准确发行源码的[标准构建](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/42965291149) attempt 1 全量 2825 通过／3 跳过／0 失败，发行材料 136 通过。三项跳过为显式原生字幕隔离门禁、显式 Windows 自然退出探针及 Unix transport；不计作本次远端通过。

[发行工作流](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/42968837982) 复用该构建并核对五附件。安装器 161905570 字节，SHA-256 `c46c09ea39015e51dfa92120c5221b585def3c693b4ed165a5bbc5867fc62476`。本地下载的 Actions ZIP 摘要及解包五附件均已独立核对；公开附件身份另经发布回读核验。未安装新标准包，真实使用反馈仍属于旧验收包。

候选以已验收的 a83f9fa81702c09294dc8810e0595b2d60017561 为产品基础；初始字幕提交 f0613c6aa5cd7c57523da42eea5c5195e08fe915、EOF 传递提交 016e47168136d0fe01535baa5e8bb72f4d580986。本次后续提交仅更新文档和发布说明，产品源码不变。

标准发布流程要求目标源码已包含在 main，准确 Tag 与 package 版本一致，并使用通过校验的发行构建五附件。验收包来源没有对应发行构建 run，不能通过改名或替换 provenance 充当新发行材料。正式 Latest 保持 v0.4.0；测试版不得提升为正式版。合并、发行构建、Tag、Release 和公开资产核验结果以实际完成记录更新，不预先宣称成功。

## 已交付验收包证据

- 版本 0.4.21；sourceCommit a83f9fa81702c09294dc8810e0595b2d60017561。
- 文件 EmbyTheaterEnhanced-0.4.21-acceptance-a83f9fa81702-win-x64-setup.exe，161911044 字节。
- SHA-256 f4f53ed644e202dacd7847829506cd6032e9c57e0b9882b619aafde1d8a396f3。
- 全量 2828 项：2821 通过、7 跳过、0 失败；显式材料自测 136 通过。
- 完整源码 Host 编译及隐藏验证通过；Host 源码链独立 12 项通过。
- 固定 DLL 下完整 helper 门禁 19 项通过（含父级及 18 个子场景），打包后字幕链路 15 项通过；内嵌三轨实际文本及渲染检查通过，覆盖外挂转内嵌与代次竞争。
- 597 个 JavaScript 文件语法、53 个 PowerShell 文件语法及 694 个维护文本的有限凭据模式检查通过；不等于完整安全审查。
- 安装器解包 2236 个文件与构建 runtime 逐路径、大小、SHA-256 一致；包内原生加载自检、九项离线更新自检通过。

全量测试跳过的三项 Host 源码门禁及一项 opt-in 原生字幕门禁，随后分别由上述独立检查覆盖；两项显式托管 Windows 退出／转发门禁及一项 Unix transport 未运行。验收时没有远端 CI；后续公开 CI 不与此本地记录混用。

验收使用反馈为字幕起播不卡，本地播放及被控端 CD2 直链暂时正常，标记为 USER_REPORTED_PASS。其他稳定性仍待持续观察，不扩展为所有字幕、媒体、服务器、硬件和安装组合通过，也不代表之后新发行字节已安装验收。

## 修复范围与剩余边界

已知且唯一的内嵌身份在 native on_preloaded 阶段选中；Index=0 与外部字幕插入后的底层身份映射保留。初始回读确认已是正确轨才跳过重复操作，不确定时继续原有后置选择；播放中必要切换不受此优化替代。

EOF 变更保留明确 unexpectedEof，或当前代次已起播后的媒体终止错误分类，进入已有一次退出、禁止下一集与同集转码回退的路径。普通 EOF 已交付后不通过迟到错误再终止一次。没有新增客户端重试、keep-open 变更、EWT 协议耦合或内核读取错误补丁。

**原现场无错误 EOF 路径仍未解决。** 真实 adapter 与生成 PlaybackManager 的事件重放包含已起播、暂停恢复、未归属代次的 demux 警告、缓存 EOF 及普通 eof-reached，仍得到 hasError=false、nextAllowed=true。不能以剩余时长、单条警告或缓存 EOF 证明终止失败；原始读流根因未知。

## 公开发行记录

Release ID 441290591；Pre-release=true、draft=false，正式 Latest 保持 v0.4.0。公开下载：[安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.21/EmbyTheaterEnhanced-0.4.21-win-x64-setup.exe)、[SHA-256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.21/EmbyTheaterEnhanced-0.4.21-win-x64-setup.exe.sha256)；其余来源文件与摘要清单见 [Release 附件](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.21)。链接读取自实际 Release 资产。上方旧验收包与新标准发行包身份分别保留，发布不扩大已知 EOF 覆盖。

已运行验收包与最终标准发行包的数字版本均为 0.4.21；同版本不会触发内置更高版本更新。需要替换时手动使用已发布且校验通过的标准安装器。

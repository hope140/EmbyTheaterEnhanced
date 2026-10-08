# 统一候选集成与回归

2026-10-08（UTC+8）。本文相对路径属于 managed worktree `ete-unified-candidate-20261008`。

## 0.2.3版本收口

当前对外交付版本已统一为0.2.3，源码提交`f7505cda40c7f64e31714fbbe40eaa532926c46c`，分支`codex/release-v0.2.3-test-20261008`。安装包`dist/EmbyTheaterEnhanced-0.2.3-win-x64-setup.exe`，175,622,861 bytes，SHA256 `217f36f065fafe122f06265d703d76018bf51588409a0966fada1bd3c797f314`。已发布 [v0.2.3 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.3)，默认下载为 [0.2.3安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.3/EmbyTheaterEnhanced-0.2.3-win-x64-setup.exe)。下面cc603ba段落保留旧版本候选的原始归属。

- root package/lock三个版本字段、构建清单、打包application package、实际About接口/页面文本、安装器FileVersion/ProductVersion均为0.2.3。
- 新提交全量测试430/430通过；正式build/source/runtime/native provenance、2146 payload校验、Inno完整性及解包2147文件逐项比对通过。
- 新runtime与cc603ba旧runtime各2147文件，只有`electronapp/package.json`与四份build/source/runtime/native来源JSON变化。所有产品JS/C++、Electron、Helper、libmpv和安装器脚本保持同一字节；没有重做已通过的完整可见播放矩阵。
- 新runtime通过隔离后台Settings/diagnostics/About controller+IPC检查，About为0.2.3且sourceCommit精确匹配；本轮未新增页面截图或系统安装验收。
- 证据：`.work/v023-unit.log`、`.work/v023-build.log`、`.work/v023-package-verify.log`、`.work/v023-installer-compile.log`、`.work/v023-innounp-test.log`、`.work/v023-final-audit.json`、`.work/v023-settings-final/unified-settings-probe.json`。

旧`test-20261008-cc603ba`的tag和包继续绑定原cc603ba/0.2.2，页面顶部已标明由v0.2.3替代，不移动旧标签或改写已发布资产。0.2.3仍是测试预发布，正式Latest保持v0.2.2；全屏Previous INCONCLUSIVE与真实环境未覆盖范围继续保留。

GitHub发布于2026-10-08 22:22（UTC+8），Release ID406895582，draft=false/prerelease=true；annotated tag object为`7143e5dc633de0af6e82e07285ccae992513be29`，精确指向f7505cd。两个附件均uploaded，安装包大小/digest与上文匹配；110-byte校验文件的SHA256为`6d0533aff895800d515e3c267e2756e7bf3f743a4ff80517692bf4af6668dc6e`。独立分支已推送，main仍46e995e，Latest仍v0.2.2。大文件上传期间Release保持草稿，完成后才发布。发布回读见 `.work/v023-published.json`。

## 首次统一候选记录（cc603ba）

当前状态：`GITHUB TEST PRERELEASE PUBLISHED / CORE SYNTHETIC REGRESSION VERIFIED / LIMITATIONS RECORDED`。用户先以实体 Esc 中止桌面操作，探针已清理；随后明确授权继续，在新的 profile/窗口中补齐下述回归，并另行确认GitHub预发布。Settings、连续切集与停止均已取得同一源码候选的新证据；全屏跨编码 Previous 的连续采样仍为 INCONCLUSIVE，不将全部像素矩阵记为 PASS。

## 交付身份

- 分支：`codex/unified-candidate-20261008`。
- 产品 sourceCommit：`cc603ba59fc527e50dda5b32f849af7b50702e2f`。
- 默认下载：[Windows x64安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/test-20261008-cc603ba/EmbyTheaterEnhanced-unified-test-cc603ba-win-x64-setup.exe)，安装后通过项目既有快捷方式启动。
- 本地入口：`dist/unified-candidate/Emby.Theater.exe`。
- 本地两父 merge：Fullscreen 文档 HEAD `6be48ed`（产品 `1e86e51`，包含 `6473ecb`）与 Settings `21ef9a4`。
- 版本字段继续为 `0.2.2`，该 sourceCommit 标识本地集成候选。
- payload：2146 files；payload set SHA256 `6009e388fcab2f101348551721b6ab7885717d70e6472ed36bfee91d6462e0e6`。
- Electron：44.4.2，官方完整 runtime tree 73 files。
- production Helper SHA256：`28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`，与播放/全屏基线相同。

测试 ZIP：`dist/EmbyTheaterEnhanced-unified-test-cc603ba-win-x64.zip`，240,289,348 bytes，SHA256 `eb5934d3da9a891cd40f5dab94a7cd4d206bd0f4d28b0fd469cbff7a9ef19647`。解压后唯一启动入口为 `unified-candidate/Emby.Theater.exe`。压缩包重新打开并逐项核对2146个payload加build manifest，共2147个文件，missing/extra/hash mismatch均0；见 `.work/final-zip-audit.json`。没有系统安装。

## GitHub预发布（2026-10-08）

用户确认后，于20:18（UTC+8）发布 [test-20261008-cc603ba](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/test-20261008-cc603ba)。Release ID为406794578，`draft=false`、`prerelease=true`，未设为Latest。annotated tag `455cd068cb3f426f972afa221462d50fa42dec9b`精确指向产品源码`cc603ba`；仅推送独立候选分支与该标签。main保持`46e995e`，Latest仍为正式版`v0.2.2`。

首次发布附件为ZIP与119-byte校验文件，GitHub API回读均为uploaded；ZIP服务器SHA256与上文一致，校验文件服务器SHA256为`d73eef35c71772a08657242cd0321fee89fbb88a93ef381041fde4da2335af1a`，均匹配本地字节。发布后本机到release-assets域的TLS/EOF/timeout导致独立下载校验文件未完成；该项记为UNAVAILABLE，与已通过的上传状态、服务端digest、GitHub API标签指向校验分开。没有修改系统代理或关闭证书验证。证据见 `.work/github-prerelease-published.json` 与 `.work/github-public-download-check.json`。

### 安装包交付补齐

用户指出既有版本使用安装包交付后，恢复项目原有Inno Setup交付方式，并将安装包设为Release说明的默认下载。独立detached打包工作树精确锁定`cc603ba`，正式准备vendor/native输入后复用已验证runtime，原`tools/package.ps1`与`.iss`均未修改。

安装包 `EmbyTheaterEnhanced-unified-test-cc603ba-win-x64-setup.exe`：175,594,443 bytes，SHA256 `1412dc7e87e1f353c1985cec15c7c0882a4ac65a48c032700ab991500be4f6df`。原有AppId、默认安装目录、快捷方式和应用版本0.2.2保持。`package -VerifyOnly`、安装器命名定向测试、Inno编译、innounp完整性/解包均通过；解包`{app}`与runtime均2147文件，missing/extra/mismatch全0。主线程额外复核入口、config、main/libmpv、Helper、Electron、mpv和manifest字节一致。证据在 `.work/installer-cc603ba-audit/`。

安装包与125-byte校验文件已补至同一Pre-release，GitHub asset均uploaded，大小/digest匹配本地；校验文件SHA256为`0b99b3dd0f157df4b5d78018d89f5580fd3ab93a7f26f4368a27ad5cf0beb8e4`。当前4个附件为安装包/ZIP及各自校验文件，ZIP保留为备用。发布仍非Latest，源码tag与main不变。没有运行安装器或安装生命周期测试；安装前应退出正在运行的客户端。GitHub上传证据见 `.work/installer-github-upload.json`。

远端只读核对：main 为 `46e995e`，beta ref 未返回；latest Release 为 `v0.2.2`，tag dereference 为 `9a034e8`，open PR 为空。此处是本轮核对时状态。

## 共享源码审核

main 相对全屏候选仅加入维护 IPC、环境信息读取与退出注销；相对 Settings 仅加入已验证的窗口状态机。libmpv 相对全屏候选仅加入 About route，native presentation、stop/generation 与播放器销毁链保持。Settings 页面及 maintenance 文件与 `21ef9a4` blob 一致；native service/CPP 与 `1e86e51` 一致。apphost canonicalization、Resolver、身份与 Session 未新增差异。

三份追加型历史文档发生冲突，保留双方记录；产品源码自动合并。诊断自测参数补丁在双方已等价存在，最终只保留一份内容。入口工作区与另两个候选工作树的已有文件、未提交内容均保留。

## 自动化与构建证据

| 检查 | 本轮结果 | 证据 |
|---|---|---|
| 全量 npm test | 430/430 PASS，0 skipped | `.work/unified-unit-initial.log` |
| Settings/STRM/main/window/transition 定向 | 144/144 PASS | `.work/unified-focused-initial.log` |
| 独立核心定向复核 | 95/95 PASS；与全量集合有重叠，不相加 | 当前 merge 上的九个定向测试文件 |
| JS syntax、Git diff whitespace、冲突标记 | PASS | 共享源码和目标文档审核 |
| 正式 build、source/runtime/native provenance | PASS，绑定上述 sourceCommit | `.work/unified-build.log` |
| package VerifyOnly | PASS，2146 files | `.work/unified-package-verify.log` |

输入由 `npm ci --ignore-scripts`、`tools/prepare.ps1` 和 `tools/prepare-native-helper-inputs.ps1` 正式生成。没有替换依赖版本或手工复制旧候选的 ignored prepared 源码。

## Runtime 与可见回归

| 范围 | 本轮结果 | 证据 |
|---|---|---|
| 普通源与 STRM native fallback | Pause/Seek/Unpause/Stop、Item/Source/Session 身份与播放报告全部通过；快速夹具 `next.selected=false`，整轮保留 FAIL | `.work/unified-pipeline.log` |
| Mock CD2 HTTP | 完整 pipeline PASS，含 generation takeover/cancel | `.work/unified-cd2-hit.log` |
| Mock DirectUrl | 完整 pipeline PASS；请求 UA 匹配且未泄漏到后续源 | `.work/unified-cd2-direct.log` |
| Mock CD2 miss | 播放与 fallback/身份通过；同一个 `next.selected=false`，整轮保留 FAIL | `.work/unified-cd2-miss.log` |
| Stop-before-player | 四项断言 PASS：进入等待、请求结束、未调用 player play、未报告 Playing | `.work/unified-stop-before-player.log` |
| 原全屏基线同条件对照 | 原 `1e86e51` 同样只有 `next.selected=false`，其余断言向量与集成候选相同 | `.work/unified-baseline-provenance.log`、`.work/unified-baseline-pipeline.log` |
| 全屏三种拖动 | 顶边、右边、顶部拖动区操作后均保持 `0,0,2560,1440`，renderer 为 Fullscreen | `.work/fullscreen-unified-window/3-snapshot.json` 至 `5-snapshot.json` |
| 退出与普通缩放 | 首次退出精确恢复 `120,100,1000,600`；普通窗口右边缘可缩窄 | 同目录 `6-normal.json`、`7-snapshot.json` |
| 重复全屏、最小化/恢复 | 重复进入不覆盖 normal bounds；restore 后仍全屏，Normal 恢复普通交互 | 同目录 `9-fullscreen.json` 至 `13-normal.json` |
| 播放中状态切换 | initial/fullscreen/normal/restored 四阶段，各 6 次屏幕 ROI 采样，各 6 个独立 hash；均为红色视频区域 | 同目录 `15-motion-cycle-*-video.json` |
| 顶部窄区 | 截图与前 6 行 BGRA 为连续红色视频色，未见旧灰线 | 同目录 `16-capture-top-desktop-top.png`、`16-capture-top-pixels.json` |
| Stop 与退出 | Stop 后 carrier visible=false；正常关闭后该 runtime 进程数为 0 | 同目录 `17-stop.json`、`20-quit.json` |

快速夹具失败没有通过改断言或改播放逻辑消除；它与原候选同条件匹配。首次基线 adapter 的相对依赖路径错误未进入产品断言，单独保留于 `.work/unified-baseline-adapter-setup-failure.log`。之后使用字节相同的依赖完成一次有效基线对照。

150% 显示缩放下，手动拖动后瞬时宽度记录为 853 DIP，经过 OS 全屏往返规范化为 854 DIP；后续多次播放/全屏往返均稳定恢复 854×600。未将该 1 DIP 差异描述为像素完全相等。普通窗口的 `resizable/movable` 均恢复 true；独立移动输入未得到位移证据。

Settings 早期隐藏探针的失败按原样保留于 `.work/unified-settings-evidence-cc603ba-*`。探针在应用完成启动前请求canonical模块，且遗漏Alameda Promise拒绝；后续改为被动等待产品的 `appready`。动态customized built-in使用真实constructor/instanceof验证，不能要求Chromium一定反射`is`内容属性。这些修复只在 `.work` 测试脚本中，没有变更产品。

早期 `.work/unified-playback-manager` 的中止记录保留。恢复后先修复注入脚本返回函数导致structured clone失败；较早 resumed-manager 的灰色/遮挡采样仅记逻辑证据。最终 manager-visual 使用既有timeline夹具相同的测试页面样式隐藏无登录启动页，真实PlaybackManager/libmpv/Session仍未替换。

## 恢复后的最终验证

| 范围 | 结果 | 证据 |
|---|---|---|
| Settings实际controller与IPC | 12项检查通过；未保存onPause为0次Save且旧值保留，显式Save为1次，磁盘JSON和重载值一致；动态Emby input/select实例正确 | `.work/unified-settings-evidence-cc603ba-final-capture-8a0018733b2c4869bede721f84044384/unified-settings-probe.json` |
| Diagnostics/About/maintenance | 实际诊断状态、版本0.2.2、Electron44.4.2、准确sourceCommit均匹配；4个handler注册及退出注销通过 | 同上；实际package metadata wrapper只属于测试入口 |
| 窗口与全屏连续切集 | 10个Next/Previous动作正确选源、core-playing、Session identity；每次6个屏幕ROI样本均为目标红/绿视频色并持续变化 | `.work/unified-playback-manager-visual/`、`.work/final-payload-audit.json` |
| 快速Next→Stop | 900ms有界等待后无current player/item、无late embedded.play、无B Playing report、surface移除 | 同目录 `8-manager-rapid-stop-manager.json` |
| Terminal Stop | 正确Stopped报告、Session一致、surface移除且carrier隐藏；进程exit0 | 同目录 `10-manager-stop-manager.json`、`completion.json` |
| 全屏最小化关闭 | 保存normal bounds `640,336,1280,720`，没有保存显示器bounds | `.work/unified-playback-resumed-manager/profile/windowstate.json` |
| H.264 720p24/AAC ↔ H.265 1080p60/AAC，窗口 | Next/Previous各78帧、max49/52ms；black/purple/mixed均0；正确新视频及原生持帧衔接 | `.work/transition-compare-unified-codec-window-08a7a15c3c9a4752b0428dbbec5d4cdc/` |
| 同媒体全屏 | Next77帧/max43ms，OBSERVED_VIDEO_TRANSITION；Previous73帧/max107ms，INCONCLUSIVE；两向所采black/purple/mixed均0 | `.work/transition-compare-unified-codec-fullscreen-b4ef6ee8c4f84fdca5557c94dadf72af/` |
| 最终payload与ZIP复核 | 精确cc603ba来源、2146payload和2147ZIP条目通过；源码/native/tools/tests/vendor无新增tracked差异 | `.work/final-payload-audit.json`、`.work/final-zip-audit.json` |

两个codec运行的owned进程分别8/7个全部自行退出，residual和ownership mismatch/unverified均0；媒体与harness哈希运行后保持。连续采样保持原100ms门槛，不反复采样挑选通过结果。manager每动作的稀疏采样证明正确视频呈现，不用于排除极短闪烁。Settings证据属于无登录态的实际controller fragment/IPC，不冒充真实账号导航。

Settings三页截图已实际打开核对。可见STRM草稿中的Emby控件、诊断已启用/728 B，以及About版本0.2.2；截图位于最终Settings证据目录。此前即时capture曾取得DOM更新前的占位文字，最终测试截图前有界等待两次requestAnimationFrame后与DOM断言一致。此paint等待只属于测试工具。最终整个候选runtime进程盘点为0，未遗留测试窗口。

## 验收边界

Settings `21ef9a4` 的用户通过、切集 `6473ecb` 的用户所测场景基本解决，以及 `1e86e51` 顶部细条用户通过保留原归属。本轮新增自动化不能扩大那些用户反馈的媒体/显示器范围。

真实 Emby/CD2、HDR、硬件解码、多显示器、安装生命周期和真实服务器远控不在本轮合成验收结果内。

# v0.4.7 免费签名材料核对

核对日期：2026-10-31。范围是 [v0.4.7 Windows x64 测试发行](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.7)，不是更新的 main、历史 RC 或独立预载分支。本文是材料盘点和待办，不是法律意见、发行合规认证或 SignPath 接受承诺。`未知`表示证据不足，不等于已证明侵权；`固定哈希`只证明身份，不证明许可或完整对应源码。

## 发行身份与证据边界

- Tag 指向 [`5190a7020d0d00ea06776676921469736859bfbd`](https://github.com/hope140/EmbyTheaterEnhanced/tree/5190a7020d0d00ea06776676921469736859bfbd)。发布页显示预发行、安装器未签名；发行 API 和随包外置的 [provenance](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.7/EmbyTheaterEnhanced-0.4.7-win-x64-setup.exe.provenance.json) 均绑定该提交。
- 实际下载的安装器为 162,030,104 bytes，实算 SHA-256 `8157ed8b38d075bba080992933dce04d8c813729b11895745455be127b814d42`，与发行 API 和 provenance 的安装器身份一致。provenance 是发布方自述的来源记录，不是独立重建证明。
- [发行作业 41171790099](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41171790099) 成功；build job 的现场构建步骤被跳过，复用已验证构建步骤成功，不能称该发行作业现场重新构建。作业日志读取返回 HTTP 403，故本次未确认复用的原始 run 编号和其逐步结果，未换通道重试。
- 本机未找到兼容 Inno 6.7.3 的解包器，未执行安装器，也未独立回读其内部成员。下表的“构建选择/预期随包”来自精确提交的 manifest、装配合同及发行 provenance，不是本次逐项从最终安装器提取证明。尤其尚不能把仓库内已收集文本等同于本包实测交付。构建合同列有 16 个 project notice 路径（见 [`NOTICE_PATHS`](../tools/build-input-contract.cjs)）；历史文档中的 4 或 11 个入口是旧阶段。
- 本次验证：`node tools/web-snapshot-input.cjs validate .`、`node tools/model-compatibility-input.cjs validate .`、`node tools/runtime-template-input.cjs validate .`、`node tools/libmpv-input.cjs validate-archive .` 均通过。它们检查该提交的输入身份，不验证最终安装包内的内容、权利或法律组合。

## 当前构建选择与来源矩阵

| 项目／预期交付 | 来源、版本、许可与已得通知 | 未决事实和可操作补件 |
|---|---|---|
| ETE 维护层、Native Helper | 项目声明 [GPL-2.0-only](LICENSING.md)，源码为上述 tag；[Helper 源码](../native/mpv-helper/ete-mpv-helper.cpp)和构建脚本可查。 | 维护者与第三方表达的边界、依赖组合及完整对应源码安排须按实际成品审查；根 GPL 不覆盖所有外部组件。 |
| Web 基底、overlay、图像与本地化 | [清单](../vendor/web-snapshot-manifest.json)校验 713 个活动基底文件、另有 2 个历史补丁载体；最终按构建投影和维护源码/overlay 装配，不能将输入计数当成最终文件数。部分已辨 GPL/MIT 表达见 [研究结论](dependency-research/LICENSE_DECISIONS.md)。 | 精确整体上游 revision 未建立；较新 API/ConnectionManager、page、PlaybackManager、AppSettings、VTT 增量与部分图形/本地化的来源或授权仍需逐项对应。按路径和 hash 向原提供者索取来源、修改与许可记录；已确认 GPL 内容不重复要求作者授权。 |
| Web 第三方资源 | Roboto 21 个字体标记 2.137/2017、Apache-2.0；jQuery 3.6.0 slim 与 Sizzle 2.3.6 有 MIT 通知；Material Icons Round 目标字形/度量与 [Google 固定来源](https://github.com/google/material-design-icons/tree/9c7b48a33157fd849c275d05fcf93d0b981f7083)及 Apache-2.0 已建立内容关系；Mozilla vtt.js 固定 [0.13.0 源](https://github.com/mozilla/vtt.js/tree/f823de834bc23d65300e58a6d391916bc00bcb75)为 Apache-2.0。相关全文见 [第三方通知](../THIRD_PARTY_NOTICES.md)。 | Material 字体历史导出程序未知，但不能因此抹去已识别的 Google 授权；jQuery 旧压缩配方未知亦不自动构成授权缺失。VTT 后续增量/CSS 的来源及 Apache/GPL 具体组合须另审；按实际活动清单排查剩余图像与字体权利和适用通知，不沿用旧版已退役 logo、CustomCssJS 或 Anime4K 作为当前包事实。 |
| preload 桥接模板 | [`preload.js`](../tools/templates/runtime/preload.js) 为 7 行，生成后哈希 `d84006412b38a7eeeafefc9fe94af63d9f0aed3eff3c6ceb83d37aa400515575`；[模板合同](RUNTIME_TEMPLATES.md)和 manifest 标记原作者及准确来源未确定。现已在该公开 tag 的源码树中，不应沿用历史“仅本地”说法。 | 核对原提供者、最早导入记录、可适用条款和变更；源码短小或缺少声明本身不能证明有或无版权。任何替换或产品行为变化需另行决策。 |
| Host 与 RefreshRate | Host 从 [Emby Windows 固定源码 708fadc](https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13) 的 GPLv2 来源加 ETE [修改与构建合同](../native/windows-host/README.md)构建；官方 3.0.20 ZIP 固定 SHA `3bc01d288d64046483ef12a8e5a70cc31b6d8b65ed9ee1837554ab7eba797c4c`。RefreshRate 为官方保留成员，源码参考同树；[Host 投影](WINDOWS_HOST_INPUT.md)说明原 EXE/PDB 被派生产物取代。 | 对成品回读 Host、RefreshRate 和其实际依赖的版本/哈希、源与完整通知；确认源码与构建材料对收件人可取得，以及旧 AMD SDK 条款的实际适用范围。不要把官方参考树直接等同所有二进制的完整对应源码。 |
| Model | 固定 [官方 Windows 3.0.20](https://github.com/MediaBrowser/emby-theater-windows/releases/tag/3.0.20) ZIP 根成员，426,496 bytes，SHA `db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153`；仓库内固定该 DLL。 | 官方包身份可核验，但该 DLL 的准确适用许可、完整对应源码及 notice 关系未因此自动证明。向上游核实发行成员及源码/修改、条款和交付路径；查成品成员。 |
| Host 其他保留依赖 | 当前合同保留 Common、SocketHttpListener、SimpleInjector 等官方成员；Common 3.3.10 已辨部分有 [官方 GPL 源映射](https://github.com/MediaBrowser/Emby/tree/a304b3cd0a330bb34fd3606a6afb9cd3d80176e4/MediaBrowser.Common)，Socket 有组件 MIT 依据，SimpleInjector 4.0.11 的 MIT 文本见第三方通知。Newtonsoft.Json 13.0.4 为 [固定 NuGet、源码及 MIT](../vendor/host-json-manifest.json)。 | Common 的实际 Updater 等差异与对应源码交付未闭合；保留 Socket 独立 MIT 及其集成增量边界。逐个对最终包实际成员、hash、文本和源码获取方式做回读，不能仅据 ZIP 中有文件认定全部授权。 |
| Electron | [44.4.2 Windows x64 固定清单](../vendor/electron-runtime-manifest.json)，[官方发行](https://github.com/electron/electron/releases/tag/v44.4.2)，ZIP SHA `6aae435b6cd5c0eedf9fd38824bae4045ffdaecd029f0b8c8328bac3f5b71f03`；合同预期保留 Electron `LICENSE` 和 Chromium `LICENSES.chromium.html`。 | 整体是上游预编译树，Electron、Chromium 与内含依赖各有许可；从最终包核对许可证文件与树，核对可取得的上游源码及适用组件义务。没有自行重编 Electron，也无需凭此断言必须自行重编。 |
| libmpv / FFmpeg | [固定原始归档](../vendor/libmpv-input-manifest.json)为 `20260809-git-dd5d17d328`，archive SHA `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`，预期 DLL SHA `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。已知 [mpv 源](https://github.com/mpv-player/mpv/tree/dd5d17d3285a095a0f712fa9d116e22a076492de)、[FFmpeg 源](https://github.com/FFmpeg/FFmpeg/tree/2a20737f662fd3f3f5999e873b9e7c90b5efc375)和 [builder/run](https://github.com/shinchiro/mpv-winbuild-cmake/actions/runs/31285220366)，文本见 [来源索引](redistribution-notices/mpv/SOURCES.md)。 | builder 配方启用 GPL 和 version3；其缓存依赖精确版本、实际链接集合、完整 notice 和对应源码交付未闭合。GPLv3 可能与项目 GPL-2.0-only Helper 形成具体组合问题，须审查实际链接、作品范围和可用授权，不能因动态加载就判定兼容，也不能仅凭配方断言所有依赖均进入 DLL。向构建提供者取得实际依赖锁、补丁、配置、脚本和通知；选择适用的源码交付方案。 |
| npm 与 Windows 媒体控制 | [project lock](../package-lock.json) 锁定 @grpc/grpc-js 1.14.6、@grpc/proto-loader 0.8.1 及传递包；活动投影见 [合同](SCOPED_RUNTIME_PROJECTION.md)。[继承 npm](../vendor/inherited-npm-manifest.json) 29 文件、7 项包记录有各自 MIT 声明。[Windows 媒体模块](../native/windows-media/README.md)自 v0.4.3 起装配 Koffi 和 win32-x64 原生包 3.3.3，两个 MIT notice、归档 hash/SRI 和文件清单被锁定。 | 逐包核对锁文件、实际投影、许可证及 notice；确认预编译原生成员及相关源码适用条款。不要把根 package-lock 所有开发包自动视为全部随包，也不要依旧的媒体试验文档误认 Koffi 未进入正式包。 |
| 安装器和构建工具 | Inno Setup 6.7.3 的来源/校验见发行 provenance；[安装器脚本](../installer/EmbyTheaterEnhanced.iss)与[中文语言文件来源及许可](../installer/languages/SOURCE.md)在仓库。脚本包含卸载入口。 | 核对实际生成安装器内嵌的 Inno 组件和许可条件及最终通知；构建工具和随包运行时应分别列示，不能将所有构建工具当作应用内依赖。 |

旧版的 ServiceStack.Text、SharpCompress、私有 System.Configuration、CEC 及其 DPInst 由当前 [Host 投影](WINDOWS_HOST_INPUT.md)排除；它们的旧授权研究不能直接当成 v0.4.7 当前成品阻断，也不代表历史发行问题自动消失。最终安装器仍待独立回读确认排除结果。

## SignPath Foundation 对照

[公开条件](https://signpath.org/terms)区分免费 OSS 订阅与 Foundation 证书：要求所有组件使用 OSI 批准的开源许可且不进行商业双重许可，允许 System Libraries 例外；项目须已发布、持续维护并描述功能。是否涵盖某项以及未知来源可否接受，应向 Foundation 按具体事实确认。该页目前标为 draft。已发布及维护有可查证据；所有组件符合条件尚未证实。

Foundation 证书仅签项目自身、可验证从源码构建的产物；允许将未签名上游 OSS 二进制放入已签安装包，但上游 DLL 不应以本项目订阅冒充自有二进制签名。项目团队须控制仓库，成员启用 MFA，明确作者、审阅者、审批人，每次发行人工审批；首页和下载页需提供 code signing policy、角色及适用的隐私说明。首页和本版发行文本本次未发现该 policy；账户 MFA、实际团队权限和隐私行为未核实。维护者应逐项核实，不在本次改配置或对外承诺。

[GitHub 接入说明](https://docs.signpath.io/trusted-build-systems/github)要求签名前将 artifact 上传为 GitHub workflow artifact；SignPath 验证构建来源，OSS 签名前的所有 workflow jobs 应在 GitHub-hosted runner 执行。当前 workflow 有托管 runner 和 artifact，但跨 run 复用需要按实际 SignPath origin/pipeline policy 确认可接受，不能凭现有成功作业认定接入完成。先确定签名对象、Inno 安装器/自建 Host/Helper 的顺序及元数据约束；签名会改变字节，最终生成并验证对应 `.sha256`、`SHA256SUMS`、provenance 和更新元数据。不得以外部预编译 Electron、Model、libmpv 为自编产物。

Foundation 还会审查项目可验证信誉并自行决定是否接受；公开条款未给明确 star 数门槛。本盘点不预测通过率。

## 后续顺序与需要决策的事项

1. 使用受控、兼容 Inno 6.7.3 的只读提取工具，对上述已校验安装器生成路径、大小和 SHA 清单；回读 `build-manifest`、三层 provenance、16 个 project notice、Electron/Chromium 和 npm/Koffi 的实际 notice，逐项与该提交及最终成员比较。记录未取得的项，不运行安装程序。获取已验证构建 run 和相应原始证据需有正常授权；本次日志 403 已停止。
2. 按最终文件范围联系材料提供者补 Web 图像/增量及 preload 来源、Model 适用授权与源码、Common 差异，以及 libmpv 实际依赖与完整对应源码/通知。维护含明确路径/hash 的请求清单，优先复用已有明确授权与证据，避免对已确认内容重复索权。
3. 由维护者与具备相应专业能力者判断 GPL-2.0-only、GPLv3 和 Apache 组件的实际组合及交付方案；对仍无法获得证据的资源，先形成保持功能与视觉的具体方案供产品决定。此报告不授权删除、替换、重新许可或改变安全策略。
4. 只有在范围、通知、来源和组合问题有可审阅方案后，再决定是否向 SignPath 询问资格或申请，并单独设计签名流水线、签名策略和权限。没有提交申请、上传材料、配置凭据、修改发布流程或合并 main。

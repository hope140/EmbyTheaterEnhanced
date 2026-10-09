# 构建输入、来源与可再构建范围审计

日期：2026-10-09（UTC+8）。审计起点 `1abf55496e3425c1930805de54796c1fa3069504`，本地分支 `codex/build-input-audit-20261009`。本轮只修改审计工具、测试和文档，产品版本仍为 0.2.4。

导出器与测试的本地提交为 `0b44a81`；下方机器清单使用该实现、现有P1材料和本轮起点的权威输入清单。文档/证据提交独立于工具提交，均不改变产品sourceCommit。

当前证据支持“使用本机保存的固定输入组装 runtime，并从 Git 源码编译 Native Helper”。它不支持“仅克隆公开仓库即可完整构建”或“所有组件均可从对应源码逐字节重建”。下面把文件身份、来源材料、实际生成和验证层次分别记录；`CONFIRMED` 是所述事实已确认，`MISSING` 是所述材料未在审计范围内找到，`UNKNOWN` 是尚不能建立对应关系，均不是法律合规评级。

## 对象与权威记录

- 产品样本是 P1 `sourceCommit=fb10f920a39112ff72b0f82715da8345702f634b` 的 `dist/ETE-0.2.4-p1-fb10f92-win-x64/`，持有该产物的工作树与历史验证见 [P0/P1 交付](P0_P1_DELIVERY.md)。本轮没有给它换 sourceCommit 或重新打包。
- P1 到本轮起点之间，`src/`、`native/`、四份 vendor manifest、依赖声明/锁文件、正式 prepare/build/package/provenance 工具均无差异；后续审计提交不改变这些产品输入。
- 2026-10-09 只读刷新 GitHub：`main=46e995ef83fca7f7a882e3dc633bdcc2d2d521c7`，Latest 为 [v0.2.2](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2)，[v0.2.4](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.4) 为 Pre-release。已发布 v0.2.4 的产品源为 `03a2e3b9ea7f1cf786b034b0a1882b10de79a39c`；它与 P1 是不同对象。本轮未重新下载或审计已发布安装包的全部 payload。

继续使用现有三层记录，不建立第二套权威 manifest：

| 层次 | 权威记录 | 能证明的内容 |
|---|---|---|
| 外部输入与转换 | `vendor/runtime-manifest.json`、`vendor/electron-runtime-manifest.json`、`vendor/native-helper-manifest.json`、`package-lock.json`；产物 `source-provenance.json` | 指定输入的文件身份、来源说明、转换与生产依赖选择；来源说明仍需独立核实 |
| 产品源码与 runtime 关系 | `runtime-provenance.json`、`native-helper-provenance.json` | commit blob、prepared preload、overlay、header/compiler/helper 与 runtime 的关系 |
| 最终 payload | `build-manifest.json`；安装器解包回比 | 全部文件集合及哈希；不能单独证明对应源码、下载来源或许可条件 |

`vendor/toolchain-manifest.json` 是现有工具来源记录，当前 package gate 不消费它。本文和 `docs/evidence/build-input-*.json` 都是从这些材料导出的观察，不作为构建的新信任根。

[机器清单](evidence/build-input-inventory-20261009.json)记录三个归档、1009/51个vendor文件、Electron73文件、header、33包选择、40个实际包根、23个EXE/DLL和45个可见通知路径。P1 payload2149项加manifest自身共2150文件，文件集合和hash一致。报告整体`assessment=MISMATCH`来自包目录比较的20个long旧文件；`runtime.status=PASS`只表示原payload清单与实物一致，两者并不矛盾。

`vendor/README.md`保留早期双归档和“本地验收”说明；原vendor文档与输入保持只读。本节、[PACKAGING](PACKAGING.md)和当前通知文档补充Electron44/helper输入及既有二进制发行事实，早期措辞不作为当前分发状态。

## 输入与对应来源矩阵

本地可用性指审计时显式指定的归档目录及 P1 输入目录；不指裸 checkout 自带这些材料。完整 SHA256、逐文件身份和包版本由机器报告及原 manifest 给出。

| 输入 / 组件 | 用途、固定身份与生成步骤 | 对应来源和源码材料 | 本地可用性 / 已验证层次 / 缺口 |
|---|---|---|---|
| Git 维护源码 | `src/electronapp/**` 由 `copy-tracked-product-sources.cjs` 从 sourceCommit 的 regular Git blob 原字节物化；P1 scope 85 项 | 当前 Git tree、blob ID/hash；维护层声明见根 `LICENSE` | CONFIRMED：P1 runtime provenance 重新校验通过。源码覆盖、prepared、package overlay 各按自身 contract 判断，不能统称全部 checkout 文件都被 blob 锁定 |
| Canonical Web 变换 | `prepare-web-overlays.cjs` 对 `app.js` 执行 registration transform；`apiclient.js`、`toast.css` 使用补丁 replacement；`patch-playbackmanager.cjs` 生成现有请求代次 overlay | tracked generator + manifest 固定 base/payload + 输出 hash；见 [构建文档](PACKAGING.md) | CONFIRMED：三项 Web input/output 与 PlaybackManager relation 通过已有 validator。它们可从保存的输入再生成，不证明整个 Web 快照的上游来源 |
| Prepared preload | Carnival preload → `prepare-preload.cjs` → ignored `src/electronapp/preload.js` → runtime | generator 为 Git 维护文件；base 属于 Carnival | CONFIRMED：expected/prepared/runtime 均为 `83a39f2d6fe658aa81da9445bd6cc33bb16ef4b764c67cfcb7268fe141427aad`；不能以手工复制的 preload 代替生成 |
| Carnival SFX | `Emby for Windows_3.0.20_v3.0(Carnival).exe`，SHA `9d53fe71…b001`；`prepare.ps1` + `extract-carnival.cjs` 解包 1009 文件，build 从整树起步 | 用户提供归档；[历史基线审计](CARNIVAL_BASELINE.md) 的 A/B/C/D/E 分类只是与参考源码的比对 | CONFIRMED：本机归档与解包逐文件固定身份；UNKNOWN：可长期取得的公开原件、所有定制来源和完整源码集合 |
| 综合补丁 ZIP | SHA `2316cd37…3b43`，51 文件；实际选择 API client、toast、libmpv 等固定输入 | 用户提供补丁及其说明；脚本不执行补丁安装/恢复程序 | CONFIRMED：本机归档/解包可用且 hash 匹配。补丁里的字体/shader/mpv.conf 不因位于 archive 就成为新增产品默认输入；现存 Carnival 同类资产仍可能随基线复制 |
| 离线 Web / 资产 | Carnival `electronapp/www` base 761 文件，P1 runtime Web 720 文件；差异由 tracked覆盖、canonical变换、externalplayer排除解释 | 官方 Electron 参考依赖在线 Web，尚未找到与完整离线快照逐文件对应的精确公开源码/构建配方 | CONFIRMED：文件身份和转换；UNKNOWN：完整快照精确上游 revision、字体/图像/脚本逐项来源和通知条件。明文可读不等于来源闭合 |
| Windows Host | `Emby.Theater.exe` SHA `11abf75c…163e`，PE File/ProductVersion 实测 `3.0.20.0`；直接复制 Carnival | [Windows 参考提交 708fadc](https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13) | CONFIRMED：归档身份和 PE 元数据；UNKNOWN：参考源码是否精确生成该 Carnival EXE。MISSING：精确 source tree、依赖/工具链与构建记录 |
| Host 托管 DLL | MediaBrowser.Common/Model、ServiceStack.Text、SharpCompress、SimpleInjector、SocketHttpListener、System.Configuration，均来自 Carnival，逐文件 hash 在原 manifest | DLL 名称和 PE 版本只能作为检索线索；不能据同名仓库或 NuGet 包宣称已对应 | CONFIRMED：payload 和 PE 元数据；UNKNOWN：每个二进制的精确源包、构建参数及通知材料。完整列表见下节 |
| CEC / RefreshRate | 5 个 CEC EXE/DLL（含 driver installer），以及 `electronapp/libmpv/x64/RefreshRate.exe` 随 Carnival 复制 | 当前输入只有归档二进制及少量旁带文件；不从文件名推断精确源码 | CONFIRMED：固定 payload；UNKNOWN：精确对应源码/版本/构建配方与通知。携带 driver installer 不表示本轮安装或运行了驱动 |
| Electron 44.4.2 全树 | 官方 Windows x64 ZIP SHA `6aae435b…1f03`，158218669 bytes；73 文件 tree `f9f14e4f…9030`；完整替换 `x64/electron` | [固定 Release](https://github.com/electron/electron/releases/tag/v44.4.2)、manifest 中固定 ZIP/SHASUMS 链接；[固定源码树](https://github.com/electron/electron/tree/v44.4.2) | CONFIRMED：本地 archive/prepared/runtime 三层身份。LICENSE 和 LICENSES.chromium.html 在 payload。未从源码重编 Electron/Chromium/V8/Node/其依赖；本轮未启动进程，processVersions 沿用历史证据 |
| 历史 Electron 18 / Pepper | Carnival `x64/electron` 与 `mpv-win32-x64.node` 仅为 archive provenance；新 Electron 整树替换、Pepper路径排除 | 旧二进制来源关系维持历史记录 | CONFIRMED：P1 runtime 无 `.node` Pepper输入；不列为当前生产 bridge 或生产依赖，不因退役而删除原 archive |
| Native Helper 源码 / header | `native/mpv-helper/ete-mpv-helper.cpp` 从 Git blob 编译；mpv `client.h` 固定 `dd5d17d32` / SHA `1acf99ee…d353`；manifest 固定 flags | [固定 header](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/include/mpv/client.h) 与项目 C++ 源码 | CONFIRMED：本地 header、source、contract、P1 helper hash `28054c75…30dc`；helper源码编译有历史实证。本轮只重验 provenance，未重新编译 |
| Native Helper 工具链 | MSYS2 UCRT64 GCC 16.1.0 Rev5；`g++.exe` SHA `798a6eb4…4b69`；包含 static flags 与 `--no-insert-timestamp` | 本机工具链可用；manifest只固定driver本体、版本和flags | CONFIRMED：driver身份；MISSING：完整工具链归档/展开树锁定。实测还能解析到 cc1plus、collect2、as、ld、libstdc++/libgcc/MinGW/import libs、crt对象，不可由driver单文件hash代替 |
| libmpv | 补丁 `payload/libmpv/mpv-1.dll` 覆盖原 Carnival DLL；SHA `965efde4…4d0c`；历史 probe 为 `v0.41.0-920-gdd5d17d32`、API2.5、FFmpeg `N-125998-g2a20737f6` | 补丁说明指向 shinchiro `20260809` / `mpv-dev-x86_64-20260809-git-dd5d17d328.7z`；[mpv 固定源码](https://github.com/mpv-player/mpv/tree/dd5d17d3285a095a0f712fa9d116e22a076492de) 存在 | CONFIRMED：本地DLL身份、说明与历史probe；2026-10-09该release查询404且tag未查到。UNKNOWN：上游asset与DLL逐字节关系。MISSING：完整构建脚本revision、各依赖源码/patch/config/toolchain和对应通知集合 |
| npm 生产闭包 | root lock `dev !== true` 选择33包，direct为grpc-js1.14.4/proto-loader0.8.1；`copy-runtime-dependencies.cjs`复制安装目录 | `package-lock.json` 精确version/resolved/integrity；安装包源码与通知按实际文件保留 | CONFIRMED：独立 npm ci 后1142文件与P1对应文件全匹配；但P1闭包路径下有1162文件，额外20个long旧文件来自Carnival。lock integrity不是对任意已改安装目录的实时验证 |
| Carnival npm 基线 | `electronapp/node_modules` 在复制33包前已由Carnival带入；包括detect-rpi、is-linux/is-osx/is-windows、power-off、sleep-mode及其它旧包 | 原 vendor逐文件manifest；部分包package.json带版本，但无本仓库npm锁定链 | CONFIRMED：这些是最终payload的一部分，不能把33包当作全部Node内容；MISSING/UNKNOWN：未锁包与包内旧文件的独立源包验证，详见机器报告 |
| 安装器 / 构建工具 | `installer/EmbyTheaterEnhanced.iss`递归打包runtime；Inno6.7.3、InnoUnp归档identity在toolchain manifest；node-unrar-js2.0.2为dev工具 | [Inno6.7.3来源](https://github.com/jrsoftware/issrc/releases/tag/is-6_7_3)，原manifest固定安装EXE/解包器ZIP链接 | CONFIRMED：两份本机工具归档hash匹配，ISCC/innounp可用；package仅检查compiler存在，没有执行版本/hash gate。历史P1安装器2150文件回比通过。本轮未编译/安装/解包新包 |
| 构建宿主环境 | Windows PowerShell、Node/npm、Git，以及helper的Windows SDK兼容头/库环境参与生成 | 本次只读与npm核对使用Node24.18.1、npm11.17.0、Git2.55.0.windows.4；正式PS脚本约定Windows PowerShell5.1 | 可用性CONFIRMED；版本/hash/locale及完整宿主环境未被统一锁定。不是新安装要求 |

补丁`libmpv-source.txt`还声明原dev archive的SHA256为`c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`。这是说明中的asset identity，区别于最终DLL的`965e…`；本轮没有原7z或独立发布端记录验证该声明。

Node完整文件集合为1191：fresh生产闭包1142 + long旧路径20 + 其余Carnival独有29。锁文件以外的7个包根为`detect-rpi@1.4.0`、`is-linux@1.0.1`、`is-osx@1.0.2`、顶层`is-windows@1.0.2`、`power-off@1.1.2`、`sleep-mode@1.1.0`及其嵌套`is-windows@0.1.1`；逐文件与Carnival相同。嵌套文件在集合计数中去重。long20项位于已选中的long5.3.2包根，不是第8个额外包根。

## 最终二进制与通知材料

P1 runtime 含23个 `.exe/.dll/.node` 扩展名的二进制文件，`.node`数量为0。机器报告提供全部路径和hash；该扩展名清单不替代完整payload枚举（例如pak、bin、字体、图像、PDB仍在payload层）。其中Electron全树包含6个DLL及electron.exe，helper1个，libmpv1个，其余为Host/支撑DLL/CEC/RefreshRate。

| 托管 / 辅助载荷 | 本轮读取的PE FileVersion（仅元数据，不是来源证明） |
|---|---|
| MediaBrowser.Common.dll / MediaBrowser.Model.dll | 1.0.0.0 / 1.0.0.0 |
| ServiceStack.Text.dll / SharpCompress.dll | 4.5.14.0 / 0.10.3.0 |
| SimpleInjector.dll / SocketHttpListener.dll | 4.0.11.0 / 3.2.32.4 |
| System.Configuration.dll | 4.0.30319.18020 built by: FX45RTMGDR |
| cec/cec.dll | FileVersion `.0.0.0`，ProductVersion `3.0.0.0`，保留异常原值 |
| cec-client.exe / USB-CEC driver installer | 版本字段未提供，不写成0或已确认版本 |
| RefreshRate.exe | 1.0.0.0 |

已确认Electron的两份许可文件和npm中43个可见license/notice文件随包保留，共45个匹配路径。此为按文件名定位的可见材料清单，不保证识别任意命名或嵌入文本中的所有通知。P1完整文件集合中没有根项目 `LICENSE` / `THIRD_PARTY_NOTICES.md`，也未找到独立libmpv/CEC/Host对应源码与完整通知集合。这里的“未找到”指审计范围内的材料，不表示已经认定某组件违法或确定了所有义务。

上游[该mpv revision的Copyright](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/Copyright)明确说明许可模式受源码选择、构建选项及依赖影响。因此不能从`mpv-1.dll`文件名、版本字符串、header许可或单个package字段推导这个DLL的完整许可模式。旧 `THIRD_PARTY_NOTICES` 与许可文档的“excluded”现限定为Git输入本体边界；当前二进制分发事实单列，来源/对应源码缺口保持打开。

## 可再构建层次

| 命题 | 当前判断 | 支撑与边界 |
|---|---|---|
| 本机既有固定输入可构建 | 已有P1实际构建证据，本轮重验其输入/产物关系 | 产品fb10f92已有正式build/package/安装器回比；本轮只读验证既有产物，未虚构一次新build |
| 干净工作树加现有输入可构建 | 历史Phase1双worktree通过；当前材料/脚本路径已盘点，当前双build未重做 | [历史clean-room](CLEANROOM_REPRODUCIBILITY.md)不能直接升级为当前Electron44/Native Helper字节重复构建证据。除3归档/npm外还需header和完整现有GCC环境 |
| 仅公开仓库可构建 | 当前不成立 | Carnival/补丁/完整Web/预编译输入未纳入Git；其可公开获取与对应源码并未闭合。公开Electron和header可下载不能补齐其余输入 |
| Native Helper从源码可编译 | 已有P1源构建记录，本轮source/header/compiler/output关系通过 | 不能由此声称整个产品源码可构建；完整工具链固定仍缺失 |
| 相同材料组装出相同runtime字节 | 有限历史证据，当前整体未重新证明 | 旧Phase1两树和历史helper重复hash只适用记录的revision/环境。当前未锁定所有构建输入，新增sourceCommit还会改变provenance字节 |
| 安装器容器字节可复现 | 未证明 | compiler gate/完整工具链/非确定字段未闭合；安装器解包payload一致是另一个命题 |

## 有界独立检查与发现

1. 重新运行P1的source、runtime、native-helper、Electron validator，均通过；runtime产品scope85，Electron73文件。这里使用P1材料根和fb10f92，避免把当前审计HEAD冒充旧runtime的源。
2. 新审计工作树运行 `npm ci --ignore-scripts --no-audit --no-fund`，按锁文件安装34包（其中1个dev）。33个生产包1142文件与P1逐文件比较：missing=0、mismatch=0、extra=20。20个extra全部位于`long`且逐个hash等于Carnival `long@3.2.0`原文件。报告见 [npm独立对照](evidence/build-input-npm-20261009.json)。这是copy-overlay保留旧文件的事实，不据此推断播放缺陷。
3. 只读解析g++实际程序/库路径并hash：cc1plus、collect2、as、ld、libstdc++.a、libgcc.a、libmingw32.a、libuser32.a、crt2.o均存在，见 [工具链观察](evidence/build-input-toolchain-20261009.json)。这是工具链缺口的样本，不是完整closure。当前MSYS2本地包记录包括gcc/gcc-libs16.1.0-5、binutils2.46-4、crt/headers/winpthreads14.0.0.r92.g818fa6510-1；尚未验证这些包的完整原始归档及源码。
4. 正式build读取工作文件 `package.json` / `package-lock.json` 和vendor manifest。它们当前与基线一致，但不像普通产品文件从sourceCommit物化；同sourceCommit加dirty元数据可能生成不同产物。`node_modules`实际bytes也不在复制前绑定npm tarball。后续收紧需独立构建contract变更，不能把已有provenance描述成已经实现这些gate。
5. `Emby.Theater.exe.config` 的ProgramDataPath由build进行锚点替换，最终hash有payload记录，但没有独立base/generator/output relation条目。安装器compiler同样没有正式version/hash断言。本文披露这些准确限制，不将“可审计结果”扩写为“所有输入均固定”。

## 复跑与证据边界

`tools/audit-build-inputs.cjs` 是只读导出器，显式传入材料位置；仅向一个新output写报告，拒绝覆盖。manifest中的输入相对路径决定检查范围，缺失材料记为MISSING并继续其它项目。输出不包含材料根的私人绝对路径、原始日志或媒体信息。它验证的是本地文件身份，不能替代正式source/runtime validator、来源证明或许可判断。

```powershell
node tools/audit-build-inputs.cjs --repo-root . --inputs-root <材料工作树> --archive-root <三个归档所在目录> --runtime <既有P1-runtime> --output .work/build-input-observation.json
node --test tests/build-input-audit.test.cjs tests/tracked-product-sources.test.cjs tests/electron-runtime-input.test.cjs
```

同一报告的input状态、runtime payload状态、dependency file-set差异分别阅读，不能把报告成功写出当作构建通过。tarball `integrity`字段只是引用锁文件；要重复本轮fresh npm对照，应先在新目录/新工作树执行相同锁文件的 `npm ci --ignore-scripts --no-audit --no-fund`，再指明该输入目录。不要在旧工作树运行清理命令来制造“干净”输入。

本轮复用P1安装器完整性和2150/2150回比历史记录，并重算既有安装器SHA256：`d23ff3a0a7794fa66250e2cdfef7f8bc85a4bd4cab0b48d3f57cfbe5e679a84e`。未执行客户端、profile、系统安装、真实Emby/CD2、窗口/GPU或远控验收。

实际验证：新增14项工具测试与既有5项Git blob/Electron输入测试共19/19通过，包含输入缺失继续、篡改/extra、路径/链接拒绝、版本元数据隐私、大小写/通知文件名、退役目录、输出独占和缺文件计数；Node语法与diff检查通过。新工作树仅npm准备后执行导出得到`INCOMPLETE`，Carnival/补丁/Electron/header分别为MISSING，未将缺失误记为通过。主目录已有改动及P1安装包保持；原产品源码/版本/manifest/构建链无diff。

## 剩余材料与最小补齐顺序

| 优先级 | 缺口 | 最小下一步 / 完成条件 |
|---|---|---|
| 高 | 当前分发内容的通知与完整对应源码材料未闭合 | 按实际payload准备逐组件材料索引，收集Host/支撑DLL、libmpv及依赖、CEC/RefreshRate、Web/资产的精确revision/来源/许可文本/构建材料；核对根项目许可与通知的随包方案。缺项继续显式标未知，最终许可判断另行完成 |
| 高 | libmpv所称上游asset入口现不可用 | 向原提供者取得原dev archive、独立发布端hash/签名或可信发布记录，核对说明声明的archive hash，再收集winbuild脚本revision、依赖revision/patch/config/toolchain；先验证与本地DLL相等，不能用一个mpv commit代替完整对应源码 |
| 中 | Node最终文件集合包含归档继承包和long旧文件 | 固定并审阅33包之外的列表及20个旧文件用途；下一次获授权构建contract变更时选择明确保留或清理，并做新目录构建/payload对照。此次不更换依赖或旧产物 |
| 中 | helper及installer完整工具链未锁定 | 保存现有工具链精确包/归档及完整tree identity，补完整许可/源码材料；让正式gate消费它。先核对工具链来源，再做同输入的有界双build |
| 中 | build元数据与sourceCommit边界不完整 | 对package/lock/vendor元数据及config transform补明确commit/relation gate；使用dirty元数据负向测试验证fail closed，独立小范围提交 |
| 后续验证 | 当前双worktree与installer字节重复性 | 前述材料收齐后，在两个全新输出验证runtime路径/hash；另行固定Inno环境并比较容器bytes。一次build、一个SHA或历史PASS不能替代这些条件 |

来源未知不会自动触发组件替换、删除资产或撤下Release。本轮交付是清单与材料缺口；这些后续实施项仍需按各自范围决定。

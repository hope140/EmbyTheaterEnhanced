# 固定Windows Host组件

本地测试候选：完整官方 Host 输入仍为19文件/3,967,899 bytes，manifest、归档身份、恢复输入和必要声明保持；仅此候选分支的 runtime 投影省略根目录 `System.Configuration.dll`，输出18文件/3,874,699 bytes。目标固定为93,200 bytes、SHA256 `3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf`。`System.Configuration.xml` 和其余十八项不变；没有修改系统/GAC、正式安装或用户配置，也不据此宣称其它材料的许可问题已解决。

投影在 Windows Host 装配器内按精确路径/大小/hash核对，不按通配符删除。完整19文件仍全部验证，源 DLL 缺失/变更继续失败；输出中重新出现同名文件、大小写别名、目录或悬空链接都拒绝，保留现场。装配计划及 source provenance 分开记录完整来源与 runtime 数量/字节/树hash、单项 `excludedFiles`，并绑定投影生成器SHA；最终 runtime provenance 和 package VerifyOnly 复核该来源记录与排除状态。回滚应从原main重新生成完整、正确绑定的新测试包，不向已验证包手工夹回DLL后沿用旧manifest。

局部验证可运行 `node --test --test-concurrency=1 tests/windows-host-input.test.cjs tests/runtime-base-assembly.test.cjs tests/runtime-provenance.test.cjs`；真实组件投影用 `node --test --test-name-pattern="real official Host projection omits one DLL" tests/windows-host-material-selftest.cjs`。组件/基础payload对照不等于完整客户端。未提交候选继续受现有HEAD输入门禁限制，不能将本地工作区混入固定sourceCommit构建。

完整客户端验收仍需另行批准提交后的固定Windows构建：保留现有全测试、材料门禁、`build.ps1`、`package.ps1 -VerifyOnly`和安装器解包对照，测试包采用默认 `release_package=false`。交付带 `-test-<source>-<run>` 身份的安装器及 `.sha256`/`.provenance.json`、五份构建/provenance JSON、`installer-verification.json`和`test-build-summary.json`。在隔离测试环境/专用账号中运行解包后的测试副本，检查Electron启动/重载、登录、配置保存与重启、普通媒体/字幕音轨/停止退出及CEC零客户端/零安装路径（不做已退役CEC设备功能验收）。默认Host配置使用 `%ApplicationData%\EmbyTheaterEnhanced`，不能直接拿同账号正式profile做隔离验收。以上完整客户端项目尚未在本候选验收，不改正式安装、不发布。

Current Model selection: a separate hash-locked component now selects the official Windows 3.0.20 Model member from this same ZIP. The Host source whitelist remains 19 files and does not copy Model; the test runtime projection above selects 18. Historical statements below about retaining community Model bytes describe earlier stages; see [current Model contract](MODEL_COMPATIBILITY_INPUT.md).

Current extension: the same pinned official 3.0.20 archive now supplies 19 files (3,967,899 bytes). Added ServiceStack.Text.xml, SimpleInjector.xml, System.Configuration.xml, electronapp/scripts/windowsync.js and electronapp/plugins/mpvplayer/strings/en-US.json: all five are exact byte matches, total 440,443 bytes, without conversion. Companion XML documentation keeps the existing dependency notice/source boundaries; windowsync and language source references retain their upstream GPL v2 declarations. Model remains excluded. The prepared component stays ignored, with no public body upload. Normal old Carnival requirement is now 53 files plus one libmpv patch. Earlier 14-file/58-file counts below describe prior stages. Re-preparation uses the unchanged archive/whitelist validator into a fresh prepared directory; an existing old component is never silently overwritten.

Subsequent selection update: the stage-specific 234/49 counts below are now 90/1 physical requirements after removal of gate-only predecessors. The official 14-file Host component is unchanged. See [current input selection](LEGACY_INPUT_SELECTION.md).

此组件从官方Windows 3.0.20发布ZIP提取14份白名单文件。它们与此前Carnival输入逐字节相同，总计3,527,456字节；没有重新编译、升级版本或改变启动/播放行为。

`MediaBrowser.Model.dll`明确排除在组件之外：官方文件与当前文件不同，当前Model仍保留原字节及原输入来源。Host配置小模板也仍属后续待迁输入。本步骤将必需的非Web Carnival物理文件从248份降至234份，旧补丁仍为49份。

## 固定来源与清单

- 官方发布：[Windows 3.0.20](https://github.com/MediaBrowser/emby-theater-windows/releases/tag/3.0.20)。
- 原ZIP：`emby-theater-x64.zip`，111,318,728字节，SHA256 `3bc01d288d64046483ef12a8e5a70cc31b6d8b65ed9ee1837554ab7eba797c4c`。
- `vendor/windows-host-manifest.json`固定每文件路径、大小、SHA256、归属证据和整个组件tree hash。
- 准备材料正文位于`vendor/windows-host/3.0.20`，被Git忽略；仓库仅保存清单、脚本、测试及来源说明。本次不新增公开二进制分发。

| 分组 | 文件 | 来源/许可证据边界 |
|---|---|---|
| Host | `Emby.Theater.exe`、`Emby.Theater.pdb` | 官方发行件字节匹配；已有Windows参考源码提供GPL v2文本，尚未以对应完整工具链重现该二进制 |
| Common与容器 | `MediaBrowser.Common.dll`、`SimpleInjector.dll` | 同时匹配既有NuGet 3.3.10 / 4.0.11成员；精确源码重建及完整通知关系另记 |
| ServiceStack | `ServiceStack.Text.dll` | 同时匹配NuGet 4.5.14；既有源码参考含AGPL-3.0、FOSS例外和商业文本，不在此选择二进制适用路线 |
| 其它托管支持 | `SharpCompress.dll`、`SocketHttpListener.dll`、`System.Configuration.dll` | 官方发行件原样；保留既有组件来源/通知未闭合记录，不统一重标为项目原创或单一GPL |
| CEC | 两份cec-client、两份cec DLL、USB-CEC driver installer | 官方发行件同路径字节匹配；只提取文件，不运行驱动安装器或改变设备 |
| 刷新率 | `electronapp/libmpv/x64/RefreshRate.exe` | 官方发行件匹配，已有Windows参考库含相关C#源码；此步不重新编译或运行显示工具 |

完整对应源码与通知材料的关系仍见`SOURCE_MATERIALS.md`、`LICENSING.md`及`THIRD_PARTY_NOTICES.md`。官方分发来源已固定不等于所有第三方的源码/通知义务自动闭合。

## 准备与构建

从上述固定官方发布取得原ZIP后执行：

```powershell
./tools/prepare-windows-host.ps1 -ArchivePath <official-3.0.20-zip>
node tools/windows-host-input.cjs validate .
```

准备脚本先验证整个归档大小/SHA，再逐个查找唯一的白名单成员，在内存中验证全部文件身份后才创建组件目录。不会解包额外条目，不运行任何归档程序，不覆盖现有组件，也不删除原材料。归档仅在准备阶段使用；已准备组件的生产组装不再需要原ZIP或Carnival中的对应14文件。

`tools/prepare.ps1`在组件缺失时从指定ArchiveRoot中的固定文件名准备此组件。独立准备脚本也可读取不同缓存文件名的同字节归档。若已有组件与清单不符，流程失败并保留现有文件，不自动修复或覆盖。

生产材料门禁和基础组装按独立清单读取组件，旧目录14同路径条目不再是必需物理文件。来源记录验证最终runtime中的全部14份文件，记录组件与准备脚本身份。来源、校验和输出均受HEAD构建输入合同约束。

## 验证范围

```powershell
node --test tests/windows-host-input.test.cjs tests/runtime-base-assembly.test.cjs tests/runtime-provenance.test.cjs
node --test tests/windows-host-material-selftest.cjs
```

回归涵盖不提供旧Host文件的材料门禁/组装、精确字节、归档身份、缺失/篡改/额外文件、Model禁止进入白名单、路径重定向及runtime篡改。真实材料验证应在旧目录省去这14文件后执行基础组装，并与独立的冻结manifest预期路径和SHA集合对照；这属于静态中间组装证据，不替代完整安装器构建或硬件播放验收。

其余234份非Web Carnival和49份旧补丁的门禁暂保留。已识别的历史Electron、退役bridge、已被源码/npm替代输入和未消费补丁可继续按小组拆除；本步不顺带改变这些门禁、不移动整个旧包，也不宣称全部去依赖或云恢复已完成。

## Source-derived Host and retired CEC projection candidate

The complete official19-file input and its archive/hash remain intact. Runtime projection now omits the private configuration DLL plus five exact CEC binary identities (19→13). The two Host EXE/PDB leaves must then be replaced by verified ETE source-built outputs, leaving eleven unchanged official members plus two derived files. The source-built lock records source/Model/toolchain/build-receipt/output identities; final provenance must validate them. Missing verified input blocks normal build before dist creation, with no original-Host fallback. No new Host/PDB hash or complete package-size saving is asserted before receiving actual verified artifacts. See [retirement and acceptance boundaries](CEC_RETIREMENT.md).

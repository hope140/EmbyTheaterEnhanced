# 构建与打包

本文说明当前源码候选的构建合同。已发布安装包保持原 tag、附件和 provenance；本轮已验收的本地候选与当前公开交接提交并非同一提交，准确边界见[收尾清单](SOURCE_CLEANUP_CLOSEOUT.md)。正式发布、版本号和 main 合并尚未执行。

## 输入与输出

- `tools/prepare.ps1` 和独立恢复工具按 manifest／固定 Git 对象准备材料。正常构建不依赖 Carnival／综合补丁目录，也不从旧安装包取回组件。被冻结的来源正文不在准备后手工修改。
- 官方 Host完整输入保留19文件，runtime排除9个已退役身份，保留10项。两份 EXE/PDB随后替换为已验证的 ETE源码构建产物，并加入固定 Newtonsoft13.0.4 net45 DLL；官方 Model继续独立校验。[Host合同](WINDOWS_HOST_INPUT.md)区分完整来源和运行投影。
- Electron固定44.4.2 Windows x64完整树。libmpv按固定仓库归档离线恢复；Native Helper读取固定 mpv头文件并从所选提交构建。编译器、解包器及安装器工具按现有锁核验，不自动升级系统工具。
- 兼容资源全部退役，零项清单只校验历史身份和缺席约束，无需恢复 shader 目录；小组件2项和Web713项使用当前快照。生产npm依赖从锁文件新建安装树，完整来源1142文件与运行投影1122文件分别验证；LICENSE／NOTICE保留。
- 普通产品源码从 `sourceCommit` 的 Git blob物化；preload、Web overlay、模板和Host配置使用固定生成合同。dirty／仅暂存的源码不能冒充所选提交。

## 两条 Host 准备路径

**已审核产物的本地测试路径**：使用真实验证锁 `native/windows-host/verified-runtime.json`，锁必须在当前 HEAD中；EXE/PDB放入忽略的 `vendor/source-built-host/snapshot-v1/`，固定 JSON依赖位于 `vendor/host-json/snapshot-v1/`。锁绑定来源、Model、框架／平台、产物大小与哈希及回执身份。仅本地测试 fixture提交与公开候选提交分开记录，不把外部回执移植成 runner验收。

**runner从源码生成路径**：`tools/ci-source-built-host.ps1` 恢复固定官方55份源码／资源／声明和两个固定 NuGet输入，使用仓库构建工具编译，在本次 runner验证实际产物，再生成 `.work/source-built-host/verified-runtime.json`及完整回执／provenance。该锁不需要成为Git源码，但必须绑定当前HEAD和Actions运行。两套锁同时存在、缺验证器、回执或产物不符均失败；禁止原Host回退。可移植验证器已通过正常Git交接并接入32文件精确身份合同，当前没有干净GitHub构建成功的结论。

builder使用Windows PowerShell5.1、既有MSBuild17、net462参考包和x86目标；验证入口需要PowerShell7，不能因此把builder改成Core运行时。参考包只解压作编译输入，不安装运行时。Host声明net462不等于已验证纯net462运行环境；安装器当前没有显式最低.NET检查。

## 本地验证与打包

先恢复对应manifest要求的全部材料及既有工具链，取得上述任一有效Host输入，再执行既有准备／回归／构建流程。使用环境正常允许的PowerShell入口；不修改执行策略或绕过审批。

```powershell
npm ci --ignore-scripts
# 按组件合同完成输入恢复；先生成测试需要的固定 preload。
node tools/prepare-preload.cjs .
node tools/source-built-host-input.cjs preflight .
# 运行全部适用回归、材料、源码语法及工具链检查后：
./tools/build.ps1 -OutputName ETE-review
./tools/package.ps1 -RuntimeName ETE-review -VerifyOnly
./tools/package.ps1 -RuntimeName ETE-review -OutputBaseFilename ETE-review-setup
```

输出目录必须新建，构建不覆盖旧产物。`build.ps1`先校验当前HEAD输入和Host材料再创建dist；基础组装后替换派生Host、验证退役文件缺席、生成源码与运行provenance。`source-provenance.json`、`runtime-provenance.json`和schema3 `build-manifest.json`分别记录来源、生成关系及最终完整集合；安装器解包必须与该runtime逐路径／大小／SHA一致。不能手工改包后沿用旧清单。

GitHub手动作业与本地已审核产物路线不同，具体参数及产物见[Actions测试包](ACTIONS_TEST_PACKAGE.md)。`release_package=true`仅暂存标准发行附件，不等于发布授权。

## 安装、升级和验收

安装器正常入口为 `{app}\Emby.Theater.exe`。CEC专属链与旧Host自更新已退役；本项目发行版检查／浏览器下载、服务器更新、刷新率和普通播放保留。升级仅按[14项精确名单](../installer/retired-runtime.json)处理注册应用目录旧文件，未知内容或重定向失败，不递归清目录、不卸载系统驱动、不删除profile、登录态、既有配置或pending归档。

本轮用户已确认候选包验收通过；新runner／最终整合提交仍须独立验证。安装器封装可能含时间字段，未宣称setup位级可重复。必要第三方声明继续按输入合同进入包；本轮清理不代表全库来源／许可审查全部通过。

## 历史发行记录

以下保留各版当时的来源、计数和验收边界，不作为当前候选构建输入或新验证结果。


以下保留各版当时的来源、计数、工具输入及验收边界，不作为当前候选来源或新测试结果。

### v0.3.14（历史）

[v0.3.14](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.14) 发布时为 Pre-release，产品 sourceCommit 为 `ce9310e1c8392af174e4bb5cd3f84e8a6ab0c867`。原 Tag、五附件与 notes 保留；播放后退出异常已在 v0.3.15 修复。见[V0314 发行核验](V0314_RELEASE_VERIFICATION.md)。

### v0.3.13（历史）

[v0.3.13](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.13) 发布时为 Pre-release，产品 sourceCommit 为 `d313e93a9d0920af7ed27cd1743d6bb9c9178d4d`。原 Tag、五附件及历史身份保留；见[V0313 发行核验](V0313_RELEASE_VERIFICATION.md)。

### v0.3.12（历史）

[v0.3.12](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.12) 的产品 sourceCommit 为 `408f74df626f23c9ad1295090548d7d95bc0525f`，Stable/Latest 保持 v0.3.1。发行资产与当时验收边界见[v0.3.12 发行核验](V0312_RELEASE_VERIFICATION.md)；后续 v0.3.13 使用新的最终 main source 构建。

### v0.3.11（历史）

[v0.3.11](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.11) 当时为测试版 Pre-release，产品sourceCommit为`3b308c7fcec44990d1a0820e1a982691d7d4e17b`，Stable/Latest保持v0.3.1。安装器、来源、完整runtime与公开附件结果见[v0.3.11发行核验](V0311_RELEASE_VERIFICATION.md)。产品来源与后续文档HEAD分别记录。

### v0.3.10（历史）

[v0.3.10](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.10) Pre-release，产品 Tag/sourceCommit 为 `v0.3.10` / `73a5379983e2be2a2bc0bdc8aec8f0fcb5f07d63`，Stable/Latest 保持 v0.3.1。Main CI [run 39099388720](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39099388720) 与 Tag CI [run 39101070181](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39101070181) 均为 1119/1119；固定材料 210/210。准确安装器、runtime、五附件和匿名全字节回读见[v0.3.10 发行核验](V0310_RELEASE_VERIFICATION.md)。后续维护文档 HEAD 不替代该产品来源。

### v0.3.9（历史）

当时测试版为v0.3.9 Pre-release，产品Tag/sourceCommit为 `v0.3.9` / `06d34a712e26e0d6d0b299b487cfd68625df71ed`，Stable/Latest保持v0.3.1。准确安装器、runtime、五附件及安装升级验收边界见[v0.3.9发行核验](V039_RELEASE_VERIFICATION.md)。后续维护文档或代码HEAD不替代该产品来源。

### v0.3.7

v0.3.7 已作为 Pre-release 发布，产品Tag/sourceCommit 为 `v0.3.7` / `bf6e48214820fac0558bdfe7f37526f1c7a3d7c2`。主线与Tag CI 977/977，材料门禁200/200；2159 payload/2160完整runtime与2160个`{app}`解包文件完整集合、逐SHA一致。标准安装器 `EmbyTheaterEnhanced-0.3.7-win-x64-setup.exe` 为175733823 bytes，SHA-256 `aca0ff577ad111f726bf769706b23d5e0e2d7d1706e7bfa768c2d15e9db1f49d`，build-manifest SHA-256 `1439f6521e32d40758b049f4e15eb4ed171a9698bdbc27d776c9dfb303cec19e`。五附件匿名完整回读通过；Stable/Latest仍为v0.3.1。固定prepared物理输入按原清单和工具链校验，本轮没有重新取得或独立回读Electron ZIP归档，不将prepared树核验表述为该归档回读。详细来源、资产与验收边界见[发行核验](V037_RELEASE_VERIFICATION.md)。

[v0.3.6发行](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.6)已完成，产品Tag固定`de1a731aa3e915b00988134b6f5331bfc867a84a`。标准安装器`EmbyTheaterEnhanced-0.3.6-win-x64-setup.exe`，175752059 bytes，SHA-256 `020df218195e9999d443ad0832df6cd1be9a8c9f8dc8d7780b75b6c25893edc1`；2159个{app}解包文件与完整runtime逐路径一致，五附件匿名完整回读通过。安装器未签名，解包/隐藏运行不代表系统安装或用户前台验收。详细边界见[发行核验](V036_RELEASE_VERIFICATION.md)，文档后续HEAD不替代该产品来源。


以下为v0.3.6发行历史，发行渠道为Pre-release，Latest保持v0.3.1。根package、锁文件、生成runtime和安装器使用同一数字版本；发行安装器从v0.3.6 Tag指向的最终main源码重新构建，不沿用旧本地候选runtime冒充新来源。标准产品入口和完整payload随包，私有浏览验收脚本、独立启动wrapper、登录资料、profile及用户导入的内核不进入安装包。内置更新检查仍只读取Stable `/releases/latest`。

[v0.3.5发行](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.5)已完成，Tag固定`b0234c8a0e8d4fb264b21cf39f8ce68c9146d115`。标准安装器`EmbyTheaterEnhanced-0.3.5-win-x64-setup.exe`，175741577 bytes，SHA-256 `03f8cf5f2b18f854cc6548a7fe2d60cd641a8187479c4fd2e3ad22c8dfd87414`。2158个{app}解包文件与来源runtime逐项一致；五个附件匿名完整回读通过。安装器未签名，解包验证不等于系统安装验收；后续文档HEAD不改变该来源。详见[发行核验](V035_RELEASE_VERIFICATION.md)。

[v0.3.4发行](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.4)已完成，Tag固定`98c26e4a123f0b8c623451ee7603fc431b28bddf`。标准安装器为`EmbyTheaterEnhanced-0.3.4-win-x64-setup.exe`，175753774 bytes，SHA-256 `eedf03e83b0f4b2b2ef674134af4fefc5068573b5bb82466e3ad4191c46d0c3d`。2157项解包文件与来源runtime逐项一致，五项公开附件匿名完整回读通过。安装器未签名；解包验证不代表系统安装验收。此后文档提交与该产品来源分开。

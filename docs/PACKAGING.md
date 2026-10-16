# 构建与打包

v0.3.7独立本地候选已完成，产品源码`1246da1023c43981c7ed40a4e556cb95c7eb7e02`。2159 payload/2160完整runtime与2164文件本地ZIP的完整集合及SHA通过；[候选身份和验收边界](V037_LOCAL_CANDIDATE.md)单列。公开测试版仍按下述v0.3.6记录，Stable/Latest仍v0.3.1；没有远端发布或系统安装。固定prepared物理输入通过原清单与工具链校验，未重新取得Electron ZIP归档；该归档本轮未独立回读，完整prepared树身份另行验证。

[v0.3.6发行](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.6)已完成，产品Tag固定`de1a731aa3e915b00988134b6f5331bfc867a84a`。标准安装器`EmbyTheaterEnhanced-0.3.6-win-x64-setup.exe`，175752059 bytes，SHA-256 `020df218195e9999d443ad0832df6cd1be9a8c9f8dc8d7780b75b6c25893edc1`；2159个{app}解包文件与完整runtime逐路径一致，五附件匿名完整回读通过。安装器未签名，解包/隐藏运行不代表系统安装或用户前台验收。详细边界见[发行核验](V036_RELEASE_VERIFICATION.md)，文档后续HEAD不替代该产品来源。


本批测试产品版本为v0.3.6，发行渠道为Pre-release，Latest保持v0.3.1。根package、锁文件、生成runtime和安装器使用同一数字版本；发行安装器从v0.3.6 Tag指向的最终main源码重新构建，不沿用旧本地候选runtime冒充新来源。标准产品入口和完整payload随包，私有浏览验收脚本、独立启动wrapper、登录资料、profile及用户导入的内核不进入安装包。内置更新检查仍只读取Stable `/releases/latest`。

[v0.3.5发行](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.5)已完成，Tag固定`b0234c8a0e8d4fb264b21cf39f8ce68c9146d115`。标准安装器`EmbyTheaterEnhanced-0.3.5-win-x64-setup.exe`，175741577 bytes，SHA-256 `03f8cf5f2b18f854cc6548a7fe2d60cd641a8187479c4fd2e3ad22c8dfd87414`。2158个{app}解包文件与来源runtime逐项一致；五个附件匿名完整回读通过。安装器未签名，解包验证不等于系统安装验收；后续文档HEAD不改变该来源。详见[发行核验](V035_RELEASE_VERIFICATION.md)。

[v0.3.4发行](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.4)已完成，Tag固定`98c26e4a123f0b8c623451ee7603fc431b28bddf`。标准安装器为`EmbyTheaterEnhanced-0.3.4-win-x64-setup.exe`，175753774 bytes，SHA-256 `eedf03e83b0f4b2b2ef674134af4fefc5068573b5bb82466e3ad4191c46d0c3d`。2157项解包文件与来源runtime逐项一致，五项公开附件匿名完整回读通过。安装器未签名；解包验证不代表系统安装验收。此后文档提交与该产品来源分开。

当前正式产品版本为 v0.3.1，准确 `sourceCommit` 由同名 Tag 与 Release 安装包 provenance 固定。构建流程和输入约束由 [BUILD_HARDENING.md](BUILD_HARDENING.md)、[BUILD_TOOLCHAINS.md](BUILD_TOOLCHAINS.md)、[NODE_DEPENDENCY_BOUNDARY.md](NODE_DEPENDENCY_BOUNDARY.md)、vendor manifests 与 package lock 定义。公开仓库不含 Carnival、综合补丁、完整离线 Web、外部 Electron/libmpv 归档及所有预编译输入，因此单独克隆不能完成产品构建；来源及对应源码状态见 [BUILD_INPUT_AUDIT.md](BUILD_INPUT_AUDIT.md) 和 [SOURCE_MATERIALS.md](SOURCE_MATERIALS.md)。

## 固定运行时与输入

- Electron 使用 vendor manifest 固定的官方 44.4.2 Stable Windows x64 完整目录。构建核对归档、解包树、版本文件、`electron.exe` 和最终 `x64/electron`；缺失或哈希不符时停止。Carnival Electron 18.3.15 只作为历史输入身份保留。
- 生产播放器 bridge 为 Native Helper。旧 Pepper Node bridge 可作为归档来源清单输入，但由 `tools/runtime-exclusions.cjs` 在 runtime 中排除，package verify 与 provenance 再次确认其不存在。
- Native Helper 从所选 `sourceCommit` 的 Git blob 构建，固定 header、compiler、libmpv、源码、helper 和 contract hash 写入 provenance。需要先用 `tools/prepare-native-helper-inputs.ps1` 获取并验证 mpv `client.h`。
- Node、UCRT64、Inno/InnoUnp 与解包器版本和目录身份分别由 `package-lock.json`、`tools/build-toolchains.lock.json` 及 `vendor/*-manifest.json` 固定。构建不自动安装或升级系统工具，也不接受同版本但哈希不同的编译器。
- 根 `LICENSE`、`THIRD_PARTY_NOTICES.md`、`docs/LICENSING.md` 与 `docs/SOURCE_MATERIALS.md` 按提交字节纳入输入及 provenance。该通知边界不证明其它材料具有授权或完整对应源码。

## 构建命令

需预备三个固定输入归档（Carnival、综合补丁、Electron 44.4.2）和已验证的项目内工具链。`prepare.ps1` 使用 `-ArchiveRoot` 读取归档目录并核验 SHA256；缺少输入时流程不能完成。

```powershell
npm ci --ignore-scripts
powershell -NoProfile -ExecutionPolicy Bypass -File tools/prepare.ps1 -ArchiveRoot <archive-directory>
powershell -NoProfile -ExecutionPolicy Bypass -File tools/prepare-native-helper-inputs.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1
```

构建从已验证的 vendor 输入生成 runtime，物化官方 Electron 目录，从 `<sourceCommit>` 读取 `src/electronapp` 的 Git blobs，再按各自 contract 生成 preload/Web overlay、复制 production dependencies、应用 PlaybackManager overlay、替换固定 libmpv 并写 provenance 与 payload manifest。普通源码直接写 Git blob bytes，不把 dirty/staged checkout 内容当作所选提交源码。Web overlay 只接受 manifest 中固定的 base、payload 与 generator；任一 hash 或锚点不匹配即停止。

插件设置兼容候选串联 app 路由/别名变换，并新增 viewmanager 与 approuter 的窄取消/事务 overlay。维护模块从 `src/electronapp/enhanced/plugin-ui` 的 Git blobs 进入 runtime，完整 ignored Web snapshot 仍不作为输入。候选未提交时 build-input 门禁拒绝组装；材料 fixture 和隐藏实验不能替代新 sourceCommit 的正式构建。详见 [兼容合同](PLUGIN_SETTINGS_COMPATIBILITY.md)。

`source-provenance.json` 记录外部归档、manifest、runtime/Web 输入、Electron、Native Helper、libmpv 与 production dependencies；`runtime-provenance.json` 绑定 Git 源码和生成 overlay；`build-manifest.json` schema 3 绑定 source commit、输入与 provenance 及 canonical payload-set digest。打包前校验路径、重复项、完整 file set、逐文件 SHA256 和 provenance binding。Inno 递归复制已验证 runtime；`-RuntimeName` 选择目标，`-OutputBaseFilename` 只设安装包文件名。

## 安装和可重复性边界

安装入口启动 `{app}\Emby.Theater.exe`。卸载保留 Enhanced 用户数据和个人 mpv 配置；构建、打包不会写入用户的 mpv 配置、shader 或字体目录。

可重复性只在固定的源码提交、外部输入、工具链与命令范围内成立。runtime manifest 可逐文件核对；安装器封装可能包含时间字段，项目不宣称 setup.exe 位级可重复，也不把第三方预编译组件描述为由本仓库源码完整重建。

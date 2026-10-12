# v0.3.0 libmpv 分发材料解阻结果

2026-10-12（UTC+8）；研究基线 `72d4688821822860d20342ae8c784a279b06b4f5`。本轮仅取得与核验官方材料、保存上游许可全文及制定后续合同。生产代码、runtime、安装器、根 LICENSE 均未修改；目标 DLL 和下载的 CLI 均未执行。

## 已实际关闭的材料缺口

1. **固定 mpv 源码及通知实体**。官方固定源码 ZIP 已重新取得，8,023,071 bytes，SHA256 `e82426ff14b1c05705f9e16889bba17f28e578b6c5a0b32ed03b0f9ee050c72f`。`Copyright`、`LICENSE.GPL`、`LICENSE.LGPL` 和 client API 的完整 ISC 通知已准确保存到 `redistribution-notices/mpv/`；逐文件 SHA 在 [JSON 回执](evidence/v030-mpv-unblock.json)。这关闭这些文本缺失，尚未使它们进入现成 stable-rc payload。
2. **发布者固定配方与实际发布日志**。发现并实际取得官方 [clang run 31285220366](https://github.com/shinchiro/mpv-winbuild-cmake/actions/runs/31285220366) 的完整日志。其实际 checkout 为 `cd1edc11dc6887a50f705717619d879f5a93a488`，固定 builder ZIP SHA256 `770882870fd2d66411150947777147e8c7ebaa5b8b6e980b7643b79b7bc4a989`。此前“没有 workflow/run 身份”的缺口关闭。
3. **准确归档名、variant 与发布链**。x86_64 job 日志直接创建 `mpv-dev-x86_64-20260809-git-dd5d17d328.7z`，记录 2 目录、6 文件、119,916,200 uncompressed bytes、31,173,907 archive bytes；00:28:45.2213539Z upload 日志直接上传该文件至 SourceForge `libmpv/`，下一 v3 文件于 00:28:46.4536383Z 开始上传。名称/size/variant 与既有准确归档检验一致；不再仅凭日期推测发布者。日志没有目标 dev 归档 SHA，因此 run 到目标归档字节关联仍标为有直接发布证据的推断，不伪造密码学 attestation。
4. **固定 FFmpeg 源码与许可文本实体**。官方 `2a20737f662fd3f3f5999e873b9e7c90b5efc375` ZIP 实际取得，23,956,097 bytes，SHA256 `0fccef617d0692c50223162202ba894d8397412d5c94ea978ac528dac6775af9`。四份 GPL/LGPL 全文、`LICENSE.md`、`CREDITS` 和三项 IJG 源文件的完整开头通知已保存。实际 x86_64 日志显示 FFmpeg master 更新到 `2a20737f6`、重配/构建/安装和 `No patch step for 'ffmpeg'`，其关系已从单独 DLL version reference 提升为官方构建链支持的源码关联；完整 FFmpeg 配置 readback 与完整依赖锁仍缺。

## 身份与证据层级

当前只读 stable-rc 的 `electronapp/libmpv/x64/mpv-1.dll` SHA256 本轮独立计算为 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，119,725,568 bytes。SourceForge [准确文件页](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download) 本轮仍显示目标归档 SHA256 `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`。历史归档 member 到 DLL 的 EXACT 关系保留其原证据身份。

本轮两次 SourceForge 下载均返回 HTML，分别 143,954 / 143,720 bytes，均不是 7z、hash 均不匹配目标，不能作为归档成功。下载了同 run 的准确 x86_64 CLI artifact，ZIP SHA256 `9e197bc768085e7cadc1f9a4126ff50c2ac9b5b53bad743fcf510a9d3d865156`，与官方上传日志的 digest EXACT；它是同次 CLI 包，不能替代目标 dev DLL。其归档内未发现 LICENSE/Copyright，不能用它关闭完整 notice。未试其它日期/variant，未重试既知 404 release 路径。官方查询/下载按有界预算停止。

目标 DLL 静态 ASCII 中实际存在 clang/LLVM 子串，支持工具链线索；所查 `clang version` / `LLVM version` 完整标记未找到，不据这些字符串判定完整编译器版本或许可模式。所查 DLL/CLI 均有固定 mpv/FFmpeg revision 标签，但没有查到 configure flags。

## 许可模式已出现的具体事实

固定 `packages/mpv.cmake` 使用 `--prefer-static`，未设置 `-Dgpl=false`；固定 mpv `meson.options` 的 `gpl` 默认 true。固定 `packages/ffmpeg.cmake` 明确 `--enable-gpl --enable-version3`，并启用 x264/x265/rubberband 等库；未出现 `--enable-nonfree`。实际 run 的 custom command 是 `mpv-fullclean`，CMake 指定 clang/x86_64/LTO。以上是官方源码及日志事实；缓存依赖、FFmpeg 配置结果和链接闭包不能由 recipe 计划值全部替代。

固定 FFmpeg `LICENSE.md` 明确 GPL 部分加 `--enable-version3` 时适用 GPLv3 文本；mpv `Copyright` 明确链接的 GPL FFmpeg 会影响最终许可。因而 **GPLv3 组合兼容性审核是具体待决事项**，不能继续将此 DLL 猜成 LGPL，亦不能宣称 GPL-2.0-only 项目组合已兼容。`native/mpv-helper/ete-mpv-helper.cpp:1` 声明 GPL-2.0-only；1370 起通过 LoadLibraryEx/GetProcAddress 直接使用 libmpv。API 头的 ISC 许可不等于 core DLL 许可。父线程应复核实际组合、各版权方可用授权以及可采取的路线；本轮不修改根 LICENSE，不认定动态加载自动消除义务。

## A：保留准确 DLL 的最小剩余材料与动作

- 已有 fixed mpv/FFmpeg source 获取入口、builder 全部 recipe/patch 和实际发布日志，后续不再请求“先找 workflow”。必要补充缩为 run `31285220366` 的 **resolved dependency source lock / source bundle**（包括缓存复用库），各 source revision、tarball hash、实际 patches；本地 `recipe-source-inventory.json` 已列出官方获取声明。仅更新时出现的短 hash 不能替代所有未变化缓存库的锁。
- 提供/恢复该 run 的 `mpv-*-configure.log`、FFmpeg `ffbuild/config.log` / `config.h` / `config.mak`、mpv Meson 配置结果和实际链接组件清单，确认 recipe 计划与已安装缓存库的关系。workflow 的 configure/build 日志 artifact retention 为 1 day，当前 artifact API 中已不包含日志包；当前取得的 job 日志本身可保留，但不包含全部配置正文。
- 根据上述实际组成补齐各依赖的准确许可、版权通知及必要源文件 notice，并选择履行对应源码的有效交付方式。完整 preferred source、修改与控制构建的 scripts 是必要材料；PDB、精确 Docker/toolchain复刻或 bit-exact 二进制重建不作为普遍法律前提。已知 Docker digest仅为技术来源补强。
- 独立处理 GPLv3 组合与现有 GPL-2.0-only Helper/维护层的许可路线，不能由用户简单授权升级其没有权利变更的上游条款。当前任务已允许发行准备构建；父线程将全文整合既有根通知并验证Git blob交付，未重包旧候选。未来新 artifact 必须绑定自己的 manifest；repository 收集不等于旧包 notice 已交付。

## B：官方固定源码重建替代的最小验证合同（仅建议）

候选源码版本可使用本轮实际取得的官方 mpv `dd5d17d3285a095a0f712fa9d116e22a076492de`（client API 2.5）与固定 FFmpeg `2a20737f662fd3f3f5999e873b9e7c90b5efc375`，由项目控制所有依赖锁、补丁和许可模式，产生新的 libmpv 二进制；它不是重标当前提供者 DLL，也不称它已 release-ready。每个依赖必须选有准确源码/适用许可/完整通知的固定输入。选择 GPLv2-compatible 或 LGPL 路线时，需明确禁用 FFmpeg version3-only/不兼容组件、不能盲用现有 `--enable-version3` 配方；必要功能是否可保留由验证决定。

实施前需先明确可兼容的许可组成和已授权的最小替代边界，不能借材料任务重构冻结播放器。合同：保留 libmpv API 2.5 以及当前 Helper 所有必需 exports/事件/属性、generation/playlist-entry 归属、file-local headers 与异步 stop/recreate；Electron 44.4.2/Helper IPC和 HWND/surface/presentation 归属保持。若未来确实更换 core，按影响核对 gpu-next、Windows hwdec/颜色、STRM DirectUrl/CD2/Mount/native fallback、字幕/音轨/seek/暂停/恢复/Stop/Next、真实 Session/report/远控和 repeated video frame evidence；这是替代影响范围，不是本轮重新开启HDR专项或要求重跑全部历史实验。编译成功、API 版本或 time-pos 推进均不足以通过替代。任何必要能力回退即拒绝候选；不能为了许可材料闭合删掉用户已有功能。

## C：核心处置

libmpv 是生产 Native Helper 唯一播放 core，不能以删除 DLL 或关闭播放功能来清材料门禁。保留当前候选的技术验收身份；A 无法取得必要材料且组合路线未解决时，只在单独授权下实施 B。当前用户安装/覆盖升级/启动反馈 PASS 为父线程已有真实体验证据，本轮未重复安装或媒体实验。

验证：准确 source ZIP 文件身份、ZIP/7z成员静态检查、通知字节/hash、目标 DLL SHA、官方 run/API/log/CLI digest 对照、JSON hash 字段长度和存在性、diff/敏感路径检查。无本轮播放/安装/发布 PASS 声明。

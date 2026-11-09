# 来源与许可证据续核（2026-11-09）

本次文档基线为已推送审计提交 [`0acd0984d52cfd063c964c570732c07e669cb4c7`](https://github.com/hope140/EmbyTheaterEnhanced/tree/0acd0984d52cfd063c964c570732c07e669cb4c7)。原[审计正文](LICENSE_PROVENANCE_CURRENT.md)与[旧回执](evidence/license-provenance-20261109.json)描述的是 v0.4.19，不是 v0.4.20。本次独立取得新版安装器及选定官方材料；新增[机器回执](evidence/license-provenance-recovery-20261109.json)，保留旧回执原字节。本次没有运行安装器或产品、重建 Windows 二进制，也不作整体许可已闭合的结论。

## 本次远端身份与可继承范围

| 对象 | 固定身份与解释 |
| --- | --- |
| 实际远端 main | [`b4b70bc7c8873b750ee9375a00c9cca742fcf28b`](https://github.com/hope140/EmbyTheaterEnhanced/tree/b4b70bc7c8873b750ee9375a00c9cca742fcf28b)，直接读取远端 API 并 fetch；不使用环境预置 ref 推断 |
| 最新公开测试版 | [v0.4.20](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.20)，tag 直接指向 `4bf20e067c2a79bf2498943c2d06f955b9f0fcc0`；release ID `438746891`，prerelease，2026-11-09 04:36:07 UTC 发布 |
| 正式 Latest | `/releases/latest` 返回 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)；正式渠道与最新测试版分开解释 |
| 旧成品审计 | v0.4.19 `f07bf1f575741fe9f33e7345a96c8f61e5e8bc9a` 的 2232 文件、v0.4.7 的 2225 文件；旧版对比结论保持原范围 |
| 旧测试 | Linux 2600 通过、0 失败、32 跳过是旧回执记录。本次另回读旧提交 `0acd0984…` 的 [Windows CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/42558826353)：2632 项，2627 通过、0 失败、5 跳过；它也不是 v0.4.20 或本次新提交的回归结果 |

旧审计 main `f007802…` 到本次 main 的逐路径差异在新回执中。v0.4.20 tag 到本次 main 仅有 7 个文档路径变化。旧回执的 21 个组件 Git 对象，加查 Electron 与工具链两份清单，共 **23 个对象**在旧审计基线、v0.4.19、v0.4.20 和本次 main 全部相同；24 项重点库存的实际 Git blob SHA256 在 v0.4.20/main 也保持。npm lock 除根版本外一致。

这些比较允许继承固定第三方输入的既有官方来源、许可文本和已核哈希；不允许继承变化的 Native Helper、维护 JS/Web 输出、版本、包内来源记录或安装器的验证结果。新版成品以下列独立提取为准，main 后续移动不自动进入结论。未重新下载 33 个 npm tarball 或 Electron 完整 ZIP；其上游身份沿用固定旧回执，再比较本次成品字节。

## v0.4.20 的独立成品核对

- 安装器 161,904,584 bytes，SHA256 `ffc1e2363432af0a14a395b842667b49f332c7b1afe1fdd7a6581b8c367e99ea`。五个发行附件均重新下载并匹配官方 API 的大小和 SHA256。
- 固定 innoextract 1.13.0（SHA256 `c898db2ecc282ff8d943e9868d03dd6f1fc6069ddd40430341b211f93826b360`）只读解包退出 0。保留 `Unexpected filetime: 0` 警告，不采用时间戳证明身份。
- **2235/2235** 清单文件独立重算 SHA256 全部匹配；实际 2236 文件包含 manifest 自身，无遗漏、无额外成员。manifest SHA256 `9624ac567880dd3b04b223de2da8ed57c969b33f874b86efe82a76afc9c7f903` 与外置 provenance 一致；内外以及五份包内来源记录均绑定 `4bf20e067…`。
- **64 个明确通知路径**通过：16 项项目通知与 v0.4.20 Git blob 同字节，也与 v0.4.19 对应通知一致；36 项生产 npm、7 项继承 npm、3 项 Koffi 及 2 项 Electron 通知匹配旧回执的已核哈希。Electron 73 成员也逐项匹配旧回执。这里是有限路径核对，不是所有内嵌依赖、源码头部或全部义务的穷尽检查。
- 官方 MediaBrowser.Common 3.3.10 NuGet 重新下载，177,439 bytes，SHA256 `4d9bd3ed99e9b2b6cd22622018af5667246d8b866041f540afdb973b30d30d0b`。Model/Common 两 DLL 与新版包同字节；固定 libmpv DLL 的大小与 SHA256 也匹配清单。未重复下载官方 Windows ZIP，旧官方分发依据继续保留。

## 三条线索的重新验证

### 保留图像与官方许可文本

从官方 [emby-webcomponents 固定提交 cc087c2a…](https://github.com/MediaBrowser/emby-webcomponents/tree/cc087c2a93e74c3e35bd1cb4935ae472cff41a0e)重新取得 5 个不同原图，匹配 6 个保留路径；每项都同时比较 v0.4.20 Git blob 与解包后的成品。完整 URL、大小、SHA256 与映射在新回执。

| 当前 `electronapp/www/modules/` 下路径 | 官方提交内原图 |
| --- | --- |
| `mediainfo/fresh.png` | `mediainfo/fresh.png` |
| `mediainfo/rotten.png` | `mediainfo/rotten.png` |
| `themes/darkgradient/blueradiance.jpg` | `themes/blueradiance/bg.jpg` |
| `themes/logodark.png` | `themes/logodark.png` |
| `themes/logowhite.png` | `themes/logowhite.png` |
| `logoscreensaver/logowhite.png` | `themes/logowhite.png`（第二处使用同字节原图） |

同提交的 [LICENSE.md](https://github.com/MediaBrowser/emby-webcomponents/blob/cc087c2a93e74c3e35bd1cb4935ae472cff41a0e/LICENSE.md)为完整 GPLv2 文本，含条款 0–12 和应用附录，18,014 bytes，SHA256 `f371b80469fb235bc500ec29e0e85b682d4a6157a158567d828ff0be544d4f1d`。上述两处白色 logo 另与官方 [emby-theater-electron 的固定原图](https://github.com/MediaBrowser/emby-theater-electron/blob/db0f4c814ee1e7d9b5f50010065c5cb64a20357e/logowhite.png)一致，包内 `electronapp/logowhite.png` 也一致；该 Electron 提交的 LICENSE.md 同字节。

因此这 6 个路径已有明确官方字节来源和同提交许可文本，不能继续统称“无官方来源/无许可依据”。此证据不单独证明商标使用权或上游对每张第三方图像的全部权利链；也不替其余 icon、splash、supporter badge 推断来源。equalizer 的既有官方证据保持。

### libmpv 实际内嵌配置

新版包内 DLL 为 119,725,568 bytes，SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，与固定输入及旧回执一致。本次只读提取两个 ASCII 字符串的完整可打印部分，字节偏移及 SHA256 在回执；哈希不含其后的 LF 和 NUL，结尾字节另记为 `0a00`：

- 偏移 `97847333` 的 `Configuration:` 包含 `-Ddefault_library=shared`、`-Dprefer_static=true`、`-Dlibmpv=true`、LTO，以及启用 Lua、JavaScript、libarchive、libbluray、dvdnav、rubberband、libcurl 等选项。
- 偏移 `97848134` 的启用特性列表明确包含 `gpl`、`ffmpeg`、`libass`、`libplacebo`、`rubberband` 等。

重新取得固定 mpv 提交的 [meson.build](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/meson.build#L1762)，确认 CONFIGURATION 来自 Meson build options，FULLCONFIG 来自启用特性，`gpl` 特性读取 `get_option('gpl')`。同提交 [Copyright](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/Copyright)保留默认 GPLv2+、LGPL 模式条件及逐文件声明说明。证据从“仅有构建配方”推进到“固定 DLL 内确有对应配置声明”；仍不能据此生成完整依赖版本锁、FFmpeg 的实际 configure 命令、实际静态/动态链接清单、完整对应源码包或最终组合许可结论。`prefer_static` 是配置倾向，不是每个库实际静态链接的证明。

### Model/Common 构建路径

本次官方 NuGet 的 `lib/netstandard1.3/MediaBrowser.Model.dll` 与 `MediaBrowser.Common.dll` 同新版包匹配。其内嵌调试字符串分别指向官方构建目录的 `Emby.Server.NetCore/src/MediaBrowser.Model/obj/Release/netstandard1.3/MediaBrowser.Model.pdb` 与 Common 对应路径；原始字符串和偏移在回执，路径属于上游构建而非用户环境。

这缩小了项目/目标框架线索，但不提供 commit，也不证明公开 `a304…` PCL 源就是该发布的精确源码。已有官方 ZIP/NuGet 身份和已辨 GPL/MIT 表达继续保留；不能从未复现历史构建推导“没有许可”。

## 有界停止点与最小缺件

| 未决项 | 最小新材料及用途 |
| --- | --- |
| libmpv/FFmpeg 完整源码关系 | 原构建实际依赖 revision 清单、补丁和工具链/config/link 记录或源缓存快照；用来确定实际组成及对应源码/notices 范围。现有主源码 ZIP 与 108 份 recipe 不重复当作闭环 |
| Model/Common 3.3.10 | 与 `Emby.Server.NetCore` netstandard1.3 发布对应的 source revision、项目/打包记录或发布映射说明；用来核对具体差异与源码交付范围，不需重交现成 DLL |
| 其余图像/小资源 | 对尚未覆盖的 icon、splash、supporter badge、默认配置和继承译文，仅补具体原路径/固定原件及适用声明。上述 6 路径不再归零；品牌边界按实际使用另行判断 |
| preload 与 Web/字幕增量 | 首次导入来源/固定材料与适用声明，仍限旧表列出的具体表达；没有新材料不再遍历相同旧包 |
| 具体作品组合 | 固定成品的实际链接/来源范围供专门评审；不因同包、动态加载或构建失败直接断言兼容、违规或无许可，也不改变根许可证 |

本轮停止在这些可说明用途的缺件处。保留官方既有许可证与通知；未联系第三方、申请 SignPath、修改依赖/发布流程、合并 main 或发版。

## 复核方法与验证边界

1. 按新回执 `remote` 固定 main/tag；对 `componentGitIdentities` 执行 `git rev-parse <commit>:<path>`，并对 24 项库存的 Git blob 重算 SHA256。`sourceChangesSinceOldMain` 与 `mainChangesSinceRelease` 可用 `git diff --no-renames --name-status` 复核。
2. 按 `downloads` 下载准确 URL，核大小与 SHA256；只读解包。对 `build-manifest.json.files` 每个路径重算 SHA256，检查实际文件集合（单列 manifest），再比较外置 manifest 哈希、各 sourceCommit 和列明的 64 通知、73 Electron 成员。payloadSetSha256 在回执中保留包内声明；本轮独立验证的是完整成员集合与逐文件哈希。
3. 图像按 `officialImages` 的固定 URL 比较原图、Git blob、包内成员；同时读取同提交 LICENSE.md。NuGet 用 ZIP 读取两个 DLL，提取内嵌 ASCII 路径；DLL 不执行。mpv 读取回执偏移所列字节并重算字符串哈希，再查固定 meson.build 的生成关系。
4. 本次运行文档/JSON、链接、有限凭据模式及补丁空白检查；没有重跑 Windows/Linux 产品回归。推送后的 CI 结果必须按本次准确提交另行报告，不把旧 Windows 2627 或 Linux 2600 通过移动到新版名下。

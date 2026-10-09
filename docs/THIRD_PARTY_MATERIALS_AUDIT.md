# 第三方来源材料补充审计

日期：2026-10-09（UTC+8）。从干净的 `5af84432967dd0d93dd45ab02fd518afc2d2e3b6`
建立独立 `codex/source-materials-20261009`。核对对象是
`sourceCommit=1a05f88357a08f5d7c99a7e5de28de20aad0dc79`、版本 0.2.4
的 build-review 交付及其既有输入清单。本页是后续本地材料交付，不改变该候选、
同期发布分支或安装包。历史 535/535、双 runtime 和双安装器一致结果仍归属
[BUILD_REVIEW](BUILD_REVIEW.md)，不作为本轮新增测试。

`EXACT` 仅表示指明的文件字节对应；`REFERENCE` 表示已固定的参考来源，
不代表已从该源码重建二进制。`MISSING` 表示所需材料未收集，`UNKNOWN`
表示对应关系尚不能建立。所有观察仍引用既有 vendor manifest、lock 和
payload provenance，不增加构建信任根。

## 本轮新增证据

| 组件 | 已建立的关系 | 仍未建立的关系 |
|---|---|---|
| patched libmpv | SourceForge 原 dev archive 实际下载；公开校验值、提供者声明和本地 SHA256 相同；归档 `libmpv-2.dll` 与打包 `mpv-1.dll` EXACT | winbuild revision、工作流记录、全部依赖 revision/patch/config/toolchain、完整通知和源码重建 |
| Host 支撑 DLL | 官方 NuGet 中 Common 3.3.10、ServiceStack.Text 4.5.14、SimpleInjector 4.0.11 的指定 DLL EXACT | 精确 source/build 对应；同包 Model DLL 不匹配，不能沿用 Common 结论 |
| CEC / SharpCompress | 固定参考源码及 CEC 的 platform gitlink；保留源码通知入口 | 版本标签不是二进制对应证明；SharpCompress 0.10.3 各 NuGet DLL 均不匹配；CEC/driver 的确切构建关系未知 |
| 继承 npm 七包 | 七个 registry tarball 均通过 SHA512 SRI；实际随包的七份许可文本与原包仅换行不同 | Carnival 包不是完整原包字节副本；安装 metadata、README 缺项和 power-off 源码修正分列 |
| UCRT64 | 17 个原始包及签名已保存；包内 6,990 文件与已锁定前缀全部相同；17 项本地发行 keyring 签名检查通过 | 工具本身完整源码包、bootstrap/toolchain 重建与独立 keyring 信任审查 |
| Inno / InnoUnp | Inno 固定发布 digest 对应既有安装器工具；源码已保存。InnoUnp 原 ZIP 在固定 commit 下 EXACT，源码及分组件许可已保存 | 源码到工具二进制的独立重建；InnoUnp 源码中仍带预编译 object 输入 |
| 离线 Web / 资产 | 完整 Carnival Web 761 路径、23 个字体及19个图片的有界盘点；原 manifest 继续固定身份 | 精确 Web revision、完整源/构建锁与资产授权通知来源；当前官方 Electron 参考树不含完整 Web 快照 |

## libmpv 原归档

原文件为 `mpv-dev-x86_64-20260809-git-dd5d17d328.7z`，31,173,907 bytes，
SHA256 `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`。
[SourceForge 下载信息页](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download)
提供同名记录和相同校验值。GitHub 原 Release 页面、Release API 和 tag ref
本次仍为 404；SourceForge 的有效记录单独保留，不改写这些查询结果。

归档先经 `7z l -slt` 预检，再在新独占目录解包：8 项、6 文件、119,916,200
解压字节，路径/链接异常和大小写重复均为0。归档成员 `libmpv-2.dll`
119,725,568 bytes，SHA256
`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，
与 `vendor/native-helper-manifest.json` 和交付 `mpv-1.dll` 相同。
这关闭原归档取得、公开校验值和归档成员到打包 DLL 的字节对应缺口。

归档只包含 DLL、import library 和四份 API headers，没有独立完整通知文件或
构建脚本。headers 的许可文字不用于推断整个 DLL 的实际构建许可模式。
DLL 中 FFmpeg 字符串 `N-125998-g2a20737f6` 定位到
[固定 FFmpeg commit](https://github.com/FFmpeg/FFmpeg/commit/2a20737f662fd3f3f5999e873b9e7c90b5efc375)，
并以精确 commit 的 depth-1 Git fetch 和本地 `git archive` 保存源码ZIP及六份
许可/贡献通知入口。该ZIP不是GitHub codeload原件，生成方式和hash已分列；
其与DLL的关系仍仅属于 `REFERENCE`。mpv 的固定源码/header 对应是上一轮成果，本轮不重复计数。
详见 [libmpv 证据](evidence/third-party-mpv-20261009.json)。

## Host 与辅助组件

| 当前文件 | 官方包和具体成员 | 结论 |
|---|---|---|
| MediaBrowser.Common.dll | MediaBrowser.Common 3.3.10 / `lib/netstandard1.3/MediaBrowser.Common.dll` | EXACT |
| MediaBrowser.Model.dll | 同包 `lib/netstandard1.3/MediaBrowser.Model.dll` | 不匹配；精确来源 UNKNOWN |
| ServiceStack.Text.dll | ServiceStack.Text 4.5.14 / `lib/net45/ServiceStack.Text.dll` | EXACT |
| SimpleInjector.dll | SimpleInjector 4.0.11 / `lib/net45/SimpleInjector.dll` | EXACT |
| SharpCompress.dll | SharpCompress 0.10.3 的 net40/netcore45/portable DLL | 三项均不匹配；保留原 Host ZIP 中的历史 EXACT binary 入口 |
| SocketHttpListener.dll | SocketHttpListener 1.0.50 / `lib/net45/SocketHttpListener.dll` | 不匹配；保留原 Host ZIP 中的历史 EXACT binary 入口 |

包地址、包 SHA256、双方 DLL SHA256、nuspec、源码与通知入口见
[Host 证据](evidence/third-party-host-20261009.json)。三个匹配 NuGet 包未携带
独立 license 文件；网页 terms 或当前许可页面不能代替版本对应材料。
Host 根 LICENSE 也不覆盖所有独立依赖。

本轮保存ServiceStack.Text精确 `v4.5.14` 源码commit
`e5819a8de75a8bae64ddc7a64008613067893e32` 的许可文本，其中列出AGPL-3.0、
FOSS License Exception与商业许可说明；该文本是源码参考，不推断实际DLL
构建许可选择。SimpleInjector的精确4.0.11源码tag在有界查询中未找到，
v4.0.0的许可仅作近版本参考。SharpCompress使用canonical上游的0.10.3
commit，早先fork归档另标REFERENCE；双方427条目内容相同，但该准确tag
没有根license文本，旧CodePlex链接保留为线索。

libCEC 3.0.0 参考 commit 为 `3dcc821c86576c94ac3b5b73fd764cc16dfe05b1`，
platform submodule 为 `e237d8b3ab180ad85e3a944b275b297dd5cfa478`。源码版本
与 CEC DLL 的 ProductVersion 相符，但没有准确编译关系，driver installer
也不能由 libCEC 源码自动覆盖。RefreshRate 与 Host ZIP 的历史二进制匹配保持；
Host EXE、RefreshRate 的精确工具链/PDB/构建记录，以及 System.Configuration
的确切 targeting-pack 输入仍待补。

## 继承 Node 包及离线资产

七个保留包分别为 detect-rpi 1.4.0、is-linux 1.0.1、is-osx 1.0.2、
顶层 is-windows 1.0.2、power-off 1.1.2、sleep-mode 1.1.0，以及嵌套
is-windows 0.1.1。每个版本均直接读取 registry metadata，并从其返回的
tarball URL 取包，路径/类型预检后核对 SHA512 SRI 和 SHA1。未执行 npm
安装或包内代码。原保留集合29文件的生产生成 contract 不变。

除每个 `package.json` 的旧安装 metadata 外，统一换行后内容差异为
`power-off/index.js`：Carnival 传递 `stdout`，registry 原包引用 `stout`；
顶层 is-windows 1.0.2 的 README 在 Carnival 中缺失。五个旧 `_integrity`
字段与当前 registry SRI 不同，不能把该字段视为对 Carnival 内容的认证。
全部原始文件差异、精确版本、registry gitHead 及查询状态保留在
[Web/npm 证据](evidence/third-party-web-npm-20261009.json)。

对实际 build-review runtime 独立检查：七份继承包许可文本都存在，和各自
tarball 仅换行不同；项目四份随包通知/来源文件均与原 build manifest hash
相符。完整路径/hash 见 [随包通知检查](evidence/third-party-delivered-notices-20261009.json)。
本轮新下载的源码和通知位于研究目录，尚未自动加入任何发行包。

离线 Web 的761文件来自 Carnival，包含23字体与19图片；这里计数的是原始
输入 Web，不是经过覆盖/排除后的 runtime Web。路径中没有 license 命名文件
或 package/bower 组件描述；CSS 仅提供 Roboto、Material Icons 等名称线索。
有界检查未找到精确 Web revision，也未以字体名称推断来源或许可。
固定官方 Electron 参考 commit 的 Node 路径比对不能补齐 Web 来源。

## 工具链材料

本机 MSYS2 原始缓存的17包和17份签名已复制到本任务独占材料目录。仅在内存
解析 tar；普通文件、目录以及目标明确留在 `ucrt64/` 内的直接 hardlink 通过
预检，不执行解包安装。包内合计6,990文件逐项匹配已有锁定前缀，missing、extra、
changed均0；再次使用既有 `build-toolchains.cjs` 重算得到树 SHA256
`5215ec9725ad0ef660064944eef6aba5106bd09044a0f70a6e37c4252815fab3`。

17个签名经本机 MSYS2 发行 keyring 的本地副本校验，均有 `VALIDSIG`。
这是指定 keyring 下的密码学验证；未独立重新建立 keyring 的外部信任与撤销链。
首轮把 armored keyring 直接交给 gpgv 导致验证不可用，随后只在新材料目录
dearmor 并完成验证，未修改系统 keyring。

`.PKGINFO`、`.BUILDINFO` 已保留。15个不同 pkgbase 中，12个固定上游
`PKGBUILD` 的 SHA256 与包内 build metadata 完全相同，含 GCC 16.1.0-5
和 binutils 2.46-4。对应12目录54个配方/patch文件已下载，Git blob身份逐项
匹配。crt、headers、winpthreads 在每项最多3个历史候选中
未匹配，保持 UNKNOWN。配方匹配不自动覆盖其引用的所有 upstream source
tarball、patch 应用结果或构建宿主。详细归档、签名、配方和通知记录见
[工具链材料证据](evidence/third-party-toolchains-20261009.json)。

Inno 6.7.3 的固定发布记录 `digest` 与原 toolchain manifest 相同，签名 tag
解引用到 `4adf37ed7f3fd2bd11c6836ba056e3de170fbabf`，源码 ZIP 已保存。
InnoUnp 2.67 ZIP 在 `07ee3b1a05a26fa27a0efe110fe78dfa72c06c71` 下与原
manifest 完全相同；其源码中的 InnoSetup、bzip2、GPL、LGPL、LZMA、zlib
许可文件均已定位。仓库根 GUI 许可不能代表所有 innounp 组件，源码目录中的
预编译 object 仍是重建输入缺口。本轮未编译这些第三方工具。

## 材料保存、检查与下一步

新材料仅保存在本独立工作树 `.work/source-materials/` 的 mpv、host、web-npm、
toolchain、msys2-v2 子目录。固定材料目录/文件身份见
[本地收集清单](evidence/third-party-materials-files-20261009.json)。原 vendor、
原归档、原 runtime、主目录和同期发布工作树保持只读。研究脚本也留在该目录，
未进入构建链；证据文件是观察记录，不作为新的构建许可或来源 gate。

原提供者最小索取项见 [材料索取清单](THIRD_PARTY_MATERIALS_REQUEST.md)。
公开工具链 source tarballs、剩余配方和第三方源码重建仍是单独后续工作。
本轮只补事实和技术材料，不作法律认证；未运行真实 Emby/CD2、客户端、安装器、
驱动或下载到的程序，不增加播放/Session/窗口行为。

## 本轮验证结果

| 检查 | 实际结果 |
|---|---|
| 原归档与payload | libmpv archive/DLL重新hash通过；4项NuGet DLL成员主线程复算，3匹配、1保留不匹配；其它Host候选由独立复核逐项验证 |
| npm与通知 | 7份tarball SHA512 SRI主线程复算；7份实际随包license换行归一后相同；4份项目通知与原payload manifest匹配 |
| ZIP检查 | 主线程14个ZIP/NuGet包完整性与路径检查通过；mpv 7z另行预检、解包和hash验证 |
| 工具链 | 17包、17签名、6,990文件对应；12个PKGBUILD hash和54个Git blob身份；160项最终收集材料逐项hash读回 |
| 相关测试 | `node --test --test-concurrency=1 tests/build-input-contract.test.cjs tests/build-input-audit.test.cjs tests/build-toolchains.test.cjs`：43/43 PASS，0失败、0跳过 |
| 证据与文档 | 六份JSON可解析；15个交付文件范围检查、相对链接检查、敏感模式扫描和 `git diff --check` 通过 |
| 变更范围 | 只含docs与根通知；src/native/tools/tests/vendor/package/installer相对5af8443无diff |

初轮并行测试42/43，临时fixture内一次 `Git blob read failed` 使预期错误断言
失败；原日志保留，未据此断言具体环境根因，也没有修改测试或产品代码。
改为串行后完整43项通过。两轮日志分别位于任务材料目录
`targeted-tests.log` 与 `targeted-tests-serial.log`。静态材料检查与测试结果
不替代第三方源码重建、系统安装、真实播放或完整许可审查。

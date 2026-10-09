# 原提供者最小材料索取清单

日期：2026-10-09（UTC+8）。适用对象是 [本轮材料审计](THIRD_PARTY_MATERIALS_AUDIT.md)
绑定的 0.2.4 / `1a05f88357a08f5d7c99a7e5de28de20aad0dc79` 输入。
本页只是可交给原提供者的清单，没有向外部发送。

已取得 libmpv 原 dev archive、公开 checksum 和相同 DLL，无需再次索取归档或
把同字节改名作为未知。当前缺失的是下面能建立准确构建/资产关系的材料。
不存在已知预期 hash 的材料明确写 UNKNOWN，不发明校验值。

| 材料组 | 最小需要的文件/记录 | 已知对象和预期身份 | 用途及验收条件 |
|---|---|---|---|
| libmpv 构建记录 | 产出该 archive 的 winbuild commit、workflow run/build log、完整 resolved dependencies 清单、patches、构建配置和工具链镜像/包锁、通知集合 | `mpv-dev-x86_64-20260809-git-dd5d17d328.7z` SHA256 `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`；其 DLL SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`；上述新材料自身 hash UNKNOWN | 能把已验 archive 绑定到具体配方、每个依赖源/patch/config 和适用通知；mpv/FFmpeg 版本字符串不足以替代 |
| Windows Host | 精确 source tree/commit、相对公开参考源的补丁、依赖 lock/nupkg、MSBuild/SDK/targeting-pack/编译器版本和构建命令/日志；有则附对应 PDB | Emby.Theater.exe 3.0.20.0，SHA256 `11abf75c8f77ddb0078e7dd62a2eaae60dba244c113bc7893a7e56bc6527163e`；参考源为 `708fadc068cbf66ced6aece4a32f3e12bb2c4e13`，精确关系 UNKNOWN | 解释 Carnival EXE 与源/工具链的准确关系，不以程序集版本代替 |
| 尚未匹配的托管依赖 | MediaBrowser.Model、SharpCompress、SocketHttpListener、System.Configuration 的原包/准确来源revision、补丁和适用通知；System.Configuration 提供确切 SDK/targeting-pack 包 | 当前 DLL hashes 分别为 `f2eeca1c65e56e96340dc84ff91de6e4cc25bb2e510706748606f05c1e39ebaf`、`3c34138417974ce215e5d1b5bdbb7abd578ce77420073ea9de3f46ccebe42b55`、`7d1e347f1cb6ff10b011547665bcf13bb734306e8977e572021161f52a43f852`、`3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf`；源包 hash UNKNOWN | 对应成员 hash 必须匹配；不能用已验证 Common 包覆盖同包但不匹配的 Model |
| 已匹配 NuGet DLL 的源码与通知 | Common 3.3.10、ServiceStack.Text 4.5.14、SimpleInjector 4.0.11 的准确源码revision/修改/构建记录和版本对应许可通知 | 原 nupkg 和 DLL identity 已在 [Host证据](evidence/third-party-host-20261009.json) 固定；尚缺材料 hash UNKNOWN | 不重复索取已取得 nupkg；补 source-to-binary 关系及包中未包含的许可材料 |
| CEC / driver / RefreshRate | cec-client/cec DLL 和 USB-CEC installer 的精确 source、依赖/submodule、patch、Windows build recipe、工具链和通知；RefreshRate 的准确构建配置/工具版本 | CEC DLL SHA256 `6e2932ab53f4d05d5f815499786a48c3ccb8a60c527aa2f34e4abbf14dc66d04`；client `42f601278f82c37d0cc26460d4ac80e62f6cec5b84b2efb0ee8ed75c1cbc4519`；driver installer `6e4d5a091720cf5ad727896bbf3766e5529468e24849183439506130bde3546a`；RefreshRate `c3ac38b3345d804afc4ba97f34f059d0c4294ac5f55f62a25948ee62975eaa81` | 8项公开 Host ZIP binary 匹配已知；所需是源码构建关系。libCEC 3.0.0 参考源不能自动涵盖 driver |
| 离线 Web / 资产及继承包修改 | Web 精确仓库revision或源归档、构建配方/依赖锁、原图像/字体来源与通知、Carnival/综合补丁变更清单；七个保留 Node 包的原始导入/转换说明，尤其 power-off 源码修正 | Carnival SFX SHA256 `9d53fe71b42a530e9941f97ad712bd6724dbb0e7aa0e7de73a4bf9614b28b001`；761 Web 文件身份由既有 runtime manifest 固定；Web/资产原始源包 hash UNKNOWN | 逐文件建立原始来源与 overlay 关系，23字体/19图片独立列明；当前可读 JS、字体名称或 npm version 均不足以代替 |

提供者可先交付一个按组件分目录的材料包，附文件名/字节数/SHA256、公开来源、
精确 revision、构建说明与通知路径。个人 profile、媒体路径、账号、凭据和内部服务
地址均不需要。接收后只读预检并核对目标 hash；不直接运行提供的脚本或安装程序。

工具链原包、17份签名、Inno/InnoUnp 固定材料和七个 npm 原包已在本地收集。
剩余公开工具链 source tarballs、三项尚未匹配的 PKGBUILD、第三方重建实验可作为
独立技术后续，不要求原提供者重复交付已确认的本地工具输入。

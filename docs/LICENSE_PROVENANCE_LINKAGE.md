# 固定 DLL 的源码与链接线索（2026-11-09）

后续有限检查及可执行补证路径见[有界收尾](LICENSE_PROVENANCE_CLOSEOUT.md)；本页保留该阶段的观察与停止点。

本阶段在 [`1fbb2179868c15c9d6f609608c030cc0bee059cc`](https://github.com/hope140/EmbyTheaterEnhanced/tree/1fbb2179868c15c9d6f609608c030cc0bee059cc) 的[续核成果](LICENSE_PROVENANCE_RECOVERY.md)上，仅进一步检查已验证的固定 DLL、选定官方源码和精确元数据入口。没有重复下载/解包安装器，也没有运行 DLL、产品或重建源码。[新回执](evidence/license-provenance-linkage-20261109.json)记录来源 URL、固定 revision、Git blob ID、SHA256、静态检查和停止点；前两份回执保持原字节。

前一提交的 [CI 42598547980](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/42598547980)已完成且成功：Windows 2632 项，2627 通过、0 失败、5 跳过。这是 `1fbb2179…` 的实际结果，未移作 v0.4.20 发布或本阶段后续提交的测试证据。未更改 CI 分类或门禁。

## libmpv：实际静态证据能推进到哪里

对象仍为 SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`、119,725,568-byte 的固定 DLL。

| 本阶段观察 | 可以确认 | 不能据此确认 |
| --- | --- | --- |
| PE 普通导入表 47 个 DLL 描述符，两种读取方式一致；delay-import 目录 RVA/size 均为 0 | 正常导入名单包括系统库与 `vulkan-1.dll`，没有 FFmpeg、libass、libplacebo DLL；完整名单在回执 | 不能排除 `LoadLibrary/GetProcAddress` 等运行时加载，不能据此生成所有实际静态库清单 |
| 206 个具名导出，无 `avutil_configuration`、`avcodec_configuration` 等配置接口；COFF 符号表计数为 0 | 该 DLL 不以这些导出接口直接提供 FFmpeg 配置，未取得对应原生 PDB/link map | 不能把导出/字符串缺失解读为未启用 GPL/version3；也没有执行未知 DLL 以尝试查询 |
| libass 内嵌完整 revision 字符串 | 缩小到可取得的官方基础提交及其 ISC 原文 | 不证明源码无修改、依赖完整或历史构建逐字节可重现 |
| libplacebo 内嵌版本含短 revision 与 `dirty` | 能固定官方基础提交，明确不能仅以干净源码树解释成品 | `dirty` 不说明具体改动，更不自动表示未知作者或许可失效 |

普通导入/延迟导入与调试目录含义按 [Microsoft PE 格式](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)解释。本次用 Python 标准库按 PE32+ 表结构读取全部普通导入名称，与 GNU objdump 逐项交叉核对。此前 mpv 的 Configuration/FULLCONFIG 证据继续有效。

### libass：基础 revision 和 ISC 文本已落实

DLL 偏移 `98597067` 是完整可打印字符串：

```text
meson, commit: 0.17.5-3-g89cc0f4e450d64f74281a17d7f11ed05229665e8
```

该完整 SHA 对应官方 [libass 提交](https://github.com/libass/libass/commit/89cc0f4e450d64f74281a17d7f11ed05229665e8)。同提交 [meson.build](https://github.com/libass/libass/blob/89cc0f4e450d64f74281a17d7f11ed05229665e8/meson.build#L345)生成 `CONFIG_SOURCEVERSION`，调用 `git describe --tags --long --always --broken --abbrev=40`；主命令没有 `--dirty`，因此字符串无 dirty 后缀**不证明工作树无改动**。固定 builder 的 [libass recipe](https://github.com/shinchiro/mpv-winbuild-cmake/blob/cd1edc11dc6887a50f705717619d879f5a93a488/packages/libass.cmake)使用此官方仓库，声明 static 构建，但仍是配方证据。

同提交 [COPYING](https://github.com/libass/libass/blob/89cc0f4e450d64f74281a17d7f11ed05229665e8/COPYING)是 ISC，包含 libass contributors 的版权署名及保留通知条件，755 bytes，SHA256 `f7e30699d02798351e7f839e3d3bfeb29ce65e44efa7735c225464c4fd7dfe9c`。基础源码和许可原文已能直接取得，不再列为“需寻找 libass 官方来源/许可”；实际修改及依赖映射仍未取得。

### libplacebo：固定基础提交，保留 dirty 边界

DLL 偏移 `99849568` 为 `v7.371.0 (v7.360.0-109-g4d82c68-dirty)`。短 SHA 在官方 recipe 指向的仓库解析为 [`4d82c6898551068d4ae6a6b5538efcddc2c7cf64`](https://github.com/haasn/libplacebo/commit/4d82c6898551068d4ae6a6b5538efcddc2c7cf64)。同提交 [src/version.py](https://github.com/haasn/libplacebo/blob/4d82c6898551068d4ae6a6b5538efcddc2c7cf64/src/version.py)用 `git describe --dirty` 形成版本，meson 声明 7.371.0 与 LGPL2.1+；[LICENSE](https://github.com/haasn/libplacebo/blob/4d82c6898551068d4ae6a6b5538efcddc2c7cf64/LICENSE)是完整 LGPL 2.1 文本，24,478 bytes，SHA256 `b3aa400aca6d2ba1f0bd03bd98d03d1fe7489a3bbb26969d72016360af8a5c9d`；[源码头部](https://github.com/haasn/libplacebo/blob/4d82c6898551068d4ae6a6b5538efcddc2c7cf64/src/log.c)明确保留 2.1-or-later 表达。

固定 [libplacebo recipe](https://github.com/shinchiro/mpv-winbuild-cmake/blob/cd1edc11dc6887a50f705717619d879f5a93a488/packages/libplacebo.cmake)还会移除 `3rdparty/glad`、`3rdparty/fast_float` 并链接独立准备的目录，声明 static 构建。这是可能影响 dirty 状态的配方操作，**不能据此断言当时只有这两项差异**。最小新材料是实际 dirty diff、这些替代输入的解析 revision/改动，以及相关构建映射，不是再次下载干净基础源码包。

### FFmpeg 与必要通知范围

固定 [FFmpeg recipe](https://github.com/shinchiro/mpv-winbuild-cmake/blob/cd1edc11dc6887a50f705717619d879f5a93a488/packages/ffmpeg.cmake)的 GPL/version3、依赖与静态 pkg-config 选项仍是配方依据。针对已核 DLL 的有限 ASCII 搜索没有取得 `--enable-gpl`、`--enable-version3`、`libavutil license:`、`libavcodec license:` 字符串；这只说明这些字节序列未找到。官方固定 [libavutil/version.c](https://github.com/FFmpeg/FFmpeg/blob/2a20737f662fd3f3f5999e873b9e7c90b5efc375/libavutil/version.c)定义配置和许可查询函数，不代表这些函数/字符串必须完整保留于最终链接产物。已有 FFmpeg 版本和原 job 记录继续保留，本次没有把配方升级成实际 configure 输出。

对前阶段**准确的 64 个通知路径**进行了大小写不敏感的字面查询：未检出 `libass contributors`、其完整版权行或 `libplacebo`。这是具体署名/交付映射待补的证据，不能扩大为“整个包没有许可证”；扫描不覆盖所有内嵌文本、源码头部、HTML 实体写法或全部义务。libass ISC 原文和 libplacebo 的许可/源码已可取得，后续应按实际组成评审通知交付范围；本次只记录材料与边界，没有修改 runtime 通知装配、根许可证或产品包。

原 builder [workflow](https://github.com/shinchiro/mpv-winbuild-cmake/blob/cd1edc11dc6887a50f705717619d879f5a93a488/.github/workflows/mpv_clang.yml)确实收集 `ffbuild/config.log`，但日志 artifact 的保留期为 1 天；依赖源与工具链使用缓存。原 [run 31285220366 的 artifact API](https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/actions/runs/31285220366/artifacts)本次返回 `total_count: 0`。旧“8 个 artifact”是当时观察，不能当成现在可下载的列表；未重试此前被拒的发行日志，也未把工作流保留规则当作某个文件确已删除的证明。

## Model/Common：编译身份更明确，发布源码映射仍缺

只读 `System.Reflection.Metadata/PEReader` 检查已验证的官方 NuGet DLL，不加载目标程序集。两者均声明 `.NETStandard,Version=v1.3`、Assembly/FileVersion `1.0.0.0`、InformationalVersion `1.0.0`；没有 AssemblyMetadata 条目或可用源码 revision。NuGet 包版本 3.3.10 不等同程序集版本。

| DLL | MVID | CodeView GUID（age 均为 1） |
| --- | --- | --- |
| Common | `de37ece1-71f7-4074-8f65-540a1bcf7ba8` | `78535b6a-7da6-4ad0-ae2d-53b59f828513` |
| Model | `8230a66d-bafe-4792-a5b7-8f2350acc8ee` | `b238cd1a-6154-4779-8b09-9bb7f5620f3b` |

调试目录为 Portable CodeView 加 Reproducible 标记，没有 EmbeddedPortablePdb 条目。PDB 路径与前阶段一致。MVID/CodeView 标识用于精确匹配模块或符号，不是 source commit；Reproducible 标记也不是本轮独立重现构建的证明。

按 [.NET SymbolStore 固定源码](https://github.com/dotnet/symstore/blob/d66992e7c2f32288fbf1acf08cdea43098025c7c/src/Microsoft.SymbolStore/KeyGenerators/PortablePDBFileKeyGenerator.cs)，Portable PDB 键为 GUID 加 `FFFFFFFF`，不是普通 Windows GUID+age。对 [NuGet 官方符号入口](https://learn.microsoft.com/nuget/create-packages/symbol-packages-snupkg#nugetorg-symbol-server)按两个精确键各请求一次，均为 **HTTP 403**，未取得 PDB；状态、URL、响应大小/哈希在回执。没有替换域名重试，不据 403 声称符号不存在；该旧包也不能仅因当前服务支持 Portable PDB 而推定曾上传过兼容符号。

按内嵌路径查询准确仓库 `MediaBrowser/Emby.Server.NetCore`，API 在本次访问上下文返回 404，不能据此否定私有或历史来源。针对公开 Emby 仓库、NuGet 发布前的 Common 项目路径做一次有界历史查询，得到 [`0b6516a0…`](https://github.com/MediaBrowser/Emby/blob/0b6516a0c26315017c2f0cb1c0cee8d8f47bfcc4/MediaBrowser.Common/MediaBrowser.Common.csproj)，仍为 Profile7/v4.5/PCL；日期接近不能把它认定为实际 netstandard1.3 发布源码。已有官方二进制身份和已辨源码/许可依据保持。

## 本阶段停止点

- **libass：**基础 revision 与 ISC 原文已补齐；等待实际修改和相关依赖映射，不再重复找同一个基础仓库或授权书。
- **libplacebo：**等待与本 DLL 对应的 dirty diff、替代子目录的解析 revision/改动；干净基础提交不能解释全部实际输入。
- **FFmpeg/libmpv 全部组成：**等待该构建的 `config.log`/`config.h`、实际依赖 revision/补丁与 link map 或等效构建记录，确定配置、源码/notice 范围。不是把完整 SBOM、独立授权书或逐字节重建当作普遍许可前提。
- **Model/Common：**最小材料仍是 3.3.10 实际发布源码 revision、项目/打包映射；若有匹配上述 GUID 的 PDB及文档校验和/SourceLink，可用来核对映射。PDB 是有用路线，不是普遍许可条件。现有 DLL、普通 AssemblyVersion、发布日期及 403/404 结果均不能替代源码映射。

这些具体公开入口已按本轮边界检查；不宣称所有公开/历史来源都已穷尽。没有新原始材料则停止重复同项查询。无法精确重现历史构建不等于没有许可；本阶段不作兼容/违规结论，不联系第三方、不申请签名、不合并或发布。

复核可从新回执的固定 `officialSources` 下载原文，先验证 Git blob SHA-1 与 SHA256；按记录的 DLL偏移核版本字符串；用 `objdump -p` 与 PE import descriptor 读取方式比较 47 项；用 `PEReader.ReadDebugDirectory()`、`GetMetadataReader()`读取程序集属性/调试记录。17 个选定上游原文件、静态结果和有限通知查询均已核验；未进行新的完整产品回归。

# v0.4.7 来源历史追查与停止点

2026-10-31，在现有[材料清单](SIGNPATH_V047_MATERIALS.md)与[补件清单](SIGNPATH_V047_GAPS.md)基础上，对公开上游和 v0.4.7 可达历史进行一轮有界追查。输入与结果的完整路径、大小、SHA256、比较方式见[机器回执](evidence/signpath-v047-history.json)。这些观察补强具体来源和剩余问题，不把匹配视为授权、不把未匹配视为侵权。

## preload：追到首次模板入库，未追到原作者

完整取得 v0.4.7 的祖先历史后，`tools/templates/runtime/preload.js` 只有一次路径提交：[`d941bcd5`](https://github.com/hope140/EmbyTheaterEnhanced/commit/d941bcd5d285e509419d175ae4e828e737c0876f)。该次正文与当前207-byte LF模板一致，SHA256为 `2d1f39a8771dfe6f4bfa03c13a98bc6a19e50f5b2e814721d33f56183fabea38`。对可达 JS 历史用 `git log -S 'window.appdata'` 同样只得到此提交；未找到更早受跟踪的 `src/electronapp/preload.js` 历史。

首次入库已经标记它为既有 Carnival 桥接，准确作者/上游未建立。历史 [BUILD_INPUT_AUDIT](BUILD_INPUT_AUDIT.md)记载它先前由用户提供的 Carnival 3.0 SFX 解出，再经生成器产生 preload；该历史没有给出原作者许可链。模板入库提交作者不能因此被认定为七行正文作者。

本轮上游 Electron 仓库的根 `preload.js` 路径提交查询返回空列表，定向/组合字符串搜索也未返回可确认匹配。查询只覆盖所指路径、搜索可见范围和当前可达历史；不是证明所有上游历史都不存在该实现。**停止点：**现有仓库历史只能确认“从既有材料保留”，不能自行补出原始 grant。下一条有效线索是最早提供者的来源帖/原项目路径、源码包内适用声明或真实作者说明；不继续靠名字猜作者。

## Web：核实官方4.7.6与4.7.14，但不能给六个输入套整包版本

实际重新下载两个官方 [4.7.6.0](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.6.0)与 [4.7.14.0](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.14.0) netcore ZIP。分别为44849375 bytes、SHA256 `fcdd8b5d0c177bc8601ebdde33b953c7d728afd3367caba6ae34ec427b6f6074`，及41299962 bytes、SHA256 `ff5c412fb9f4faeb0f0d9da6c70e962205c29ff0483f161b85e9db05eb941804`，与既有历史回执一致。

从两个 ZIP 的 `system/dashboard-ui/` 同名路径读取六个重点输入：ConnectionManager、page.js、PlaybackManager、AppSettings、vtt.js、vtt.css。共12项都不与当前固定 Web 基底逐字节相同，去除一个 UTF-8 BOM及CRLF→LF后也不相同。该比较没有做新的 AST/函数证明；此前已辨旧GPL/MIT/Apache表达和局部映射继续有效，不因本轮不等而失效。

两份 netcore ZIP 中未发现文件名含 license/copying/notice 的成员。这只是文件名观察，不是“官方Web没有许可”或“无需许可”的证据；此前 Debian 包内单独的 server license.docx 观察也不能直接当作独立Web拆改授权。**停止点：**可以明确官方发布参考，但不足以给这六个文件整体标上某一官方版本或许可。只继续等待具体文件适用声明或修改来源，不重跑全量旧包普查，不将整文件不同换算成未知代码数量。当前四个MIT维护API模块依前轮证据，不重新列为旧ApiClient缺口。

## Model/Common：官方发布目录没有给出所需源码revision

官方 [NuGet登记](https://api.nuget.org/v3/registration5-semver1/mediabrowser.common/3.3.10.json)及其catalog确认 `3.3.10` 发布于2017-09-20 19:11:10.21 UTC，项目指向 MediaBrowser/Emby，没有licenseUrl、licenseExpression或repository字段。前轮已确认当前Model与该包内成员完全一致。

本轮进一步读取官方 [a304的Nuget/MediaBrowser.Common.nuspec](https://github.com/MediaBrowser/Emby/blob/a304b3cd0a330bb34fd3606a6afb9cd3d80176e4/Nuget/MediaBrowser.Common.nuspec)：它标为 **3.0.748**，把Common和Model打到 `lib/portable-net45+win8+wpa81`；其Model项目是 v4.5/Profile7。该固定源码树的完整路径清单未截断，只有这套Model/Common csproj与nuspec，未出现另一套netstandard专用项目。官方GPLv2参考源的存在已确认；此处未建立它到实际 **3.3.10/netstandard1.3** 发布的完整映射。

另尝试读取官方现有 beta/dev/master 三分支HEAD下这两个固定路径，六项请求均返回HTTPError，本轮采集器未保留HTTP状态，故未取得新内容，不据此判定路径不存在或源码未公开，亦未重复请求。**停止点：**缺的仍是实际3.3.10发布源码、构建/打包项目和已定位Common差异的对应关系。NuGet元数据未给revision，不能从发布日或相同项目名猜一个提交，也不把“参考项目是portable”直接当作授权失效。

## libmpv：原始归档只有接口与二进制，没有完整源码包

在不提取到产品目录、不执行DLL的情况下，用系统libarchive流式读取已固定SHA256的原始7z。其八个条目为两个目录、四个API头（client.h、render.h、render_gl.h、stream_cb.h）、导入库 `libmpv.dll.a` 和 `libmpv-2.dll`。DLL为119725568 bytes，SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，与现用输入一致。归档没有另外附完整mpv/FFmpeg/依赖源码或完整GPL通知包；API头内原有通知保留，不能拿它们代替整个DLL条款。

重新取得固定builder ZIP，175497 bytes、SHA256 `770882870fd2d66411150947777147e8c7ebaa5b8b6e980b7643b79b7bc4a989`，与原回执一致。[FFmpeg recipe](https://github.com/shinchiro/mpv-winbuild-cmake/blob/cd1edc11dc6887a50f705717619d879f5a93a488/packages/ffmpeg.cmake)确有 `--enable-gpl`、`--enable-version3`，且未在该recipe指定GIT_TAG；[mpv recipe](https://github.com/shinchiro/mpv-winbuild-cmake/blob/cd1edc11dc6887a50f705717619d879f5a93a488/packages/mpv.cmake)有 `--prefer-static`。recipe不是完整的实际链接清单。

原 [run31285220366](https://github.com/shinchiro/mpv-winbuild-cmake/actions/runs/31285220366)当前artifact API列8个架构/调试产物，未列source/configuration命名产物；本轮没有下载这些artifact，也不据名字声称内部一定没有材料。既有已取得的job transcript、mpv/FFmpeg源码及builder证据仍有效。**停止点：**原dev归档本身无法补齐完整对应源码；缺实际解析依赖版本、补丁/配置、链接集合和必要通知。无新的源锁或发布者材料，不再把同一builder反复下载当作缺口关闭，也不声称本轮做出了GPL组合结论。

本轮没有产品更改、资源替换、系统安装、第三方上传或签名申请。没有对已返回403的发行日志重试或换通道。

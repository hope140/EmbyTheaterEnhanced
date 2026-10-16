# v0.3.4 本地测试候选

## 发行状态

2026-10-16：[v0.3.4 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.4)已发布，Tag与重新构建的标准安装器固定最终main源码`98c26e4a123f0b8c623451ee7603fc431b28bddf`，Stable/Latest仍v0.3.1。公开CI940项、材料156项、隔离首页17项/电影库25项与三视口检查通过；runtime及安装器解包2157文件一致，五项公开附件全部匿名回读通过。安装器SHA-256为`eedf03e83b0f4b2b2ef674134af4fefc5068573b5bb82466e3ad4191c46d0c3d`。真实服务器/播放/远控、前台及系统安装仍未验收。

以下保留发行前本地候选及用户观察的原始证据；旧目录、ZIP和用户profile保持，各自来源及哈希不替代已发布安装器。

## 2026-10-16 用户反馈

用户在收到ae245f6标题跳转候选后反馈“现在没看到有什么问题”。按上下文归属于当前v0.3.4候选的有限使用观察，记录为USER_REPORTED_NO_ISSUE / MONITORING；本次标题缺项转入观察。用户未逐项说明点击/Enter/See All/返回焦点、媒体类型或设备组合，不补写逐项PASS，也不扩大为真实播放、远控、旧服务器矩阵或安装验收。缓存继续不做，既有包体/sourceCommit保持，未因此发布或启动后续版本。

发行前电影库试点的实现、源码审阅、来源绑定构建与隔离后台检查已完成，曾交付本地人工测试；其历史证据不表示真实业务验收完成。

## 首页标题跳转续办候选

当前入口为 `dist/ETE-v0.3.4-home-titles-ae245f6-20261016/Start-v0.3.4.cmd`，使用全新独立test-profile，首次需自行登录。原ed00a97入口、ZIP及profile继续保留。

| 对象 | 当前身份 |
| --- | --- |
| 产品源码 | `ae245f623fa32957c155cfb8b5dd1f1e7aa78987`，版本0.3.4 |
| Runtime | `dist/EmbyTheaterEnhanced-v034-home-titles-ae245f6-20261016`，2156 payload / 2157完整文件 |
| Manifest SHA-256 | `b3cd0fe004b96ccaee8e3fe925579373f82cd1b86a4176a7c829d0c5445ad350` |
| Payload-set SHA-256 | `acf43a44d4488ffa598d9101604c0cef47a6943dad0149c78211a8c96ca7442f` |
| ZIP | `dist/ETE-v0.3.4-home-titles-ae245f6-20261016.zip`，2161文件逐项回读匹配 |
| ZIP SHA-256 | `6e4abb611e896af0de8ec232d6290043354cd58e4204b4d8233e50cca68c12c2` |

桌面首页latestmedia分区在有受支持电影/电视剧父媒体库时，通过原native标题、See All和canonical router跳到该库原suggestions最近页签。返回时恢复新标题/可见See All焦点；缺少支持目标的分区和TV布局保持普通标题。缓存、refresh清空/重试/5秒时限、搜索布局、播放核心与默认内核均保持。

当前来源公开门禁940/940、定向/固定材料39/39通过；实际来源/包体核对和2161 ZIP逐文件读取通过。空profile、合成API的完整应用17项通过，包括原main/loader/router/native控件、标题/See All点击、真实Enter导航、返回焦点与内容、跨账号失效阻止、TV普通标题；390/800/1280视口无页面横向溢出并实际查看截图。原生See All仍由itemscontainer按条目数隐藏，未改变其门槛。show、外部请求、Node网络、Native启动和所属残留进程0；只有原file: Service Worker Cache警告。

上述计数绑定最终ae245f6来源的私有回执：公开为`home-title-public-ae245f6.log`（940），定向为`home-title-targeted-visible.log`（39）；较早`home-title-public-final.log`（939）与`home-title-targeted-final.log`（38）属于先前实现阶段，不作为最终来源记录。

独立启动wrapper的appData/userData/config隔离探针通过，生成profile不随包；外层wrapper单独记录SHA，runtime仍绑定上述产品sourceCommit。请人工确认真实桌面首页标题跳转、Enter与返回焦点；实际服务器ParentItem DTO、前台视觉、真实播放/远控和安装保持NOT_VERIFIED。

以下保留首批电影库候选的原始产物身份与证据，不能据其哈希校验当前标题跳转ZIP。

## 首批电影库候选来源（ed00a97）

| 对象 | 身份 |
| --- | --- |
| 产品源码 | `ed00a97c11490a36e2a844c531772750deb22524`，分支 `codex/v034-library` |
| 产品版本 | `0.3.4` |
| 构建runtime | `dist/EmbyTheaterEnhanced-v034-ed00a97-20261016-r2` |
| Payload / 完整runtime | 2156文件 / 2157文件（含build-manifest） |
| Build manifest SHA-256 | `9cf1211f4c367f82445cac59883037b165c1cce18072a9c7383d5cfd811f577b` |
| Payload set SHA-256 | `8a70575381f2ea59a64dab112b6a10d5d5bf19a7acd189bf948d9a33abcccbac` |
| 本地目录 | `dist/ETE-v0.3.4-local-ed00a97-20261016` |
| 最终ZIP | `dist/ETE-v0.3.4-local-ed00a97-20261016-r2.zip` |
| ZIP SHA-256 | `81962ab3d5f521925408ecb07a89d14de27861735781dc65b727d8c1fdb8b735` |

后续文档HEAD与产品sourceCommit分开，文档收尾不重打或重标runtime。ZIP内runtime保持原manifest字节；外层启动wrapper和说明单独由随包VALIDATION记录，不冒充源码提交中的产品文件。

## 本批变化与已执行验证

电影库复用原分页、筛选排序、卡片/列表与播放入口；新增请求取消和迟到响应归属检查，保护重复刷新、离页和返回焦点，修正电影类别入口页签。调用图、固定变换和回退见 [电影库合同](MOVIE_BROWSER.md)。

| 层级 | 结果与范围 |
| --- | --- |
| 公开离线 | 931/931，失败/跳过0 |
| 电影单元与固定材料 | 22/22；冻结基线复现、真实default拆包、原controller及首屏/分页/延迟焦点提交边界 |
| 来源夹具 | 6/6；overlay与runtime provenance，保留tamper与完整集合断言 |
| 实际包体 | VerifyOnly、2156逐文件SHA及2157完整runtime集合、16项独立断言通过 |
| 最终ZIP | 2161文件逐项回读与完整集合通过，4359项审计断言通过；SHA与sidecar一致 |
| 隐藏完整应用 | 23项通过；正式main、app.js、loader、router、原controller/卡片/列表与合成API |
| 返回恢复 | 真正进入现有详情路由后返回，同一合成影片焦点，滚动1460→1460；另覆盖离页取消和迟到响应 |
| CSS视口 | 390/800/1280无页面横向溢出并查看截图；390临时覆盖夹具窗口最小尺寸，产品约束不变 |
| 隔离与收尾 | 空profile；实际显示、外部浏览器/Node请求、Native子进程和所属残余进程0 |
| 直接入口探针 | appData/userData/config均位于独立test-profile，版本0.3.4，显示/网络/子进程0 |

合成偏好写入只进入夹具内存，未访问真实服务器。唯一保留的页面警告来自原file: Service Worker Cache路径；非预期页面错误为0。合成旧版本提示检查不构成真实旧服务器兼容矩阵。

锁定依赖原带的12个 `@protobufjs` 测试文件继续保留，均与v0.3.3主线manifest及实际文件同字节，对应9个依赖的版本和integrity也一致；没有借本批浏览工作裁剪依赖树。ZIP中没有本轮私有profile、harness、fixture或额外测试文件。

## 打开与人工确认

完整解压ZIP后，双击 `Start-v0.3.4.cmd`；本机已有目录可以直接使用同名入口。首次需自行登录，启动wrapper在正式main之前固定独立 `test-profile`，不复制现用客户端资料。默认内核不变，不需要系统安装。

请确认实际电影库翻页、连续筛选排序、卡片/列表切换、进入详情后返回位置与焦点，以及键盘/遥控和窄窗口体验。真实登录/服务器矩阵、前台视觉、播放/远控和安装仍为NOT_VERIFIED。

本地候选没有推送、PR、合并、Release、系统安装或服务器业务写入。后续产品修正应另记产品来源；不扩展为v0.3.5或其他版本实施。

# 电影库浏览合同

v0.3.4 以电影库为试点，基线为 v0.3.3 后的 main `6fb61e3`。这是现有页面的局部浏览适配，版本身份不代表新版 Web 整树已迁入。

## 调用图与最小差异

`/videos` → `videos/videos.js` → `videos` 页签 → `modules/tabbedview/videostab.js` → `ItemsTab` / `ListController` → `emby-itemscontainer` / `virtual-scroller` → 当前 ApiClient 的 `getItems(userId, query, signal)` → `Users/{userId}/Items`。

| 能力 | 现有行为 | 本批处理 |
| --- | --- | --- |
| 分页 | 虚拟滚动传 StartIndex、Limit，controller 合并当前查询 | 保留分页和 DTO，将电影查询取消信号传到既有 API |
| 筛选排序 | 原菜单、用户设置及查询组装已存在 | 保留原语义；实际刷新开始时使前轮分页与首屏请求失效 |
| 卡片与列表 | 原 CardBuilder、ListView、上下文动作和原播放入口 | 保留组件与媒体身份，不复制新版卡片树 |
| 返回位置与焦点 | route back 恢复缓存 view 的 activeElement；容器刷新按 ID/index 恢复，桌面另保留滚动位置 | 保留原机制；暂停、销毁或更新轮次后的旧异步回调不得再次 autofocus |
| 电影类别入口 | 旧电影首页传 tab=movies；真实影片页签 ID 为 videos | 将该入口映射为 videos，favorites / collections 保留 |
| 离页与重复刷新 | 旧普通查询未转发 signal，首屏完成直接提交 | Movie 实例安装请求维护层，独立检查轮次、ApiClient 与用户；传输忽略 abort 时仍丢弃迟到结果 |
| 旧服务器与接口错误 | 使用原 Item 查询和原错误处理；已存在的排序字段有版本门槛 | 不引入新端点、权限或 DTO；当前请求错误保留原对象，旧 owner 的成功及失败均转取消 |

固定 Server 4.10.1.0 私有静态样本的 ListController 普通查询已转发 signal；其分页、筛选排序和页面结构仍与本批复用合同相容。该观察仅作差异依据，不证明服务端兼容矩阵或新版整体性能。使用现有组件不依赖样本缺失的现代 keyboard/virtual-scroller 闭包；本批没有复制样本资产。

## Owner 与允许范围

`enhanced/library/movie-browser.js` 只给 `itemType=Movie` 的 VideosTab 安装维护层，包括电影收藏页签的同类型实例。Episode、Series、搜索和其他页面不安装。刷新与页面生命周期仍从原公开方法进入，容器继续拥有渲染、分页、位置恢复与焦点。暂停/销毁同步取消所属 pending promise；外部 signal 只取消对应请求。无刷新恢复保留原容器状态，不强制清空或跳回首屏。

自有模块通过唯一 AMD alias 加载，共享连接模块使用 canonical ID。普通 getItems 保持同一个 ApiClient、原 query 与原 Item DTO。未增加服务器写入、认证、播放或 IPC 链路。PlaybackManager/Item/MediaSource/PlaySession/Session/WebSocket、Resolver/CD2/Mount/DirectUrl、Native Helper/libmpv 与窗口 owner 保持。

只维护自有模块、固定输入变换生成器、overlay/build-input 合同、相关测试和版本/说明。vendor 只读。app、VideosTab、ItemsTab、ListController、电影类别、itemscontainer 与 virtual-scroller 七个输出按原输入/新输出 SHA 绑定；生成器进入来源合同。Movie实例的首屏提交、分页item-source写入和原容器50ms延后焦点/monitor回调都复核轮次；同查询中被中断的分页仍可重试。移除本批 alias、模块及整组 overlay delta 可恢复原页面；不迁移持久化格式或配置。

首批源码提交的审核范围为以下14个文件，已固定为 `ed00a97`。后续交付记录属于独立文档提交，不改变该产品来源。

| 分组 | 文件 |
| --- | --- |
| 产品模块 | `src/electronapp/enhanced/library/movie-browser.js` |
| 变换与来源 | `tools/patch-movie-browser.cjs`、`tools/prepare-web-overlays.cjs`、`tools/build-input-contract.cjs` |
| 验证 | `tests/movie-browser.test.cjs`、`tests/movie-browser-material-selftest.cjs`、`tests/build-input-contract.test.cjs`、`tests/runtime-provenance.test.cjs` |
| 版本与说明 | `package.json`、`package-lock.json`、`CHANGELOG.md`、`docs/MOVIE_BROWSER.md`、`docs/PROJECT_STATUS.md`、`docs/DEVELOPMENT_LOG.md` |

## 验证与交付门槛

- 离线 helper：Movie 限定、分页参数/结果/错误保真、signal 下传、刷新/离页/销毁取消、忽略 abort、账号变化、无刷新恢复。
- 固定材料：消费原 app.js 的真实 default 解包函数及原 VideosTab/ItemsTab/ListController/容器 refresh 方法，验证重复刷新、筛选参数与分页、迟到结果和 autofocus；固定锚点偏移或重复变换必须失败。
- 构建：来源绑定构建、完整 source/runtime provenance、payload 与版本核对。构建要求已提交的准确源码；未提交候选不绕过该门禁生成交付包。
- 隐藏应用：在隔离空 profile、合成 API 与阻止网络/子进程条件下，检查实际 loader/路由/原组件及 390/800/1280 视口、返回恢复与错误场景。源 VM 证据不能替代该层。
- 人工：真实电影库分页、筛选排序、卡片/列表、进入详情后返回位置、键盘/遥控焦点和窄窗口。真实播放、远控、系统安装分别记录，不由浏览测试推定。

本合同不承诺性能提升。构建、隐藏完整应用与人工结果以 PROJECT_STATUS 的实际证据为准；未执行项保持 NOT_EXECUTED / NOT_VERIFIED。

本地构建及隐藏完整应用检查已完成，准确产品身份、交付入口与仍需人工确认的项目见 [v0.3.4本地候选](V034_LOCAL_CANDIDATE.md)。

源级复核命令：`node --test tests/movie-browser.test.cjs tests/movie-browser-material-selftest.cjs`。后者要求固定vendor材料存在，缺失直接失败；不能用简化fixture或跳过代替。

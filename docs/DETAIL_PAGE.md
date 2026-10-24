# v0.3.5 详情页合同

## 实际页面与差异

基线为 v0.3.4 后主线 `ef7a8d8`。`app.js` 注册 `/item` 与模板别名，`modules/approuter.js` 将 Movie、Series、Season、Episode 导向该页；原 `item/item.js` 的 ItemPage 与 BaseView 继续拥有页面生命周期。没有引入第二套详情或新版 Web 整树。

| 类型 | 原生信息与分区 | 本轮处理 |
| --- | --- | --- |
| Movie | 信息、媒体版本、视频/音轨/字幕、播放按钮、相关内容 | 请求归属与离页保护 |
| Series | 系列信息、下一集、季列表 | 同一详情事务保护，保留原列表 |
| Season | 季信息、原 trackList/getEpisodes | 同一详情事务保护，保留原列表 |
| Episode | 集信息、原版本/轨道选择、同季更多集 | 同一详情事务保护，保留原选择与列表 |

版本、视频、音轨、字幕仍由 ItemPage 消费原 select 的 value/change，菜单由 EmbySelect/ActionSheet 实现；v0.3.3 的 custom 菜单和宽屏 overlay 保持。播放仍走原 playCurrentItem/commandprocessor/PlaybackManager，不改变 Item、MediaSource、Session 或任何播放器 owner。没有新增缓存或刷新策略。

## 已确认缺项与最小实现

原 startDataLoad 在销毁后仍调用 onDataFetched，后者立即访问已置空的 view。使用 v0.3.4 完整 runtime、空 profile 与合成只读 API，在旧 ItemPage 启动延迟请求、销毁并释放响应时，实际得到 null classList 的未处理拒绝。该证据来自隐藏完整应用，未访问真实服务器或启动播放器。

受控变换 `tools/patch-item-lifecycle.cjs` 串联在既有 item overlay 后；每次加载捕获页面与递增代次，暂停/销毁使旧代次失效。加载前阶段不同于已显示阶段，onBeginResume 明确开放该页面事务，不用 BaseView.paused 阻止合法返回加载。过期 Item 回复不再继续请求播放来源信息；过期成功/失败不进入主渲染、reload 后续、选择器回填与焦点更新。底层既有 API 请求不强行中断，取消为详情提交失效；不改变 API 或 PlaybackManager 取消合同。

仍在当前事务的错误维持原 Content no longer available 与 Home 返回路径。没有加入新重试业务；当前信息区和布局在没有独立问题证据时保留。原动态分区列表继续由 itemscontainer/virtual scroller 管理，其生命周期不转交详情补丁。

## 文件范围与回退

产品变更限根版本/锁文件、详情变换器及 Web overlay 接线/固定输出哈希；测试覆盖生成器与冻结材料，文档记录合同与来源。vendor 只读。删除本次生命周期变换接线并恢复原输出哈希可整体回退，HTML/CSS 与原选择器实现没有本轮产品变化。

## 验证边界

需要覆盖：旧请求成功/失败、重复刷新、离页/销毁/返回、原四选择器 value/change 与原播放参数、Movie/Series/Season/Episode 可达页面、错误返回、鼠标/键盘和390/800/1280视口。使用真实 AMD、原 controller 和组件的隐藏完整应用；合成 API、空 profile、阻断外网/Native/前台动作。材料测试不可用须明确失败，不能跳过。

最终结果、产品 sourceCommit、runtime/ZIP 身份及人工清单见[本版交付记录](V035_LOCAL_CANDIDATE.md)。真实服务器、前台使用、播放/远控、安装和硬件证据需分别验收，合成隐藏测试不替代这些证据。

首次菜单取消探针观察到原生ActionSheet拒绝为undefined且原EmbySelect没有拒绝回调，产生四条未处理拒绝。本轮共用选择器与ActionSheet字节保持原状，该取消诊断缺口保留为OBSERVED。成功选择菜单的最终隐藏验证通过；没有删除首次失败或把取消路径记为通过。另一次夹具在菜单DOM出现但异步选项未填充时提前点击，修正为等待实际原生列表条目；Series播放入口按原生resume按钮核对，不强求隐藏的PlayFromBeginning按钮可见。

## 后续独立持久缓存试验

基于组合 d8870fbd 的新候选在原生命周期变换后串联静态 DTO 接线，不替换本版历史材料或放松归属 guard。范围、试验容量、删除／权限、原播放关键路径及验证层次见[详情缓存合同](DETAIL_PAGE_CACHE.md)；未据此宣称正式版已加入缓存或用户整体验收通过。

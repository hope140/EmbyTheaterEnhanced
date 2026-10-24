# 首页界面流畅度实验

目标是减少返回时的空白和首屏对慢分区的等待，不以增加缓存命中率代替可见界面验证。本实验从独立页面缓存分支继续，保留修复候选来源 `bcf9453fc1173ae5a40468f466bf1de1ab77ad38`；没有整合其他功能或纯问题修复分支。范围仅限当前服务端首页 controller 的一条可验证路径，不宣称媒体库、搜索、详情或全部页面已优化。

## 默认和测试入口

普通启动仍用原 baseline 流程，布局缓存仍缺配置默认关闭。实验仅通过源码依赖注入 `homeFlowOptions.mode`，或既有强制新 profile 的显式隔离测试启动参数选择：

| 模式 | 行为 |
| --- | --- |
| baseline／缺省 | 原清空、全部首批 Items 完成后统一呈现。 |
| retain | 同身份、查询和布局保留原 stage；返回重新读取数据，首次进入保持统一呈现，便于单独比较返回复用。 |
| sections | 同样保留返回 stage；首次进入各分区独立呈现、独立错误和重试。 |

精确分支新包通过完整来源、VerifyOnly 及解包对照后，才可在独立解包 runtime 直接启动：

```powershell
& (Join-Path $trialRuntime 'x64/electron/electron.exe') `
  (Join-Path $trialRuntime 'electronapp') `
  '--ete-page-cache-test=disabled' `
  '--ete-page-cache-ttl-ms=10000' `
  '--ete-page-cache-max-entries=2' `
  '--ete-page-cache-max-bytes=1048576' `
  '--ete-page-cache-home-flow=sections'
```

这使布局数据缓存关闭，单独测试界面编排；三项数字只是复用已有隔离入口的显式测试配置，不新增产品 TTL 或容量。切换最后一个值为 retain／baseline 做对照。缺少原四项、重复、未知模式或额外配置仍拒绝，普通入口不接受内部 renderer 参数。

沿用[隔离启动合同](PAGE_CACHE_TEST_ENTRY.md)：每轮全新 `ETE-page-cache-test-*` 根，不复用／导入账号，不执行普通安装器或 Host，不覆盖正式数据。新增模式除原关键源码／preload 身份外，还核验 itemscontainer 与 virtual-scroller 两份完整组合输出的精确 SHA；不匹配时在创建 profile 前拒绝。启动 PREPARED 只证明入口准备，不证明功能或 GUI 验收。

## 返回和首屏的归属

`home-tab.js` 仍是原 HomeTab 生命周期下的唯一首页 owner。保留的 stage 只属于同一个实例；client、server、user、已登录状态、认证代次、locale、服务端版本、displayMode 及受支持路由参数必须一致。未知参数使返回复用关闭。布局每次重新读取／按显式布局缓存策略处理，投影签名不一致则重建；没有新增跨实例、跨账号或持久页面池。

每次返回仍重新读取所有分区首批 Items，未永久缓存用户进度／收藏／内容 DTO。普通静态行可先显示原海报和文字，但取数期间不可操作；继续观看、下一集、直播／录制等动态行遮住旧内容，完成后才显示。通知标记脏状态时全部行遮住旧内容；不读取或记录通知 Data。认证／连接事件同步退休 stage，原认证 setter 的直接变化在读取和提交边界检查。

成功布局下，sections 模式先建立有序标题与比例占位，然后让分区分别加载。一个慢／错误分区不切掉其他成功分区；错误仅显示通用文字与原生按钮重试，重试只读该区。不支持的布局／能力仍回完整旧 homesections，不混用未知 schema。旧首页的刷新归属保持原组件，本实验不额外监听其数据事件。

滚动由原 scroller 持有，复用返回时保存／恢复外层及行内位置；焦点按仍存在的 item／标题标识恢复，目标消失时安全回退。用户已重新输入、滚动或选择后，迟到分区不再收回焦点／位置。没有承诺随机排序、未加载分块或所有遥控输入在完整客户端中均已体验通过。

## 取消和原生组件检查

- 暂停、新导航、身份变化、事件失效和销毁均使旧票据失效；provider 仍负责 GET 的取消及原期限。
- 每份交付结果在弱引用表绑定票据和本轮请求。Home 自己安装 `eteHomeFlowOwns`；原 itemscontainer 在 DOM 提交前和既有延迟后的焦点／刷新回调再次核对，virtual-scroller 在分块写入前核对。其他页面没有该钩子，原 Movie/Search 变换及归属保留。
- 两个新增检查由原固定 Web 来源经过 Movie、Search、Home 的完整组合生成并绑定输出 SHA；vendor 原文只读。没有包装共享 API、认证、PlaybackManager 或图片请求。
- 原生刷新会消费取数失败，因此 owner 另记录本轮实际读取成功与否，避免把完成的 Promise 当成功并重新展示旧进度。
- 事件以微任务合并同步通知，退休后旧排队工作不能启动；没有轮询或无界自动重试。销毁解绑自己的 CM/API／输入监听，释放 stage、位置和焦点引用。

## 可重复的证据

标准 Node 回归覆盖真实 controller/provider/cache/事件及精确生成的原生提交代码，DOM／网络使用明确夹具：

```bash
node --test tests/home-server-rendering.test.cjs tests/home-flow-material.test.cjs tests/home-server-rendering-material-selftest.cjs tests/page-cache-test-entry.test.cjs tests/home-layout-cache-integration.test.cjs
```

可选无界面检查使用**已经安装**的 Playwright 和 Chromium；工具不会安装浏览器、连接服务器或读取个人 profile：

```bash
node tools/check-home-flow-renderer.cjs /absolute/path/to/chromium
node tools/measure-home-flow.cjs /absolute/path/to/chromium <exact-40-char-source-SHA> baseline 5
node tools/measure-home-flow.cjs /absolute/path/to/chromium <same-source-SHA> retain 5
node tools/measure-home-flow.cjs /absolute/path/to/chromium <same-source-SHA> sections 5
```

对照固定两区、布局15ms、首区25ms、慢区220ms；每模式5个全新 page，每轮均测首次和返回。缓存关闭，逻辑 GET 数保持可核对，不把条件差异包装成减少网络流量。输出记录 source SHA／controller SHA、浏览器版本、首个可见／可交互 DOM 的 rAF／viewport 代理时间、完成时间、空白采样帧、stage 是否复用和位置／焦点状态；无真实 URL、凭据或用户数据。代理指标不是 GPU 实际首绘、生产组件渲染耗时或用户主观流畅度。

renderer 执行真实 Home controller/provider/Events/cache 和真实 DOM／Window 定时器；API 是合成 Promise，Items/CardBuilder 为替身。原生提交／延迟／分块钩子另以精确组合的生产函数测试。没有把两者描述成完整 Alameda／原生 CardBuilder／Windows Electron／真实 NAS 的整包证据。完整运行仍须后续独立包、空闲时段和允许的测试身份验收；不安排用户工作期间的前台试验。

## 停止条件与后续

跨账号旧内容、进度不新鲜、焦点跳动、旧响应覆盖、无界请求、内存不收敛或播放受影响时停止扩大范围。若相同条件下首屏／返回没有可核对改善，也不继续增加缓存。

图片继续走既有 URL/tag/HTTP 缓存，未新增海报库；尚未取得图片尺寸／解码瓶颈证据。长列表尚未做实机内存曲线，不增加淘汰策略。新增[最小缓存管理](CACHE_MANAGEMENT.md)只统计／清理首页布局 DTO 和当前 session HTTP 缓存；其他资源仍须由各 owner 安全分项处理；HTTP 总量不得标成纯海报占用，不能清登录／设置、整个 profile 或播放中的 lease。现阶段也未测原生字体／屏宽下的占位高度、视觉抖动和完整返回滚动，不能宣称全部页面优化完成。

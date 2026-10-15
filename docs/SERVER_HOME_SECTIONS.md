# 服务端首页接入合同

首批采用服务端首页分区和顺序，保留旧首页回退；只读取配置，不在客户端实现服务端分区编辑。当前完成的是独立接口适配模块与离线合同测试，尚未接到 HomeTab，也没有改变现用首页。

## 当前模块

`enhanced/home/server-sections.js` 是无副作用的 AMD/CommonJS 模块。调用方提供当前既有 ApiClient，不新建认证、连接或播放 owner。模块只调用已有 `getUrl` 与 `getJSON(url, signal)`；不读取令牌、不增加认证 header，不调用保存、重排、删除或任何 POST 接口。

- 最低版本暂以固定 4.10.1.0 Web 分析样本的 `4.10.0.4` 判断为依据；严格检查版本格式，再实际尝试 GET。它是客户端能力提示，不是经实测确认的服务端兼容矩阵。
- `loadSections({displayMode, signal})` 读取 `Users/{userId}/HomeSections`，displayMode 只允许 `tv` 或 `mobile,desktop`。保留返回顺序和标题；显式空数组保留为空布局。
- `loadItems(section, {startIndex, limit, signal})` 只接受本轮模块返回的 section 对象，调用 `Users/{userId}/Sections/{sectionId}/Items`。ID 按单一路径段编码；只发送固定字段、图像类型、分页与同一 section 固定 RandomSeed，不转发服务端任意 URL 或 QueryOptions。
- 保留普通 Item DTO 交给未来现有 CardBuilder，不创建或改写 Item/MediaSource/PlaySession 身份。不同 ServerId 的 Items 会拒绝。
- 每次刷新取消上一轮。请求关联当前 ApiClient、server、user 与轮次；暂停/销毁/外部取消使迟到响应失效。getJSON 即使忽略 AbortSignal，模块也会在取消或最长超时后结束等待；不会把旧 owner 的响应或失败交给新首页。
- `server` 表示接口数据可供后续渲染；`fallback` 要求调用方回到完整旧首页；`cancelled` 要求丢弃，不触发旧首页渲染。默认请求期限 5 秒，仅为接口候选的保护上限，不是性能结论。

当前支持常规媒体类 SectionType，以及 cards/buttons/list/spotlight 的结构声明。未支持类型、未知 ViewType、交互 HeaderButtons、坏 DTO、请求失败和超时都会要求整体回退；不悄悄遗漏用户配置的分区。Href、QueryOptions、HTML和命令不进入适配结果。标题必须由未来 renderer 使用 textContent 呈现，不能直接拼成 HTML。

## 后续接线与验收

1. 先核对目标服务器只读响应及真实使用的 SectionType/ViewType/图像和布局字段，补齐 renderer 真正需要的 DTO；本轮只有固定客户端样本与合成响应。
2. HomeTab 保持唯一生命周期 owner，在其暂停、销毁及刷新时调用 provider 的 cancel/dispose。既有 API client、CardBuilder、itemscontainer、focus/input 与 PlaybackManager/Session 保留原归属。
3. 建立服务端配置与旧客户端首页设置的可见关系：服务端能力可用时使用网页配置；旧版本或不支持布局时完整回退。不得只切数据源却继续宣称旧首页设置能管理服务端分区。
4. 根据已确认字段实现分区 renderer 和固定源码 overlay，补返回/焦点/滚动/空态/快速切换、请求失败后的完整回退及播放入口合同。新增 overlay 绑定固定输入及输出 SHA，不复制未知来源整树。
5. 实际页面候选需另做来源绑定构建与隐藏/真实服务验证；前台和真实播放按恢复时的验收安排。本模块的 Node 测试不等于首页迁移完成。

离线检查：`node --test tests/home-server-sections.test.cjs`。不需要安装依赖或启动客户端。

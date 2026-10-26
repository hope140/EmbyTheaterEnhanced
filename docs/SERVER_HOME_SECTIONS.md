# 服务端首页接入合同

首批采用服务端首页分区和顺序，保留旧首页回退；只读取配置，不在客户端实现服务端分区编辑。HomeTab 接线、卡片渲染与固定源码 overlay 已形成来源绑定候选，后台和用户前台证据分别记录在项目状态中。

## 当前模块

`enhanced/home/server-sections.js` 是无副作用的 AMD/CommonJS 模块。调用方提供当前既有 ApiClient，不新建认证、连接或播放 owner。模块只调用已有 `getUrl` 与 `getJSON(url, signal)`；不读取令牌、不增加认证 header，不调用保存、重排、删除或任何 POST 接口。

- 最低版本暂以固定 4.10.1.0 Web 分析样本的 `4.10.0.4` 判断为依据；严格检查版本格式，再实际尝试 GET。它是客户端能力提示，不是经实测确认的服务端兼容矩阵。
- `loadSections({displayMode, signal})` 读取 `Users/{userId}/HomeSections`，displayMode 只允许 `tv` 或 `mobile,desktop`。保留返回顺序和标题；显式空数组保留为空布局。
- `loadItems(section, {startIndex, limit, signal})` 只接受本轮模块返回的 section 对象，调用 `Users/{userId}/Sections/{sectionId}/Items`。ID 按单一路径段编码；只发送固定字段、图像类型、分页与同一 section 固定 RandomSeed，不转发服务端任意 URL 或 QueryOptions。
- 保留普通 Item DTO 交给现有 CardBuilder，不创建或改写 Item/MediaSource/PlaySession 身份。不同 ServerId 的 Items 会拒绝。
- 每次刷新取消上一轮。请求关联当前 ApiClient、server、user 与轮次；暂停/销毁/外部取消使迟到响应失效。getJSON 即使忽略 AbortSignal，模块也会在取消或最长超时后结束等待；不会把旧 owner 的响应或失败交给新首页。
- `server` 表示接口数据可供后续渲染；`fallback` 要求调用方回到完整旧首页；`cancelled` 要求丢弃，不触发旧首页渲染。默认请求期限 5 秒，仅为接口候选的保护上限，不是性能结论。

接口层接受常规媒体类 SectionType，以及 cards/buttons/list/spotlight 的结构声明。首批 renderer 只激活水平 cards、Primary 图像声明、默认卡片尺寸的组合；其他布局、非默认尺寸、交互 HeaderButtons、坏 DTO、请求失败和超时都会整体回退，不悄悄遗漏用户分区。Href、QueryOptions、HTML和命令不进入适配结果。分区标题使用 textContent，卡片、虚拟滚动与上下文动作仍由现有 CardBuilder/itemscontainer 提供。

## HomeTab 接线

冷启动 currentApiClient/server/user 暂未就绪时，当前 controller 在原 refresh epoch 内做最多 3 秒可取消等待，身份可用后再开始首页 GET。持续不可用显示通用错误；普通恢复不会永久复用已失败或 cancelled 的 Promise。清理、暂停、销毁退休等待，成功 active 恢复继续去重。该修改针对身份 readiness，不表示所有首屏慢请求已优化或所有冷启动环境均已覆盖。

### 媒体库分区标题

桌面布局的`latestmedia`分区仅在`ParentItem`提供可校验的电影或电视剧媒体库身份时生成标题链接。provider只投影`Id`、`CollectionType`和当前owner绑定的`ServerId`，不制造缺省Type/IsFolder；若服务端提供这两个字段，则必须与受支持文件夹语义一致。ID限定为可安全放入原路由query的字母、数字、下划线与连字符，跨服务器、坏身份、url/Href/QueryOptions/脚本/动作覆盖会失去导航资格。其他DTO字段（含Path）不跨适配边界。

renderer使用canonical`modules/approuter.js`的原`getRouteUrl(parent,{section:'latest',serverId})`，电影映射到`/videos`、电视剧到`/tv`的`suggestions`页签，保持当前原生路由语义。标题由原`emby-sectiontitle`升级并派生See All，标题文本仍用textContent，点击与键盘交给原router/input；局部标题容器仅阻止旧epoch、失效账号/服务器或已退休stage的激活。没有通用sectionId列表路由，不把section.Id猜成媒体库Id。

返回首页仍重新读取并重建分区，只扩展既有焦点身份记录以定位新标题或See All；若条目数使See All隐藏，则回到可见标题，不保留旧DOM或分区数据。原生itemscontainer对See All的显示门槛不改。

无ParentItem、不支持目标及TV布局保留普通标题。此范围不覆盖任意分区类型或任意动态筛选列表。刷新清空、请求时限、重试、缓存与卡片/播放链保持原状；新增依赖只是随包原生router/button的canonical AMD入口，不更换Web输入或构建生成器。

`ete-server-home` 使用原生 `getDynamicImport` 注册，该工厂已取出AMD模块的default；HomeTab直接调用别名对象的create，不再次访问default。别名回归必须消费原app.js的实际拆包函数，不能用直接返回AMD module对象的简化别名替代。

- 固定 Carnival HomeTab 只新增一个维护 controller，接入原 resume/refresh/pause/destroy，保留原 BaseTab、连接、焦点和播放 owner。AMD 维护模块以唯一注册 ID 加载，共用依赖使用原 canonical module ID。
- 首页按服务端顺序构建分区。继续观看/下一集保留 backdrop 和原上下文动作，直播条目沿原 programlink；空分区由原 itemscontainer 隐藏。显式空首页不重新插入旧分区。
- 每轮刷新清除并暂停旧节点，取消前轮请求；新数据完成后提交本轮 stage。取消、切换账号/服务器或销毁后不提交旧页面、不转入旧账号的回退。旧 renderer 的 user 读取和渲染等待也有取消及5秒等待上限。
- 返回首页时重新读取服务端分区，并按已有卡片 ID 恢复焦点；找不到且本次要求自动聚焦时交给原 focusmanager。已有Node与隐藏完整应用验证，实际键盘、遥控和滚动体验仍需分别验收。
- 服务端布局成功时直接呈现分区内容；旧版本、不支持布局或读取失败回到完整旧首页及其原设置行为。首批没有服务端首页编辑器，不调用配置写接口。
- overlay 固定 HomeTab 与 app.js 输入和输出 SHA，新生成器进入 build-input 和 runtime provenance 合同；不复制新版 Web 整树。

## 当前证据及剩余验证

2026-10-16标题续办：来源ae245f6的39项定向/固定材料与940项公开门禁通过；真实main/loader/router/native标题、合成API和空profile下17项完整应用检查通过，含电影点击、See All、电视剧Enter导航/返回、账号失效阻止及TV普通标题；390/800/1280视口检查通过。requestWait、clear、refresh函数体与b646374保持字节等价（只规范化换行作比较），未增加缓存策略。对应新包与hash见[V034_LOCAL_CANDIDATE](V034_LOCAL_CANDIDATE.md)。实际服务端ParentItem响应、前台与业务仍未验收；下面的早期真实只读记录保持原范围，不用它外推当前分区导航DTO。

只读服务核对观察到 Emby 4.10.0.40，电视与桌面模式各13分区；当前均为支持的默认水平 cards 布局。继续观看、正在播出、最新内容三类条目接口分别读取成功，保留类型和数量摘要，不保存原始响应、媒体标题、URL或凭据。这不证明其他服务版本或任意首页配置可用。

接口和渲染/生命周期的28项 Node 测试通过，构建输入及overlay检查、来源绑定包体和隐藏完整应用检查已完成；具体来源及后续修订见项目状态。隐藏完整应用使用真实main、路由、原生加载器与组件，隔离登录副本仅执行只读数据请求；这不能代替用户前台、真实播放、远控或安装验收。空收藏场景下原生12类查询均返回0条，用户确认网页同样无收藏；因此页签可进入不等于已有收藏的渲染验收。

离线检查：`node --test tests/home-server-sections.test.cjs tests/home-server-rendering.test.cjs`。不需要安装依赖或启动客户端。

## 默认返回时的驻留呈现

普通 baseline 保持原模式与布局缓存默认关闭，但允许原生三槽内、同账号／服务器／认证代次／语言／查询且未失效的 Home 驻留页恢复。恢复仍请求新布局和 Items；等待时保留原卡片，布局签名相同则通过原容器交付新内容，身份／数据失效则退休。布局发生变化才更换 stage，未新增视图池或永久 API 缓存。加载中的用户进度、状态和正在播出／录制节目易变字段不继续显示旧值。原请求、导航票据与提交守卫仍有效；失效或槽淘汰后冷加载属正常行为。

## 图片内文字与旧首页样式兼容

旧 CardBuilder 为 `.sections.homeSectionsContainer` 内的 `.innerCardFooter .cardText.cardTextCentered` 注入隐藏规则。维护 Home 将 `homeSectionsContainer` stage 放在原 `.sections` 内，两个类不再属于同一节点，旧规则失配；回退使用 Backdrop 的继续观看卡片会露出原已生成的年份。维护 `home-flow.css` 仅为这层父子结构补回相同隐藏范围，保留普通外层卡片文字、进度及指示器，也不改变非首页的图片内文字。没有改动冻结快照或添加第二个 `sections` 容器。

同根源码审计未发现另一条依赖该组合类的 Home 规则；原生进度／已播／数量／计时器／直播角标和文字间距使用各自类，`.closest('.homeSectionsContainer')` 仍找到 stage。既有 pending 状态规则继续拥有其进度／节目字段遮罩，不因本次 CSS 提前显示陈旧状态。这些审计与受控卡片对照不代表任意服务器自定义 CSS、完整客户端或真实媒体验收。

受控复现命令：`node tools/check-home-card-overlay-renderer.cjs <Chromium绝对路径> <新证据目录绝对路径> <修复前40位commit>`。它使用原 CardBuilder／CSS，覆盖桌面与 TV 的 Backdrop／Thumb、普通海报下年份、非首页、进度和角标，并执行维护 Home owner 建页；拒绝实际网络请求。报告分别记录控制提交与候选样式 SHA-256，未提交样式的测试结果不能仅凭 HEAD 冒充固定来源。图片／API／平台由夹具提供，不构建或启动 Windows 客户端，不读取用户数据。

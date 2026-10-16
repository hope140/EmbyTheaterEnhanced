# v0.3.5 当前本地候选

产品sourceCommit为`2c9410c1bfd9ab27e7f3fe9943f9841b20494829`，测试提交`8b484d2`；后续文档HEAD由最终Git回执固定，不能替代runtime来源。数字版本继续0.3.5，未推送、PR、合并、发布或系统安装。旧v0.3.4、51ae2e4与441eafb产物/profile全部保留。

## 默认入口阻断与修正

父审核拒绝441eafb：冻结router的`getRouteUrl('search')`实际生成`/list/list.html?type=search`，没有serverId；原ListController只在显式serverId时设置owner.apiClient，缺省由原canonical currentApiClient提供。旧维护helper却调用getApiClient(undefined)，实际抛`item or serverId cannot be null`。此前18项完整应用人为附加serverId，无法证明默认入口正常；这些旧PASS不能当作本问题验收。

主线程已在441eafb完整runtime以原getRouteUrl生成的默认路由复现，controller params仅type=search且owner.apiClient缺省。失败回执保存在`.work/default-route-before/RESULT.json`，显示/网络/Native启动均0。离线新增回归修改前也失败，保留`.work/default-search-before.log`。

产品仅修改`enhanced/search/list-search.js`：按owner.apiClient优先，其次显式params.serverId，再缺省connection.currentApiClient；提交成功或错误前重查所选API对象与userid。隐式current client即使换为同userid的另一个对象，也退休旧成功/错误，不能更新数据或错误状态。共享ConnectionManager/router/API、查询字段、菜单策略、依赖和播放owner未改。

## 新来源检查

| 项目 | 结果 |
| --- | --- |
| 默认入口完整应用 | 20/20：原getRouteUrl('search')，没有手工附serverId，没有提供owner.apiClient；初始输入、查询/清空/迟到、分类、分页、错误/空态、详情往返焦点/位置及再次输入 |
| 显式serverId路径 | 18/18与三视口，通过；与默认入口证据单列 |
| 原客户端选择单元 | helper8/8；缺省、显式、owner优先，同userid换client旧success/error退休，账号变化及既有生命周期/分页/反馈 |
| 相关单元/固定材料定向 | 15/15 |
| 新来源完整公开门禁 | 首轮950/951，唯一失败项隔离复验1/1通过；无未解决失败，原失败/UNKNOWN保留 |
| 新来源固定材料 | 162/162，0失败/跳过 |
| 关键合批完整应用 | 电视搜索9、详情24及三条实际菜单取消、电影库25、首页17；每条回执均绑定新source |
| 几何与输入 | 默认/显式/电视搜索各390/800/1280；四类型详情12组及浏览三视口通过；真实Tab/Shift+Tab、Escape与鼠标取消保持 |
| 隔离 | 真实main/AMD/router/controller/原组件，空profile/合成API；show、浏览器外网、Node网络、Native启动均0，非预期页面错误0，原file Cache警告保留 |
| 静态 | JS297、PowerShell28语法、348文件有限敏感信息扫描和diff-check通过 |
| 构建与完整包体 | 2157 payload / 2158完整runtime，VerifyOnly和独立逐项SHA/完整集合通过，交付副本一致 |
| 启动 | appData/userData/config隔离与0.3.5通过；探针profile移至证据区，交付空profile |

默认入口验证调用的是原router生成的等价原路由，没有声称点击过真实服务器的页头搜索按钮；真实页头/服务器体验仍由人工确认。显式serverId和同userid切client的单元用例也保留，未放宽有效断言；getter会在提交前复核，所以测试不将调用次数硬编码为一次。

## 交付身份

- Runtime：`dist/EmbyTheaterEnhanced-v035-default-search-20261016`。
- 本地目录：`dist/ETE-v0.3.5-browse-2c9410c-20261016`，入口`Start-v0.3.5.cmd`，首次服务器/登录由用户完成。
- manifest SHA-256：`45a1d5c6649c5c720b8b83e327c0d8b1db8ece99894a15297adc4aab8da7cd39`。
- payload-set SHA-256：`c68dc1d64673353f3d573fd78bfbe238d1174e723c1a71df298ca068905cbd3e`。
- Helper SHA-256：`28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`；libmpv SHA-256：`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，与既有固定字节一致。
- ZIP：`dist/ETE-v0.3.5-browse-2c9410c-20261016.zip`，2162文件、234473398 bytes，完整条目流回读和SHA/集合核对通过。SHA-256：`7f8a2b88d4c40d00391798209cd0fa055fa8c941b4c4164ac3c7fc93c35eab10`，附同名`.sha256`；旧441eafb目录和ZIP保留为被父审核阻断的历史候选。

## 人工清单与证据边界

随包`测试说明.md`要求从原搜索入口开始，核对不同关键词、分类/分页、连续输入与清空、错误恢复、详情返回和再次输入；继续确认原版本/音轨/字幕菜单选择/取消与四类型详情。原视频控件的禁用展示保持，不宣称用户可切视频轨道。真实服务器DTO/旧版本矩阵、前台、实际播放/远控、安装和硬件仍NOT_VERIFIED；不把此前用户对详情候选的有限观察扩写到本修正。

本轮没有缓存、刷新/超时策略或菜单扩大修改。原getSearchResults的底层HTTP协议保持，取消仍是本地完成拒绝及提交归属校验。详细搜索/菜单合同沿用[原合同](SEARCH_AND_MENU.md)。

私有回执：`.work/default-search-targeted.log`、`default-search-public.log`、`default-search-materials.log`、`default-search-build.log`、`default-search-verify.log`、`default-route-final/RESULT.json`、`explicit-route-final/RESULT.json`、`default-fix-tv/RESULT.json`、`default-fix-menus/RESULT.json`、`default-fix-movie/RESULT.json`、`default-fix-home/RESULT.json`、`launcher-default/RESULT.json`及`DEFAULT_PAYLOAD_AUDIT.json`。夹具、profile与原始截图不进入payload或ZIP。

公开门禁首轮951项中950通过，唯一失败为构建输入临时fixture的Git show返回失败，错误为Tracked generator is not committed: installer/languages/LICENSE.txt；相邻ls-tree已检查blob存在，不能据此认定产品缺输入，也不能宣称根因已定位。原始Git错误未被旧工具包含，根因UNKNOWN。后续仅在其他作业结束后按名称隔离同一项，并用私有preload旁路记录Git失败；没有改动或放宽产品门禁，也不重新全量循环。回执见`.work/default-input-recheck.log`。

隔离复验实际选中1项、1通过/0失败/0跳过（约52秒），未出现新的Git命令失败；其余首轮950个通过项没有重复计算。该回执闭合失败项，但首次Git失败的具体原因仍UNKNOWN。

最终ZIP回读见`.work/DEFAULT_ZIP_AUDIT.json`。产品source之后仅有测试和文档提交；没有将当前HEAD重标为runtime来源。工作区状态及文档HEAD由本轮最终Git回执固定。

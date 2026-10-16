# v0.3.5 浏览与搜索本地候选

当前产品来源`441eafb5dd5434174bad739eb0e1ed01abb0ae4f`，测试提交`3b5520d`；最终文档HEAD由本轮Git回执固定，与产品sourceCommit分开。版本继续0.3.5，尚未推送、创建PR、合并或发布。范围见[搜索与菜单合同](SEARCH_AND_MENU.md)，详情基线见[详情合同](DETAIL_PAGE.md)。

本批合入标准/电视搜索的输入、连续查询与离页归属、错误/空态恢复，以及原生菜单正常取消。分类、分页、筛选排序、原CardBuilder、router、详情与播放入口保持；没有新增内容缓存、修改防抖/超时或涉及切轨性能。旧51ae2e4候选的用户反馈仅为已测场景USER_REPORTED_NO_ISSUE / MONITORING，不扩写为本合批来源的人工验收。

## 新来源验证

| 检查 | 结果 |
| --- | --- |
| 完整公开离线门禁 | 948/948，0失败/跳过 |
| 固定材料门禁 | 162/162，0失败/跳过；包含两新增patcher及来源夹具 |
| 新增定向单元/材料 | 12/12，真实错误与undefined错误保持拒绝身份 |
| 标准搜索完整应用 | 18项：初始query、输入立即失效、乱序/清空、分类、分页、错误/空态、错误返回、详情焦点/位置、离页与待恢复输入 |
| 电视布局完整应用 | 使用原setLayout(tv,false)与/search，9项：全局/分类迟到、16项原预览限制、清空、错误恢复、离页/返回 |
| 详情与菜单完整应用 | 24项详情基线回归、四类型12组三视口；版本/字幕鼠标取消、音轨真实Escape取消均保值且change=0；原视频禁用展示单独核对 |
| 原浏览邻接 | 电影库25项及三视口，首页17项最终检查（含原Enter跳转/返回与TV普通标题）及三视口 |
| 键盘 | 真实Tab/Shift+Tab移动/返回，原EmbySelect Enter打开及原菜单Escape关闭；不以未打开菜单的按键作为取消PASS |
| 全部隔离运行 | 真正main/AMD/router/controller/组件、合成API与空profile；show、浏览器外网、Node网络、Native启动均0，非预期页面错误0 |
| 静态 | JS297、PowerShell28语法检查、348文件有限敏感信息扫描和diff-check通过 |
| 构建/包体 | 2157 payload / 2158完整runtime，VerifyOnly及独立逐文件SHA/完整集合核对通过；交付runtime副本一致 |
| 启动入口 | 0.3.5与appData/userData/config隔离通过；探针生成profile已移出交付 |

原file: ServiceWorker Cache警告保留单列。没有将旧来源PASS叠加成新来源证据；以上完整应用回执均固定441eafb。

## 产物与身份

- Runtime：`dist/EmbyTheaterEnhanced-v035-search-menu-20261016-r3`。
- 独立目录：`dist/ETE-v0.3.5-browse-441eafb-20261016`，双击`Start-v0.3.5.cmd`；首次添加服务器/登录由用户完成。
- manifest SHA-256：`e33e2c485fb48a7541ca17b19c85d1e275cd5104bead00d7c41cc96a01e4c357`。
- payload-set SHA-256：`8022a1913e5b2e1d3d268995b2172b438eaa4ee73ec6b15ed8ec4f07b28c7e42`。
- Helper SHA-256：`28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`；libmpv SHA-256：`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，与原固定字节一致。
- ZIP：`dist/ETE-v0.3.5-browse-441eafb-20261016.zip`，2162文件、234473141 bytes，全部条目流回读及SHA/完整集合通过；SHA-256：`6b85f003ff3d75831fc65d05924c37696e45e9565765edca74eba082cd8f200e`，附同名`.sha256`。旧v0.3.4和51ae2e4目录、ZIP、profile均保留。

## 失败与修正

旧runtime两条真实搜索路由均复现迟到旧结果覆盖新查询，以及模板未就绪时querySelector空节点。第一合批隐藏检查进一步发现返回时待完成请求使Fields仍paused，立即输入被忽略；修正早期接收输入并保持500ms防抖，新增回归通过。最终补齐离页保留已完成错误/空态提示，返回不强制刷新。

首次空结果夹具猜中文文案而超时，修正为实际本地化状态；未修改有效产品断言。菜单夹具曾对原禁用video派发按键，该按键离开详情，不能作为真实取消；最终核对disabled，并在实际可选三菜单使用真实外部点击与Escape。原ActionSheet多选关闭提交语义保持，不把多选提交重新定义为取消。一次首页复用夹具漏带expectLinks配置，明确报baseline-unexpected-links；补齐候选配置后在新目录重跑通过。全部失败现场保留，未关闭控制台或全局吞错。

原菜单取消undefined诊断已在明确取消源头加专用标记，并仅由EmbySelect处理该标记；真实Error和undefined错误仍保留。已知视频原controller只读/禁用展示保持，不能宣称用户可选择视频轨道。

## 人工验收与边界

按随包`测试说明.md`核对标准/电视搜索、当前分类/分页、快速输入/清空/错误恢复、详情往返焦点与位置及版本/音轨/字幕菜单选择和取消。真实服务器DTO与旧服务器矩阵、前台视觉、真实播放/远控、系统安装与硬件均NOT_VERIFIED；没有使用个人凭据、打开现用客户端或执行真实播放。ApiClient.getSearchResults仍不支持传递signal，本批取消为本地完成拒绝及提交失效，不声称底层两个HTTP请求均已物理中断。

私有回执保存在`.work/combined-public-release.log`、`combined-materials-release.log`、`search-build-r3.log`、`combined-verify-release.log`、`search-release/RESULT.json`、`search-tv-release/RESULT.json`、`menu-release/RESULT.json`、`movie-release/RESULT.json`、`home-release/RESULT.json`、`launcher-browse/RESULT.json`及`BROWSE_PAYLOAD_AUDIT.json`。这些fixture、profile与截图不进入payload或ZIP。

ZIP审计见`.work/BROWSE_ZIP_AUDIT.json`。首次合批ZIP已完成回读，随后将随包验证JSON的原始合成快照改为结果摘要，重新生成独立ZIP并再次逐项回读；产品runtime与来源未变。最终提交仅同步文档，不将后续HEAD重标为runtime来源。

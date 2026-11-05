# v0.3.5 搜索与菜单取消合同

## v0.4.14 独立候选：最近搜索

“最近搜索”指服务器记录的媒体条目，不是输入过的关键词。公开 [Emby 4.10.0.40 发行说明](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.10.0.40)记录了最近搜索数据与性能修复；[Emby 插件 API](https://dev.emby.media/reference/pluginapi/MediaBrowser.Controller.Entities.InternalItemsQuery.html?q=InternalItemsQuery)定义 `WasSearched`，公开[实际请求记录](https://emby.media/community/topic/144128-search-very-slow-3-minute-response/page/8/)给出 `Items?...WasSearched=true&SortBy=DateLastSearched`。REST 参考未完整列出这两个较新的查询参数，因此候选保守地仅在严格版本 `4.10.0.40+` 查询，并在失败、空结果或无效 DTO 时继续原推荐；这不是任意 4.10 服务的兼容保证。

搜索空白时按当前认证用户读取最多 12 条，仅显示同服务器安全条目名称与原路由。输入、暂停、销毁、账号／服务器／client 变更会退休旧响应。清除按钮仅在有结果时出现，调用官方 [DELETE `/Users/{Id}/RecentlySearched`](https://dev.emby.media/reference/RestAPI/UserService/deleteUsersByIdRecentlysearched.html)；[Emby 4.10.0.40 发行记录](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.10.0.40)说明清除需服务器 `4.10.0.31+`。候选使用更高的读取门槛，故清除也不会发给较旧服务器。清除范围为当前服务器当前用户的全部最近搜索条目；成功才移除显示，失败保留原条目并提示重试，过期结果不回填。搜索结果和推荐的原查询、分类及分页不变。

目前未证实 Emby 对 ETE 搜索何时记录条目；候选只读取服务器已有记录，不另发 `SearchedItems` 写请求。真实 NAS 版本、历史响应、清除确认、桌面／TV 视觉和焦点均待用户服务器实测。下文 v0.3.5 合同为原基线。

验收反馈后的客户端复核发现：从媒体详情返回搜索页时，原接线的 `pause()` 移除了最近搜索，已完成首次加载的 `resume()` 却未再读取，空搜索页会退回“猜你喜欢”。修正仅在经历暂停且搜索框仍为空时重新加载；重复 `resume()` 不重复请求，非空搜索仍沿用原结果。冻结 SearchFields 的实际 overlay VM 测试先复现失败再验证修正；这不能证明用户 NAS 是否已记录媒体条目。用户当前服务器版本、请求状态及返回条数尚无可用只读访问，仍需现场脱敏核实。

用户已接受将原搜索批次和必要菜单取消修正并入尚未发布的v0.3.5；详情候选反馈记录为已测场景USER_REPORTED_NO_ISSUE / MONITORING。旧详情产品来源51ae2e4及其本地目录、ZIP、profile保留，新合批产物独立命名。

## 实际路由与最小差异

标准布局原搜索入口经appRouter进入`list/list.html?type=search`，使用ItemsView/ListController/ItemsContainer；服务器ItemTypes构造原分类页签，IncludeItemTypes选择当前分类，StartIndex/Limit由原分页容器提供，筛选排序仍由原getQueryInfo生成。电视布局`/search`使用SearchView/SearchResults，每类前16项及原推荐查询保持。两者共用SearchFields与原API认证、CardBuilder、router和详情入口；没有整树Web替换或新搜索协议。

默认router入口没有serverId，原ListController也不提供owner.apiClient；维护helper必须优先复用owner client，其次显式serverId，缺省走同一canonical connection.currentApiClient。回复提交前复核选择出的API对象与userid，防止同userid下切换current client后旧成功或错误回填。441eafb漏掉默认分支，已被父审核阻断；新来源与原默认路由证据见[当前修正](V035_DEFAULT_SEARCH_FIX.md)。

固定旧runtime的两条真实路由均复现旧请求迟到覆盖新结果。共享SearchFields在输入模板异步加载前resume也出现querySelector空节点异常。原pause只停止语音识别，不清防抖timer，已发出的查询/分类/推荐没有完整提交归属；标准列表虽然创建AbortController，搜索API包装层不接收signal，旧分类仍可能先更新页签。

修正只覆盖这些缺项：SearchFields保留500ms防抖，输入即使旧代次失效，pause清尚未触发timer，resume继续被暂停的输入；模板就绪与页面owner检查防迟到focus。电视搜索在全局/分类结果、错误与loading提交前校验代次；标准列表的维护helper只安装于type=search，并复用现有列表/虚拟滚动的请求归属guard，旧signal在更新分类前验证。底层getSearchResults仍为原API包装，取消以本地请求完成拒绝和提交失效为准，不能声称两条HTTP请求均被物理中断。

当前请求失败显示既有HeaderError本地化文本，成功空结果保持原NoItemsMatchingFound，后续有效输入恢复；不添加全局重试、排序规则或结果数量。原ViewManager恢复既有view、滚动与焦点，未增加内容缓存。推荐的原ParentId行为与查询范围保持，不从后续建议推断新作用域语义。

成功空结果统一交给原ListController.getEmptyListMessage/setEmptyListState；维护eteSearchStatus只显示请求错误，成功响应时隐藏。原单字符TwoSearchCharsRequired和空查询无匹配提示规则保留，验收需实际统计同页可见提示数量，不能只断言新增status出现。见[重复提示修正](V035_SEARCH_FEEDBACK_FIX.md)。

## 菜单取消

固定原ActionSheet的无选择关闭分支使用Promise.reject()，原EmbySelect只有成功处理。旧完整应用实际关闭菜单产生undefined未处理拒绝。受控overlay仅在这个明确取消源头加ETE_ACTIONSHEET_CANCELLED标记，EmbySelect只处理该标记；成功setValues/change、真实异常对象或undefined错误、原生系统菜单及disabled判断保持。没有全局Promise/控制台拦截。

原ActionSheet多选关闭使用selectedValuesClone作为提交，保持原语义；本批不把多选提交重新定义为取消，也不改共享控件的选项加载、播放或切轨业务。其他ActionSheet调用者仍收到拒绝，仅正常取消负载有明确标记。要求以原关闭按钮和键盘返回实际触发取消，不能用成功选择或伪造reject替代完整应用证据。

## 共享调用者核对

固定vendor静态HTML共141个EmbySelect声明，覆盖默认单选、多选和custom声明；动态provider来自filtermenu、guide设置、recordingcreator及维护GenericUI多选。原enableNativeMenu仍决定非TV普通单选走系统菜单，TV/multiple/getItems/custom走ActionSheet，但disabled视频声明不代表实际可操作。固定材料VM覆盖默认/native、disabled、custom、multiple、成功change、明确取消与真实Error/undefined拒绝。

静态检索ActionSheet的10个模块用户（包含EmbySelect和已退役externalplayers），其余代表有genericedit、guide日期、multiselect、recordingcreator、playerselection、listcontroller、subtitleeditor和syncjoblist。未发现根据拒绝reason是否undefined来分支的调用者；多选仍走原数组提交。直接调用ActionSheet的其他页面仍收到取消拒绝，只改变正常取消诊断负载；本批不全局吞掉它，也不声称这些页面逐一运行通过。完整DOM实际取消证据限详情三个可操作select，141模板与所有provider组合及前台仍未穷尽验收。

## 允许文件与回退

产品范围限`enhanced/search/list-search.js`、搜索与取消两个精确变换器、受控overlay及build-input接线；新增变换器必须进入INPUT_PATHS、防篡改patcher集合与provenance fixture复制列表。新变换固定输入/输出SHA，锚点变化失败停止，vendor只读。已有详情变换、播放核心、认证、IPC、窗口、内核与锁定依赖不变。

可整体回退本批接线及新增维护helper，恢复51ae2e4已交付详情来源；不覆盖旧本地包。验收需要新来源的公开/固定材料门禁、真实AMD/两条搜索路由/原组件隐藏应用、菜单实际取消及错误保留、分类与分页/清空/迟到/离页/详情往返、三视口和完整包体/ZIP回读。真实服务、前台、播放远控、安装各自保留NOT_VERIFIED。

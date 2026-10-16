# 维护注意事项

- 新增Web变换器必须同时进入overlay generatorPaths、build-input-contract的INPUT_PATHS、输入防篡改测试patcher集合和runtime-provenance fixture复制列表。runtime自身VerifyOnly通过不能替代独立材料夹具验证；v0.3.5已实际遇到漏列导致的两项材料失败并修正。
- BaseView在viewbeforeshow调用onBeginResume，在transition完成后才onResume清除paused；详情加载事务不能简单用paused判断。销毁后异步回复也必须在访问view、全局backdrop或focus之前核对代次与owner，不能只在最终列表提交处检查。

- 原生emby-sectiontitle会派生See All，但后者仍由itemscontainer按条目数隐藏。动态构造要在createElement时指定is并保留原生类；返回重建DOM时只记录分区焦点身份，隐藏/消失的次级入口应回退可见标题，不用内容缓存解决焦点问题。
- ApiClient的serverInfo.Version不等于serverVersion()运行提示；合成版本兼容测试应通过原setSystemInfo设置，并直接断言serverVersion，再检查行为，不能把字段赋值当生效证据。

- 动态创建Emby原生按钮需在createElement时传入定制内建元素标识；只添加raised或事后设置is属性不能注册原生控件。构造器已添加主题/焦点类时应追加classList，不覆盖className。需用真实customElements构造器及按钮样式验证，普通DOM模拟无法证明原生外观。

- 同一原生select可按data-menu和布局模式选择系统菜单或Emby ActionSheet，视觉不一致不代表缺少新版渲染库；先核对页面声明。详情组逐行堆叠也可能来自旧主题额外限宽，需确认实际命中规则后做页面局部纠正，保留控件值/change事件与播放归属。

- 传统插件可能用table/td百分比做布局。全表`display:block`即使通过整页溢出检查，也会把百分比分栏压成固有内容宽度。保留原生table布局，将超宽内容交给既有内容容器滚动；同时检查单层/嵌套分栏、字段焦点横滚、长内容和外层纵向滚动，不能只验容器没撑出页面。

- 原生页签不是独立布局块：维护页必须同时设置withTabs，才能在原断点下为第二行页签预留正文空间。检查首文字与页签交集、真实滚动祖先和viewport，不用外层分组盒或单一整页溢出计数替代。对话框还需实际滚到末字段并核对命令区可达性；静态模板存在和控件数量不等于可用。

- 控件数量和HTTP成功不证明显示一致。按真实页面与组件矩阵核对语义、截图和计算样式；HTML实体只能在明确消费边界处理。替换原生输入后，状态与条件Map必须指向新节点；直接子组/当前列表行归属不能用任意后代选择器代替。对话框结构存在也不证明关闭组件已注册或点击有效。

- 以运行时和完整来源清单判断版本，不以开发依赖声明推断 Electron/libmpv 身份。
- source provenance、runtime relation 与 payload manifest 分别证明输入、生成关系和最终文件集合，不能互相替代。
- 新 Play、Stop 和 Next 必须使旧异步响应失效；超时只限制耗时，不能替代请求与 generation 归属检查。
- 普通 RPC 失败继续回退，Abort/superseded 终止旧请求。Mapping miss 与 CD2 not_found 分开判断。
- User-Agent 使用 file-local loadfile 选项；未知 headers 不进入播放器，不修改全局 header 设置。
- 单元测试、隔离 runtime、媒体推进、用户可见画面、Session/远控和真实安装是不同证据层；缺失值保持 UNKNOWN/不可用。
- 原始路径、URL、认证头和媒体标识不得进入公开诊断。有限脱敏规则仍需人工检查导出包。
- Windows 脚本保留编码和换行；固定 sourceCommit 的构建从 Git blob 获取字节，避免混入工作区残留。
- 传统插件的 data-require 失败发生在插入之前，controller 模块失败发生在插入之后；必须实际区分这两条失败路径。取消既要阻止旧状态提交，也要只销毁旧请求所属的暂存节点。
- GenericUI 可复用旧通知出口；新版同名模块依赖不同不能作为替换整个共享 input/API 或播放栈的理由。合成 schema 通过仍需真实插件前台验证。
- Alameda 按规范化的 AMD 标识缓存实例，不按最终文件路径去重。维护目录中的共享依赖应引用原 `modules/...` 标识；同文件的 `../www/modules/...` 会重复创建未初始化的 service locator/appsettings 等实例，必须用真实应用加载链验证。
- 真实插件协议枚举不能由合成 fixture 推断。Emby 4.10 的普通 GenericUI 响应使用 `RegularPage`；应先取得只读结构证据，再验证真实 controller 和 DOM，错误提示出现不能记为兼容通过。
- 页签direct route检查与真实按钮点击是不同证据。使用原生tab组件时，程序selectedTabIndex同样触发tabchange；恢复选中态必须抑制自己的处理器，mock也必须保留此行为。动态Caption只更新正文不能更新应用页头，标题更新还需转义及请求归属保护。

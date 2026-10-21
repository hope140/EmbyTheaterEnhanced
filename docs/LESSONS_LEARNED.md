# 维护注意事项

- 构建跳过旧payload副本不等于可以省略其prepared输入，历史provenance仍可能回读旧Electron/Pepper。组装计划应从当前Git tree与overlay合同重算，按共同生产变换后的逐文件等价对照验证，再单独处理材料独立化；见[RUNTIME_BASE_ASSEMBLY.md](RUNTIME_BASE_ASSEMBLY.md)。

- 本地 runtime 完整性入口须区分固定 payload 与精确允许的运行日志。Electron 可在二进制目录创建 debug.log，不能因此永久拒绝第二次启动；既有 payload 仍逐项校验，其他未知文件继续拒绝。System.Diagnostics.MainWindowHandle/CloseMainWindow 不足以证明实际 BrowserWindow 关闭，应结合应用窗口生命周期与进程退出核对。

- Electron preload 可用的 require 不应留到后续回调再调用；提前捕获模块，再把原应用实例传入幂等 binder。appready/unload 时序须在真实 runtime 验证。暂停 seek 节流要有末次 flush，否则没有下一次 timeupdate 时系统进度会停在旧值。
- PrintWindow 成功不证明 Native 视频有效。隐藏/最小化 surface 可以返回黑图，捕获前后应校验 owner/媒体代次和窗口状态并保留有效帧；DWM 成功、SMTC 成功与可见桌面验收分别记录。按需捕获应核对图像变化与 GDI 增量。

- 菜单空态的居中须核对空列表容器，而不仅是标题的 text-align。ActionSheet 的列表末尾 padding 在无条目时仍占高度，会使标题视觉偏上；只针对实际为空的非虚拟列表清除，保留正常条目焦点间距和异步加载布局。隔离渲染替换 CSS 时保持原级联顺序并关闭过渡动画，避免将边框重置或动画中间帧误记为修复效果；几何中心与完整客户端视觉分层验证。

- ChildProcess error可表示无法向仍存活的进程发送终止信号，不能一律当成exit。无PID的spawn失败与有PID的transport失败分别处理；process ownership保持到实际退出，重复error监听仍须安全且终态通知幂等。
- 多owner退出收尾不能用Promise.all的快速拒绝代替全部完成。每个cleanup先在原同步时序中启动并隔离throw/reject，再等待全部outcome；故障诊断只写固定阶段。回归需让某项失败同时另一真实返回的Promise仍pending，不能等待失败阶段未返回的fixture gate。

- 动态 EmbySelect 应通过 `label` 属性生成组件标签，避免手工同级标签与组件空标签叠加。每个选择器使用独立 `selectContainer`；嵌套普通 label 不提供箭头需要的定位容器。自定义标签布局不能继续依赖组件隐藏占位与固定 top/margin 来对齐，可局部将箭头与选择器放在同一网格行居中，并验证明暗主题、断点、标签关联、禁用/隐藏和焦点缩放。隔离控件几何证据与完整客户端视觉验收分开。

- 宿主通用 `.readOnlyContent { max-width:90ch !important }` 会覆盖插件普通声明及页面内联限宽。解除通用强制限宽时保留宽屏默认、三行折叠和焦点简介独立规则；同一layout.css的多项变换应串联并只登记一个最终输出SHA。隔离CSS/DOM可验证级联及断点，不能代替已登录客户端视觉或播放验收。

- C++工作线程启动前，其读取的状态成员必须已构造。成员按声明顺序初始化；线程成员可最后声明，或在成员初始化后的构造函数体启动。保留线程归属与join，并用源码合同/构造顺序模型防回归；模型不替代真实线程和播放验收。依据见[C++成员初始化规则](https://eel.is/c%2B%2Bdraft/class.base.init#15)。

- 测试回执与原日志分别保留。Node测试汇总可能使用`ℹ`前缀，解析器应验证唯一完整汇总；解析失败不能覆盖初版回执。修正解析后新增独占回执，绑定原日志SHA并说明原件是否可恢复，不为回执工具误报重复运行已完成测试。

- async drain的owner应在内部finally中同步释放，再让共享Promise结算。只在外层Promise.finally清理会留下微任务窗口，新事件可能附着到已结束work并丢失pending。回归应从实际endpoint完成出口排微任务，不能用同步重入替代该窗口。

- 同一回归更换被测源码时保持目标断言一致，显式输入只切换源码。公开测试默认不依赖私有草案或写私有回执；修前、草案、产品输出由外层按不同文件名保存。暂停计数区分原Native Play的pause:false与增强任务的解暂停。

- 绝对deadline不仅用timer执行顺序保证。事件循环阻塞后close/load可先于已经到期的timer到达，提交结果与获得执行槽时都应核当前绝对时间；用只推进Date.now但不调度timer的用例覆盖，不能只靠advance先跑timeout。

- 固定材料齐备后，依赖prepared preload的测试还须先走原prepare-preload生成关系。require时缺生成文件属于测试输入缺口，不能计作有效断言失败后修复或跳过；保留原失败，补实体后独立复验。

- 重用私有probe前先检查所有输出路径和副作用。可执行脚本复制到新目录仍可能写硬编码旧目录；历史回执不能覆盖，误覆盖后保留现场并分清独立重现与原件恢复。

- Ctrl+C或关闭exec会话不证明Node测试树已退出。结束前按本任务命令、启动时间与父子PID确认归属，再回读实际退出；只清所属进程，不能用整个node进程名批量终止。

- Overlay输出SHA必须按完整生产变换链计算。Movie VirtualScroller后还有Search guard组合；只验证中间patcher会漏掉最终hash和owner范围变化。共享提交guard与特定功能的资源owner应分开，回归覆盖实际组合及其他功能保留路径。

- Promise已fulfilled仍可能在DOM提交前被pause/换代退休。可重试资源标记应在成功退休与失败两条终态都按当前请求token释放；仅加catch清理会留下缓存页无法重取的标记。清理不能覆盖新query或同map同chunk的新owner。

- 脱敏回归直接断言独立合成canary无残留。用带分隔符的原始路径后缀比较会在字符归一后假阴性，即使敏感片段仍在；category/event/stage与details都应分别覆盖，保留正常标签及fallback合同。

- 加反馈前核对原ListController.setEmptyListState等既有owner。只验证新增status显示会漏掉重复提示；应在真实页面统计可见同文案节点，并覆盖空输入、单字符、无匹配、错误与恢复。成功空结果保留原生owner，维护错误status不再同时输出第二份空态。

- 搜索验收必须从实际getRouteUrl('search')开始；默认URL不含serverId，手工附加serverId会绕过currentApiClient分支并掩盖阻断。客户端选择应沿原controller的owner/显式/当前优先级，回复时同时核对API对象和userid；同userid不代表同一client或请求owner。

- 搜索在标准布局走通用ListController，在电视布局才走SearchView；直接打开/search不足以覆盖默认搜索入口。公共API包装未接收signal时，本地取消与防迟到提交不等于底层HTTP已中断。
- 控件disabled时程序派发keydown仍可能调用原监听器，不代表用户能打开菜单。取消验收先确认菜单真实打开并获得输入归属，再用原外部点击或键盘返回关闭，检查值与change次数；禁止把离开底层页面误记为取消成功。
- 页面返回过程中，如果Fields仅在HTTP结束后resume，已经可见的输入会被paused检查忽略；应在原页面resume开始接收输入，但保留防抖及请求归属。已完成错误/空态随原view返回，新输入或刷新时再清除。

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

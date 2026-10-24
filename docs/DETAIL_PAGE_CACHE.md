# 详情页持久缓存试验

独立 `feature/detail-page-cache` 从组合来源 `d8870fbd692ea1f952fd06325f0dbda0d57011c6` 开发，保留该组合的首页、缓存页、说明链接、正式／测试更新通道及 v0.4.1 修复；不修改原整合分支或已发布版本。详情缓存默认自动工作，没有新增容量／TTL 设置，也不自动打开上次页面或预取媒体库。原首页布局缓存仍缺显式配置关闭，首页编排仍默认 baseline。

## 持久范围与所有权

只在用户主动打开 Movie、Series、Season、Episode 后保存有限投影：Id、类型、标题、纯文本简介、有效年份与 Primary 图片 tag。简介去脚本／样式及标签并解常见实体；图片 URL 在当前 API 上按 id/tag 重建，复用现有 HTTP 缓存，未下载或另存海报。没有保存原始 API 响应、UserData／进度、权限、用户资料、Token、Cookie、MediaSource、路径、临时播放 URL 或视频。

独立 IndexedDB `ete-detail-page-cache-v1` 的 `entries` 由本模块拥有。缓存键隔离 serverId、去认证信息的服务端 origin/path、userId、itemId、asSeries/context、语言、服务端版本及显示模式；未知查询或不支持的表示沿原流程，不尝试猜测。认证代次和实际 API 实例只用于运行时归属检查，不作为跨重启保存的授权。原生视图仍由原 viewmanager 三槽及 BaseView 拥有，未新增视图池。

最近 200 条为本轮试验上限，跨本 owner 的全部账号／服务器合计，读取更新时间用于 LRU。额外内部硬限为 4 MiB 总序列化预算、64 KiB 单条（包含键和更新时间等行元数据），总限额另预留 128 bytes 安全元数据。合成中文简介 200／1500／6000 字的四类 DTO 约为 0.7／4.6／18.1 KB；这只是选择工程限额的受控样本，不是真实媒体库分布或已确认正式容量。预算不包含图片／视频、实际 Chromium 文件开销或解码内存。

删除／清理前，本 owner 向独占 localStorage 键 `ete-detail-page-cache-v1-quarantine` 写入一字节隔离标记，成功后仅移除该键。事务失败则保持隔离，重启仍不读旧 DTO；别项删除成功不能解除先前失败，显式清空本 owner 成功才恢复。该标记无账号、媒体或内容信息，属于同一 owner 的安全元数据；从不清其他 localStorage、登录／服务器／设置、embydata、下载或 profile。若整个 profile 连这份隔离状态都无法写入，缓存停用并报告不可用；无法保证未成功落盘的状态跨重启有效。

正常关窗只在本 renderer 的缓存 owner 已 READY 时，沿窄主 frame IPC 请求 flush 已开始事务，拒绝新缓存事务，完成后再执行原关窗和窗口状态保存；最多等待1秒，重复关闭共用同一操作，失败事务等待实际 abort 终态。未加载详情 owner 不等待，主文档导航或 renderer 退出后必须重新 READY；同文档／hash 导航保留 READY。该收尾不影响打开／播放、不清数据、不弹窗；超时／销毁／发送失败记录固定 unavailable，不能宣称最后未提交记录已持久。原 before-quit 的媒体／HTTP 等 owner 仍各自收尾。

## 加载、失效与画面

持久读取与原网络取数并行。命中时只填原生标题、简介及合适的主／侧海报容器；不把缓存 DTO 设为 currentItem，不授予权限。原按钮和相关列表继续等待真实数据；静态区后台更新，不先清空整页。同身份驻留返回保留已有静态区，进度／用户按钮／选择器等易变字段等待本轮真实数据，不把旧进度继续显示为新结果。

| 结果 | 规则 |
| --- | --- |
| 成功 | 原 ItemPage 继续渲染真实数据；有限投影可写入新票据；不等待写盘才继续原媒体源读取。 |
| 断网、超时、5xx或无法确认语义的404 | 保留已有静态详情，短提示和手动重试；失败时缓存播放按钮不可用，不从旧数据续播。 |
| 401／403 | 沿原错误路径，退休旧显示及可用缓存；不会把旧内容当作授权。原用户 API 的缓存语义保持，不宣称本轮实时复验权限。 |
| 明确条目不存在 | 必须是目标 Item URL 的 JSON 错误，具有明确 ItemNotFound 代码，或已限定的 NotFound 代码加 item-not-found 语义；代理 HTML、泛化404及 PlaybackInfo404不当作删除。删除同身份该 item 的全部表示并退休驻留旧详情；下次不先显示旧内容，只有重新请求成功才能重建。 |
| 删除通知 | 当前 API 的 LibraryChanged/ItemsRemoved 退休对应静态内容与持久记录；仅显示固定提示，不保留原通知正文。 |
| 切账号／服务器／认证变化、暂停、销毁、新加载 | 退休所属票据／提交，旧回复不能覆盖新导航；跨身份旧 DOM 在新鲜数据前隐藏，背景按实际页面归属处理。 |

写入票据同键只认最近请求，并有 200 项元数据上限；删除／清理立即退休旧写入。坏 schema、键与 DTO id 不符、未知字段、超限或读回更新时间后超限的行被拒绝／清除。取消是本地归属失效，未宣称原不接收 signal 的 Item HTTP 已物理中断。原 NextUp 标签回填另核对详情 epoch 与请求 revision，避免同页旧结果覆盖新进度。

## 详情到播放的关键路径

原流程为 `Item ∥ getCurrentUser → 可选详情媒体源 → 主渲染`；点击播放再走原 PlaybackManager、条目类型翻译、片头、会话与真实 PlaybackInfo。候选复用同一次 Item 与用户 promise，没有额外串行的检查请求。

- 正常详情完成后，保留原版本／音轨／字幕选择及播放入口；MultiSelect 仍优先。
- 刷新中的播放只使用本轮 Item，保持原 `UserData && resume ? null : 0` 起点规则，持久 DTO 不进入 PlaybackManager。“播放”按钮从头开始，原 resume 指令仍使用本轮进度。
- Endpoint 已缓存时，可在本轮 Item 和既有用户返回后开始，不等详情媒体源或其他分区／DOM 完成。Endpoint 冷时等待既有详情 sources 完成；不另外发 Endpoint 检查，避免并行冷请求翻倍。无需详情媒体源的类型沿原空 promise 和播放流程。
- 普通影片、用户／Endpoint 已缓存、无片头／测速／开流的控制请求为 Item GET、详情 PlaybackInfo POST、播放 PlaybackInfo POST，共3个；Endpoint 冷时加原有一个 Endpoint GET，用户冷等原有条件另计。不能外推为所有媒体、播放器和真实服务的固定请求数。

## 验证与限制

```sh
node --test tests/detail-page-cache.test.cjs tests/cache-management-page.test.cjs tests/cache-management-loader.test.cjs tests/page-cache-test-entry.test.cjs
node tools/check-detail-store-renderer.cjs /absolute/path/to/chromium /new/absolute/store-evidence
node tools/check-detail-page-renderer.cjs /absolute/path/to/chromium /new/absolute/page-evidence
node tools/check-home-cache-update-renderer.cjs /absolute/path/to/chromium /new/absolute/integration-evidence
```

存储检查使用实际 Alameda／IndexedDB、独立临时 browser profile，覆盖浏览器重启、LRU／容量、坏行、同键旧写／删除、全部表示删除、事务 abort 后重启隔离和仅 owner 清理。详情检查执行原 ItemPage／BaseView、组合 viewmanager、CardBuilder／ItemsContainer／ImageLoader／ListView／按钮、维护 ApiClient／transport与实际 Fetch；HTTP 在合成 origin 拦截，设备／PlaybackManager 交接、辅助元信息、select／userdata 控件及 scroller 有明确替身。保留旧生成源码对照、等待／响应截图与 rAF 可见性；夹具保留原生 page 层级，可见性另检查实际命中层并用遮挡对照验证；代理首显、可见帧和请求数不等于 GPU 绘制、Windows 完整客户端或 NAS 性能。

完整离线、材料／来源及打包语法检查须绑定最终来源，不能用旧包、仅 DOM 存在或单元通过代替整包验收。Windows／真实 Emby 服务后续需要核对：退出重开后主动打开旧详情、四类型、图片实际命中与解码、原生选择／播放、临时失败和确切删除恢复、认证／权限变化、清理后登录和设置保持。本任务不操作用户工作前台、不发布或自行触发测试包。

导航生命周期按固定 [Electron 44.4.2 webContents 文档](https://github.com/electron/electron/blob/v44.4.2/docs/api/web-contents.md#event-did-start-navigation) 的事件 details 与保留的位置参数兼容；这份文档依据不替代 Windows 实机事件验收。

## 生产入口回归

原候选的 Windows 详情入口未通过用户验收。app 的 `getDynamicImport` 会解包默认导出，而 ItemPage 的 AMD 参数消费 namespace；两端错配会在视图切换前抛出构造异常，表现为 URL 已变化但仍显示首页。详情别名现直接返回原 AMD namespace，与 store 保持单一模块身份；Home 别名消费者合同不变。

`node tools/check-detail-entry-renderer.cjs <Chromium绝对路径> <新证据目录>` 从真实 Home 卡片标题点击，经过原 Shortcuts／CommandProcessor、实际 router 取 URL／init／loadContent、viewmanager 和 Alameda Item 依赖。固定旧提交别名作失败对照，电影／剧集均验证首次入口和缓存再次入口的可见性；既有详情 renderer 也使用生产 app 别名，不再手写替代。HTTP／text、输入／scroller、元数据与播放设备边界仍受控，截图中的合成内容与未替换的翻译键不代表完整客户端视觉。该回归不是 Work、Electron 或真实服务验收，原包保留供对照，候选由协调者另排。

# 简洁缓存管理

当前独立详情候选将界面收敛为“名称／大小／清理”两行与底部“清理全部”，短说明，不显示未实现的视频／字幕占位。HTTP 仍只能准确测资源总量，因此本候选用诚实四字名“资源缓存”（不是纯图片大小）；“页面缓存”汇总原布局 owner 与新持久详情 owner 的序列化数据。两行口径分别展示，不把资源磁盘总量与 DTO 序列化大小相加成总数。命名和完整客户端视觉由协调者复核。

布局、详情、HTTP 按原 owner 分别处理结果，支持部分成功／失败／未知统计；离页停止未开始的后续清理，迟到回复不更新新页，重复点击和退出归属保持。仅清 DTO 数据、它的一字节安全隔离标记与 HTTP cache，不清账号／服务器配置／设置、其他 localStorage／embydata／profile／下载／播放。详情范围与限额见[详情缓存](DETAIL_PAGE_CACHE.md)。

以下为原两 owner 实现的历史技术合同；独立详情候选的页面操作增加持久 DTO owner，HTTP 边界保持。

# 缓存管理的范围与生命周期

客户端设置增加独立“缓存管理”入口，使用原 pluginManager 的 mapPath／mapRoute 注册页面和 controller，沿用原设置卡片、按钮和页内状态。原 About 的“缓存管理”只是区块标题，没有独立点击路由；About 现在只说明独立入口位置。进入页面读取一次统计，手动刷新或清理后更新；没有后台定时清理、容量策略设置或弹窗。首页流畅度实验仍默认 baseline，布局数据缓存仍缺显式配置关闭，管理入口不会启用缓存或改变 TTL。

## 两个独立对象

| 对象 | 所有者与准确统计 | 清理范围 |
| --- | --- | --- |
| 首页布局数据 | 当前 renderer 已存在的 `home-layout-cache` owner；汇总有效条目、在途请求、已用序列化预算及实际配置上限 | 原 owner 的 invalidate，取消其布局在途订阅，防止迟到回复重新入库；保留当前界面，下次读取重新获取 |
| 图片与网络 HTTP 缓存 | 当前应用主窗口 `webContents.session.getCacheSize()`；只显示 session HTTP 总量 bytes | 同一 session 的 `clearCache()`；不区分海报和其他 HTTP 资源，正在使用时可重新产生缓存 |

页面序列化预算沿缓存引擎现有的 key 与 JSON 字符串 UTF-16 计数，不是实际 JS 堆或进程内存。上限是已启用 owner 各自实际配置的汇总，不是新产品默认值。没有启用的 owner 时显示“未启用（0 条）”，不会把未知 HTTP 大小写成 0。统计读取先核对原认证上下文；退出、切身份或到期数据不能继续计入有效条目。owner 销毁后从统计注册中移除。

owner 集合只保存统计／失效函数，不复制 DTO、服务器／用户标识或缓存 key，不创建全局页面数据池。它只覆盖实际已接入的首页布局数据；没有声称可统计或释放所有页面、列表或状态缓存。

Electron 固定版本 [Session API](https://github.com/electron/electron/blob/v44.4.2/docs/api/session.md#sesclearcache) 将 `clearCache` 定义为 HTTP 缓存清理；存储清理是另一接口。本入口不调用 `clearStorageData`、CacheStorage、cookies 或 localStorage 接口，也不删除 profile、设置、下载或其他目录。特别不操作原应用用于登录／设置副本的 `embydata` CacheStorage。

保留首页 DOM、列表数据、图片解码／GPU 内存不计入这些 bytes，也不随布局 DTO 清理销毁。图片解码内存无法可靠分项统计，界面只说明其未知；HTTP 总量不能标成“海报大小”。播放暂存方案尚未接入，没有播放清理按钮，也不触碰活动播放 lease、播放器缓冲、内核存储或媒体文件。

## 交互和进程归属

- renderer 管理模块由独立 CacheManagementView 通过原 BaseView 的 resume、pause、destroy 持有。页内一次只允许一个管理操作，等待时禁用四个按钮；重复 DOM 点击不会再发出操作。离页或销毁使旧 UI 票据失效，迟到回复不改新一轮状态，销毁移除监听。
- 页面数据清理留在 renderer 的实际 owner，不通过 main 传递 DTO 或认证信息。同步失效后，原缓存 epoch 和请求订阅继续阻止旧结果入库；它不清当前可见界面，下一次读取沿原 owner 重取。
- HTTP main 只注册状态／清理两个窄 IPC，无任意路径、session、脚本或存储类型参数。每次校验当前应用主窗口、原包内 index 主 frame 和空载荷，取该窗口所属 session，不使用任意默认／外部 session。
- main 合并同 session 的重复读取／清理，清理排在已有读取之后；不同 session 的旧操作不会当成新 session 的结果。主进程退出时停止受理并移除 handler，未开始的排队清理停止，已经开始的不可取消操作归原 owner 等待结算，不假装已物理取消。
- 失败只显示固定页内信息，可手动重试，不显示原始错误、身份或路径。清理已经成功但随后大小读取失败时明确显示“清理完成；统计暂不可用”，避免误报清理失败或零占用。网络活动可在清理后产生非零 HTTP 缓存，非零不是自动清理失败。

## 可重复验证与限制

```bash
node --test tests/cache-management-page.test.cjs tests/cache-management.test.cjs tests/app-shutdown-drain.test.cjs tests/page-cache-test-entry.test.cjs tests/home-layout-cache-integration.test.cjs tests/page-data-cache.test.cjs tests/mpv-kernel-ui.test.cjs
node tools/check-cache-settings-renderer.cjs /absolute/path/to/installed/chromium
node tools/check-home-flow-renderer.cjs /absolute/path/to/installed/chromium
```

“清理以上缓存”按原 owner 分别执行布局失效和 HTTP 清理，每项保留成功／失败／未知统计结果，布局失败不阻断独立 HTTP owner。离页使未开始的后续清理停止；已经开始的 HTTP 工作仍归 main 等待结算，不假装取消或把部分完成说成全部完成。

Node 执行真实管理 IPC、原 sender boundary、布局／数据缓存以及原 main 退出块；Electron session／app 对象为替身。缓存清理回归覆盖多 owner、身份变更、期限、在途取消、迟到回复、销毁、重复点击、异常、清理后无法测量及退出归属。HTTP session 替身只允许调用 getCacheSize／clearCache，其他接口触碰即失败。

可选已安装 Chromium 工具执行真实独立页 HTML/controller、原 BaseView、管理 UI、缓存、Events 和 DOM，另用原 Alameda 加载独立缓存页工厂及真实管理依赖、原设置 CSS 和首页相对样式，并验证共享同一缓存 owner；网络、IPC 和 session 为受控替身。它不安装浏览器、不读取个人 profile、不连接实际 Emby，也不代替 Electron/Windows 的整包存储保留、焦点、主题和视觉验收。

后续精确独立包先按[隔离入口](PAGE_CACHE_TEST_ENTRY.md)在全新测试 profile 验证：从客户端设置点击缓存管理可读取两项；手动清理后重读；登录和设置以及 embydata 保持；请求／清理未结算时离页、返回、退出不出现迟到覆盖或遗留在途 owner。需使用合成数据／获准测试身份，用户工作期间不执行前台验证。这里不承诺清理后的性能收益或所有页面优化完成。

完整离线回归须先用 `node tools/prepare-preload.cjs .` 从锁定源码模板生成被忽略的 preload，再运行 `node --test --test-concurrency=1 tests/*.test.cjs`。独立缓存页必须在实际设置列表和插件路由中验证；进入时的 HTTP 统计是只读请求，检查更新和清理仍只由对应用户动作触发。平台专属测试按实际宿主单独列出，Linux 结果不替代 Windows PowerShell／进程集成证据。

原生点击链的受控复现还运行原设置 controller／navdrawercontent／listview／Shortcuts，通过真实 getRoutes、mapRoute 和 router／viewmanager 打开独立页并操作按钮，见 `tools/check-home-route-renderer.cjs`。该工具的 API、文本／模块载入和宿主 IPC 为明确边界替身；实际 Alameda 加载独立页和原 CSS 另行验证，不等于 Windows 整包已验收。

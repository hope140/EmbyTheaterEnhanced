# 页面缓存：隔离测试启动入口

独立分支 `feature/page-cache` 已重基当前 v0.4.0 main `88578c91ab19d44eecddcfae096d37dc917ef1f4`，现有真实的命令行→main→prepared preload→原首页工厂测试接线。普通 Host/客户端启动不带参数，缓存仍默认关闭；没有设置页、持久化开关或产品 TTL。只缓存 HomeSections 安全投影，Items、用户资料、图片、播放和认证请求仍不缓存。

## 构建与运行

父线程在正式 v0.4.0 任务之后协调独立分支云UI构建：现有 `.github/workflows/public-ci.yml`、ref=`feature/page-cache`、`release_package=false`。触发前核对远端实际40位来源；正常推送及exact SHA由最终交付回读确认；不手动触发打包workflow。构建/VerifyOnly/完整安装器解包对照按原门禁执行，不能把本地Node夹具当成Windows包通过。

使用该**精确提交新构建并已验证解包的 runtime**，保留全部文件及runtime-provenance.json。测试时不执行普通安装器，不覆盖当前应用目录、不改Host配置；不要对旧包补文件或手改preload/manifest。父/测试runner可沿既有固定innounp解包流程取得独立runtime；当前手动artifact仍以带commit/run的测试安装器为容器，没有宣称新增便携ZIP。空白Windows VM仍为首轮自动验收环境。

在Windows PowerShell中，把 `$trialRuntime` 指向上述独立解包根目录，直接执行其固定Electron，不经过Emby.Theater.exe/普通安装入口：

```powershell
$trialRuntime = 'C:\ETE-PageCache-Test\verified-runtime'
& (Join-Path $trialRuntime 'x64\electron\electron.exe') `
  (Join-Path $trialRuntime 'electronapp') `
  '--ete-page-cache-test=enabled' `
  '--ete-page-cache-ttl-ms=10000' `
  '--ete-page-cache-max-entries=2' `
  '--ete-page-cache-max-bytes=1048576'
```

这是**显式测试参数示例**，不是产品TTL或容量默认。关闭对照使用相同三项数值，只把第一个参数改为 `--ete-page-cache-test=disabled`；该模式同样创建全新隔离profile，所以两个对照不携带上轮登录或数据。不带任何测试参数则完全沿原普通启动，不创建测试profile。

四项测试参数必须恰好各出现一次，不接受缺参、重复、别名、负数、0、小数、科学计数、未知选项或额外位置参数。TTL范围1–300000ms，条目1–1024，序列化预算1–33554432bytes；工程内部pending/期限护栏沿[基础合同](PAGE_DATA_CACHE.md)。不允许在这条应用参数链中另外指定profile、调试端口或安全选项；测试入口不修改既有webPreferences安全策略、代理、防火墙、ACL或系统环境。

## 隔离和拒绝

`main.js`在bootstrap、设备身份和日志创建之前调用 `page-cache/test-session.js`，要求Windows、app尚未ready、实际execPath为当前runtime的x64/electron/electron.exe且argv应用目录为该runtime/electronapp。缺来源清单、七份关键维护脚本与Git blob来源记录不一致、prepared preload不一致、输入/临时目录为链接或重定向均拒绝。这里的包内哈希自检是有限启动绑定，**不是独立完整来源或全runtime验证**；完整验证仍由构建与父线程核对执行。

全部参数及包内身份检查通过后，只在物理临时父目录创建全新 `ETE-page-cache-test-*` 根目录；不能选择/复用已有profile。拒绝临时父目录位于当前runtime、普通userData或appData/EmbyTheaterEnhanced之内。每次生成独立的appdata、userdata、session、logs、temp、crashes、localappdata和mpv目录，不复制账户、存储或原配置。

- 在任何产品bootstrap写入前设置Electron的appData/userData/sessionData/logs/temp/crashDumps，后续旧位置参数解析也不能覆盖测试userData。
- APPDATA、LOCALAPPDATA、TMP、TEMP、MPV_HOME只在当前测试进程环境中指向新根目录，供原preload及后续子进程读取；不写系统环境。
- Host不由该入口启动，因此不依赖改Host ProgramDataPath来隔离。这里不是Host启动/安装/播放验收；尤其不把设置Electron路径外推为任意本机库的Windows Known Folder读取均已隔离。首轮不执行播放和真实服务动作。
- 新根目录保存 `page-cache-test-session.json`，仅有来源commit、有限测试参数和PREPARED状态，不含令牌/账号。PREPARED只证明入口准备到该点，**不证明窗口显示、Home工厂接线执行或缓存命中**。它不会自动删除，保留本轮证据；下一次启动继续创建新目录。

main仅在该模式给原应用BrowserWindow添加一个内部renderer参数；prepared preload验证有限配置后安装不可写/不可重配的 `window.__etePageCacheTestOptions`，原Home工厂读取该对象。普通main拒绝用户直接提供该内部renderer参数，普通preload没有该参数时不设置选项或加载测试选项模块。没有新增IPC、任意配置文件、脚本求值或认证数据传递。

## 自动证据与Windows验收

本次19个文件的定向及相邻合同247/247通过，失败/取消/跳过均为0。离线回归执行真实配置解析/拒绝、实际文件哈希与物理路径检查、真实临时目录分配、原bootstrap及main启动片段、生成preload块、真实Home controller/provider/cache与维护AMD API/CM；app Electron对象、Windows可执行文件身份、Fetch、DOM及部分事件仍为夹具。测试检查正式配置sentinel不变、每轮profile新建无账户复制、disabled对照、preload选项进入原Home工厂、同账号字符串的两测试renderer不共享缓存、账号切换及迟到响应。不得把这些称为Windows Electron实际setPath或完整GUI已运行。

完整自动验收仍需在父协调的新Windows测试包上：

1. 开启/关闭各启动一次，读取应用进程appData/userData/sessionData和bootstrap实际目录，确认均在本轮新根目录，原配置树未变；核对prepared receipt来源与artifact来源一致。
2. 用合成只读服务/身份完成原登录/首页加载，在实际原loader/组件下检查 `window.__etePageCacheTestOptions` 和请求计数。开启时同一保留HomeTab返回可命中布局；Items仍读取，显式刷新/TTL后重取。页面被销毁后不要求跨实例命中。
3. 验证旧请求、坏schema/错误、账号/服务器切换、退出重登、成功写通知失效和销毁；不要为演示通知向用户NAS写收藏或进度。

需要Windows人工的最短补充是一次首页→详情→返回、刷新/过期后恢复，以及焦点/滚动/加载遮罩可见体验。先完成自动启动/路径检查再交给用户；若真实服务体验仍需用户，则只读测试等后续明确安排，不复制已登录profile、不要求上传账户信息。真实播放、安装、覆盖升级、真实NAS写与性能收益不在本轮已验收范围。

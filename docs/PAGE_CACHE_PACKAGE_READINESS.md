# 页面缓存测试包准备评估

当前功能来源为 `ed5713384bc709b32d1f1d11a0edfd6ef9874aa1`，独立分支 `feature/page-cache`，基线 `6858c71103605ff66c630f1cd7e1e9fdbdeab000`。后续文档提交不改变这次功能实现身份。正式 v0.4.0 仍优先，真实发布点确定后再重基和重新验证；不把其他功能或正式发布任务混入本分支。

**结论：具备默认关闭的真实源码接线和隔离合成集成测试，但暂不具备可开启该功能的包内安全测试开关。当前不申请功能验收包构建；不能用关闭状态安装包冒充缓存功能验收。**

## 证据和缺口

| 项目 | 当前事实 |
| --- | --- |
| 页面接线 | HomeTab → home controller → provider → 安全投影布局缓存已接，源码默认关闭。内容 Items、图片、播放及认证请求不缓存。 |
| 测试 | 精确功能版本有170/170定向/相邻回归、419个JS语法和有限凭据模式检查；精确提交物化的4个home/cache文件逐字节一致。实际API/CM与合成Fetch、DOM/事件替身的范围见[适配合同](PAGE_CACHE_HOME_ADAPTER.md)。没有Windows整包/GUI/真实性能证据。 |
| 可开启入口 | [`home-tab.js`](../src/electronapp/enhanced/home/home-tab.js) 接受 dependencies.pageCacheOptions；[`patch-server-home.cjs`](../tools/patch-server-home.cjs) 的实际调用只传legacy/loading/focus/connection，未传缓存配置。适配器需要显式enabled和TTL；没有设置、CLI、环境变量或包内测试配置入口。 |
| 默认与未定规格 | 不新增产品TTL/容量选择；现有工程限额、测试TTL不能当产品默认。不能靠篡改生成runtime、跳过provenance或临时改已验包文件启用。 |
| 隔离 | [`ci-windows-test-package.ps1`](../tools/ci-windows-test-package.ps1) 生成含commit/run的独立安装器名，并拒绝已有输出。独立文件名不等于安装隔离：[`installer`](../installer/EmbyTheaterEnhanced.iss) 仍使用同一AppId、默认目录和UsePreviousAppDir。 |
| profile | [`bootstrap.js`](../src/electronapp/enhanced/bootstrap.js) 在appData/EmbyTheaterEnhanced下创建配置/身份；生成Host配置使用相同ApplicationData根。main稍后接受userData参数，不能据此宣称早期bootstrap/Host也被隔离。修改普通启动参数或仅换安装目录不足以证明全部隔离。 |
| 当前操作 | 没有触发workflow、上传分支、安装/启动程序、访问真实NAS或账户；没有尝试任何被拒入口。这是工程准备条件不足，不是本任务发生了审批拒绝。 |

## 给父线程的构建参数（条件满足后）

现有云UI支持 `.github/workflows/public-ci.yml` 的 workflow_dispatch：

- ref：本任务独立 `feature/page-cache`，触发前由父线程按授权安排远端可见，并核对它确切指向拟构建的40位commit；不要改main/发布分支。
- input：`release_package=false`。当前不存在 `page_cache_enabled` 或TTL工作流输入，不能编造此类参数。
- job：`manual-windows-test-package`，Windows2022、Node24.18.1；入口为 `tools/ci-windows-test-package.ps1 -ReleasePackage:$false`，从干净checkout按当前提交准备固定输入、构建并验证本runner Host，再跑回归、构建、VerifyOnly与安装器解包逐文件比对。
- 唯一产物名：`ete-test-win-x64-<github.sha>-<run_id>-<attempt>`；安装器含`-test-<sha前12位>-<run>-win-x64-setup`，输出路径`test-output/manual-windows-package`必须全新。保留原artifact/run，不覆盖任何既有附件或正式包。
- 现有手动job与正式手动构建共用concurrency group；由父协调排在正式v0.4.0任务之后，不取消或抢占正式run。
- 当前版本直接跑上述入口最多只能得到**关闭状态组装冒烟包**，不能验证缓存命中分支。只有补齐并审阅安全测试入口、绑定新的来源commit并完成其回归后，才改为功能验收候选。这里仅交接参数，没有实际触发或宣称云构建成功。

最小后续方案：若要验收开启分支，应由独立测试启动器在可确认的空白隔离环境中给原Home工厂提供显式、有限的验收配置，正常启动保持关闭；所有新增受消费输入必须进入来源/生成合同。先明确该入口及包身份方案，不为本轮打包评估扩展设置页、持久化偏好或产品TTL。本轮没有实现或批准某种IPC/环境变量/调试注入方案。

## 自动与人工验收清单（尚未执行）

先用空白Windows VM/独立OS用户、全新目标目录及profile；不能在当前正式客户端上覆盖安装、复制用户已登录profile或用真实账户原始数据填夹具。每次运行保存精确source/artifact SHA、配置是否启用、实际受测路径及安装/启动状态，状态未确认保持NOT EXECUTED。

自动阶段应使用合成只读服务和合成身份验证：关闭分支无监听/命中；开启后同一保留HomeTab返回只减少HomeSections读取而内容Items保持新鲜；显式刷新、TTL、迟到导航/认证轮换/退出、原成功写通知、坏schema/错误、凭据canary及销毁清理。必须在实际组装runtime和原加载器/组件中完成，现有Node夹具不替代该层。不能为验证写后事件而向用户NAS写入收藏/进度。

需要人工时最短四项：

1. 隔离测试副本内首页→详情→返回，核对原焦点/滚动和内容正确；记录HomeTab是否被保留，销毁后不要求命中。
2. 显式刷新及超过测试TTL后返回，确认内容可恢复、不留旧页/错误/加载遮罩。
3. 经允许的测试身份切换账号/服务器、退出后重登，确认无旧布局或用户状态；当前不要求用户提供真实账户数据。
4. 明确授权后才在真实服务做只读布局/返回体验，结果区分合成、真实服务及主观感受；不报未测性能收益。真实写、播放、NAS变更不包含在此清单。

这些是后续交接条件，不是已经完成的包验收，不触发新功能正式Release或合并。

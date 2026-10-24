# 页面缓存测试包准备评估

当前独立分支 `feature/page-cache` 已重基 v0.4.0 main `88578c91ab19d44eecddcfae096d37dc917ef1f4`。最初开发基线6858c711与历史本地提交ed571338等保留为阶段记录；当前功能来源以正常推送后回读的最终40位SHA为准。正式v0.4.0构建优先；本分支不混入其他新功能、不合main、不自行dispatch打包。

**更新：源码级安全测试入口现已补齐。** 本页保留上一轮包准备评估和既有构建参数；“无包内入口”的缺口由[隔离启动合同](PAGE_CACHE_TEST_ENTRY.md)中的显式参数与全新profile接线取代。当前可以准备独立新测试包，但尚未运行Windows Electron/完整GUI，不能将代码回归称为包验收。

**构建阻碍更新：** 首次 Windows 包尚未通过 Framework 固定实现门禁，没有成功 artifact。独立分支现新增[精确来源预检和候选合同](FRAMEWORK_SERVICING_PROFILES.md)，保留原固定实现和完整 Host 行为验收；新候选的实际 Windows 签名、兼容性及包产出待精确新提交构建验证，不重复运行旧提交。成功后先核对伴随 runner-framework-profile.json、Host 与 runtime 来源材料，再执行本页验收。

**功能验收更新：** 后续独立包启用路径已暴露缓存完成时的Window定时器接收者错误，关闭对照正常，不能称该包或含该代码的整合包验收通过。源码新增直接调用全局定时器的默认时钟包装及接收者回归；已有旧包不覆盖补丁，精确修复提交须另构建验收。修复候选的无界面Chromium/可控host测试不能替代Windows Electron整包验证。上段构建状态是历史阻碍记录，后续实际构建结果应按对应来源回执判断。

## 证据和缺口

| 项目 | 当前事实 |
| --- | --- |
| 页面接线 | HomeTab → home controller → provider → 安全投影布局缓存已接，源码默认关闭。内容 Items、图片、播放及认证请求不缓存。 |
| 测试 | 重基后的页面缓存/入口、来源及v0.4.0版本/发行构建合同271/271、0失败/跳过；此前阶段170/247项保持历史范围，静态检查按最终提交记录；精确提交物化的4个home/cache文件逐字节一致。实际API/CM与合成Fetch、DOM/事件替身的范围见[适配合同](PAGE_CACHE_HOME_ADAPTER.md)。没有Windows整包/GUI/真实性能证据。 |
| 可开启入口 | [`home-tab.js`](../src/electronapp/enhanced/home/home-tab.js) 接受 dependencies.pageCacheOptions；[`patch-server-home.cjs`](../tools/patch-server-home.cjs) 的实际调用只传legacy/loading/focus/connection，未传缓存配置。适配器需要显式enabled和TTL；原评估时没有CLI入口；现新增main启动参数→prepared preload→Home工厂接线，正常启动继续关闭，见隔离启动合同。 |
| 默认与未定规格 | 不新增产品TTL/容量选择；现有工程限额、测试TTL不能当产品默认。不能靠篡改生成runtime、跳过provenance或临时改已验包文件启用。 |
| 隔离 | [`ci-windows-test-package.ps1`](../tools/ci-windows-test-package.ps1) 生成含commit/run的独立安装器名，并拒绝已有输出。独立文件名不等于安装隔离：[`installer`](../installer/EmbyTheaterEnhanced.iss) 仍使用同一AppId、默认目录和UsePreviousAppDir。 |
| profile | [`bootstrap.js`](../src/electronapp/enhanced/bootstrap.js) 在appData/EmbyTheaterEnhanced下创建配置/身份；生成Host配置使用相同ApplicationData根。普通main稍后接受userData参数，不足以隔离早期bootstrap/Host。新显式测试入口在bootstrap之前设置独立Electron路径与进程环境，并直接启动Electron避开Host，具体边界见隔离启动合同。 |
| 当前操作 | 没有触发workflow、上传分支、安装/启动程序、访问真实NAS或账户；没有尝试任何被拒入口。本次未发生审批拒绝；Windows包/运行与性能尚未执行。 |

## 给父线程的构建参数（条件满足后）

现有云UI支持 `.github/workflows/public-ci.yml` 的 workflow_dispatch：

- ref：本任务独立 `feature/page-cache`，触发前由父线程按授权安排远端可见，并核对它确切指向拟构建的40位commit；不要改main/发布分支。
- input：`release_package=false`。当前不存在 `page_cache_enabled` 或TTL工作流输入，不能编造此类参数。
- job：`manual-windows-test-package`，Windows2022、Node24.18.1；入口为 `tools/ci-windows-test-package.ps1 -ReleasePackage:$false`，从干净checkout按当前提交准备固定输入、构建并验证本runner Host，再跑回归、构建、VerifyOnly与安装器解包逐文件比对。
- 唯一产物名：`ete-test-win-x64-<github.sha>-<run_id>-<attempt>`；安装器含`-test-<sha前12位>-<run>-win-x64-setup`，输出路径`test-output/manual-windows-package`必须全新。保留原artifact/run，不覆盖任何既有附件或正式包。
- 现有手动job与正式手动构建共用concurrency group；由父协调排在正式v0.4.0任务之后，不取消或抢占正式run。
- 本分支新增的测试入口必须随精确来源新构建；完整包验证后按隔离启动合同在独立解包runtime运行显式参数。这里仅交接参数，没有实际触发或宣称云构建成功。

已实施方案：只读验证显式有限参数与包内关键身份，在bootstrap之前分配全新临时profile并设置Electron路径及当前进程环境，原preload把有限选项送到Home工厂；没有新增IPC或修改安装器。启动命令、拒绝范围及Windows未验项见[隔离启动合同](PAGE_CACHE_TEST_ENTRY.md)。

## 自动与人工验收清单（尚未执行）

先用空白Windows VM/独立OS用户、全新目标目录及profile；不能在当前正式客户端上覆盖安装、复制用户已登录profile或用真实账户原始数据填夹具。每次运行保存精确source/artifact SHA、配置是否启用、实际受测路径及安装/启动状态，状态未确认保持NOT EXECUTED。

自动阶段应使用合成只读服务和合成身份验证：关闭分支无监听/命中；开启后同一保留HomeTab返回只减少HomeSections读取而内容Items保持新鲜；显式刷新、TTL、迟到导航/认证轮换/退出、原成功写通知、坏schema/错误、凭据canary及销毁清理。必须在实际组装runtime和原加载器/组件中完成，现有Node夹具不替代该层。不能为验证写后事件而向用户NAS写入收藏/进度。

需要人工时最短四项：

1. 隔离测试副本内首页→详情→返回，核对原焦点/滚动和内容正确；记录HomeTab是否被保留，销毁后不要求命中。
2. 显式刷新及超过测试TTL后返回，确认内容可恢复、不留旧页/错误/加载遮罩。
3. 经允许的测试身份切换账号/服务器、退出后重登，确认无旧布局或用户状态；当前不要求用户提供真实账户数据。
4. 明确授权后才在真实服务做只读布局/返回体验，结果区分合成、真实服务及主观感受；不报未测性能收益。真实写、播放、NAS变更不包含在此清单。

这些是后续交接条件，不是已经完成的包验收，不触发新功能正式Release或合并。

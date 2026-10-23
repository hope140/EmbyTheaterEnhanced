# 页面布局缓存与四项审查修复：本地测试整合

此为可回退的测试集成，未批准正式合并。分支`integration/page-cache-audit`，共同base为发布main `88578c91ab19d44eecddcfae096d37dc917ef1f4`，只接受以下两个准确父来源：

- `fix/post-v040-audit-findings`：`2570c3263bf2dc3fe43168edcf6b64c9f2eacda5`，四个审查修复提交。
- `feature/page-cache`：`4f3eceee69855f9254d1de706e6fd3ee6be7fb95`，默认关闭的首页布局缓存及独立profile测试入口。

原分支不移动；本轮不推送、不开PR、不触发构建、不合main或发布。只在本地新worktree生成集成提交与忽略的测试产物。父协调先核对页面缓存独立Windows作业，再安排是否制作组合测试包。本轮Node回归和来源检查不是Windows包、GUI或真实性能验收。

## 冲突与范围

生产源码和测试路径没有交集冲突。`docs/PROJECT_STATUS.md`、`docs/DEVELOPMENT_LOG.md`顶部新增记录冲突：保留页面缓存全部阶段记录及四项审查修复全部记录，公共基线正文只保留一次，并增加明确的本地测试整合说明。`docs/ARCHITECTURE.md`自动合并后同时保留缓存和FPS意图合同。其他文件按各自指定父来源原字节保留，不改产品源码来消除测试差异。

不包含手动更新、预览、EWT、播放缓存或其他功能。未获取或尝试转送任何被拒分支内容，不能用集成分支绕过其他分支的策略拒绝。版本、依赖、安装器、CI和Host/C++保持共同基线；原始vendor输入只读。

## 默认关闭与试验入口

普通Home工厂无显式缓存选项时不实例化数据缓存、不注册缓存监听器；仅`enabled=true`且给定正TTL才接入HomeSections安全投影。Section Items、图片、认证、播放和会话数据不缓存，产品配置未增加启用默认、TTL默认或设置页。

原页面缓存CLI在bootstrap/身份/日志写入之前，要求Windows、当前包内Electron/app身份和未ready状态；参数、关键来源及prepared preload检查通过后创建全新临时profile，设置独立appData/userData/session/log/temp/crash及当前进程环境。enabled/disabled对照都使用全新根，不复制既有登录配置。原普通启动不触发该准备路径，原preload无内部参数时不安装缓存选项。

源码及合成夹具确认这些入口；真实Windows setPath/GUI/首页命中和焦点滚动须按[测试入口](PAGE_CACHE_TEST_ENTRY.md)另验。内部PREPARED回执只代表入口准备到该点，不代表页面已加载、缓存命中或整包通过。本轮不执行该Windows入口，也不访问真实NAS/账户。

## 与四项修复的交叉合同

- 测试profile先于原bootstrap建立；STRM secrets首次恢复规则及原保存策略保持，不能读取正式profile来验证功能。
- 新main测试入口/preload选项不得绕过原helper创建/销毁owner与app退出等待；普通路径及四项生命周期回归继续执行。
- 页面缓存不改pause/unpause/playPause；FPS显式意图及nativecycle的保守恢复边界保持。
- controller历史固定容量及丢弃计数不变；新试验或诊断不能依赖无限历史或timeline数组结构写回。
- API/CM登录轮换、布局订阅取消和销毁只影响所属缓存，不增加另一套播放、页面滚动或Session owner。

## 组合回归

使用锁定Node、锁定依赖，先按原工具生成prepared preload，再在准确集成提交运行：

```sh
node tools/prepare-preload.cjs .
node tools/ci-public-tests.cjs
node --test --test-concurrency=1 tests/device-identity.test.cjs tests/external-player-process-chain.test.cjs tests/playback-route-stats.test.cjs tests/playbackmanager-request-session.test.cjs tests/runtime-provenance.test.cjs tests/web-overlay-preparation.test.cjs
node --test tests/home-server-rendering-material-selftest.cjs
```

公开集合包含page-data-cache、home-layout-cache-integration、page-cache-test-entry及四项修复回归；另核HEAD构建输入、语法、有限凭据模式和空白检查。定向入口测试验证默认无副作用、enabled/disabled、参数/来源/链接拒绝、正式配置sentinel不变、每轮新profile、实际main片段与prepared preload到Home工厂接线。模块/文件来自真实源码，Electron/Windows映像、DOM、Fetch仍含替身，不能越级称完整Windows验收。

结果按准确集成提交在独立交接证据中保存；上述命令是本轮范围，不宣称所有显式材料自测、Windows硬件或整仓逐行无问题。若组合测试失败，保留原日志和来源再定位，不通过改默认值、跳过或扩大权限凑通过。

# v0.2.6 主线整合审查

PR #20 已于2026-10-09 22:22:16（UTC+8）以merge commit合入main，提交 bc50d181cd5cafd14b31e2c0d24cbf7fd73b0ee1；合并树与已审阅45ec2d6相同。以下保留合并前审查时点记录。合并后记录见 PROJECT_STATUS。


日期：2026-10-09（UTC+8）。本轮将已经发布的v0.2.6完整成果提交为指向main的独立PR，收口到差异、验证与合并判定。发布产品身份保持不变。

## Git关系与整合方式

| 身份 | 准确提交 / 状态 |
|---|---|
| 远端main审查基线 | `46e995ef83fca7f7a882e3dc633bdcc2d2d521c7` |
| 完整发布分支 | `codex/release-v0.2.6-test-20261009` / `4b2491959a756844bf72b923306b0ec7f0a061d7` |
| 发布产品sourceCommit | `355f4e6ba434074d1cd5c17e24cd79bad0f5eb1f` |
| merge-base | 与main审查基线相同 |
| 双向提交差异 | main独有0，发布分支独有81 |
| 本轮整合分支 | `codex/integrate-v0.2.6-main-20261009` |

开工现场远端refs与交接一致，open PR为0。完整发布分支已经包含main，直接从其准确HEAD建立独立托管worktree和整合分支，保留81个提交及原有merge关系。没有冲突需要解决。主目录的旧分支、未提交资料及旧工作树保持原状。

## main到拟整合树的范围

发布树相对main共172个文件、42,074行增加和843行删除，其中59个文件为文档或历史证据。逐文件状态与分组保存在 [整合证据](evidence/main-integration-026-20261009.json) 的`publishedScope.files`。

| 分组 | 文件数 | 已发布成果 |
|---|---:|---|
| 应用层 | 23 | Settings原生布局/动态控件与About；有限脱敏诊断；原生持帧协调；全屏状态；Native Helper正常关闭等待 |
| Native Helper C++ | 1 | generation/hold归属、原生内存帧、one-shot揭帧与失败清理 |
| 工具 | 35 | PlaybackManager请求快照/Stop owner补丁、确定性播放与关闭验证、离线计时、固定构建输入与来源校验 |
| 测试 | 51 | 请求/Session/Stop/退出、Settings、诊断、持帧、runner、输入与打包边界 |
| 打包元数据 | 3 | 版本0.2.6、lockfile版本、Inno源文件时间控制 |
| 文档 | 38 | 架构、验收、构建、来源材料、状态和发布记录 |
| 历史结构化证据 | 21 | 各原始sourceCommit的成功、失败、来源、发布与材料证据 |

本轮在完整发布树上只整理README、CHANGELOG、ROADMAP、PROJECT_STATUS、DEVELOPMENT_LOG、TESTING、PACKAGING，并新增本报告和结构化证据。修正了“已发布但仍写待打包/待发布”的当前导航，补齐正常关闭和v0.2.6测试入口。历史专项证据与四份随包通知原样保留。相对main的最终PR为174个文件；本轮新增的产品、测试或构建逻辑为0。

## 审查结果

当前检查范围内未发现需要修改产品的整合缺陷或合并阻断；主线没有独有改动会被覆盖。主线程核对了跨层调用与回归断言，两个Tier 1只读worker分别审查构建/来源和Settings/诊断，worker结果不替代最终判断。

- 播放请求先复制options再分配ID，旧PlaybackInfo和旧失败无法越过current-request边界再次play；Item、MediaSource、PlaySession与远控链继续归原PlaybackManager所有。
- pending标记只抑制尚未Started的临时Stopped报告。Stop coordinator按捕获stream排空旧物理Stop、解绑无标签stopped事件并只清理/报告一次；terminal join保留拒绝，最新presentation token仍执行准备。非本地/self-managed player保留原路径。
- presentation token、endpoint epoch、helper instance与generation的归属校验保留；旧完成不能撤销新hold，native one-shot依赖目标媒体、capture与fence，失败有界清理。当前实现和原用户验收结论保持原证据范围。
- `destroy()`返回共享Promise，并捕获renderer先行销毁的pending集合；全部captured outcomes经`allSettled`收齐后传播失败，原失败时surface cleanup短路保持。main的正常退出继续等待Native IPC注销返回的Promise。
- Settings沿用显式Save与独立Token操作；维护IPC只接收当前应用webContents。Renderer错误在两端投影为固定类别及安全包内位置，原始消息/stack不进入日志；更新查询仍由点击触发并有总时限。
- 构建保留Git blob输入、固定完整工具链、精确npm目录、writer链接保护和Inno时间控制。来源材料索引与缺口保留，不将通知交付或公开二进制身份推导成完整源码可重建。

## 本轮验证与旧证据复用

本轮整合树完整单测：**631/631 PASS**，0失败/取消/跳过，约238.7秒。命令为 `node --test --test-concurrency=1 tests/*.test.cjs`，原始日志保存在整合工作树的 `test-output/integration-unit.log`，环境和日志hash记录在机器证据中。一个只读review worker在旧发布树启动的两次局部测试因无工具输出手动中断，exit1、未产生测试终态，不计入本次PASS。

本次环境为Node v24.18.1 / npm 11.17.0，full suite退出码0；196份tracked JS/CJS及prepared preload语法检查0失败，`git diff --check`通过。`npm ci --ignore-scripts`退出0。正式prepare第一次受Windows深层路径复制限制失败，保留失败现场后改用临时PowerShell文件系统驱动缩短本轮worktree路径，同一`prepare.ps1 -ArchiveRoot`退出0；Carnival、补丁、Electron三个归档SHA256和Electron 73文件tree匹配锁定manifest。未改系统PATH或长路径策略。

`npm audit --json`退出1，报告原已锁定的`@grpc/grpc-js 1.14.4`一个受影响包，包含 [High服务端证书身份问题](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j) 与 [Low服务端异常信息问题](https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4)。main使用同一依赖版本，本PR仅改package版本元数据。官方触发条件分别涉及服务端凭据/getAuthContext鉴权，以及运行gRPC服务端。静态核对生产`enhanced/cd2-service.js`只创建CloudDriveFileSrv客户端；生产源码没有gRPC Server、ServerCredentials、getAuthContext或xDS入口，独立smoke服务只绑定127.0.0.1。因此当前未发现这些服务端触发路径，记为已披露的非阻断依赖维护项；这不是npm audit通过，也不是全依赖无漏洞结论。本轮保持固定输入，不升级依赖。

身份复核已通过，机器证据如下。

1. `src`、`native`、`tools`、`tests`、`installer`、`vendor`六棵Git tree与355f4e6完全相同。34项`INPUT_PATHS`逐项Git blob相同，包含package/lock、生成器、清单、工具链锁和四份随包通知。
2. 原runtime重新枚举并读取全部2,136文件，missing/extra/mismatch均为0。manifest SHA256为`69fb0042c7651a40b2ac4ebfffd149307bd4e292eb5231998dc24c7300786e7c`，payload-set为`19b2156f215afaa7f714d56ded5ab57923949f62f4cf0ee0ee6a7e33a40595d4`。
3. 原安装器重新读取175,621,807 bytes，SHA256为`bc878b4e929016071b8d7a41f9b281ad3118e62e8a1e469b0a5c9858718b1532`，与原交付及GitHub asset digest一致。
4. 原三种正常关闭及五组完整pipeline的69份原始artifact逐一匹配公开证据hash；16份原harness文件精确匹配原运行输入。新checkout中6份文件仅有CRLF/LF差异，双方归一化后均匹配同一product blob，机器记录同时保留旧/新物理hash。
5. 因本轮没有产品或构建输入变更，复用的runtime仍明确归属355f4e6，没有重新标记sourceCommit、构建安装器或启动客户端。旧八组PASS、自然exit0、零强清理与零观察到的候选残留是经身份关联的历史运行证据；本次新执行的是整合树单测和只读身份复核。

## 发布身份与PR判定

现场回读v0.2.6仍是Release `407934479`、Pre-release，target_commitish为355f4e6；annotated tag object为`ea4841bf7ed51471facc5b715a058e3de9b19241`，解引用355f4e6。三个资产ID、大小与digest保持，正式Latest仍v0.2.2。完整公开下载核验沿用 [原发布证据](RELEASE_026.md)，本轮没有再次下载或修改Release。

PR：**[PR #20](https://github.com/hope140/EmbyTheaterEnhanced/pull/20) 已创建，OPEN / 非Draft**，base为main46e995e。创建时head为a064017，GitHub返回MERGEABLE / CLEAN；本次收尾提交只同步PR状态。check runs=0、commit statuses=0，combined status为pending（空集合），仓库workflow=0，故CI结论是“没有已配置的检查”，不能写成CI绿色。

最终判定：**具备进入main的技术合并条件，当前未发现整合阻断，等待人工review与合并决定**。依据是完整源码审查、整合树631/631全量、同源输入/产物/历史证据核对及main仍无独有提交。npm audit既有服务端依赖提示按上方适用性分析单列，不概括为全部检查通过。

PR创建后对照推送前快照，原36项远端refs全部保持，唯一新增ref为本次整合分支；8个Release的身份/正文/标志/发布日期及15个附件的ID/名称/大小/digest/状态均相同，Latest仍v0.2.2。PR已经附加到当前工作会话，结构化回读见本页机器证据。

本轮到可审阅PR为止，main未自动合并。早期8700039与d480eb8的直接`app.exit` OS退出超时仍UNKNOWN，最终355f4e6未复跑该直接退出路径。真实Emby/CD2、真实远控、可见首帧/连续性、HDR/多屏与系统安装/升级/卸载仍没有本次验收。About高级信息UNKNOWN留待下一轮。

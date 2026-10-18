# v0.3.10维护测试版发行合同

## 基线与范围

2026-10-18（UTC+8），用户明确发布v0.3.10。发行起点为准确main `d6f19c0b4b01f5bc5c496f22bf2d4b4a7e43e9eb`，分支`codex/v0310-maintenance-release`，使用独立managed发行树。PR #44代码main为`88fcac151d14a6e8d69ff5bd47db252b1d5b71c3`；此前本地候选e41a050及公开039/source06d34a7分别保留，均不代替本次最终产品来源。

本版交付四项已审修正：诊断动态对象键已知敏感格式清洗、服务器发现错误终结、WOL一次响应及Native输入/写队列在成员初始化后启动线程，以及既有文档事实维护。不增加产品功能，版本元数据更新为0.3.10，标题为“v0.3.10 · 稳定性维护测试版”。渠道为Pre-release，Stable/Latest保持v0.3.1，签名继续暂缓。

## 允许差异与保护

- 准备阶段只修改根`package.json`、`package-lock.json`的产品版本，`docs/RELEASE_NOTES.md`、本合同、`docs/V0310_RELEASE_VERIFICATION.md`、`CHANGELOG.md`、`docs/PROJECT_STATUS.md`及`docs/DEVELOPMENT_LOG.md`。
- 根package版本、lock顶层及`packages[""].version`三处一致；依赖项、integrity和其余配置保持。runtime版本由原build生成，manifest、Inno文件/产品版本及附件文件名按原链传播，不手改旧产物或仅换包名。
- `src/`、`native/`、`tools/`、`tests/`、`installer/`、`vendor/`及`.github/`保持基线。PlaybackManager/Session/身份、Resolver/CD2、Native协议/ABI/run/close/dtor、鉴权/IPC、显示与默认mpv/Electron均不改。
- 发行后仅按真实结果同步README、PACKAGING、状态、日志、变更记录与发行核验；后续文档HEAD单列，不移动产品Tag或替换既有附件。
- root旧Settings脏树及所有旧工作树、profile、备份、包和回执保留。固定材料只读复制到本任务新目录，先后核完整集合/大小/SHA，原件不改；不是Git跟踪的外部二进制按物理输入和固定manifest核对。

## 准备、集成与实际来源

先交本合同、私有STATE及准确版本/notes准备差异，由父实际审核。PR创建后attach，保存准确head/base、累计diff和实际Checks；公共CI成功及父准许后正常merge，不squash、rebase或force。

合并后固定准确main为本次sourceCommit，再执行本版实际公共与材料门禁、标准build、VerifyOnly和固定Inno安装器构建。历史1119公共/210材料只是选择与计数预期，必须保存新source的实际退出、唯一完整汇总和日志SHA；不借旧计数、解析失败后的覆盖或跳过输入代替。

本任务所有脚本、材料测试、生成物、解包及回执用新exclusive路径；尤其旧材料夹具的固定相对输出只能在本次新树首次运行。原失败、脚本及日志分别保留，新尝试换目录/文件名且先说明修正层次。共享STATE和发行核验由主线程单owner，worker只写自有新目录。

## 包体与附件门禁

1. 校验固定材料、锁定依赖与真实生成器组合；准确Git blob、build-input/source/runtime/native provenance及完整manifest相互绑定。生产Native为testing=false，实际Helper字节、CPP blob、materializer参数流和编译工具链分别核对，默认libmpv及完整Electron身份保持。
2. 标准runtime完整集合逐路径/大小/SHA核验；VerifyOnly通过后用固定Inno 6.7.3编译。安装器PE版本、NotSigned、sidecar和全部文件身份按实际值记录。
3. 用固定innounp在新目录解包，`{app}`完整集合与runtime逐路径/大小/SHA相同；私有harness、回执、profile、备份和凭据不入包。此门禁不等于系统安装、运行Helper、真实播放或设备验收。
4. 五附件固定为安装器、安装器`.provenance.json`、单文件`.sha256`、准确产品source的`RELEASE_NOTES.md`及`SHA256SUMS.txt`；notes使用Git blob的UTF-8/LF字节，与Release初次正文绑定，来源与manifest关系明确。
5. 父实际包体审核通过后，annotated `v0.3.10`绑定本次准确产品source，建立draft/prerelease并上传五附件；标题版本优先、make_latest=false。tag CI及上传后身份回读通过再公开，非draft且prerelease。
6. 五公开附件均匿名完整GET或连续range保存全部字节，检查覆盖、实际长度及独立SHA。上传成功、GitHub digest、HEAD或小样本不代替全字节下载；原21Release/74assets/45行tag引用及Latest031保持。

## 验收边界与恢复

本次不执行系统安装、主动前台、个人资料/凭据读取、真实服务器或网络设备操作，不升级依赖或采购签名。真实Helper ready/加载映像SHA、播放/远控和设备结果保持NOT_EXECUTED/UNKNOWN，不因发布变为PASS，也不以缺环境增加用户手测门槛。

准备与文档提交按独立小提交`git revert <commit>`恢复；原Release对象/字段/附件和Tag引用有before快照。本次新draft/上传出现失败先保存当前对象与错误，确认准确身份后继续或停止，不重建同名对象掩盖未知结果。已公开产品Tag和附件作为交付身份保留，后续纠错不通过重标或替换旧资产实现。

最终README/文档导航、PR状态、准确main/产品Tag、CI、附件及旧公开对象实际回读后交父最终验收。用户追加的发布后用户文档与Release规范整理仅在本版真实闭环后从届时准确main另建文档树执行；共用跟进由父在两个阶段均验收后关闭。

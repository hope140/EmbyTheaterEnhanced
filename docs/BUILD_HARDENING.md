# 构建输入绑定与依赖生成

基线为审计提交 `49f643a`，独立分支 `codex/build-hardening-20261009`。
本轮只修改构建、审计、测试与文档；产品版本保留 0.2.4。候选产物必须
使用其实际 sourceCommit 命名，原 P1 与既有发布产物保持各自身份。

## 输入 contract

`tools/build-input-contract.cjs` 是限定输入集合的执行定义。集合覆盖
package/lock、四份既有 vendor manifest、实际消费它们的 build/package
与全部局部 helper、安装器脚本和四份随包通知。新增工具链锁只补充
既有清单没有固定的展开工具目录，不重新定义 Electron、libmpv、header
或 compiler flags 的权威身份。

build 在创建输出之前、package 在验证载荷之前检查这些输入是 HEAD 的
regular Git blob；工作文件允许 CRLF/LF 表示差异，其他差异立即失败。
普通 `src/electronapp` 与 native C++ 仍从指定提交的 blob 物化。
无关工作文档不要求 clean，index 不能替代 sourceCommit。所有记录中的
tracked 元数据 hash 使用提交字节，避免 checkout 换行改变 provenance。

vendor 输入本体由既有 manifest 验证，不写回原始输入。prepared preload
和 Web overlay 保留已有 canonical 生成关系。`Emby.Theater.exe.config`
从固定 Carnival base 只替换唯一 ProgramDataPath 锚点；新输入记录同时
绑定 base、generator 和 output。根 LICENSE、THIRD_PARTY_NOTICES.md、
docs/LICENSING.md 与 docs/SOURCE_MATERIALS.md 复制准确 blob 字节。
`build-input-provenance.json` 自身的 hash 纳入 build manifest，package
重新生成预期关系并核对通知和 config，不接受只修改 payload 清单的替换。
新 build manifest 使用 schema 3，明确区分 canonical 元数据 hash 和新增
inputs binding；离线审计仍识别历史 schema 2 的原始字节和两项 binding。
schema 2 的历史通过不被升级为本轮输入 contract 的通过。

## Node 依赖 contract

每次 build 在新的本地临时项目用原 package/lock 执行 npm ci，禁用安装
脚本且只安装生产依赖；npm 负责检查锁定 tarball integrity。已有根
node_modules 不作为生产复制源。复制器只接受本轮创建的新 dist 输出
及一次性 ownership token，拒绝链接和越界目标。完整替换锁定的包根，
逐文件比较新 npm 输入与输出，另核对明确保留的 Carnival 包与其归档
字节；未知额外文件不能进入完成的依赖目录。

该流程不改变版本或 lockfile 选择。安装材料可由 npm 本地缓存提供，
但并不声称与网络、npm 实现和构建宿主完全无关的 hermetic build。
依赖包目录精确性、保留包来源、运行验证分别留存证据。
本轮保留每次新建的 `.work/runtime-dependencies-*` 作为可核查输入；它们
不进入安装包。失败输出也保留供诊断，使用新名称重试，不覆盖旧材料。

## 验证层次

需要负向测试 dirty 版本/lock/manifest/generator、缺失和篡改通知、错误
config base/output、stale 包文件和越界清理。全量测试与来源校验通过后，
同一产品提交、相同固定输入在两个全新输出比较完整路径与 SHA256。
安装器完整性、解包文件比较、容器字节相同分别记录，不能互相替代。
隔离运行只使用明确 appData/userData 的已修正 runner、假服务和合成
媒体；视觉和真实服务验收不在本轮工程完成声明中。

源码材料缺项见随包 [来源索引](SOURCE_MATERIALS.md)。

## 2026-10-09 本地交付结果

状态为 `LOCAL ENGINEERING CANDIDATE COMPLETE / LIMITATIONS RECORDED`。
产品sourceCommit为 `3b158f69e974802ef92a3d8c7ef6815139498d1f`，后续文档
HEAD不替换这个产物身份。普通产品源码85项、native C++、原vendor
manifests、package/lock和installer脚本相对审计起点保持不变。

| 验证层 | 实测结果 |
|---|---|
| 最终提交全量测试 | 529/529 PASS，0 skipped；日志 `.work/build-hardening-unit-committed.log` |
| 实际build入口负向 | dirty版本、lock、vendor manifest、生成器四项全部在创建输出前拒绝 |
| 新输入与来源 | 34项提交输入、4份notice；source/runtime/native/Electron与依赖集合检查PASS |
| 两次独立runtime构建 | 两次独立新输出、独立npm安装；各2136文件（payload2135 + build manifest），全路径/hash一致，missing/extra/changed均0 |
| 新Node目录 | 33个锁选包1142文件；7个Carnival包身份29文件；合计1171，long精确10文件、旧残留0 |
| Native Helper | 重新编译SHA256仍为 `28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`，与P1一致 |
| 输入审计器 | OBSERVED / CONSISTENT；runtime、三项binding和packageComparison均PASS，保留inventory语义 |
| 两个安装器 | Inno完整性均通过；每个解包`{app}`2136文件与对应runtime路径/hash完全一致；PE双版本0.2.4 |
| 安装器容器原始字节 | 不一致，尚未实现容器字节复现；未改写/过滤差异字节，也不以解包相同冒充容器相同 |
| 隐藏fake CD2/合成媒体 | 首轮仅double-Next的selected断言失败；普通/STRM、暂停/跳转/恢复、身份和Session报告、generation takeover与Stop防迟到加载通过。有界复验完整PASS |
| 最终诊断与隔离 | 111条合法记录、准确关联10、两类Renderer安全位置各1、raw canary缺失；appData/userData均在bootstrap前设置并读回，最终6个子进程已退出、残留0 |

首次隐藏回归记录位于 `.work/p1-runtime-47aab83d33e34372af550c14be588fdf/`。
实际报告显示两次Next依次启动B、C，而夹具的selected断言要求仍为B；
这与历史快速夹具的限制一致，但本次失败仍保留，不修改断言或播放链。
构建/全量测试结束后使用新profile进行一次有界复验，位于
`.work/p1-runtime-e611deabc22642acbeccee28217d2676/`，整体退出0、产品
diagnostics验证PASS。它证明该次隔离运行通过，不证明夹具从此无时序
敏感性；没有把file-loaded/core-playing记录称为可见首帧验收。

## P1 差异与候选入口

与P1的2150文件逐字节回比：新增6、删除20、改动4，其余保持。
新增为根LICENSE、THIRD_PARTY_NOTICES.md、docs/LICENSING.md、
docs/SOURCE_MATERIALS.md、build-input-provenance.json、runtime-dependencies.json。
删除项全部是long的旧文件；改动项只有build/native-helper/runtime/source
四份manifest/provenance。Windows Host、Electron、libmpv、重新编译的
Helper、全部产品JS和ProgramDataPath最终配置均与P1字节一致。

以下路径以持有本分支的独立工作树为根：

- 主runtime：`dist/ETE-0.2.4-build-hardening-3b158f6-a-win-x64/Emby.Theater.exe`。
- 主安装器：`dist/EmbyTheaterEnhanced-0.2.4-build-hardening-3b158f6-a-win-x64-setup.exe`，175630156 bytes，SHA256 `467cf2774be8b89d9ee6a8af98c064c1590e87d403b5225255bd5f8aa740accc`。
- 独立重复runtime：`dist/ETE-0.2.4-build-hardening-3b158f6-b-win-x64/`。
- 重复安装器：`dist/EmbyTheaterEnhanced-0.2.4-build-hardening-3b158f6-b-win-x64-setup.exe`，175630030 bytes，SHA256 `b853e5c831c5b16810e9d75b64e29a9818ef048c39f0d3a2183166f39839f16d`。
- 每个安装器均有 `.exe.sha256` 与 `.exe.provenance.json`，记录实际Inno目录身份及runtime manifest hash。

四个工程提交可分开审阅：7c8270b（审计size）、a51831b（工具链）、
83b75b8（依赖目录）、3b158f6（提交输入/notice/schema与集成）。
build/package及schema 3审计要求材料工作树HEAD等于产物sourceCommit；
若当前HEAD已前进到交付文档提交，复跑应使用独立检查工作树中的准确
3b158f6与固定输入，不能把文档HEAD重新标到现有runtime上。
完整机器结果见 [交付证据](evidence/build-hardening-delivery-20261009.json)、
[新输入清单](evidence/build-hardening-input-inventory-20261009.json)、
[来源材料](evidence/build-hardening-source-materials-20261009.json) 和
[工具链材料](evidence/build-hardening-toolchains-20261009.json)。

## 剩余材料与验收边界

两个固定公开source ZIP与8项辅助binary身份核对完成；仍需原提供者
补齐patched libmpv原dev archive与独立发布记录、winbuild revision、
依赖sources/patches/config/toolchain/完整通知，以及Host准确构建关系、
离线Web/资产和部分辅助组件对应源码材料。本机完整GCC前缀已固定，
但这些工具本身的原包/签名/全部源码还未收齐。当前不是仅公开源码
完整可构建或全部第三方组件源码可复现的声明。

系统安装、真实Emby/CD2、真实远控、可见首帧、HDR及多屏未执行。
原客户端/profile/日志未被作为测试输入；本轮使用假服务、新配置和
合成媒体。既有主目录资料、P1产物和已发布资产保留；本轮仅本地提交
与独立候选，没有推送、PR、合并或发布。

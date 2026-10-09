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

本文件先记录执行 contract；准确提交、产物与实测结果在本轮完成后
追加。源码材料缺项见随包 [来源索引](SOURCE_MATERIALS.md)。

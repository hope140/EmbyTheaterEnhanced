# 构建输入性能实验

候选基于main `88578c91ab19d44eecddcfae096d37dc917ef1f4`，仅调整构建工具和测试准备；实际实验结果在后续测量完成后记录。workflow、测试发现规则／原集合／串行参数、runner、并发、缓存策略和发布行为保持。另加隔离与损坏输入负测。产品源码、固定材料与工具链版本未改。

## 计时与等待

手动入口和输入／Host准备输出 `CI_PHASE` JSON：配对id、UTC、单调时钟毫秒、passed／failed。嵌套阶段不能相加当总耗时；未输出完整end的阶段单独标记。原命令及失败检查保留，日志走PowerShell信息流，不污染被捕获的JSON成功流。回归后另以Node内部TAP duration生成前十热点；摘要失败只报unavailable，不能改变原回归退出码或继续失败门禁。

等待必须用Actions API的run.created_at至目标job.started_at，执行用job.started_at至completed_at；等待包含concurrency、调度和provisioning，不能进一步冒称纯排队。runner自身无法观察分配前等待。把只读取得的run JSON、单个job JSON和解码日志交给：

```sh
node tools/ci-build-timing-report.cjs run.json job.json job.log
```

## 输入身份与隔离

获取计划每次从同一精确HEAD批读authority，保留工作树物理路径、普通mode和CRLF规范化比较；解析的是刚校验过的原始提交blob，结束前再核HEAD。Host仍固定上游commit、55路径和各OID／size／SHA256；批协议异常回到逐对象读取，所有字节仍核Git blob OID。没有跨调用缓存已通过状态，也不复用Host二进制或verified envelope。

构建输入测试的种子在首次原样建仓／提交完成后发布，每个用例物理复制工作树和完整.git，不用共享Git对象／hardlink／junction。每次新建runtime，原27用例断言保留，新增隔离负测；文件结束清理种子。`ETE_BUILD_INPUT_FIXTURE_MODE=fresh`仅选择原重复准备路径，用于同一候选上的A/B；默认seed，未知值失败。两种模式均跑全部28项，不用于减测试。

## 本地A/B方法

先提交完整候选，确保tools/tests相对HEAD干净。`benchmark-build-inputs.cjs`对相同候选输入加载固定基线中的旧算法与候选算法，核每份输出；fixture两模式执行相同28测试。每组3次交替AB／BA，记录原始时间、median、range、mean、总体variance和standard deviation。每个新进程第一次测量与后续热调用分开；不清理系统页缓存，因此不是OS冷盘基准。

```sh
node tools/benchmark-build-inputs.cjs plan <new-output-directory>
node tools/benchmark-build-inputs.cjs host <new-output-directory> <existing-fixed-Host-object-store>
node tools/benchmark-build-inputs.cjs fixtures <new-output-directory>
```

基准不拉网络、不创建Actions或安装器；Host object store须预先具有锁定commit。原始日志保存在指定新目录，不覆盖历史结果。plan的候选比基线多校验批读实现的authority，并增加普通mode／物理路径／前后HEAD保护，输出结构仍须相同。Host输出逐文件重核锁定manifest的size和SHA256。

Linux通过不代表Windows Host编译／真实验证、安装器或云端时长通过；父会话统一安排有限Windows A/B，不能从本地百分比预测云端速度。若种子复制无净收益，保留原始结果并重新选择默认准备方案，不能减少断言来换时长。

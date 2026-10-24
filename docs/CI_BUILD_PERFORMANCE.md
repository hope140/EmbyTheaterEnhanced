# 构建输入性能实验

候选基于main `88578c91ab19d44eecddcfae096d37dc917ef1f4`，调整构建工具和测试准备；已完成下述本地对照，以及同一精确候选的单次Windows短A/B。Windows局部结果支持保留固定Git批读和文件内夹具复用；完整回归／打包／合并等待的提速幅度仍未测量。[定向入口](CI_WINDOWS_AB.md)与原公共回归分别记录。原测试发现规则／集合／串行参数、打包命令、runner规格、既有并发、缓存策略和发布行为保持。产品源码、固定材料与工具链版本未改。

## Windows已核验结果与取舍

成功样本：[run40087708509／job120853913867](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40087708509/job/120853913867)，源码 `c1c6e7dc12ee999d9a34f11896482cea279c6abd`。job于2026-10-24 10:53:41–10:56:57 UTC运行；此区间只是本次job记录，不是前后性能对照。结果来自已核验的[artifact12557687964](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40087708509/artifacts/12557687964)：177,152字节，ZIP SHA256 `c3949bd0f59d7c69696573ef1c04366885f5a2a8982af9ab41a0a2ca4a4d10f3`，88项清单。GitHub元数据的源码、大小、digest与该核验记录一致；本节采用已核验内容摘要，不声称额外独立重解包。

Windows2022、4逻辑CPU、固定Node24.18.1；同job串行AB／BA／AB／BA，三个套件输入身份一致，两臂输出digest一致。每套件每臂16次操作，first n=4、warm n=12（来自4个进程，非12次独立CI）；夹具每次重新验证174个输入文件。27份process记录无异常；本run公共回归和完整打包job均skipped，这是0项单元测试的短基准，不能代替公共CI回归。

| 操作／两臂 | 首次中位 ms | 热调用中位 ms | 每次Git进程 |
|---|---:|---:|---|
| 输入计划：旧算法→批读 | 260.974→137.118 | 255.949→129.214 | 8→4 |
| 55份Host恢复：旧算法→批读 | 3400.071→134.905 | 3424.941→125.319 | 111→3 |
| 夹具准备：fresh→seed | 2422.970→2974.500 | 2206.576→530.105 | 首次7→7；热7→1 |

夹具首次准备慢22.763%，后续热准备快75.976%，仅指该操作中位数。首次seed包含建私有种子的成本，约多551.530ms；每次后续构造约省1676.471ms。以这些中位数作成本模型，`551.530 / 1676.471 = 0.329` 次后续构造即可覆盖额外成本，因此**同进程第二次构造起可摊销**。这是中位数算术推算，不保证每个进程或完整28测试组的耗时；不将准备次数乘以此差值当完整CI收益。

推荐优先保留候选的Host固定Git批读，其次输入计划批读：首次与热调用均观察到局部耗时下降，未靠删减验收换速度。夹具seed继续限于同一测试文件的私有工厂：本文件反复setup适合摊销；只准备一次的定向诊断可选既有fresh模式，不能声称首次也更快。无需扩大为跨文件／跨job共享缓存，也不复用已通过的验收状态。

| 路径 | 候选中已接入的行为 | 本次证据不覆盖的部分 |
|---|---|---|
| `prepare-ci-build-inputs.ps1` → `ci-build-input-plan.cjs` | 正常获取计划默认批读固定authority，仍核物理路径／blob／当前工作树及前后HEAD | 下载、全部后续verify-file及解包材料的总耗时 |
| `ci-source-built-host.ps1` → `ci-source-built-host-plan.cjs` | 正常source恢复默认批读55固定文件，仍核commit／OID／size／SHA | Host编译、probe、签名、二进制缓存或安装器 |
| `tests/build-input-contract.test.cjs` → 私有fixture factory | 默认seed，每次独立.git／工作树／runtime、重新合同验收；原28个测试主体保留 | 完整测试组／整个公共CI的净收益，生产材料物化复用 |
| 手动入口的 `CI_PHASE`／测试热点 | 已接入候选正常脚本，只增观测 | 不能由本短基准推导排队／合并等待减少 |
| `benchmark-build-inputs.cjs` 的legacy／fresh对照 | 旧算法从固定88578工具blob加载，仅供对照；fresh保留原完整测试准备路径 | 不作为生产来源／哈希门禁替代，短入口不运行单元测试 |

上表“已接入”只指perf分支候选的正常构建／测试路径，**不表示已合main或进入已发布包**；main仍为88578c91。所有来源／hash／签名／完整集合门禁保留，本次只归档结果，不新增实验或合并。

合并前还存在独立红灯：同SHA的[公共CI40087539201／job120853432011](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40087539201/job/120853432011)实际1545项、1543 pass／2 fail／0 skip。两处均在 `tests/manual-windows-workflow.test.cjs`：原断言要求manual job的if整行只有workflow_dispatch；原manual块从该job截取到文件尾，加入后续benchmark job后又计入其3个action，变为6而断言仍为3。新增workflow时漏跑这组相关验证；短A/B成功不能覆盖此失败，也不能称当前候选全CI通过。最小后续范围是按job边界验证既有和新增路径、保持权限／精确SHA／无全包回退等语义断言，再接受原公共CI；本次仅文档收尾，不改断言、workflow或跳失败。

OS页缓存未清，first只表示新进程首次调用，不能称冷盘。Host预准备29.768秒在测量外，不把它计作批读收益；模块加载、后验验证、cleanup及进程墙钟的边界按原协议分别保留。原始时间／范围／方差仍在artifact，不用本摘要的中位数冒称跨runner稳定比例。此证据只有一个Windows job；不将局部差值相加，也不从不同runner／不同测试数的完整CI时间推出整包百分比。完整包、安装器、真实签名与运行验收仍是独立证据层。

## 计时与等待

手动入口和输入／Host准备输出 `CI_PHASE` JSON：配对id、UTC、单调时钟毫秒、passed／failed。计时包括Start记录的格式化／写出，止于End记录格式化／写出前；观测本身有开销。嵌套阶段不能相加当总耗时；未输出完整end的阶段单独标记。原命令及失败检查保留，日志走PowerShell信息流，不污染被捕获的JSON成功流。回归后另以Node内部TAP duration生成前十热点；摘要失败只报unavailable，不能改变原回归退出码或继续失败门禁。

等待必须用Actions API的run.created_at至目标job.started_at，执行用job.started_at至completed_at；等待包含concurrency、调度和provisioning，不能进一步冒称纯排队。runner自身无法观察分配前等待。把只读取得的run JSON、单个job JSON和解码日志交给：

```sh
node tools/ci-build-timing-report.cjs run.json job.json job.log
```

## 输入身份与隔离

获取计划每次从同一精确HEAD批读authority，保留工作树物理路径、普通mode和CRLF规范化比较；解析的是刚校验过的原始提交blob，结束前再核HEAD。Host仍固定上游commit、55路径和各OID／size／SHA256；批协议异常回到逐对象读取，所有字节仍核Git blob OID。没有跨调用缓存已通过状态，也不复用Host二进制或verified envelope。

构建输入测试的种子在首次原样建仓／提交完成后发布，每个用例物理复制工作树和完整.git，不用共享Git对象／hardlink／junction。每次新建runtime，原27用例断言保留，新增隔离负测；文件结束清理种子。`ETE_BUILD_INPUT_FIXTURE_MODE=fresh`仅选择原重复准备路径，用于同一候选上的A/B；默认seed，未知值失败。两种模式均跑全部28项，不用于减测试。

## 本地A/B方法

先提交完整候选，确保全仓相对HEAD干净（含未跟踪文件）。`benchmark-build-inputs.cjs`对相同候选输入加载固定基线中的旧算法与候选算法，核每份输出；fixtures两模式执行相同28测试，fixture-prep只测同一工厂的准备并逐份验收。历史结果每组3次；当前脚本默认4次平衡AB／BA，允许2–8次偶数轮和1–10次热调用。记录原始时间、median、range、mean、总体variance和standard deviation。报告保存完整tree、Host source identity、上游manifest SHA、authority及夹具实现OID／工作树SHA，开始与结束均核HEAD及整仓干净。每个新进程第一次测量与后续热调用分开；不清理系统页缓存，因此不是OS冷盘基准。

```sh
node tools/benchmark-build-inputs.cjs plan <new-output-directory>
node tools/benchmark-build-inputs.cjs host <new-output-directory> <existing-fixed-Host-object-store>
node tools/benchmark-build-inputs.cjs fixtures <new-output-directory>
node tools/benchmark-build-inputs.cjs fixture-prep <new-output-directory> --trials 4 --warm-calls 3
```

基准不拉网络、不创建Actions或安装器；Host object store须预先具有锁定commit。原始日志保存在指定新目录，不覆盖历史结果。plan的候选比基线多校验批读实现的authority，并增加普通mode／物理路径／前后HEAD保护，输出结构仍须相同。Host输出逐文件重核锁定manifest的size和SHA256。

Linux通过不代表Windows Host编译／真实验证、安装器或云端时长通过；Windows须按同输入及同runner另行对照验证，不能从本地百分比预测云端速度。若种子复制无净收益，保留原始结果并重新选择默认准备方案，不能减少断言来换时长。

## 本地结果与验证边界

主要测量来源：e8be67667072d9ad5eece8c477e62f1337b3dc75；Linux x64、Node 24.18.1。两算法在同一候选输入运行，旧算法正文从固定88578c91加载，输出结构逐项等价；Host每次恢复55文件后均核size／SHA256。Host来源指纹保持81b18ab1264941b7121967770d9b791af7fd4436b6cf910da443c92f967eea45。

| 套件 / 算法 | 首次中位 / 范围 ms（n=3） | 热调用中位 / 范围 ms | Git进程 |
|---|---|---|---:|
| 输入计划 / 基线算法 | 28.744 / 27.791–46.277 | 23.279 / 22.785–26.470（n=9） | 8 |
| 输入计划 / 批读 | 18.824 / 18.719–20.771 | 12.843 / 12.384–16.086（n=9） | 4 |
| 55份Host恢复 / 基线算法 | 281.067 / 279.825–314.246 | 295.051 / 269.644–314.373（n=9） | 111 |
| 55份Host恢复 / 批读 | 27.961 / 25.540–30.323 | 20.489 / 18.764–25.068（n=9） | 3 |

| Git套件 / 算法 / 状态 | mean ms | 总体variance ms² | standard deviation ms |
|---|---:|---:|---:|
| plan / legacy / first-in-process | 34.270 | 72.227 | 8.499 |
| plan / legacy / warm-in-process | 23.841 | 1.256 | 1.121 |
| plan / batch / first-in-process | 19.438 | 0.890 | 0.944 |
| plan / batch / warm-in-process | 13.217 | 1.192 | 1.092 |
| host / legacy / first-in-process | 291.712 | 254.131 | 15.941 |
| host / legacy / warm-in-process | 291.868 | 216.428 | 14.711 |
| host / batch / first-in-process | 27.941 | 3.814 | 1.953 |
| host / batch / warm-in-process | 20.934 | 3.276 | 1.810 |

| 28项夹具测试模式 | 三次完整测试内部秒数 | 中位秒数 | 总体方差 s² / 标准差 s |
|---|---|---:|---:|
| fresh | 12.958、13.370、15.951 | 13.370 | 1.755 / 1.325 |
| seed | 12.294、11.865、12.678 | 12.294 | 0.110 / 0.332 |

每次均28 tests／28 pass／0 fail／0 skip／0 cancelled，每次51次相同夹具准备。新进程首次准备中位数fresh 37.299ms、seed 65.065ms，种子首次成本更高；后续准备中位35.928ms、12.853ms。热准备每臂n=150来自3个进程各50次，不能当150次独立CI。Git热调用n=9同样来自3个进程各3次。全部均未清OS页缓存，不称冷盘。

本轮完整测试组中位只观察到约1.076秒的本地差异；不把局部差值相加当整包收益，不给CI保证百分比。初轮54cae6a的fresh／seed中位13.933／12.651秒也完整保留在独立本地证据中，未剔除其样本；主要结果使用输入身份归档更完整的e8be676轮。3个进程/臂样本量有限；Windows短操作的后续证据独立列于上文，端到端收益仍未知。

定向计时／Git负例／相邻合同37项通过；Host／Release附件／计时相邻65项通过。主要提交的完整公共集1541项：1531 pass、0 fail、10个既有Linux平台skip；另跑runtime来源组6/6、0 skip。精确HEAD构建输入合同及获取计划通过，原27个构建输入测试主体保留，新增隔离及批读／诊断负测。语法与有限凭据模式检查通过；并非完整秘密扫描。

此Linux轮次没有编译／执行Windows Host、Native或安装器，没有测试真实签名／GUI；Windows注册及材料门禁保留，不能由Linux skip或合成回归替代。该轮未改变src/native/vendor、package与锁文件或workflow。普通push触发的公共CI须另读结果，不冒充本地结果；当时Windows A/B尚未执行，上文后续短基准也不提供完整打包验收。

## Windows公共CI换行夹具修正

[40083575146](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40083575146) 在c16208a上实际运行1541项：1540 pass、1 fail、0 skip。唯一失败为新增CI authority测试的最后一次换行准备；已有CRLF又直接按LF→CRLF展开，变成CRCRLF，原工作树／HEAD校验正确拒绝vendor/windows-host-manifest.json。

仅修正测试数据准备：先CRLF→LF，再LF→CRLF；连续执行两次仍断言输出身份不变，随后显式制造CRCRLF，继续断言门禁拒绝。Linux保留原5 pass／1 fail的同错误复现；修复后相关38项、0 skip通过，core.autocrlf=true的独立checkout验证该组6/6通过。这是换行行为模拟，不是新的真实Windows通过证据。

生产hash／blob／路径校验、workflow、测试发现和串行参数均未改；测试数不减少。既有同输入A/B原始数据保留，不重标或外推Windows收益。后续[Windows公共run40085107715](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40085107715)在修复提交2e310f47通过；这是正确性证据，不是性能A/B。

新增Windows定向入口只运行plan／host／fixture-prep，默认每臂相同16次操作、0项单元测试，逐次独立验收并保存原始数据。共享夹具工厂保留原28个测试主体，使用私有seed和物理独立副本；补充4项脚本边界／隔离测试。完整回归可独立执行；短基准不把合同验收次数当测试数，也不以不同runner的完整CI总时长宣称收益。复现、参数、产物和失效条件见[WindowsA/B方案](CI_WINDOWS_AB.md)。

# Windows构建输入定向A/B

目的：在同一精确候选、同一台runner的同一个job里，分别比较固定Git输入的旧／批读算法和夹具的fresh／seed准备。已有[Windows正确性run40085107715](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40085107715)通过；完整CI跨机器的总时间不作为性能因果证据。此入口不会触发Actions、安装依赖、构建Host／Native、打包或改workflow。

## 复现

使用完整历史的干净checkout，精确HEAD须与参数一致，含未跟踪文件的工作树须干净。Windows、Node **24.18.1**、PowerShell **7**、Git必须预先可用；不需要npm install。输出父目录必须已存在且物理路径无junction／symlink，输出目录必须全新并与checkout不相交。

```powershell
$source = (git rev-parse HEAD).Trim() # 调度时改用预先核对的精确40位SHA
$output = Join-Path $env:RUNNER_TEMP ('build-input-ab-' + [guid]::NewGuid().ToString('N'))
pwsh -NoProfile -File tools/benchmark-build-inputs-windows.ps1 `
  -ExpectedSourceCommit $source -OutputRoot $output -Trials 4 -WarmCalls 3
```

默认在测量前单独fetch固定官方Host commit `708fadc068cbf66ced6aece4a32f3e12bb2c4e13`，fetch与对象库验证耗时分别记入session，排除出A/B。可传 `-HostObjectStore <existing-physical-bare-store>` 只读复用已含该commit的本地bare仓库；不改其配置、不写缓存，拒绝alternates。Git子进程清除继承的全部GIT_*覆盖变量，重新固定 `GIT_NO_LAZY_FETCH=1` 和 `GIT_NO_REPLACE_OBJECTS=1`；缺对象即失败，禁用replace refs。来源固定为[官方仓库](https://github.com/MediaBrowser/emby-theater-windows)；不checkout或执行上游源码。

三个套件顺序运行，每套件4轮，每轮每臂一个新Node进程，顺序AB／BA／AB／BA。每进程首次1次、后续3次，两臂均16次操作（first n=4、warm n=12，后者来自4个进程，非12次独立CI）。可选2／4／6／8轮、1–10次热调用；不得按结果选删样本或自动重试失败。一次测量不足以证明稳定收益，可另在相同runner标签安排第二个有限job，同job内部配对比较并分别保留全部结果。

| 套件 | 两臂 | 每次计时工作 | 每次相同验收 |
|---|---|---|---|
| plan | 固定main88578算法／当前批读 | 当前同一候选的输入获取计划 | 完整输出digest相等；候选保留额外authority／路径／前后HEAD保护 |
| host | 固定main88578算法／当前批读 | 固定55文件恢复到全新目录 | commit、55份完整集合、各文件size／SHA256；生产路径仍校验Git blob OID |
| fixture-prep | fresh／seed | 原样建仓或复制私有不可变种子；独立runtime与HEAD读取 | 每次重新inspect全部输入，tree／blob／规范hash／原始字节hash相等；独立Git文件、无hardlink／alternates／redirect，空物理runtime |

旧算法正文仅从 `88578c91ab19d44eecddcfae096d37dc917ef1f4` 的两个工具blob加载；两臂消费当前同一份manifest／authority／源码输入。仓库全tree、authority blob OID／工作树SHA、Host source指纹、manifest和夹具实现OID／SHA均归档；结束再次核HEAD及全仓干净。不同候选／输入身份的结果不可冒充同输入对照。

计时使用单调时钟；模块加载在操作计时前，进程总墙钟另记。操作之后的输出验收单独记录verificationMs，清理在操作时钟外。首次seed包含建种子开销，不预热排除它。Host每次恢复到新目录。未清OS页缓存，因此这里只区分**新进程首次调用／进程内热调用**，不称冷盘或网络冷缓存。

短入口每臂执行0项单元测试，报告明确记录 `unitTestsExecuted: 0`；16次夹具合同验收不算16项测试。原28项测试及其所有断言保留。若要补充整组成本，通用入口仍提供相同28项的可选对照，默认不重复它：

```powershell
node tools/benchmark-build-inputs.cjs fixtures <new-output-directory> --trials 4 --warm-calls 3
```

## 产物与判读

仅归档 `$output/artifact`：session的OS／CPU／Node／Git／PowerShell／runner镜像、获取时间及退出结果；各套件raw／report、每进程stdout／stderr／退出状态；manifest列明归档文件size／SHA256。不上传inputs对象库、恢复的55文件、测试临时仓库、可执行文件、缓存或回执。只白名单读取必要镜像字段，不导出完整环境变量。

脚本失败返回非零，不继续下一套件、不自动重试，已结束进程的诊断在finally归档。普通子进程退出码1–255原样向上传递；signal／不可移植原生状态归档原值，CLI映为1。Host获取故障记录阶段／原因／状态；归档失败将session标failed并取消有效manifest。脚本没有独立杀driver的超时；外层job取消／机器中断不代表子树已退出或样本完整，不将残留产物计入成功统计。新目录避免覆盖旧结果。上传失败、缺report、身份不同、输出digest不同或缺任一臂时均不宣布收益。

报告分别给first、warm的原始值、n、median、min／max、mean、总体variance和standard deviation，以及每次Git进程数、验收成本和进程墙钟；同时检查首次成本与热复用收益。Git spawn减少是机制证据，不能代替Windows实际耗时。夹具短基准只量准备，不量完整回归；不能将局部差值相加外推整包／合并等待百分比。收益不确定、方差覆盖差值或没有收益时保留原结果。

若安排临时workflow，应只调用上述精确SHA入口，选择现手动打包同标签 `windows-2022`、固定现有checkout／Node action SHA，`fetch-depth: 0`、`persist-credentials: false`、只读contents权限，不引入cache或改全局concurrency。上传仅上述artifact子目录并用 `if: always()` 保存失败诊断。workflow创建／调度需另行安排，本分支不包含该workflow。

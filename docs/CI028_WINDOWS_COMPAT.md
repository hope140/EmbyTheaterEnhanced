# CI028 Windows 路径与脚本编码专项

## 范围与身份

本轮仅修复公开离线 CI 的环境兼容阻断。从远端候选 `aa86ddc6b0d5a911440ee6dff41ac20147e8f8e6` 建立独立分支 `codex/ci028-windows-compat`；原候选工作树的已有文档改动保留。代码与测试固定提交为 `5b1e09284b8aa7c74d635b02ce9aebec9de0c016`，后续文档提交单列。

已经构建并获用户六项真实播放验收的产品来源仍为 `b139d87da06cfba153a828766926b78230be4a0f`。本轮没有生成新产品，没有更新远端候选、创建 PR、合并、发布或安装。旧产品的 723/723、独立核心 119/119、隔离 runtime 8/8 继续保留原来源；不将它们当成本轮重跑结果。

## 原始 RED 与根因

[GitHub Actions run 38036913645](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38036913645) 的 HEAD 为 `aa86ddc`，公开测试为 652 项、626 PASS / 26 FAIL。构建输入组 12 项报 `Build input links or redirects are forbidden: LICENSE`，依赖树组 13 项报 `Dependency tree contains a reparse redirect: electronapp/node_modules`，诊断脚本 1 项在 Windows PowerShell 5.1 的 `147:35` 解析失败。之后的 JS、PowerShell、敏感信息与 diff 步骤被跳过，不是 PASS。原始日志与工作流回执原字节保留，哈希见机器索引。

### 路径

两个 fixture 直接使用 `fs.mkdtempSync(path.join(os.tmpdir(), ...))` 返回的文本路径。生产校验器有意要求每段路径均为物理目录，除 `lstat.isSymbolicLink()` 外，还比较 `path.resolve()` 与 `fs.realpathSync.native()`。正常 NTFS 8.3 别名的 lstat 可以不是链接，但其文本路径与物理路径不同。这种 fixture 根目录在建立输入前就违反了校验器的输入前提。

本机通过只读 `GetShortPathNameW` 得到真实目录的短名；只给测试进程设置 TEMP/TMP，结束后恢复。本机旧测试 30 项中 25 项失败，精确重现上述两种错误。快照记录了 tmpdir、mkdtemp、resolve/native、父目录、祖先和子目录的身份关系：raw 路径含短名，lstat 不是链接，raw/native 不相等；物理路径两者相等。

原 Hosted 日志未采集路径快照，因此“Hosted 使用具体哪条 8.3/别名路径”仍为 **UNKNOWN**。上述结果证实根因类别，并与远端错误一致；下一次获授权的 CI 会先执行脱敏诊断，补足托管环境事实。没有将本机快照伪装成 GitHub Runner 上新执行的诊断。

最小修复只把刚创建且由测试拥有的 fixture 根目录解析为物理路径，再派生其 repo/runtime/source。没有对生产输入做自动 realpath 规范化，没有放行符号链接、junction、逃逸或所有权异常。新增正向用例在真实 junction 父目录下创建 fixture；新增负向断言在其内部放入真实 junction，仍必须由原校验器拒绝。

### PowerShell 5.1

原 reporter Git blob 为含中文的 UTF-8 无 BOM。Windows PowerShell 5.1 可能按默认 ANSI 代码页解释无 BOM 文本；PowerShell 7 按 UTF-8 解释。旧正文按 CP1252 解码后用 5.1 ParseInput 可确定性重现 `147:35` 的解析错误；同一内容加 BOM 后按 UTF-8 解码则通过。

修复仅在 `tools/report-playback-issue.ps1` 开头增加 `EF BB BF`。正文、中文、诊断功能、脱敏与拒绝逻辑完整保留。新测试读取原 Git blob，在隔离副本中比较无 BOM/BOM 的 ParseFile 与实际执行，并验证 BOM 之后的字节与旧 blob 完全一致（仅允许 Git checkout 换行转换）。两种 shell 的 BOM 变体、PowerShell 7 无 BOM、CP1252 负向与 BOM 正向断言均严格执行。

本机实际 Windows PowerShell 5.1 为 `5.1.26100.9444`，`[Text.Encoding]::Default.CodePage=936`；PowerShell 7 为 `7.6.5`，默认代码页 65001。本机旧脚本恰好解析成功属于 locale 观察。新测试允许旧 5.1 ParseFile 按真实 locale 成功或返回明确解析错误；若解析成功，实际执行仍须返回 READY。不会要求英文 Runner 的旧脚本必须成功。Hosted 实际默认代码页未采集，为 **UNKNOWN**。

worker 早期证据把控制台 UTF-8 编码误写为本机 ANSI 65001；原记录保留，已追加更正。没有用此错误推断根因。

## 修改范围

| 文件 | 修改 |
| --- | --- |
| `tests/build-input-contract.test.cjs` | 自建根目录物理化；增加别名父目录正向及内部 junction 拒绝 |
| `tests/runtime-dependencies.test.cjs` | 同类物理 fixture；负向复制使用新空 runtime 与新 ownership token |
| `tools/report-playback-issue.ps1` | 仅 UTF-8 BOM |
| `tests/report-playback-issue-encoding.test.cjs` | Git blob/BOM/body 等价、两 shell 解析与合成执行、CP1252 确定性回归 |
| `tools/ci-windows-path-diagnostics.cjs`、对应测试 | 物理/别名/link 关系快照，所有路径输出稳定 opaque 标签，限定自建临时目录清理 |
| `.github/workflows/public-ci.yml` | 公开测试前加入上述诊断，既有依赖、权限与后续 gate 不变 |

## 中间失败与处理

所有 RED、实现期失败与中间 GREEN 均保留，不覆盖原始证据。

1. 旧路径组：30 项，5 PASS / 25 FAIL，exit 1。
2. 初步 fixture 修正：32/32，exit 0；此时尚未加入后来补充的两项内部 junction 断言，不能作为最终来源结果。
3. 初始编码测试：缺 BOM 的严格断言 RED，exit 1；仅加 BOM 后通过。主线程发现新增测试错误地假定所有 locale 的旧 5.1 脚本都成功，改为记录真实 legacy 观察；新 BOM 正文与功能断言未放宽。
4. 独立复核 `ff53e0a`：诊断 2/2；定向路径 3 PASS / 1 FAIL。新增依赖负向用例复用了已被成功复制消耗的 ownership，提前报 ENOENT，尚未到 junction 检查。改为另一个空的 `dist/junction-candidate` 与新 token；生产 contract 不变。
5. `ff53e0a` 首次全集：657 项，654 PASS / 3 FAIL，exit 1。除了上述 ownership fixture 错误，另两项受人为 TEMP 放在隐藏 Git 工作树内影响：审计测试移走 fixture 的 `.git` 后发现祖先仓库，MISSING 变为 MISMATCH；PowerShell 5.1 无法在清理时解析隐藏目录的短别名。改用系统临时目录内的独立目录，Git ancestry 探针确认不是仓库子目录；两项原用例在外部短 TEMP 中原样通过，exit 0。没有修改它们或其生产逻辑。
6. 修正 ownership 后的两项 alias 定向测试：2/2，exit 0。pattern 未选择的 case 为 NOT_EXECUTED，即使 Node 输出 skipped=0，也不将它们计为已执行。

## 最终验收

固定 `5b1e092` 在仓库外真实 8.3 TEMP 下执行公开全集，657/657，fail/cancel/skip/todo 均 0，exit 0，283107.9682 ms。独立复核另执行四项 alias/junction 与两项诊断，共 6/6。主线程检查最终 diff、完整日志、编码矩阵和构建输入；没有剩余本地阻断，状态 **READY_FOR_PUSH**。

| 检查 | 结果 / 层级 |
| --- | --- |
| 公开全集（外部真实 8.3 TEMP） | 657/657，UNIT_VERIFIED |
| 独立 alias/junction 与 diagnostic 定向 | 6/6，UNIT_VERIFIED；其余 28 项 path case 未在该 pattern 层执行，已由全集执行 |
| JavaScript 语法 | 220 个 tracked 文件，STATIC_VERIFIED |
| PowerShell 语法 | 5.1 与 7 各 25 个 tracked 文件，STATIC_VERIFIED |
| 有限敏感模式扫描 | 268 个 tracked 文本，STATIC_VERIFIED；不等于完整秘密扫描 |
| diff 检查 | PASS，STATIC_VERIFIED |
| 当前修复的 GitHub Actions | NOT_EXECUTED，等待单独推送授权 |

公开 runner 发现 87 个测试文件，执行 81 个；原六份材料依赖文件仍明确 NOT_EXECUTED，未新增排除项，也未删除或降低原有断言。本工作树没有 Carnival/vendor/preload 材料，因此不声称重新执行依赖它们的完整 723 项。

主要命令：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
# TEMP/TMP 仅对子进程指向自建、仓库外的实际 NTFS 短路径；try/finally 恢复原值。
node tools/ci-public-tests.cjs
node --test --test-concurrency=1 --test-name-pattern='temporary parent aliases|build input directory junctions|a reparse-point runtime ancestor' tests/build-input-contract.test.cjs tests/runtime-dependencies.test.cjs
node --test tests/ci-windows-path-diagnostics.test.cjs
node tools/ci-syntax.cjs
powershell.exe -NoProfile -File tools/ci-powershell-syntax.ps1
pwsh -NoProfile -File tools/ci-powershell-syntax.ps1
node tools/ci-secret-scan.cjs
# CI_EVENT_NAME=push、CI_PUSH_BEFORE=aa86ddc 的只读 diff gate。
node tools/ci-diff-check.cjs
git diff --check
```

## 产品输入与交付边界

34 项 build-input Git blob 与 `b139d87` 逐项一致；`src/`、`native/`、`installer/`、package 与 lock 均无产品差异。两个生产路径校验器原字节保持。reporter 和新 CI 诊断均不在被消费的构建输入中；既有 product sourceCommit/provenance/runtime 身份不变，本轮无需重建已验收产品。

用户六项真实播放验收仍记为 **USER_ACCEPTANCE_PASS**，字幕/音轨切换延迟为 **P2 / LEGACY_BEHAVIOR / ACCEPTED_WITH_FOLLOWUP**；本轮没有修改该逻辑。完整四阶段安装专项仍 **NOT_EXECUTED**，按用户确认不作为本次推送前置条件。本轮没有新的 REAL_SERVER_VERIFIED、runtime 或安装声明。

本地代码提交依次为 `5ddf03a`（BOM/编码测试）、`1b7fada`（legacy locale 观察纠正）、`d3be002`（物理 fixture/路径诊断）、`ff53e0a`（所有诊断路径匿名化）、`5b1e092`（负向用例独立 ownership）。worker 原提交与 cherry-pick 来源保留于提交消息。所有提交位于独立分支；回退需在获授权后的目标分支按相反顺序 revert，不操作原候选或 main。

原始本地日志位于 ignored `.work/ci028/`，私有绝对路径仅留本机；公开 [机器索引](evidence/ci028-windows-compat.json) 仅包含相对文件名、计数、来源、哈希与匿名快照。最终推送与 Hosted GREEN 必须另行授权并实际执行；本地通过不等于 READY_FOR_MERGE。

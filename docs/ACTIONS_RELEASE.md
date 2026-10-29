# 手动触发的构建与发布

本流程由 `.github/workflows/release.yml` 和 `tools/actions-release.cjs` 实现，是 ETE 的长期发布入口。用户已允许将流程加入公开仓库，并允许仅发布作业取得仓库内容写权限；实际启用提交及 CI 以远端记录为准。流程启用不是改变执行环境或身份以绕过本轮上传拒绝的办法；本地 `uploads.github.com` 被拒的事实不因流程代码上线而解除，v0.4.5 的发布方式仍等待相关权限审查。

## 入口与来源

工作流就绪后，只能从本仓库 main 的 Actions 页面手动选择 `Manual verified release`。没有 push、PR、schedule 或 workflow_run 自动发布入口，不使用 PAT，不调整仓库默认 token 权限、安全设置或审批设置。

手动输入：

| 输入 | 含义 |
| --- | --- |
| `tag` | 已存在的 `vX.Y.Z` Tag，流程不创建或移动 Tag |
| `source_sha` | 该 Tag 实际指向且已包含在 main 的完整 40 位提交 |
| `channel` | `testing` 或 `stable`，默认 testing |
| `expected_latest_tag` | 操作者核对的当前正式 Latest Tag；尚无正式版时填 `NONE` |
| `verified_build_run` | 默认留空并重新构建；可显式指定同源码的既有成功手动发行构建 run ID |

根 package／lock 三处版本须与 Tag 一致，准确 source 的 RELEASE_NOTES 首行须为 `# <Tag> 测试版` 或 `# <Tag> 正式版`，与所选渠道一致。版本必须高于当前正式 Latest；正式渠道须事先准备正式版说明，不从测试版说明猜测或自动替换。已有同 Tag 的草稿或已公开 Release 均拒绝，不将旧测试版直接转为正式版。

控制脚本固定从触发时 main 的工作流提交执行；构建 checkout 单独固定到已核准的 source_sha。预检同时验证远端 Tag 与 main 包含关系，构建完成后再次核对远端 Tag。新构建参数 `ExpectedSourceCommit` 明确绑定目标 checkout；原 `public-ci.yml` 的手动构建调用不变，参数缺省继续核对 GITHUB_SHA，不覆盖 GitHub 的身份环境变量。

## 权限与作业隔离

| 作业 | GITHUB_TOKEN 权限 | 执行内容 |
| --- | --- | --- |
| preflight | `contents:read`、`actions:read` | 只读核对 Tag、版本、说明、已有 Release、Latest 及可选旧构建 |
| build | `contents:read`、`actions:read` | 在 windows-2022 沿原 ETE 标准发行包路径构建，或下载明确指定的已验证构建；无仓库写权限 |
| publish | `contents:write`、`actions:read` | 构建作业成功后才执行；从本次 run 下载指定 artifact，用控制端脚本核验并上传五附件 |

权限未列项均不授予；不申请 actions:write、workflows:write、id-token 或其它写权限。`contents:write` 是 GitHub 对创建 Release／上传资产所需的仓库权限，本身也包含其它 contents 写能力，并非一个只能上传附件的权限；实现只调用新增 Release、资产上传和本次新草稿的公开接口，不推代码、改 Tag、覆盖附件或改旧 Release。token 只使用 GitHub 在作业内提供的 github.token，不新增长期秘密，也不将发布 token 交给构建目标或 artifact 中的脚本。

旧 `public-ci.yml` 保持只读构建／测试职责，不添加写权限，不自动创建 Release。本候选没有迁移签名、证书、OIDC 或其它项目的专属发布机制；安装器继续按 ETE 原有合同构建。

## 五附件与状态保护

标准五附件为安装器、其 `.provenance.json`、其 `.sha256`、`RELEASE_NOTES.md`、`SHA256SUMS.txt`。控制脚本验证物理文件、大小与 SHA256、安装器 provenance 的 source/version/name、两份校验文件的准确内容、notes 的 source Git blob 哈希，以及 `test-build-summary.json` 中成功状态、releasePackage=true、源码和 build run/attempt。其它构建报告留在 Actions artifact，不进入 Release。

发布先创建一个新草稿，再顺序上传五附件；按 GitHub 返回的每个资产 digest 和大小核对五项集合，重新核对 Tag 与原 Latest，之后才公开。testing 明确设置 prerelease=true、make_latest=false；stable 明确设置 prerelease=false、make_latest=true。完成后再回读资产集合、说明、渠道、Tag 和 Latest 身份。

所有本流程运行共用一把不自动取消的发布锁。它只能串行化本工作流，不能原子锁住维护者在其它界面的写操作；Latest／Tag 发生外部并发变化会被前后核对发现，流程停止，不自动回滚他人操作。

任一步 API／上传失败均停止，不自动换域名、token、账号或重试，不删除新草稿，不覆盖原附件。失败发生在创建或公开请求期间时，远端结果可能不确定；日志保留新草稿 ID（已收到时），必须先回读该对象再决定如何处理。重复派发遇到该草稿会拒绝，不能依靠“重跑”清除保护。

## v0.4.5 兼容判断

现有 `v0.4.5` 固定在 `246706d6447f78e1935d7afb496c8c613a366ae5`；其构建脚本没有 `ExpectedSourceCommit` 参数。因此不能从新控制提交静默覆盖 GITHUB_SHA、修改旧 Tag 或补丁旧构建来重建它；留空 verified_build_run 会在只读预检阶段明确拒绝。

在本轮权限审查通过、且流程已正常部署之后，v0.4.5 可以显式复用原 `public-ci.yml` 对上述 source 的成功 `workflow_dispatch` **标准发行构建**。预检要求仓库、workflow path、event、head_sha、run_attempt、成功结论与唯一未过期 artifact 一致，发布前再次核对；下载后还须确认 releasePackage=true 和五附件。普通测试包、旧 7bfc147 验收包、不同 source 或过期 artifact 都不能作为 v0.4.5 发行材料。没有符合条件的发行构建时，应通过既有入口按 v0.4.5 取得新材料，不能改名旧包。

该兼容入口不等于本轮已经获准改用 GitHub 托管 runner 上传；当前仍等待对 v0.4.5 发布方式及网络拒绝的权限审查。启用流程不自动派发此工作流，真实 GitHub 上传及最终发布须按获准运行的回执另行验证。

## 本地验证与依据

`node --test tests/actions-release.test.cjs tests/manual-windows-workflow.test.cjs tests/product-version.test.cjs` 只使用临时合成文件及注入的 API 替身，无真实 GitHub 写操作。YAML、Node／PowerShell 语法和 diff 检查另行执行；这些结果不代表 GitHub 托管工作流、真实上传或 Windows 新发行构建已通过。

GitHub 官方依据：[GITHUB_TOKEN 最小权限](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)、[Release 创建／更新及 make_latest 参数](https://docs.github.com/en/rest/releases/releases)。来源、签名与发行文案继续遵守 [ETE 发行规范](RELEASE_CONVENTIONS.md)和[原 Actions 构建合同](ACTIONS_TEST_PACKAGE.md)。

# 贡献与开发指南

欢迎提交可复现问题、文档修正和范围明确的 Pull Request。使用问题先看[用户指南](USER_GUIDE.md#问题反馈)，不要提交含账号、Token、Cookie、完整媒体地址或私人路径的诊断。

修改前阅读根目录 [AGENTS.md](../AGENTS.md)、[架构](ARCHITECTURE.md)、[项目状态](PROJECT_STATUS.md)和[维护注意事项](LESSONS_LEARNED.md)，核对最新远端分支、工作区及相关源码。保留已有工作，产品改动与文档整理分开。

代理参与时，从 [AGENTS.md](../AGENTS.md)进入[协作细则](AGENT_WORKFLOW.md)：模型建议、主／子代理边界和交接格式在该页统一维护。任务授权与环境权限以当前会话为准。

## 项目结构

| 目录 | 用途 |
| --- | --- |
| `src/electronapp/` | Electron 主进程、设置页、解析与播放适配；部分文件由模板生成。 |
| `src/web-api/`、`src/config/`、`src/localization/` | API 维护源、默认配置和本地化；Web 维护模块及 overlay 配合 `src/electronapp/` 与 `tools/` 生成。 |
| `native/` | Windows Native Helper、Host 维护源与系统媒体集成。 |
| `tools/` | 材料准备、代码生成、校验、构建和打包。 |
| `tests/` | 公开回归、依赖固定材料的显式自测及历史参考审计。 |
| `vendor/` | 固定快照、原始归档、清单及准备位置；不是手工修改区。 |
| `installer/`、`docs/`、`.github/workflows/` | 安装器、文档和现有 Actions 工作流。 |

普通播放沿 Emby Web → PlaybackManager → libmpv 适配 → Electron main → Native Helper → libmpv。STRM 只选择最终 source；原播放会话、进度、队列和远控仍由原链路管理。调整相关代码时保留取消、迟到响应隔离、Native 回退及 DirectUrl header 边界，按具体行为补必要回归。

## 依赖与运行环境

工具链使用 **Node.js 24.18.1**、Git 和 PowerShell 7（`pwsh`）；依赖按根目录 `package-lock.json` 安装，不自动升级。根 `package.json` 是开发／构建工具声明，不是 Electron 运行时入口，没有 `npm start`、`npm run dev` 或 `npm run build`。固定产品 Electron 由构建材料提供。

```powershell
npm ci --ignore-scripts
```

纯文档检查不需要执行此安装。Linux 可以运行[公开源码检查](PUBLIC_CI.md#linux-source-development)，Windows 专属集成明确跳过；Linux 结果不能替代 Windows 客户端或安装验收。

## 纯文档检查

已有轻量路线只覆盖 `tools/ci-change-scope.cjs` 的审核白名单。新 Markdown、构建合同、来源／许可文件等可能进入完整公开回归，不能仅按扩展名判断。详见[CI 文档路由](PUBLIC_CI.md#conservative-documentation-routing)。

提交文档改动后，在仓库根目录用 PowerShell 对**整个分支贡献**检查。把 base 设为本分支基于的实际主分支提交；下面以已更新的 `origin/main` 为例：

```powershell
$env:CI_EVENT_NAME = 'pull_request'
$env:CI_PULL_REQUEST_BASE = (git rev-parse origin/main).Trim()
$env:CI_PULL_REQUEST_HEAD = (git rev-parse HEAD).Trim()
node tools/ci-change-scope.cjs
# 仅当上一条结果 mode 为 docs 时执行：
node tools/ci-docs-check.cjs
git diff --check
```

该检查覆盖提交范围的空白、UTF-8／末尾换行、新增或改变的相对文件链接及有限凭据模式，不检查网页可用性、标题锚点或所有历史链接。改动涉及的锚点、下载文件名、外链和命令仍需人工核对。未提交内容不在这组 SHA 的范围内。

## 源码检查与完整测试

本地源码检查可使用以下命令。GitHub Actions 还验证仓库四份快照和固定 libmpv 原始归档，并用带事件 base 的 `ci-diff-check.cjs` 检查整个贡献范围的空白；本地 `git diff --check` 只检查未暂存差异。完整顺序和范围参数见[公开 CI](PUBLIC_CI.md)。

```powershell
npm ci --ignore-scripts
node tools/ci-public-tests.cjs
node tools/ci-syntax.cjs
pwsh -NoProfile -File tools/ci-powershell-syntax.ps1
node tools/ci-secret-scan.cjs
git diff --check
```

`ci-public-tests.cjs` 会报告固定的材料依赖排除项。材料完整时，`npm test` 运行 `tests/*.test.cjs`，另须按[测试说明](TESTING.md)显式执行 `tests/*-material-selftest.cjs`；两者不等价。材料用例运行前需准备固定组件和 `node tools/prepare-preload.cjs .`，缺材料不能删断言或计为通过。

## Windows 构建与打包

完整产品面向 Windows x64。推荐使用现有 GitHub Actions `Public offline CI` 的手动入口：选择准确源码分支，保持 `build_input_benchmark=false`，一般测试包使用 `release_package=false`。该路线使用 `windows-2022`／MSBuild 17，恢复锁定组件，编译并实际验证本次 Host，运行回归、构建 Native Helper、组装并核验安装器；结果在 Actions artifact 中保留 1 天。`release_package=true` 额外检查显式材料并暂存标准五附件，仍不会创建 Tag 或 Release。

本地构建前要具备各组件合同要求的材料及锁定工具链：固定 Electron、官方 Host／Model、libmpv、Web／兼容资源／小组件、npm 输入、mpv 头文件、GCC、Inno 与解包器。Host 编译需要 Windows PowerShell 5.1、MSBuild 17、net462 参考包及 x86 目标，验证使用 PowerShell 7。net462 编译目标不表示所有干净 .NET 运行环境已经验收。

`tools/prepare.ps1` 按现有组件及显式归档／源码路径准备材料，不能把它当成普通克隆后无参数即可完成全部依赖的命令。当前四份仓库快照和原始 libmpv 归档不等于完整构建环境。Host 还须有当前提交绑定的有效源码构建锁与产物，不能回退旧 Host。具体身份和恢复入口见[组件合同](PACKAGING.md#输入与输出)、[工具链](BUILD_TOOLCHAINS.md)及[Host 输入](WINDOWS_HOST_INPUT.md)。

完成上述准备、提交源码并运行适用回归后，沿现有入口构建；输出名须未被使用：

```powershell
node tools/prepare-preload.cjs .
node tools/source-built-host-input.cjs preflight .
node tools/validate-build-materials.cjs .
./tools/build.ps1 -OutputName ETE-review
./tools/package.ps1 -RuntimeName ETE-review -VerifyOnly
./tools/package.ps1 -RuntimeName ETE-review -OutputBaseFilename ETE-review-setup
```

runtime 输出到 `dist/ETE-review`；安装器由 `package.ps1` 输出到 `dist`。构建绑定 HEAD 的 Git blob，dirty／仅暂存源码不能代替所选提交；不覆盖旧产物，不手改生成包后沿用旧 provenance。详细流程与历史 runner 排障见[构建合同](PACKAGING.md)和[Actions 合同](ACTIONS_TEST_PACKAGE.md)；其中早期“尚未成功”记录不代表当前发布状态。

报告检查时区分单元、材料、隔离客户端、真实服务、可见画面和系统安装。云端打包通过不能替代真实播放或硬件验收。保留必要第三方版权和通知，不把来源声明、静态校验或用户接受风险写成已核验授权。发行说明遵循[Release 规范](RELEASE_CONVENTIONS.md)及模板。

# 手动 Windows 测试包

在 GitHub Actions 的 `Public offline CI` 工作流选择目标分支并手动运行。手动作业使用标准 `windows-2022`，只读仓库权限，不创建 Release、不安装或启动完整Electron客户端，也不接触自托管 runner。日常 push/PR 仍只执行公开离线检查。

2026-10-23的首次统一Host手动运行 `39957149782` 因 `windows-2025` 实际分配VS2026映像而在MSBuild17定位阶段停止，尚未编译。GitHub的[当前映像标签](https://github.com/actions/runner-images#available-images)与[Windows2022工具清单](https://github.com/actions/runner-images/blob/main/images/windows/Windows2022-Readme.md)列有受支持的 `windows-2022`／VS2022 17.14及MSBuild17组件，因此仅调整手动作业映像；定位器仍限定 `[17.0,18.0)`，builder仍拒绝非17版本，不安装编译器或回退旧Host。OS标签不锁定不可变映像，实际映像和工具链身份仍由每次run与构建回执记录；新映像上的完整构建验证结果须以新run为准。

后续运行 `39958180700` 已分配Windows2022，但在更早的libmpv恢复阶段被系统tar的LZMA能力阻断，未进入Host编译。恢复入口现优先使用该映像已有的固定安装位置7-Zip，只列举并将指定成员解至内存，再按原始归档与输出身份核验；不安装工具、不换libmpv、不跳校验，详见[libmpv恢复合同](LIBMPV_INPUT.md)。下一次运行仍须验证整个流程，不能把材料修正视为MSBuild或完整构建通过。

## 当前 Host 编译与验证前置条件

当前手动作业在独立材料准备后调用 `tools/ci-source-built-host.ps1`，恢复固定55份官方源码和两个NuGet输入，使用Windows PowerShell5.1／MSBuild17编译net462/x86 Host。随后必须由本次runner的可移植探针验证实际EXE/PDB，生成锁及构建／验证／工具链／工程回执，再进入装配。生成锁位于 `.work/source-built-host/`，绑定当前HEAD与Actions运行；不能导入外部测试机的旧回执或回退原版Host。

完整验证器已通过正常Git交接，32文件按精确字节固定；薄包装使用已有PowerShell7，builder保持Windows PowerShell5.1。官方私有System.Configuration只复制到本次构建的verification-inputs作有／无对照，不进入产品runtime。缺失、篡改或额外验证输入均停止；本文不表示该统一Host路线已在干净GitHub runner成功。探针执行受控临时Host合同测试，完整Electron／登录／播放及用户验收属于独立层次。

## 固定材料和产物

输入来自仓库的组件快照及固定官方源。`tools/prepare-ci-build-inputs.ps1` 按现有清单下载 Host、Electron、mpv 头文件、17 个 MSYS2 包、Inno 和解包器；每个文件验证 SHA256，工具链还验证完整树。官方 Electron 源只取固定 Git 对象。先验证仓库内固定 libmpv 原始 7z 的 size、SHA256 和 HEAD blob，随后离线恢复相同 DLL，不调用 SourceForge。手动作业拒绝已有 .work、dist、node_modules 或 libmpv 准备目录，归档回执记录 Git blob 和准备前后缓存状态。完整干净云构建结果仍须按实际 run 核验。禁止 `vendor/carnival` 和 `vendor/patch`，不使用旧安装包恢复。

准备固定 preload 后运行全部 `tests/*.test.cjs`、维护源码语法检查和独立 Host 材料自测，再执行现有 build/package 验证。安装包静态测试、解包后与 runtime 全部路径、大小、SHA256 一致才进入上传步骤。输出文件名含版本、源提交和运行编号；客户端版本不变，文件名中的 test 不代表新发行版。

Actions 产物只含安装包、校验值、来源回执、五份构建清单、仓库归档恢复回执、Host构建验证证据及精简测试总结，保留 1 天。不会上传工作目录、输入缓存、配置或完整测试日志。安装包未签名；自动构建不代替实际播放、退出和安装验收。

首次手动派发可能要求默认分支先具备 `workflow_dispatch`。若 GitHub 拒绝分支派发，保持本 PR 未合并并报告该前置条件；不得自动合并、改权限或替换为自动发布。此流程不需要新增 secrets。标准公开仓库 runner 与产物存储使用仓库现有配额，不启用付费容量。

## 暂存标准发行附件

明确准备版本发行时，可手动选择 `release_package=true`。仍使用同一个只读 Windows 作业和固定输入；额外运行全部 `tests/*-material-selftest.cjs`，安装器使用 `EmbyTheaterEnhanced-<version>-win-x64-setup.exe`，同时暂存标准来源、单文件校验、准确 source 的原始 `RELEASE_NOTES.md` 及列出前四项的 `SHA256SUMS.txt`。Actions artifact 中保留其余验证清单与总结，供来源核验，不全部作为 Release 附件。

该选项只构建、核验和上传 Actions artifact，不创建 Tag 或发布 Release。须先核对准确 source、版本、完整哈希、五附件及 Tag CI，再按[发行规范](RELEASE_CONVENTIONS.md)单独发布测试版。实际安装器 FileVersion、ProductVersion 和签名状态写入构建总结；云端不安装或启动客户端。

## 保留的固定下载失败诊断

原传输函数保留给受控回归；本地仓库归档恢复入口不启动此下载器。以下描述传输诊断合同，不表示生产准备过程仍需远端归档请求。

libmpv 下载失败时输出一次 `LIBMPV_HTTP_DIAGNOSTIC` JSON，带本次 `attemptId`、显式传输调用数、响应数、跳转数和脚本重试数。跳转和重复错误输出不代表重试；这些计数不宣称观测到了 HTTP 客户端底层的每个网络包。Node 包装器显式捕获子进程 stderr，防止同一错误自动回显后再次报告。

每一跳仅记录通过原来源校验的公开 host/path、状态及有限 MIME。响应字段仅接受 Server 产品家族、格式正确的 CF-Ray、秒数或 HTTP 日期形式的 Retry-After；其他值省略或标记脱敏。查询、片段、用户信息、响应正文、Cookie、Authorization、完整 URL 和完整请求/响应头均不输出，也不回显底层异常或原始命令失败文本。成功回执和归档大小、7z 签名、SHA256、DLL 校验保持原合同。

本地 HTTP 回归仅通过库函数测试入口连接回环地址；生产命令行没有传输替换参数，仍拒绝非原官方 HTTPS 路径。诊断增强不重试请求、不改源、UA、代理或权限，也不表示已解除远端 403。恢复真实下载须先取得新的正常访问依据或明确合规条件变化。

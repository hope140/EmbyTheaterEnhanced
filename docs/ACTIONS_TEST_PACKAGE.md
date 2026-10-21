# 手动 Windows 测试包

在 GitHub Actions 的 `Public offline CI` 工作流选择目标分支并手动运行。手动作业使用标准 `windows-2025`，只读仓库权限，不创建 Release、不安装或启动客户端，也不接触自托管 runner。日常 push/PR 仍只执行公开离线检查。

输入来自仓库的组件快照及固定官方源。`tools/prepare-ci-build-inputs.ps1` 按现有清单下载 Host、Electron、mpv 头文件、17 个 MSYS2 包、Inno 和解包器；每个文件验证 SHA256，工具链还验证完整树。官方 Electron 源只取固定 Git 对象，libmpv 调用既有固定下载入口。禁止 `vendor/carnival` 和 `vendor/patch`，不使用旧安装包恢复。

准备固定 preload 后运行全部 `tests/*.test.cjs`、维护源码语法检查和独立 Host 材料自测，再执行现有 build/package 验证。安装包静态测试、解包后与 runtime 全部路径、大小、SHA256 一致才进入上传步骤。输出文件名含版本、源提交和运行编号；客户端版本不变，文件名中的 test 不代表新发行版。

Actions 产物只含安装包、校验值、来源回执、五份构建清单及精简测试总结，保留 1 天。不会上传工作目录、输入缓存、配置或完整测试日志。安装包未签名；自动构建不代替实际播放、退出和安装验收。

首次手动派发可能要求默认分支先具备 `workflow_dispatch`。若 GitHub 拒绝分支派发，保持本 PR 未合并并报告该前置条件；不得自动合并、改权限或替换为自动发布。此流程不需要新增 secrets。标准公开仓库 runner 与产物存储使用仓库现有配额，不启用付费容量。

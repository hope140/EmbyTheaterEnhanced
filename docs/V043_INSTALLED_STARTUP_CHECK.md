# v0.4.3 普通安装启动核验

原基线固定成功构建 run `40110950621` 与产品提交 `abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d`；另允许下节明确列出的 Host 退出候选。两种模式都只消费各自审核绑定的原始 artifact，不重新构建、修改标签或发行物。

入口为独立工作流 `v0.4.3 existing installer startup check`。初始 `tools/v043-installed-startup-input.json` 的 `enabled=false`，只做纯合同自检。原构建成功且 artifact 未过期后，在本验证分支把该文件的 `artifactId`、`artifactZipSha256`、`installerSha256` 绑定为审核过的附件身份并设置 `enabled=true`，普通推送该文件即可触发安装检查；也可在工作流已注册后选择本分支手动运行。所有摘要使用完整小写 SHA256。普通产品CI及构建入口保持原字节；本入口没有重包或发布步骤。

一次性 Windows hosted runner 校验官方 artifact 身份、ZIP 摘要、安装器来源与摘要，然后正常静默安装到新目录。仅在无已有安装、profile、快捷方式和 Host 时执行；安装后逐文件核验载荷，通过安装快捷方式的目标启动 Host，核对其直接 Electron 子进程及可见窗口，再发送正常 WM_CLOSE 并确认所属进程退出。超时、异常退出和错误事件均不计成功，不请求提权、不改变执行策略、不强杀进程。

这次范围是普通安装、Host 启动及关闭。未证明 Web 页面 DOM 已就绪、首次真实 SMTC 会话、播放命令或 DWM 视频呈现；这些字段保持 NOT_ASSESSED。旧10用户验收只作为已验功能来源，不替代本次普通入口证据。不使用服务账号、NAS、媒体或个人配置。

工作流仅上传有限 JSON 结果。原始安装日志、客户端日志、profile 留在一次性 runner，不作为公开附件上传。失败时保留现场直到 runner 正常销毁；不把强制清理当退出成功。安装数据和卸载注册项只影响这台一次性机器。

检查器在普通Host之前用原包内固定Electron做无窗口环境语义对照，分别观察旧null调用与显式删除后的变量存在性、子进程模式及Electron内建模块。正式启动前要求Node模式变量实际不存在；不以空字符串代替删除，不修改产品或系统环境。该对照不能代替SMTC/DWM播放验收。


## 独立 Host 退出候选

原始基线之外，明确允许旧验证候选 `3a02339ab5011f2544df5b24b1da9b22d0df8d4a` 及当前生成链修复候选 `ca7ae841af8748091580259db1853e3c5e1c471f`，以及完整来源门禁修复候选 `b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5`；当前构建／安装只选择最后一项。该候选的 selected-methods 真实 Framework 红绿见 run `40117964806` / job `120943146678`：旧代码两个循环前场景需 watchdog，候选四场均正常退出；这不证明完整 Host 残留的唯一根因，也不是安装验收。对应 artifact `12570485777` 的 ZIP SHA256 为 `502d471e21b1b45a858c1c9dafe8b9b5bed60c75a7d2b14275afdc3f535bbf0b`。

构建选择 `fix/host-electron-exit-v043`，确认 head 为 `b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5`，`release_package=false`、`build_input_benchmark=false`。使用原普通构建门禁重新源码构建 Host、组装并校验测试安装器；不能拿原 v0.4.3 附件替代。构建成功后在本验证分支填写 `sourceCommit`、`buildRunId`、`installerFileName`、artifact ID 及两个摘要，再启用。初始绑定保持 disabled，不触发旧包重复安装。

当前测试附件文件名必须精确匹配 `EmbyTheaterEnhanced-0.4.3-test-b8938f4ba914-<run>-<attempt>-win-x64-setup.exe`。测试模式只要求安装器及其 provenance／sha256 三附件，因为非 release 构建不生成发布说明／SHA256SUMS；artifact 摘要、安装器摘要、原 run/source 身份、provenance、安装后完整逐文件载荷和普通启动／退出门禁全部保留，并核对 sha256 伴随文件。原固定 v0.4.3 模式仍要求原五附件。

生成链修复只同步旧patch的Program部分与来源绑定，Program源码SHA256仍为`df2b936ec854f72009dd78f44295dc0ad6988ad22252a435a818eab06d8d3ad4`。固定官方55文件经patch与替换两路径得到完全相同57文件，真实identity门禁及46编译输入验证通过；旧patch反例仍被拒绝。编译前新增强制source-chain阶段，不复用旧Host或回执。当前检查器绑定保持disabled，等待该新SHA的成功包。

当前候选的 Windows 短门禁 run `40124219323` / job `120962065084` 已通过原生产 Host 源码编译、真实 portable probes、verified envelope 生成及暂存校验。它不含安装器或真实 Electron 启动，不能代替本分支待执行的完整候选安装／正常退出验收。绑定仍为 `enabled:false`，仅在收到该来源实际成功构建的附件 ID、文件名和摘要后启用。

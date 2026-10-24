# v0.4.3 普通安装启动核验

独立验证入口只消费成功构建 run `40110950621` 的原始 artifact，固定产品提交 `abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d`，不重新构建、修改标签或发行物。

入口为独立工作流 `v0.4.3 existing installer startup check`。初始 `tools/v043-installed-startup-input.json` 的 `enabled=false`，只做纯合同自检。原构建成功且 artifact 未过期后，在本验证分支把该文件的 `artifactId`、`artifactZipSha256`、`installerSha256` 绑定为审核过的附件身份并设置 `enabled=true`，普通推送该文件即可触发安装检查；也可在工作流已注册后选择本分支手动运行。所有摘要使用完整小写 SHA256。普通产品CI及构建入口保持原字节；本入口没有重包或发布步骤。

一次性 Windows hosted runner 校验官方 artifact 身份、ZIP 摘要、安装器来源与摘要，然后正常静默安装到新目录。仅在无已有安装、profile、快捷方式和 Host 时执行；安装后逐文件核验载荷，通过安装快捷方式的目标启动 Host，核对其直接 Electron 子进程及可见窗口，再发送正常 WM_CLOSE 并确认所属进程退出。超时、异常退出和错误事件均不计成功，不请求提权、不改变执行策略、不强杀进程。

这次范围是普通安装、Host 启动及关闭。未证明 Web 页面 DOM 已就绪、首次真实 SMTC 会话、播放命令或 DWM 视频呈现；这些字段保持 NOT_ASSESSED。旧10用户验收只作为已验功能来源，不替代本次普通入口证据。不使用服务账号、NAS、媒体或个人配置。

工作流仅上传有限 JSON 结果。原始安装日志、客户端日志、profile 留在一次性 runner，不作为公开附件上传。失败时保留现场直到 runner 正常销毁；不把强制清理当退出成功。安装数据和卸载注册项只影响这台一次性机器。

检查器在普通Host之前用原包内固定Electron做无窗口环境语义对照，分别观察旧null调用与显式删除后的变量存在性、子进程模式及Electron内建模块。正式启动前要求Node模式变量实际不存在；不以空字符串代替删除，不修改产品或系统环境。该对照不能代替SMTC/DWM播放验收。

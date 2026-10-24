# Windows 构建：Framework 实现来源配置

本合同只约束测试构建 runner 的 `System.Configuration` 实现，不给应用分发框架 DLL，不改变客户端系统、GAC、网络或安全设置。Host 业务源码、固定编译器、net462/x86 目标及完整 Host 验证保持原合同。

## 两条精确路径

原固定实现 SHA256 `5a3d35a9a0db4f075cc073ea8e875ef6b3533e88ec610621ac400efcc7c8e663` 保持接受条件。额外候选仅允许 SHA256 `04a0018561b48efe2a4d56aff686783fd7f8b7f395f4c88c58ba2eb8e8118d41`，并且必须同时满足下列来源检查；不是接受任意微软签名文件，也不从当前机器自动学习允许清单。

| 额外候选条件 | 必须满足 |
| --- | --- |
| runner | GitHub Actions，ImageOS=win22，ImageVersion=20261012.333.1 |
| Windows | CurrentBuildNumber=20348，UBR=5622 |
| Framework | 已安装 v4 Full Release 在 [528040,600000)，文件版本为 4.8 系列 |
| 绑定 | GAC=True、ReferenceAssembly=False；System.Configuration 4.0.0.0，公钥标记 b03f5f7f11d50a3a |
| 文件 | 系统 GAC_MSIL 下规范位置，文件及所有祖先均无重解析点，来源检查后重新计算 SHA256 |
| 签名 | Windows Get-AuthenticodeSignature 返回 Valid，类型 Authenticode/Catalog，签名组织为 Microsoft Corporation，记录签名证书指纹 |

来源核对参考官方 [20261012.333 镜像清单](https://github.com/actions/runner-images/blob/win22/20261012.333/images/windows/Windows2022-Readme.md)及[20261021.343 镜像清单](https://github.com/actions/runner-images/blob/win22/20261021.343/images/windows/Windows2022-Readme.md)。后者 OS build 为 20348.5761，不能把相同的 windows-2022 标签或 Framework 产品版本当作 DLL 字节相同的证据。微软[2026 年 10 月 Framework 更新说明](https://learn.microsoft.com/en-us/dotnet/framework/release-notes/2026/10-13-october-cumulative-update)提供服务更新背景；这些页面不证明候选 DLL 的具体 SHA256 或 Host 兼容性，实际签名和行为检查仍是必需条件。

## 执行与拒绝

手动测试包入口先核验 33 份验证器输入，再用系统已有的 x86 Windows PowerShell 加载已安装 Framework 并只读检查。未知实现或来源不完整时在依赖下载前退出；不更新系统、不下载框架替身、不更换运行环境碰运气、不关闭门禁。

Host 准备入口重复执行来源检查，将 `runner-framework-profile.json` 写入全新构建工作目录；成功包将该文件作为 artifact 伴随材料保留。此回执只证明构建环境预检，不等于 Host 验收。最终验证器仍检查实际 Host 进程观察到的程序集位置、哈希、GAC 和非 reference 属性；额外候选重新验证完整来源。随后完整 JSON/ZIP、启动、配置写入、pending 保留、子进程和退出检查必须全部通过，才能产生本次运行的验证锁。新配置不复用旧运行锁。

## 证据边界

`tests/framework-servicing-profile.test.cjs` 执行生产分类器及提取的生产 finalizer 分支，合成有效/无效来源元数据，验证原固定路径、额外候选及拒绝条件。它没有在 Linux 上证明 Windows 文件的实际微软签名，也没有执行真正的 Host。源码级组合回归通过后仍须对精确提交运行一次新的 Windows 测试构建，核对实际来源回执、Host 验证结果、整包来源、安装器解包比对和 artifact。来源预检或 Host 失败时保留失败事实，不记为功能包通过。

原生预览仍默认关闭。成功包需按[独立试验包合同](WINDOWS_PREVIEW_SNAPSHOT_PROTOCOL.md)隔离解包并使用全新profile；普通正式安装保持原样。Framework／Host／Native构建通过不证明任务栏视频或Peek可见效果，后者仍须实机单独验收。

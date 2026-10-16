# v0.3.5 发行核验

[公开测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.5)于2026/10/16 15:22:29（UTC+8）发布，Release ID 414659667，draft=false、prerelease=true；Stable/Latest仍v0.3.1。

## 来源与安装包

| 项目 | 身份 |
| --- | --- |
| 产品Tag/sourceCommit | `v0.3.5` → `b0234c8a0e8d4fb264b21cf39f8ce68c9146d115` |
| 合入 | [PR #39](https://github.com/hope140/EmbyTheaterEnhanced/pull/39)，最终merge tree与审定7959651一致 |
| 标准安装器 | `EmbyTheaterEnhanced-0.3.5-win-x64-setup.exe`，175741577 bytes，NotSigned |
| 安装器SHA-256 | `03f8cf5f2b18f854cc6548a7fe2d60cd641a8187479c4fd2e3ad22c8dfd87414` |
| runtime manifest SHA | `5746610641f2b95008d8158ec0e4722ef94c9c237ca84a4f6d2db212e11dbef8` |
| payload-set SHA | `efa379f59499dcdc73370e5638afdec626a4b8e1481b51e9e56da205e6e22fb2` |
| 包体 | 2157 payload / 2158完整runtime / 2158个{app}解包文件，完整集合及逐项SHA一致 |

安装器由最终主线提交的Git blobs、固定物理vendor/工具链与锁定依赖重新构建，标准入口Emby.Theater.exe；没有沿用cc7f542 runtime或已使用交付目录。独立wrapper、harness、fixture、profile、debug日志及用户导入内核不进入安装包。Helper与默认libmpv包内SHA分别为`28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`、`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，保持固定值；包内哈希不代表实际加载映像证据。

## 门禁与回读

- PR Push [38864050460](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38864050460)与PR [38864112342](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38864112342)公开CI通过。
- 产品main [38865275775](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38865275775)与Tag [38865745759](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38865745759)公开951/951通过，语法/有限敏感模式扫描/diff检查通过。
- 最终main固定材料162/162、exit 0；首轮缺生成preload的158项结果与准备修正回执保留，未跳过。
- 最终runtime真实main/AMD/router/controller默认搜索24项通过，390/800/1280各只有1条原生空提示；空profile合成API，show/外网/Node网络/Native启动0，非预期页面错误0，原file Cache警告保留。
- 固定Inno编译及innounp归档测试/解包通过；每个{app}文件与runtime SHA一致，source helper与该提交Git blob一致。
- 五附件匿名完整回读通过；安装器21个range覆盖0至175741576所有字节后顺序计算SHA，未使用认证；其余四附件完整GET。全部大小/SHA及provenance、单文件校验、SHA256SUMS和同源RELEASE_NOTES关系通过。
- 发布前后Stable与v0.3.3/v0.3.4正文、附件身份和draft/prerelease标志保持；后续文档HEAD由最终Git回执单列，不改变产品Tag。

## 附件

- [EmbyTheaterEnhanced-0.3.5-win-x64-setup.exe.provenance.json](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.5/EmbyTheaterEnhanced-0.3.5-win-x64-setup.exe.provenance.json)：3943 bytes，SHA-256 `99ab3eca4f2f7732445fbe8afa6b2cc3dc4d508c94c602d0c757bd0ed37b3d98`。
- [EmbyTheaterEnhanced-0.3.5-win-x64-setup.exe.sha256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.5/EmbyTheaterEnhanced-0.3.5-win-x64-setup.exe.sha256)：110 bytes，SHA-256 `ef99558203654c9c0a2a932be182d4e17d95209514bc94e10b4c38c58689ab27`。
- [RELEASE_NOTES.md](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.5/RELEASE_NOTES.md)：1728 bytes，SHA-256 `c4becef9687d5e515a550f8ad0882480c0eaef9e912026da35a8d203f5b7ffd6`。
- [SHA256SUMS.txt](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.5/SHA256SUMS.txt)：436 bytes，SHA-256 `fd89c5608a0ee73fa1e377c87de158d910cc6e09a86d63333ee927460c538b62`。
- [EmbyTheaterEnhanced-0.3.5-win-x64-setup.exe](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.5/EmbyTheaterEnhanced-0.3.5-win-x64-setup.exe)：175741577 bytes，SHA-256 `03f8cf5f2b18f854cc6548a7fe2d60cd641a8187479c4fd2e3ad22c8dfd87414`。

## 验收边界

用户完成cc7f542候选所测场景测试并明确授权发布，按该有限范围记录USER_REPORTED_TEST_COMPLETE。未补写未说明媒体组合、真实远控、旧服务器矩阵、实际安装或硬件逐项PASS。新安装器系统安装、真实Helper/DLL加载、真实服务器与前台业务没有执行，本轮发布/解包/合成门禁不替代这些验收。切轨延迟仍未解决，缓存及后续启动视觉需求未加入本版。

本机私有回执位于发行工作树的`.work/v035-release`：CI_MAIN/CI_TAG、main-material-result、main-build/main-verify/main-package、INSTALLER_AUDIT、DRAFT_PREFLIGHT、ANONYMOUS_READBACK、PRESERVATION。保留首轮缺preload与旧候选失败日志；私有回执、个人环境和原始图像不作为Release附件。

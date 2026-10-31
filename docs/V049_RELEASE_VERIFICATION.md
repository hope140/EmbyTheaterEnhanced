# v0.4.9 测试版核验

## 已发布结果

[v0.4.9测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.9)已于2026-10-31T08:51:16Z公开，Release对象429821685，prerelease=true、draft=false；正式Latest仍为同一对象422090288／v0.4.0。

| 项目 | 准确来源与结果 |
| --- | --- |
| 产品／Tag来源 | `07326205f9260e817e88655081a1df44cc96e445`，基于51eb449，包含已验收d630438及0.4.9版本／发行资料；main正常快进，新Tag固定同一来源，无强推或移动旧Tag。 |
| Windows公开CI | [41184430038](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41184430038) success，2308项为2303 pass／0 fail／5 skip。 |
| 标准发行构建 | [41184437418](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41184437418) success，release_package=true；完整2403项为2401 pass／0 fail／2 skip，显式材料135/135、Host材料2/2、实际44.5.0接口绑定、隐藏窗口退出及安装器编译／解包回比通过。 |
| 正常testing发布 | [41186183687](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41186183687) success，复用上述同源码标准构建；原五附件门禁、上传、公开及Latest保护通过。 |

所有src、native、tools、tests、vendor输入、安装器及工作流与d630438逐字节核对，发行阶段仅同步版本／文档；依赖包选择保持。下列公开附件均独立下载并核对大小／SHA-256及API digest，provenance绑定本版来源、版本、安装器名／大小／摘要，两份校验表一致。Release正文及notes附件与准确源码Git blob逐字节一致；该核验不等于签名或许可认证。

| 附件 | bytes | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.4.9-win-x64-setup.exe` | 161847320 | `1d2bb4cf64755ef20b577ff8f7dbcf8cc984fa780158f635d21cb3bc7cbacc7a` |
| `EmbyTheaterEnhanced-0.4.9-win-x64-setup.exe.provenance.json` | 2154 | `92e8d46532bac9347f7c2291d755e1286b22e1d157acc418bef79d55ae2e8e5b` |
| `EmbyTheaterEnhanced-0.4.9-win-x64-setup.exe.sha256` | 110 | `6ca78a948cba9297aaa066c8867a7617316d68f3602b74d5535318477cd8215b` |
| `RELEASE_NOTES.md` | 2082 | `cffd782943b77632d1ea7020a82d26211eb8dea2057bb8eecf7fbb1cd12a5a2c` |
| `SHA256SUMS.txt` | 436 | `a7922d3a0aa1a12225ff91c2312ddf273518b6171f59343dcbfa1e3162340fff` |

本轮未读取Actions ZIP，不重试旧Forbidden目标；公开Release附件是本次获授权标准发布后的新资源。用户焦点验收、自动化、公开字节验证与真实服务／安装矩阵证据分别保留。

## 发布前准备（历史）

以下为准备阶段记录，不再表示本版尚未发布。

## 准备时状态

准备发布 Windows x64 testing；本轮已获准在测试和构建通过后合入main并发布，正式Latest保持v0.4.0。准确发行来源及终态在实际完成后补记，不将待执行写成成功。

## 来源与范围

基线main为`51eb44921f614defad8126d44cfaa54f3c9f4333`，已验收焦点候选为`d63043837b103df7c19272e5ff29dd434728c2ab`，候选核验补记为372930b。发行准备仅同步根package／lock三处应用版本到0.4.9、发行说明与文档；所有src、运行时manifest、loader、native、工具、安装器、工作流及依赖包选择保持候选，不混入独立缓存／预载实验或EWT插件修改。

Electron从44.4.2更新到固定44.5.0，修复Windows原生JavaScript对话框的焦点恢复；具体上游PR、归档／文件树／loader哈希及守卫见[焦点修复来源](ELECTRON_4450_FOCUS.md)。不增加全局focus／blur或模拟切换窗口。保留0.4.8下载管理、全剧／本季已看筛选及既有用户文件／任务合同。

## 验证计划与已有证据

已验收候选d630438的Windows公开CI41181127475为2308项：2303 pass／0 fail／5 skip；普通验收构建41181189855为完整2403项：2401 pass／0 fail／2 skip。实际44.5.0的processVersions、Koffi／WinRT／DWM接口绑定、隐藏窗口退出、安装器编译／解包回比通过；该普通0.4.8验收包不作为本版标准发行包。

本版版本／发布／运行时合同本地定向55/55通过，所有src、native、tools、installer、工作流、vendor清单及tests与d630438逐字节核对一致，锁文件包选择无变化。准确0.4.9源码仍须重新运行Windows公开CI及release_package=true标准发行构建；同源码成功后才正常合main、创建新v0.4.9 Tag并沿既有Manual verified release执行testing。公开后独立重新下载实际Release五附件并核对字节、来源、校验表与notes。旧Actions ZIP的Forbidden限制保持，不重试或换通道读取旧目标。

## 验收边界

焦点候选已完成用户验收；助手没有操作现用前台、登录真实Emby或独立执行该用户环境的可见复现。用户反馈与自动化分开。隐藏窗口SMTC／DWM／capture等使用替身，不等同于可见系统媒体、所有硬件、真实播放／远控或完整Windows安装生命周期验证。正式Latest和既有Release／Tag／附件保持。

# v0.4.8 测试版核验

2026-10-31已发布[v0.4.8测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.8)，Release对象429781238，发布时间2026-10-31T07:14:42Z，prerelease=true、draft=false。正式Latest保持v0.4.0，仍为同一对象422090288。

## 准确来源与门禁

| 项目 | 已核对结果 |
| --- | --- |
| 产品／Tag来源 | `e8e968860217108d00c21102ca070afdeee9ec8e`；v0.4.8注释Tag对象a2560a90a23ee745c8baf17f168bbce10a210464解析到同一提交。 |
| main合入 | 本轮具体授权后，核对main仍为16a891b，再以正常原子推送快进到e8e9688并建立新Tag；没有强推或移动旧Tag。 |
| Windows公开CI | [41177694415](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41177694415)绑定e8e9688，success；2306项为2301 pass／0 fail／5平台skip，固定组件与静态检查通过。 |
| 标准发行构建 | [41177705325](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41177705325)绑定e8e9688，release_package=true，success；完整2401项为2399 pass／0 fail／2 skip，显式材料135/135、Host、Native Helper与安装器门禁及上传通过。 |
| 正常testing发布 | [41179756153](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41179756153)从main执行，复用上述准确源码标准构建；preflight、build、publish均success，Latest不变。 |

本版只加入当前账户已看集数筛选与静态自动更新提示精简，保留Electron44.4.2，不包含独立44.5.0或EWT插件候选。固定原生／Web输入、依赖包选择、安装器与工作流源码保持；版本及来源元数据按0.4.8重新生成。下载代码与c5b9dd0相同，后续发布核验文档补记不改变Tag或原始包。

## 公开附件独立核验

五附件均从本次已公开Release的实际browser下载地址重新获取，大小／SHA-256与API digest一致。安装器来源JSON绑定e8e9688／0.4.8及准确文件名／大小／摘要，单文件校验和总校验表匹配；RELEASE_NOTES.md和Release网页正文均与来源Git blob逐字节一致。

| 附件 | bytes | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.4.8-win-x64-setup.exe` | 162036163 | `e3116e81a27d54780fac50c1cfd69b956900be3690648ade06062e7f495c2203` |
| `EmbyTheaterEnhanced-0.4.8-win-x64-setup.exe.provenance.json` | 2154 | `0839695bfc4b46d8f7352a98233c8307d4f2ff0ae9ea8453500b7c519b651c5e` |
| `EmbyTheaterEnhanced-0.4.8-win-x64-setup.exe.sha256` | 110 | `04b8270a8f7abdf123953e7e0e6360e99079700a607c7773cba3bf8aac3057e9` |
| `RELEASE_NOTES.md` | 2244 | `d8aeb68c2f28ca2477811e079e524a55b61b850ec69d04c594e1d89f30cf1b89` |
| `SHA256SUMS.txt` | 436 | `b94ae7fa499fefa0cfb574eca9edde1810c476cf09b56c2e8a40229c41f5bbd2` |

本地Actions artifact13034571213的ZIP独立回读被存储服务返回Forbidden、0字节后停止，未重试或换通道。正常发布流程内完成原构建summary及五文件门禁；本节是新公开Release附件的实际字节核验，没有将原ZIP元数据当作独立下载证据。

## 验收边界

定向下载40/40及发行合同46/46通过；本地公开2306项为2275 pass／0 fail／31平台skip，Windows及标准构建分别以上表为准。没有安装或操作Work前台，真实Emby已看数据、Windows原生确认框可见体验和系统安装未独立验收。已报告的EWT确认框后输入／下拉问题没有在本版验收修复；Electron升级独立候选暂不发布。

main／Tag合入后对同一e8e9688另触发自动CI41179732974、41179732962；它们不替代上表发布前已完成的准确来源门禁，后续状态按实际回执补记。

## 发布前准备（历史记录）

以下保留准备时范围和当时待完成事项，不再表示本版尚未发布。

当前为独立候选，未合main、创建Tag或发布。准备Windows x64 testing，保留当前正式Latest v0.4.0；合入main和正式触发本次测试版发布仍需本次具体确认，既有版本的授权不代替本轮确认。

## 来源与范围

基于main `16a891b3de4bcf14283fb6f81133b04b215d99f9`，下载筛选产品提交为`c5b9dd007395a07d34ab90bb34d4dc18b44a5003`，已包含提示精简提交`b7580a4`。发行准备仅同步package／lock三处版本到0.4.8、说明及核验记录，下载代码与c5b9dd0一致；最终准确构建source以本次来源JSON和CI回执为准。

本次只加入已看集数筛选和下载管理提示精简，不包含独立Electron升级或EWT插件候选。Electron44.4.2完整树、Vulkan loader、依赖锁中的包选择、Host、Native Helper、libmpv、Web输入与构建门禁保持；不改取源、续传、播放或用户文件清理合同。新任务在当前账户按严格布尔UserData.Played筛选，部分观看仍加入；已有任务去重，未知状态默认取消，明确下载全部也不能绕过列表／鉴权／权限核验。细节见[设计](ADVANCE_DOWNLOAD_DESIGN.md#已看集数筛选候选未发布)。

## 已完成与待完成验证

- 下载代码定向40/40通过，包括原目录／管理页回归，以及筛选、计数、未知状态、账户退休、确认等待去重和容量守卫。
- c5b9dd0完整本地公开2306项：2275 pass／0 fail／31平台skip；JS548份语法及645份维护文本有限凭据模式扫描通过。
- 最终0.4.8准确源码的版本／发布合同回归、Windows公开CI和release_package=true标准发行构建结果待追加。不能用不含本轮改动的旧包或独立Electron升级包替代。

尚未独立执行真实Emby已看状态、Windows原生确认框可见体验或系统安装验收，不把合成服务和构建通过写成前台通过。现有EWT确认框输入／下拉问题没有在本版验收修复；该候选留待另行测试，不阻止本版下载改动保持原宿主。

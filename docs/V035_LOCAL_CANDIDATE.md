# v0.3.5 详情页本地候选

产品sourceCommit为`51ae2e4df281a460e58af15255630e159bcb0ec7`，分支`codex/v035-details`，基于主线`ef7a8d8`。后续文档HEAD与产品来源分开；本候选没有发布。范围与回退见[详情页合同](DETAIL_PAGE.md)。

本版修正详情请求在离页、销毁、重复刷新后的迟到渲染，沿用Movie/Series/Season/Episode原页面、信息布局、选择器和播放入口；未发现需要更换信息布局的独立证据。旧runtime完整应用已复现销毁后null view异常，修正后相同销毁情形通过。默认内核、Electron44.4.2、锁定依赖和全部播放/Session owner保持。

| 项目 | 结果 |
| --- | --- |
| 最终公开离线门禁 | 941/941，0失败/跳过 |
| 最终固定材料门禁 | 157/157，0失败/跳过 |
| 构建输入含新变换器及tamper专项 | 19/19；provenance夹具2/2 |
| 完整应用 | 24行为检查，真实AMD/main/router/ItemPage与原组件，空profile合成API |
| 四类型视口 | 390/800/1280共12组，无页面横向溢出，原有效播放入口可见；代表截图已视觉核对 |
| 输入 | 原ActionSheet鼠标/Enter选择、选择value/change、原播放参数边界；真实Tab/Shift+Tab焦点移动及返回 |
| 隔离 | show、浏览器外网、Node网络、Native启动均0；本批所属Electron进程无残留 |
| 启动入口 | appData/userData/config隔离，版本0.3.5；探针profile已移至证据区，交付不带profile |
| 静态检查 | JS290、PowerShell28语法，341文件有限敏感信息扫描及diff-check通过 |
| 包体 | 2156 payload / 2157完整runtime；VerifyOnly及独立逐项SHA核对通过，交付runtime副本一致 |

## 产物身份

- runtime：`dist/EmbyTheaterEnhanced-v035-details-20261016-r2`。
- 本地目录：`dist/ETE-v0.3.5-details-51ae2e4-20261016`；双击`Start-v0.3.5.cmd`，首次登录由用户完成。
- manifest SHA-256：`21e779d08092da06430af3535140a1aa6b0dd034eed98b7aefafc9d8de1bd468`。
- payload-set SHA-256：`42a09ad2dc2f8faab176cbbbde2bbb5a654ee6343faca6b4342a85e0328fda57`。
- Helper SHA-256：`28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`；libmpv SHA-256：`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，与原固定值一致。
- ZIP：`dist/ETE-v0.3.5-details-51ae2e4-20261016.zip`，2161文件、234469104 bytes，全部条目流回读及SHA核对通过。SHA-256：`c16db379c003ce7ec1fad1cc8f4e0c297afe1187d530515fbbf8c7e8fd5efb16`，旁附同名`.sha256`。原v0.3.4目录、ZIP与profile均保留。

## 失败与修正回执

1. 旧版`.work/detail-baseline/RESULT.json`复现销毁后null classList异常；没有删除原失败。
2. 首轮材料157项中两项runtime-provenance失败，原因是夹具未复制新变换器。补齐build-input INPUT_PATHS、patcher防篡改集合及fixture后，原source 1f0b58d被新来源51ae2e4取代并重新构建；新来源完整材料与公开门禁通过，旧VerifyOnly不充当修正证据。
3. 菜单取消首次产生四条undefined未处理拒绝。固定原EmbySelect只给ActionSheet成功回调，共用菜单字节未改；取消诊断缺口保持OBSERVED。另一次夹具未等待异步条目，修正等待实际原生listItem再选择。最终成功选择菜单不含该异常，不把取消记为PASS。
4. 首次四类型几何夹具错误要求Series隐藏的PlayFromBeginning按钮可见。按原controller语义改验可见的Play/Resume入口，12组通过；未为测试修改产品。

私有证据保留于`.work/public-ci-final.log`、`materials-final.log`、`build-input-recheck.log`、`build-r2.log`、`verify-final.log`、`detail-final-r3/RESULT.json`、`launcher-final/RESULT.json`和`PAYLOAD_AUDIT.json`；fixture/profile/截图不进入payload或ZIP。

## 人工验收与未覆盖项

依随包`测试说明.md`核对四类型真实内容、原列表进入/返回位置与焦点、多版本/轨道选择及取消、连续导航/错误恢复、常用窗口与键盘。真实服务器DTO/旧服务器矩阵、前台视觉、真实播放/远控、系统安装及硬件保持NOT_VERIFIED。播放入口验证只在PlaybackManager.play边界记录原参数，不执行真实播放。没有新增首页或详情内容缓存，切轨延迟仍延期。

ZIP首次由旧.NET接口生成反斜杠条目名，独立审计拒绝；原包移入证据区。改为显式标准斜杠条目，补载Compression程序集后生成最终ZIP并完整回读通过。产品runtime未变。最终ZIP审计在`.work/ZIP_AUDIT.json`，工作区干净状态及文档HEAD由本轮最终Git回执固定。

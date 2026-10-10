# 0.2.7 本地测试包交付

日期：2026-10-10（UTC+8）。状态：**LOCAL_PACKAGE_READY**。主会话已PARENT_REVIEW_PASS，本轮第二阶段完成。

产品sourceCommit为 d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0，批准审阅HEAD为 2b5686438fa0129fbb8686fae88c55264e1d38a5，最终观测工具为 0e87d4f5b85ee136d1fe3d0ab47eaac25d64ac9d。文档收尾HEAD由维护分支Git日志及本地交接记录回读，独立于产品身份。

安装器：dist/EmbyTheaterEnhanced-0.2.7-win-x64-setup.exe

大小：175632871 bytes

SHA256：86bee55146714f4f7e493cadb8b483537644f513c92364df7fc0c18f5315f3db

companion：同名.exe.sha256与.exe.provenance.json，绑定产品sourceCommit、版本及批准runtime manifest c6794efc6b69aeef67c3274903715e2483955a564dc9b2bc8a3e4cefd24ffe6c。独立交付目录为 dist/delivery-0.2.7-maintenance-d8fcb0f/，含中文README、验证说明、来源回执及SHA256SUMS。

## 审核与实际打包

父会话独立审查53/53通过，回读十组166项产物、2137 runtime文件和34项输入；批准回执原件SHA256及准确范围见 [打包机器证据](evidence/local-package-027-20261010.json)。本树clean时临时detached批准产品d8fcb0f，调用原package.ps1对已验证runtime重新校验后生成新EXE，随后返回维护分支。没有重建相同产品，也未将旧0.2.6安装器改名。

Inno完整性通过：2137应用文件及容器内部install_script.iss。解包expected/actual均2137，missing/extra/mismatch0；批准runtime的全路径和hash再次匹配。原件、SHA256/provenance与交付副本全部回读，见 [交付回执](evidence/local-package-027-delivery-20261010.json)。逐文件解包哈希保存在 .work/maintenance027/package/installer-verification.json，完整日志及PE资源记录同目录。

PE实际字符串版本为带填充空格的0.2.7，trim后0.2.7，四段数值0.2.7.0；最初严格字符串0.2.7.0断言错误，原记录保留，最终同时核对字符串/数值后通过，未改包字节。解包应用package0.2.7与同一批准runtime的真实维护IPC appVersion/sourceCommit对应。Host资源3.0.20.0与Electron44.4.2保持原固定输入；Helper没有PE版本资源，其1.0.0来自源码/provenance及前阶段实际握手，不能将资源缺失记成版本不符。

## 验证与边界

651/651产品全量、42/42工具、十组隔离运行及About/Session/诊断事实保留原 [第一阶段证据](evidence/maintenance-027-20261010.json)，没有改写它的READY_FOR_PARENT_REVIEW历史状态，也未为本次纯打包重跑未变化产品。产品与运行来源相同、批准输入和payload字节已核对。

四类第三方材料继续WAITING_EXTERNAL，160项实体回读不等于完整许可或可重建闭合；详见 [材料收尾](THIRD_PARTY_MATERIALS_CLOSEOUT_027.md)。系统安装/升级/卸载/重装NOT_EXECUTED，HDR/混合DPI多屏/全屏圆角DEFERRED，真实Emby/CD2/远控与前台可见验收未执行；详见 [安装与显示准备](INSTALL_DISPLAY_READINESS_027.md)。旧直接app.exit UNKNOWN及原observer失败保持。项目S1–S5完成，S6为EXCLUDED_BY_USER / KEEP_CANDIDATE。

交付范围到本地可安装测试包。远端main、tag、Release及系统客户端没有本轮写入；本包系统安装由使用者另行决定。

# v0.3.6 发行核验

[公开测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.6)于2026/10/16 17:02:37（UTC+8）发布，Release ID 414741804，draft=false、prerelease=true；Stable/Latest v0.3.1保持。

## 产品与来源

| 项目 | 身份 |
| --- | --- |
| 产品Tag/sourceCommit | v0.3.6 → `de1a731aa3e915b00988134b6f5331bfc867a84a` |
| PR | [#40](https://github.com/hope140/EmbyTheaterEnhanced/pull/40)，merge tree与已审ea4ee8b一致 |
| 安装器 | `EmbyTheaterEnhanced-0.3.6-win-x64-setup.exe`，175752059 bytes，NotSigned |
| SHA-256 | `020df218195e9999d443ad0832df6cd1be9a8c9f8dc8d7780b75b6c25893edc1` |
| runtime manifest SHA | `48821875dc86cd867cf6c9d65930e8226c1bd60923fb526dc595f2a80e2805a4` |
| payload-set SHA | `5ab67c385c40d1107b36867d20d739b0095f7f5213e021818ba3fefa1ca36d27` |
| 完整集合 | 2158 payload / 2159 runtime / 2159解包文件；逐路径及SHA一致 |

新SVG内嵌原logowhite.png完整原始字节，仅添加THEATER ENHANCED；未采用生成预览的近似图标。index固定窄变换只改启动图来源/尺寸，原DOM与loader保持。vendor及共享logo只读不改；权属/通知仍保持，素材复用不构成第三方许可结论。

## 实际验证

- PR Push与PR公开CI各955/955成功；最终main [38875880235](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38875880235)及Tag [38876250253](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38876250253)各955/955成功。
- 最终main固定材料163/163、exit0、无跳过，HEAD起止一致。首轮新增来源fixture大小写预期5/6与格式修正后6/6分别保留；没有产品失败或删除/放宽有效断言。
- 真实main空profile隐藏应用在390/800/1280下加载正确SVG、中心/尺寸/黑底/无横溢出，截图实际查看且与已审候选像素一致。观察首轮启动图时仅在私有harness暂替apploader响应，取消拦截后正常重载同一原入口：初始页面就绪、启动图消失。show/Node网络/外网/Native子进程均0；原file Cache警告保留，新增非预期页面错误0。
- 固定工具链编译标准安装器后测试归档并解包，全部2159个{app}文件与来源runtime逐路径SHA/集合一致；无独立wrapper、profile、harness或debug日志。与v0.3.5比较只含批准的启动资产、index样式、版本和来源元数据变化；Helper `28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc` 与libmpv `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c` 保持，包内哈希不代表实际加载映像。
- 五附件匿名完整回读：四小附件完整GET，安装器21个range覆盖0至175752058全部字节后按序hash，未使用认证。全部大小/SHA、provenance、单SHA、SHA256SUMS与同源notes关系通过。
- 原v0.3.1/v0.3.3/v0.3.4/v0.3.5及Stable身份在最终远端回读时再次对照发布前快照；文档收尾HEAD/CI单列，不替代产品Tag。

## 五附件

- [EmbyTheaterEnhanced-0.3.6-win-x64-setup.exe](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.6/EmbyTheaterEnhanced-0.3.6-win-x64-setup.exe)：175752059 bytes，SHA-256 `020df218195e9999d443ad0832df6cd1be9a8c9f8dc8d7780b75b6c25893edc1`。
- [EmbyTheaterEnhanced-0.3.6-win-x64-setup.exe.provenance.json](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.6/EmbyTheaterEnhanced-0.3.6-win-x64-setup.exe.provenance.json)：3943 bytes，SHA-256 `a76a03e24e62be8ecf4a06b722a71e960f5bb936f7f3e02e6431b0fd22cf15fa`。
- [EmbyTheaterEnhanced-0.3.6-win-x64-setup.exe.sha256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.6/EmbyTheaterEnhanced-0.3.6-win-x64-setup.exe.sha256)：110 bytes，SHA-256 `d5f463e401755a5ebfde586de9fac1d9fcdd06ab8c2dbe7a59714795a28edbed`。
- [RELEASE_NOTES.md](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.6/RELEASE_NOTES.md)：1418 bytes，SHA-256 `547a158d633afce9d225e574b83126b211559adbe42d3ec3d2a14b72b029ed30`。
- [SHA256SUMS.txt](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.6/SHA256SUMS.txt)：436 bytes，SHA-256 `e8b0fc9d61a4b78bcc21e477ce7e361e2c85548b16bed660c818467e701899c4`。

## 验收边界

用户已明确要求直接完成并发布本版，不额外编造本版人工视觉/登录服务器主页/真实播放远控或系统安装PASS。相关证据为来源/包体、静态和空profile隐藏运行；旧产物/profile保持，未做前台或真实服务写入。缓存和切轨延迟未加入，不自动启动下一版本。

私有回执保存在发行工作树.work/v036-release及.work/v036-main-startup，包括CI、材料、构建/VerifyOnly、INSTALLER_AUDIT、PACKAGE_RESULT、DRAFT_PREFLIGHT、ANONYMOUS_READBACK及最终远端回读；不作为Release附件。

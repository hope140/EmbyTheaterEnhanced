# v0.3.11 发行核验

## 发行身份

[v0.3.11](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.11)已作为Pre-release公开，Release ID为416958262。产品sourceCommit为`3b308c7fcec44990d1a0820e1a982691d7d4e17b`，annotated Tag对象为`febad360c85ad21d4e9c831207bbd5d4e0db8cef`；Stable/Latest保持v0.3.1。后续文档提交与产品来源分别记录，不移动产品Tag或替换原附件。

## CI、固定材料与界面验证

- [Main CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39207500968)及[Tag CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39208264786)均为1123/1123通过，失败与跳过均为0，两者均绑定准确产品source。
- 固定材料211/211通过，失败与跳过均为0，原日志SHA-256为`34aa83522778fae8c23fc0072fd149b40cb87b041a99c4ab03759afedc71428f`。三个原始归档、完整prepared Electron与本地工具链均按固定清单重核，未升级依赖或工具。
- 正式runtime的模板/CSS完成两主题、五视口、五页50组隔离对照：STRM表单收窄，原生音视频、诊断与About几何保持，长路径及窄视口无页面横向溢出。该证据仅支持隔离模板/样式，用户认可的此前本地STRM试用效果单独记录，不作为本版完整前台或业务验收。

## Runtime与安装器

完整runtime为2160个文件，其中payload为2159项。安装器解包的`{app}`为2160个文件，与runtime的完整路径、大小及SHA逐项一致；`VerifyOnly`通过。build-manifest SHA-256为`3ada90a119ce3583e32de180e464bca938f608ba466904072997f9bdd47206a5`。

相对v0.3.10，实际runtime差异限生成layout.css、STRM样式、应用版本与来源元数据。其余payload保持；Native Helper完整字节保持，SHA-256为`baaef0f2c4599cd48a2bfbb7bc188071dc548d57ddf3ee794fe5baeca3589494`，生产`testing=false`。Native C++仍来自准确Git blob，SHA-256为`8b0c79588390cc735639e4ea26beb9f0e10719c3ab52a14520cbb96d25966de3`。源码、包内文件、ready握手及实际加载映像SHA分别解释。

构建输入52项、普通Git产品源109项、Notice4项，完整Electron73文件、默认libmpv及锁定工具链均按来源核对。安装器PE数值版本为`0.3.11.0`；资源原字符串有尾部空格，显示值归一化为0.3.11。Authenticode为`NotSigned`。

## 五附件与匿名完整回读

五件附件的远端大小/digest与本地一致，发行初次正文及RELEASE_NOTES附件均与产品source的Git blob字节一致。匿名回读未发送Authorization；安装器通过21个连续Range覆盖全部175740120字节，顺序拼接后独立计算完整SHA，另四件完整GET核对。仅上传成功、元数据digest或局部抽样不作为完整下载证明。

| 附件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.3.11-win-x64-setup.exe` | 175740120 | `0c3d24c1d5cac46251daf235509388010480efed39944a3e73a6c20bc275ea93` |
| `EmbyTheaterEnhanced-0.3.11-win-x64-setup.exe.provenance.json` | 2156 | `7f6630d83ea0536c91b11c4a40b33ed7cdedef762a03071b2a049eea7dc98ee1` |
| `EmbyTheaterEnhanced-0.3.11-win-x64-setup.exe.sha256` | 111 | `04b285244cf3ea9593484dd152d2c751a9f378835db764654004faff29873ece` |
| `RELEASE_NOTES.md` | 1917 | `8a04eb216a5167abc6a264db2d362951d7aa23d82e577c8882eb353b4bf7332b` |
| `SHA256SUMS.txt` | 439 | `2f786b999920e9c539d63730d71b8fd22b054eba19467c5fee09dca62807ab7e` |

旧22个Release、79个附件及47行Tag引用逐项回读保持；Latest仍为v0.3.1。SHA256SUMS列出其余四件附件；其自身SHA在上表单独记录。

## 验收边界

本版没有执行系统安装、真实Emby播放/远控、实际CD2连接、Helper ready/加载映像SHA或设备验收，保持NOT_EXECUTED/UNKNOWN。包体、模板及发布证据不替代这些层次。许可及对应源码未决事项按[许可说明](LICENSING.md)保留。

后续下载导航与文档提交由Git和相应Checks记录，不替代本版固定产品来源。

# v0.3.11 页面布局修正测试版

## 发行范围

在v0.3.10之后的main `1a4af49ddfb0cf3872532e8990af34cc390cacdc` 基线上，交付两项已确认的样式修正：解除通用readOnlyContent的重要限宽，同时保留默认90ch、焦点简介与折叠；仅将STRM表单自有限宽改为90ch。原生表单、其他增强设置页和播放/Session/Resolver/Native协议保持。

版本元数据三处更新为0.3.11，不改变依赖、工具链和固定外部输入。发行渠道为Pre-release，标题“v0.3.11 · 页面布局修正测试版”，Stable/Latest保持v0.3.1。

## 来源与验证

代码经独立审查、公开CI和正常PR合并，固定产品sourceCommit后重新构建。精确CSS变换、构建输入清单、防篡改与runtime来源fixture同步；依赖原始Web材料的case保留在材料自检，不跳过。

按现有构建/打包命令校验全部外部输入、生成器、完整runtime及生产Native身份。VerifyOnly通过后使用固定Inno编译，在新目录解包，并核对全部路径、大小和SHA。此前0.3.9本地试用副本不作为本版构建或发行资产。

五附件为标准安装器、安装器provenance、单文件sha256、产品source中的RELEASE_NOTES.md及SHA256SUMS.txt。annotated Tag绑定准确产品source；先上传draft、核对身份及Tag CI，再以Pre-release公开，保留旧Tag、附件和Latest。公开附件匿名全字节回读与本地完整SHA/长度核对。

## 验收边界与收尾

用户认可本地STRM收窄效果，隔离模板/样式覆盖宽窄视口及其他页面不变；这些证据不扩展为系统安装、真实播放、远控或硬件验收。本次不修改现用客户端、个人资料或服务器，不升级运行时或依赖。

按真实结果同步发行核验、首页下载入口、PACKAGING、文档索引、状态及日志，产品来源与后续文档HEAD分开记录。旧发行资产不替换；出现失败保留原日志和产物，修正后使用新输出名。

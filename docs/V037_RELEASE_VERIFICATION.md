# v0.3.7 发行核验

当前为发行准备，尚未建立产品Tag或公开Release。用户已明确授权本版Pre-release闭环；Stable/Latest保留v0.3.1，既有Release及附件保持。最终安装器将从合并后的准确main源码重新构建，本地wrapper ZIP不作为发行安装器来源身份。最终main、标准安装器、公开下载及文档HEAD在完成后分别记录。

## 授权与用户反馈

用户按父会话验收清单第1—4和第6项反馈正常，记录为该候选已测场景的USER_REPORTED_NORMAL，不扩写具体媒体、硬件或系统矩阵PASS。第5项电源/退出组合因缺环境未测，随后由用户明确暂缓，后续使用发现问题再反馈；该项为USER_DEFERRED_NOT_TESTED，不作为本轮发布等待条件。

已审本地产品source为`1246da1023c43981c7ed40a4e556cb95c7eb7e02`，文档快照`ebaed19f0c14849626149cf24215cf3112324f43`；父审核的生产路径77/77、artifact302/302和最终977/200门禁及隐藏合成证据保持其原层级。旧ZIP为240504661 bytes，SHA `9e7ea2d64df19838e2942674f4efbe23be54cfeff8b0eadab74fea281180ed6c`，旧目录、profile和日志保留，不读、不删、不入发行包。

## 发行合同

先核对累计差异与PR精确head，CI及父审通过后合并。最终main产品源码必须与已审候选的产品tree一致，使用固定输入/工具链构建标准runtime和安装器，解包逐路径/SHA与完整集合核对。Tag精确指向该产品source；后续文档HEAD分开，不重标产品Tag。

五附件为标准Windows x64安装器、同名provenance JSON、单文件.sha256、同源RELEASE_NOTES.md及SHA256SUMS.txt。公开后匿名完整GET或按序Range覆盖全部字节回读，对照大小、SHA、provenance与两份校验/notes关系；上传成功和GitHub digest不替代下载验证。发布后核对PR闭合、main/Tag/CI、draft=false、prerelease=true、Latest仍v0.3.1及旧Release静态元数据/附件身份保持。

本授权不含系统安装、主动前台、个人凭据/旧profile读取、真实服务器写入或后续版本实现。电源组合暂缓不补写为PASS，也不恢复缓存或切轨研究。详细历史本地候选及分层证据见[本地候选](V037_LOCAL_CANDIDATE.md)。

# v0.4.9 测试版核验

## 当前状态

准备发布 Windows x64 testing；本轮已获准在测试和构建通过后合入main并发布，正式Latest保持v0.4.0。准确发行来源及终态在实际完成后补记，不将待执行写成成功。

## 来源与范围

基线main为`51eb44921f614defad8126d44cfaa54f3c9f4333`，已验收焦点候选为`d63043837b103df7c19272e5ff29dd434728c2ab`，候选核验补记为372930b。发行准备仅同步根package／lock三处应用版本到0.4.9、发行说明与文档；所有src、运行时manifest、loader、native、工具、安装器、工作流及依赖包选择保持候选，不混入独立缓存／预载实验或EWT插件修改。

Electron从44.4.2更新到固定44.5.0，修复Windows原生JavaScript对话框的焦点恢复；具体上游PR、归档／文件树／loader哈希及守卫见[焦点修复来源](ELECTRON_4450_FOCUS.md)。不增加全局focus／blur或模拟切换窗口。保留0.4.8下载管理、全剧／本季已看筛选及既有用户文件／任务合同。

## 验证计划与已有证据

已验收候选d630438的Windows公开CI41181127475为2308项：2303 pass／0 fail／5 skip；普通验收构建41181189855为完整2403项：2401 pass／0 fail／2 skip。实际44.5.0的processVersions、Koffi／WinRT／DWM接口绑定、隐藏窗口退出、安装器编译／解包回比通过；该普通0.4.8验收包不作为本版标准发行包。

本版版本／发布／运行时合同本地定向55/55通过，所有src、native、tools、installer、工作流、vendor清单及tests与d630438逐字节核对一致，锁文件包选择无变化。准确0.4.9源码仍须重新运行Windows公开CI及release_package=true标准发行构建；同源码成功后才正常合main、创建新v0.4.9 Tag并沿既有Manual verified release执行testing。公开后独立重新下载实际Release五附件并核对字节、来源、校验表与notes。旧Actions ZIP的Forbidden限制保持，不重试或换通道读取旧目标。

## 验收边界

焦点候选已完成用户验收；助手没有操作现用前台、登录真实Emby或独立执行该用户环境的可见复现。用户反馈与自动化分开。隐藏窗口SMTC／DWM／capture等使用替身，不等同于可见系统媒体、所有硬件、真实播放／远控或完整Windows安装生命周期验证。正式Latest和既有Release／Tag／附件保持。

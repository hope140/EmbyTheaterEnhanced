# 共享播放缓存：独立Windows合成验收

状态：仅工具／测试接线已准备，本机未执行Windows Electron或helper。普通应用及内核文件保持原字节；`225827a`首次Windows CI已见失败，未打包，实际栈尚待读取。测试夹具另提交canonical目录／固定guard端口预检和失败清理；Linux通过不代表Windows问题已经解决。必须新的Windows CI通过后才构建一次独立候选。

## 来源与执行边界

`windows-contract.cjs`固定产品内容基线为`929b68e32a5abd90ebfb777499ce9050bc6d145d`。这是测试夹具修正提交，相对225827a的src/native/vendor/installer/package内容无变化。工具公开入口必须显式给candidateCommit，仅允许该基线或产品树相同的当前工具HEAD；不按名称、日期或最近成功包自动选来源。普通UI推荐把最终工具HEAD同时作为唯一新包来源，避免分支漂移和重复构建。

门禁逐层绑定独立提供的installer SHA、schema1安装回执、schema3物理build-manifest、完整文件集合／payload摘要／可选size、三个provenance绑定、全部维护源码Git blob及native／固定Electron身份。Electron使用original-fs核物理ASAR，不忽略文件、不改原清单。工具、fixture、rendererBoot和workflow另记录精确工具提交／文件摘要。旧225包或过期162包没有替代入口。工具自身接受Git原字节或严格等价的CRLF checkout，分别记录来源／实际文件摘要；拒绝BOM、混合换行和正文改动。

只在专用Windows runner运行：本地生成无音轨AVI A16s／B8s／C8s，固定320×180、A12fps／B/C24fps，8-bit DIB；各11,065,064B。逐帧写入文件，不在内存拼整片，无编码器或媒体下载依赖。HTTP和真实gRPC fixture只监听127.0.0.1；同一协调器维持相同origin至全部重开阶段，避免换端口导致身份变化。只有synthetic测试字符串，无真实NAS／115／账户。

worker使用候选真实BrowserWindow、原生IPC main-frame边界、Alameda／PlaybackManager／libmpv插件、source resolver、CD2 service／真实gRPC transport、authority、service、controller及helper。不会直接issue/bind伪造proof、替换helper属性／EOF，也不直接调用range-preload驱动自然切集。

为提供有界测试页面，仅候选精确index文件URL被独立Electron session映射为空harness shell；真实模块从已核验runtime读取。候选文件不改，普通main bootstrap和登录／完整用户UI不执行，因此不能把本验收称为普通安装／可见界面验收。窗口保持hidden；首帧指main进程取到真实native解码preview，seek还需真实位置与playback-restart，再取得颜色通道非黑的帧；不是屏幕可见首帧、无声卡或画质保证。

## 手动CI入口

使用已有`.github/workflows/public-ci.yml`／Public offline CI，选择本独立分支的最终工具SHA。

当前先取Windows首错，不需要artifact或Native：

~~~text
release_package=false
build_input_benchmark=false
shared_cache_smoke=false
shared_cache_diagnostics=true
benchmark_expected_sha=<精确40位工具SHA>
artifact相关三项留空
~~~

仅执行`windows-shared-cache-diagnostics`：固定9个相关文件，各自新Node进程、TAP即时输出、25s单文件／150s总界；任何失败或超时非零，未执行项不能算通过。不用test-force-exit，超时后的后代进程不冒称已确认关闭。无需Actions artifact读取权限／GitHub token、完整构建输入或媒体下载；只上传自有合成测试TAP与摘要，其中可含标准CI源码／临时目录栈，不含用户环境。先用独立失败与泄漏句柄夹具验证栈能在进程结束前输出、外层超时仍失败。

前次[Windows CI 40209021958](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40209021958)最终40分钟取消；完整日志只有16个失败名，末条16:05:07，没有AssertionError／stack，不能认定首因是EACCES、路径或25ms期限。规范化目录和端口预检是补齐已知测试前提，不是已经得到Windows修复证据。新诊断先取得真实断言；公共runner也切TAP，保留原测试集合、非零结果及六项材料排除不变。

Windows诊断和该SHA的push CI均通过后，再只运行一次普通测试包：

~~~text
release_package=false
build_input_benchmark=false
shared_cache_smoke=false
shared_cache_diagnostics=false
其余输入留默认
~~~

拿到该SHA成功manual package的artifact ID、ZIP SHA256及installer SHA256后，保持同一工具ref，用正常UI单次选择：

~~~text
release_package=false
build_input_benchmark=false
shared_cache_smoke=true
shared_cache_diagnostics=false
benchmark_expected_sha=<精确40位工具SHA；该模式必填>
shared_cache_artifact_id=<上述准确artifact ID>
shared_cache_zip_sha256=<已核验ZIP SHA256>
shared_cache_installer_sha256=<已核验installer SHA256>
~~~

此模式只执行`windows-shared-cache-smoke`，不进入打包／benchmark，不重编内核或全量安装包。独立并发组、原组不变；仅job级contents/read和actions/read，无写权限／新secret。固定Node24.18.1，依赖按锁文件安装且不执行scripts；仅为静态解包复用仓库已锁定innounp及原来源／SHA，不安装或执行installer，不准备整套编译工具链。任何下载拒绝／artifact过期都失败并保留来源，不改用其他包、镜像或路径；需要父协调新的明确来源。

GitHub token只给api.github.com，artifact302用另一个无认证客户端下载；进入工具／native前移除GH_TOKEN。ZIP有准确SHA、大小、路径、条数及解压体积边界。候选完整性通过后才生成新owned profile，逐段验证全部子目录、owner和runtime不重叠，启动前及每个worker再次校验，拒绝junction／symlink。APPDATA、LOCALAPPDATA、MPV_HOME、TEMP、session／logs／crash均隔离。未创建或复制普通profile。

总native协调deadline120s，每个worker最多40s，超时不放宽；只退出已记录所属Electron／helper。父进程终止不自动算helper已退出，缺回执必须标UNCERTAIN。HTTP响应、socket、gRPC关闭也要有回执，真正close失败不能吞掉当PASS。

## 四阶段判据

1. baseline：同一候选／同一合成CD2链，关闭共享开关。取得A解码帧、向前8s／回2s的seek及停止时间。
2. natural：测试开关启用，M使用既有300MiB值，P沿产品300十进制MB，触发70%。A必须选中shared代理；真实进度经renderer发现队列B，B预载ready；A自然EOF经原manager next切B、B也必须选shared且解码。B开始后的源请求只许独立1B probe，不能重复暖正文。
3. reopen：新Electron／新helper、同owned profile和相同源origin。先有保留的实际B且next=0；重新授权探测后解码B，整个阶段B源请求只许0–0探测，正文回源即失败。仅“文件存在／代理已选中／播放成功”均不够。
4. cancel：另一实际A开始后才清旧B；真实70%预载B到受控1B后挂起。走原manager Stop／destroy，必须找到同一B requestId的held→实际response close→晚发尝试0记录，无旧native事件。没有真实held请求不能空跑通过。

停止后读回已关闭store，next／pending／reader／reserved均须0；自然／重开阶段实际缓存须仍存在。每个真实helper需handshake、exit0和child close，Electron也需exit／流关闭。M＋P、源版本／账户／崩溃恢复大矩阵沿前轮独立证据；小AVI全小于P并非真实长影片预热全覆盖。

安全结果输出到CI日志`SHARED_CACHE_WINDOWS`，只上传candidate-source、coordinator及各phase／stage JSON。plan、source URL、profile路径、fixture媒体、token、原始stderr不上传；loader错误仅保留固定标签和系统数字码。报告保留1天。

一次A/B是接线／故障探针，报告原始毫秒值；不以单次噪声或绿色workflow宣布性能无退步。正式性能门禁仍需成组首帧／seek／卡顿样本与Windows实际条件，真实115请求保持0。

## 已解包环境直接执行

先核工具SHA、候选独立来源及摘要，再用固定Node24.18.1／PowerShell7：

~~~powershell
./tools/shared-playback-cache/windows-run.ps1 -RuntimeRoot "$RuntimeRoot" -Installer "$Installer" -InstallerSha256 "$InstallerSha256" -ProductCommit "$ReviewedPackageSHA" -OutputRoot "$FreshOwnedOutput"
~~~

Output必须是新目录。该命令不安装，不访问真实服务器，不替用户准备真实账号；不能在Work前台执行。本轮没有运行以上Windows命令，也没有自行dispatch。

本轮最终Linux串行完整回归2656项：2643通过、0失败、13项既有平台跳过；JS563／PowerShell53语法通过。一次本地回归发现坏块剔除用例与成功源回填并发的测试假设冲突，现明确跳过该用例的回填写，只测坏块拒绝／剔除，正文SHA与坏数据命中0B断言保持；不作为Windows首因。Windows平台的新诊断及真实helper短验均尚待父用普通UI单次运行，不能据此宣称Windows回归已修好。

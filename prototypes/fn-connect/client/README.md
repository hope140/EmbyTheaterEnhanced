# FN认证客户端独立实验

默认关闭、产品源码树外的可运行实验，**不是已验收的ETE功能或FNConnect SDK**。复用既有Emby映射，NAS正常授权与Emby登录独立；不注册服务或安装NAS组件。

## 运行本地实验

使用既有Node工具链，不下载依赖、不访问NAS：

```sh
node --test tests/fn-connect-client.test.cjs
node --test tests/fn-connect-*.test.cjs
```

在具有正常桌面和沙箱的环境，用固定Electron44.4.2运行：

```sh
<electron-44.4.2> prototypes/fn-connect/client/electron-main.cjs --fn-connect-prototype --fixture
```

不带 `--fn-connect-prototype` 即退出，不创建Session、窗口或实验服务器。`--fixture`只用回环合成服务。依次点击“添加连接并打开认证窗口”、合成NAS页中的授权按钮、“进入Emby网页”、“验证连接”；可添加同地址第二连接检查隔离。“合成Range测试”仅验证本机媒体桥，不证明Native播放。

可选自动窗口验收入口（只在本机合成表单执行脚本）：

```sh
<electron-44.4.2> prototypes/fn-connect/client/electron-main.cjs --fn-connect-prototype --fixture-smoke
```

输出明确保留 `realFNConnect: NOT_TESTED`、`nativeHelperPlayback: NOT_TESTED`；只有合成网关实验，不是fnOS实证。

## Windows固定运行时验收（合成链已通过，真实FN未验）

在干净的Windows工作副本运行，保留正常沙箱：

```powershell
./prototypes/fn-connect/client/run-windows-smoke.ps1
```

脚本仅从官方GitHub下载固定 `electron-v44.4.2-win32-x64.zip`，执行前校验SHA256：

```text
6aae435b6cd5c0eedf9fd38824bae4045ffdaecd029f0b8c8328bac3f5b71f03
```

输入和[官方SHASUMS](https://github.com/electron/electron/releases/download/v44.4.2/SHASUMS256.txt)定位固定在 `electron-input.json`，不安装到系统、不构建主应用。应用请求仅使用127.0.0.1合成服务，不访问真实NAS。脚本使用自己新建的临时目录；Electron测试profile归runner持有，确认进程退出后删除并回读。进程等待最多90秒，终止和输出管道各另有5秒观察上限；未确认退出或清理则失败，不把强杀当正常关闭。

真实Electron验收覆盖：正常表单建立HttpOnly Cookie、同地址不同Session隔离、绑定Session的HTTP请求、Range/206/416、本机媒体桥、外链302不带认证、携带同源Cookie的WS升级和原始字节桥、握手期/请求头期/媒体流取消、逐连接关闭、Cookie清除与合成过期挑战。WS字节回显不是Emby应用协议或浏览器WebSocket规范验收。控制面板preload还回读实际 `process.sandboxed` 与 `process.contextIsolated`；不禁用沙箱、证书校验或webSecurity。

结果仅写 `test-output/fn-connect-fixture/result.json`：白名单阶段、布尔检查、源码commit、固定运行时哈希与版本、进程退出和profile删除核验。有限诊断事件另直接输出到日志：HTTP/IPv4回环监听、请求到达计数、响应状态、预定义Chromium错误码和代理路由分类；不输出代理地址，也不修改路由。原始stdout/stderr、Cookie值、URL及系统路径均不进入回执；已有输出目录时拒绝覆盖。缺任意阶段/检查、失败退出、超时或未清理都不能PASSED。

独立 [workflow](../../../.github/workflows/fn-connect-fixture.yml) 使用 `windows-2022`、固定Node和Actions commit，只读仓库权限，10分钟上限；artifact名称包含源码SHA/run/attempt，仅上传归一JSON并保留1天。只匹配本功能分支及实验相关路径的push；push与运行由维护者统一执行。仓库原有push CI仍按原规则运行，本workflow不调度安装包或Release。

该新workflow未进入默认分支；GitHub要求默认分支已存在workflow才能从UI手动运行，所以本次通过精确功能分支push启动，不为登记而修改main。参见[GitHub手动运行说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)。

[首轮Windows任务](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40109272968)中Node回归通过，真实Electron进入BOOTSTRAP后报NETWORK_ERROR并排空；没有通过完整Session验收。已用真实Node Writable复现适配器缺陷：固定[Electron44.4.2源码](https://github.com/electron/electron/blob/v44.4.2/lib/common/api/net-client-request.ts)的ClientRequest采用autoDestroy Writable，其上传finish可能先触发close、之后URLLoader才给response；原型不应把这个close当作网络失败或提前移除取消监听。

修正提交 `29c05e89577eb384d56b0c30fe68a512c396dff1` 的[Windows run40110209174](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40110209174)/job120920160298通过。正常沙箱Electron44.4.2实际运行，日志完整覆盖所有阶段并由严格归一门禁回报PASSED；日志也实证请求先close、后200/401/206/416或302响应，确认上述适配缺陷。HTTP/IPv4回环监听、两次合成表单授权、公开信息2次成功与1次拒绝均在白名单计数中；Session HTTP、同源Cookie供WS字节桥使用、媒体桥、外链隔离、取消、过期和关闭清理属于本机合成实证。

这不证明真实FN网关的Cookie作用域、授权协议、HTTPS/跨域部署或Emby媒体兼容性。未访问NAS、取得真实凭据、验证Native Helper/libmpv播放或实现HLS/DASH；不据此提供正式功能验收包。

## 已实现的接口与边界

- 独立本地控制面板，用户主动添加连接；每连接内存Session。正常登录窗口无ETE preload，不注入账号、密码、签名或OAuth拦截器，启用sandbox/contextIsolation/webSecurity及默认TLS校验。
- `controller`提供start/showTarget/verify/request/webSocket/close；HTTP显式绑定Session并手动处理有界重定向。公开Emby信息形状及可选ServerId检查通过才ready。
- 调用方不能提供Cookie、Host或代理认证头。目标限定已配置Emby源和路径；未知HTML200、普通401/403与网络错误不自动当作FN过期。已确认挑战才触发needs-auth。
- 认证代次及verify顺序阻止迟到ready；取消/关闭退休所属请求，close等待owner排空再清Session。没有远端有效期猜测或自动重登。
- 本机媒体桥仅监听127.0.0.1随机端口。opaque capability对应固定连接和上游路径，Range/206/416按字节流传递，没有任意URL查询代理、缓存或Set-Cookie外泄。
- 外链仅限媒体请求及明确允许的源；本进程不代取外链，由不持有FN/Emby请求头的消费者跟随302。累计每跳已知凭据，疑似凭据进入Location则拒绝。匹配仅覆盖已知值和有限URL解码，不是对恶意服务端编码外泄的完整证明。未知外链默认拒绝。
- WS同源upgrade/字节转发，取消会销毁所属socket。Node升级仅在Session明确返回DIRECT时使用；Session或环境代理配置返回WS_PROXY_UNSUPPORTED，绝不静默转为直连。
- HLS/DASH当前明确拒绝。仅透传播放列表会让相对/绝对分片丢失授权桥，不能假装支持。真实字幕、转码、Native Helper/libmpv及生产PlaybackManager未接入。

生产main、添加服务器UI、Web API、Native Helper、vendor、固定依赖和打包清单均未修改。这里的request/lease是后续接线接口，不等于已经接入正式客户端。

## 待协调的真实手动验证

正常可达桌面环境中，不带fixture启动；输入已确认的NAS正常入口和Emby转发URL。用户自行在正规页面完成账号/2FA/访问码，不提供这些值给工具；不读取系统浏览器令牌、不保存NAS明文密码。

若正常认证涉及其他已确认HTTPS源，可在仓库外准备无凭据配置：

```json
{
  "bootstrapUrl": "https://nas.example.test/device-entry",
  "embyUrl": "https://media.example.test/",
  "probePath": "System/Info/Public",
  "authOrigins": ["https://confirmed-auth.example.test"],
  "externalMediaOrigins": ["https://confirmed-media.example.test"]
}
```

```sh
<electron-44.4.2> prototypes/fn-connect/client/electron-main.cjs --fn-connect-prototype --profile-config <private-config.json>
```

以上均为示例域名；不能由FNID猜测应用子域。配置拒绝账号密码、Cookie、token及未知字段。authOrigins只接受已确认正常跳转源，不自动放行整个FN域后缀；未知跳转/弹窗提示待核对。实验自己的临时目录仅正常退出时删除，不是跨重启持久授权功能。

最短验证清单：

1. 独立空会话访问Emby；同会话正常授权NAS后再次访问。另一个全新会话对照，不能仅凭现象认定是domain Cookie或IP授权。
2. 仅记录脱敏域名/路径及Cookie名称、Domain、Path、SameSite、有效期、Secure/HttpOnly。不要导出值、授权查询参数、账号数据或完整HAR。
3. 核对公开Emby信息/ServerId，然后保留原Emby登录；分别验证API、WS、Range/seek、取消、过期和302。页面打开不代表媒体接通。
4. HLS/DASH及正式Native播放当前不在可验收范围。遇协议或权限拒绝则停止，不改NAS、不关认证、不猜端点、不扩大权限。

## 当前证据与阻塞

81项FN相关Node测试通过：客户端35项、Windows场景编排1项、回执3项、既有42项。Windows编排在本机真实HTTP/WS I/O与合成Session适配器上验证；合成Jar不是ChromiumJar或fnOS，回执门禁测试也不证明Electron启动。

官方固定Electron44.4.2 Linux包SHA256为 `ad71063e77da29a647f872b090478f9fa9ccffd67de7b2ae6315409cf1f13436`，已核对。正常沙箱启动在应用代码前因SUID helper未配置中止；未改setuid、使用--no-sandbox或安装系统组件，该Linux尝试未进入GUI/ChromiumCookieJar验收。Windows首轮实际启动结果单独记录如上。

真实FN入口此前被研究环境HTTPS代理CONNECT403阻断，未取得NAS认证响应；不是NAS返回403。未绕过或真实登录。当前不打功能验收包，不宣传FNConnect打通。

## 来源和许可

代码为ETE自行编写，没有复制第三方实现、签名、凭据或客户端身份。机制参考：

- [Electron Session](https://www.electronjs.org/docs/latest/api/session)、[ClientRequest](https://www.electronjs.org/docs/latest/api/client-request)、[安全建议](https://www.electronjs.org/docs/latest/tutorial/security)。
- [fnos-git-auth 29b961351ea5cc9b37db8026829944b73c180aae](https://github.com/donnel666/fnos-git-auth/tree/29b961351ea5cc9b37db8026829944b73c180aae)，根MIT；其无2FA、密码持久化、通配域行为不采用。
- [fntv-electron bb30d12820b1d2500d39e9feeb6548432e485783](https://github.com/QiaoKes/fntv-electron/tree/bb30d12820b1d2500d39e9feeb6548432e485783)，根GPLv3；不采用其影视token、签名或登录注入。
- [飞牛访问码说明](https://help.fnnas.com/articles/v1/safety/access-code)：入口门与账号登录不同，真实挑战仍需该目标合法响应确认。

# 正常桌面只读检查：仅准备，当前不执行

入口复用已通过Windows合成验收的 `../client/electron-main.cjs`，不增加新运行代码、安装包或NAS组件。以下步骤留待用户决定验证后在正常Windows桌面执行；本轮未启动入口、登录或访问NAS。

这里的“只读”是操作范围：不改NAS/Emby/dian115配置，不播放、不读取媒体库，只检查正常授权后能否GET Emby公开信息。它不是NAS权限沙箱；在官方页面登录本身会建立授权会话，必须由用户以后主动完成，不能宣称完全无服务端状态变化。

## 准备无凭据输入

把本目录 `profile.example.json` 复制到仓库外的私人文件，再填入已确认的NAS正常入口和现有Emby转发地址。不要填写密码、Cookie、token、授权查询参数或媒体链接，不把填写后的文件提交到Git。示例域名必须替换，不能直接用于真实验证。

`probePath` 保持 `System/Info/Public`；`externalMediaOrigins` 保持空数组，本轮不验证外链播放。`authOrigins` 只填正常官方认证确实跳转到的HTTPS源，不猜域名、不放行通配后缀。若已知真实Emby ServerId，可另加 `expectedServerId`；未知时不要编造，通过ready也不等于完成服务器身份比对。

## 在正常桌面启动

使用独立官方 [Electron44.4.2 Windows x64 ZIP](https://github.com/electron/electron/releases/download/v44.4.2/electron-v44.4.2-win32-x64.zip)，不要使用或替换现用ETE安装目录中的程序。以下命令仅供以后在仓库根目录执行，ZIP和私人JSON的相对路径按本机实际位置填写：

```powershell
$fnCheckArchive = '..\electron-v44.4.2-win32-x64.zip'
$fnCheckConfig = '..\fn-connect-private.json'
if ((Get-FileHash -LiteralPath $fnCheckArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '6aae435b6cd5c0eedf9fd38824bae4045ffdaecd029f0b8c8328bac3f5b71f03') {
    throw 'FN_CHECK_ELECTRON_HASH_MISMATCH'
}
$fnCheckRuntime = Join-Path $env:TEMP ('ete-fn-readonly-' + [Guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $fnCheckArchive -DestinationPath $fnCheckRuntime
& (Join-Path $fnCheckRuntime 'electron.exe') .\prototypes\fn-connect\client\electron-main.cjs --fn-connect-prototype --profile-config $fnCheckConfig
```

脚本片段不自动下载或登录，不传fixture/smoke参数，不改沙箱、TLS、系统代理、防火墙或端口映射。独立控制面板打开后，只有用户按“添加连接并打开认证窗口”才开始正常入口访问；此后官方页面自身请求不属于受控Emby API请求层，不能宣称整个网页登录只发GET。

## 最短检查及停止条件

1. 保留默认公开信息路径和输入地址；主动添加一个连接。在官方认证窗口由用户自行输入页面要求的账号/2FA/访问码，不提供这些值给工具，也不把系统浏览器Cookie复制进来。
2. 在同一连接内点“进入Emby网页”，再点“验证连接”。无需为本轮检查输入Emby密码或浏览媒体；公开信息验证成功只代表此时该连接可读公开API，未知ServerId仍保持未比对。Emby账号登录及媒体权限继续独立。
3. 若要判断是否共享浏览器授权，可另加同地址的新连接做空会话对照；用户自行控制是否继续授权。新连接也能访问不能单凭此认定Cookie共享，还可能是网关/IP等机制。
4. 只回报固定状态/错误码，以及确有必要的脱敏跳转源和Cookie名称、Domain、Path、SameSite、Secure/HttpOnly及有效期元信息。不要导出Cookie值、授权参数、完整HAR、媒体URL、账号或原始诊断日志；当前入口没有自动收集这些材料的功能。
5. 未知官方跳转/弹窗、认证挑战未分类、证书警告、权限拒绝或网络错误时停止该检查。不关认证、不改NAS、不猜私有接口、不通过扩大允许源解决未知问题。关闭控制面板/移除连接，实验会清理其内存会话；强制终止不等于清理已确认，不对异常退出的临时目录作已删除承诺。

## 本轮不验收

不点播放，不把公开信息ready当成真实FN全部接通，不测试Native、字幕、转码、HLS/DASH、外链302或中继带宽。后续媒体验证必须先确认本轮真实认证合同，再另外约定用户已有合法媒体与最小范围。

这只是已有原型的准备说明和无凭据模板；本说明与命令未做真人桌面/NAS验证。已经完成的两轮Windows合成实证和决策边界见[短结论](../../../docs/FN_CONNECT_DECISION.md)。

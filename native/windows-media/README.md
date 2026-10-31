# Windows原生媒体模块

v0.4.3起，普通Windows x64安装默认装配并启用WinRT/SMTC及DWM预览。沿用已验收的一秒generation绑定截图、五个系统媒体命令及幂等退出；不改变原双窗口、播放管线、队列或缓冲配置。

Koffi及@koromix/koffi-win32-x64固定3.3.3，来源为官方npm注册表；package-lock.json与registry-input.json绑定归档SHA256、SHA512 integrity和完整成员SHA。按白名单解包，不执行安装脚本。两个包的元数据均声明MIT；主包包含LICENSE.txt及两份Node API依赖通知，原生子包没有独立LICENSE文件。装配保留各锁定成员；最终包内通知与原生成员的覆盖关系仍须按[逐项核对](../../docs/SIGNPATH_V047_GAPS.md)确认，不能声称两个包各有完整许可证文件。

普通构建由windows-native-media-input.cjs物化三个Git源模块、锁定依赖及同一固定Electron Vulkan loader副本；windows-native-media-provenance.json逐项绑定来源。普通打包强制复核，不依赖旧包、trial变量或人工覆盖。系统DLL保持只从系统目录加载，不安装服务、SDK或GPU驱动。

当前整合边界及分层验收见[公开核验说明](../../docs/V043_NATIVE_PREVIEW.md)。真实Windows、普通安装和DWM表现须与合成/来源检查分别记录。

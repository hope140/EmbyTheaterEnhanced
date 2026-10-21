@echo off
::启用延迟环境变量扩展
setlocal enabledelayedexpansion

::提升批处理脚本管理员权限
Pushd %~dp0 & cd /d "%~dp0"
%1 %2
mshta vbscript:createobject("shell.application").shellexecute("%~s0","goto :runas","","runas",1)(window.close)&goto :eof
:runas
CD /D "%~dp0"

::删除旧版残留文件
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\禁用媒体库背景图模糊化.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\启用媒体库背景图模糊化.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\禁用停靠窗口自适应缩放.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\启用停靠窗口自适应缩放.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\背景图模糊化【禁用】.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\背景图模糊化【启用】.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\窗口停靠缩放【禁用】.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\窗口停靠缩放【启用】.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\完全卸载客户端.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\修复客户端权限.lnk"
del /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater\重建数据库缓存.lnk"
del /s /q "%appdata%\mpv\Anime4K\Anime4K.conf"
del /s /q "%appdata%\mpv\Anime4K\Anime4K-off.conf"

::导入初步配置
xcopy /I /Y "%~dp0external\Presets\fonts" "%appdata%\mpv\fonts"
xcopy /I /Y "%~dp0external\Presets\mpv.conf" "%appdata%\mpv"

::终止异常进程
taskkill /f /im Emby.Theater.exe
taskkill /f /im electron.exe

::管理员获取目录权限
cd %~dp0 && cd.. 
cacls "Emby Theater" /e /g everyone:f Administrator:f
attrib -s -r -h "Emby Theater"

::提示对话框
start mshta vbscript:msgbox("由于【Windows 10】或更高版本的系统在安装更新补丁后会重置【Program Files】目录权限。如遇到客户端双击无法运行时，可点击【开始菜单】并转到【Emby Theater】运行【配置和卸载工具】选择【修复客户端目录权限】即可。",0,"【Emby 桌面客户端】已安装完成")(window.close)&&exit

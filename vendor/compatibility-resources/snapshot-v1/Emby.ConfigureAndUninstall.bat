@echo off
color 1f
::启用延迟环境变量扩展
setlocal enabledelayedexpansion

::提升批处理脚本管理员权限
Pushd %~dp0 & cd /d "%~dp0"
%1 %2
mshta vbscript:createobject("shell.application").shellexecute("%~s0","goto :runas","","runas",1)(window.close)&goto :eof
:runas
CD /D "%~dp0"

:界面菜单
::工具主页菜单
TITLE Emby Theater for Windows(Carnival) 配置工具
echo.
echo.√  01. 启用媒体库背景图模糊化（默认）
echo.
echo.√  02. 禁用媒体库背景图模糊化
echo.
echo.√  03. 启用停靠窗口自适应缩放（外部播放器专用）
echo.
echo.√  04. 禁用停靠窗口自适应缩放（默认）
echo.
echo.√  05. 启用弹幕功能扩展（内部播放器专用）
echo.
echo.√  06. 禁用弹幕功能扩展（默认）
echo.
echo.√  07. 启用SVP补帧扩展（内部播放器专用）
echo.
echo.√  08. 禁用SVP补帧扩展（默认）
echo.
echo.√  09. 启用Anime4K滤镜扩展（内部播放器专用）
echo.
echo.√  10. 修复客户端目录权限（针对双击无法打开）
echo.
echo.√  11. 清除所有服务器账户
echo.
echo.√  12. 清除日志和页面缓存
echo.
echo.√  13. 完全卸载客户端
echo.
echo.√  00. 退出工具
echo.
set /p choice=输入序号选择要执行的项目:  
if /i "%choice%"=="1" goto 启用媒体库背景图模糊化
if /i "%choice%"=="01" goto 启用媒体库背景图模糊化
if /i "%choice%"=="2" goto 禁用媒体库背景图模糊化
if /i "%choice%"=="02" goto 禁用媒体库背景图模糊化
if /i "%choice%"=="3" goto 启用停靠窗口自适应缩放
if /i "%choice%"=="03" goto 启用停靠窗口自适应缩放
if /i "%choice%"=="4" goto 禁用停靠窗口自适应缩放
if /i "%choice%"=="04" goto 禁用停靠窗口自适应缩放
if /i "%choice%"=="5" goto 启用弹幕功能扩展
if /i "%choice%"=="05" goto 启用弹幕功能扩展
if /i "%choice%"=="6" goto 禁用弹幕功能扩展
if /i "%choice%"=="06" goto 禁用弹幕功能扩展
if /i "%choice%"=="7" goto 启用SVP补帧扩展
if /i "%choice%"=="07" goto 启用SVP补帧扩展
if /i "%choice%"=="8" goto 禁用SVP补帧扩展
if /i "%choice%"=="08" goto 禁用SVP补帧扩展
if /i "%choice%"=="9" goto 启用Anime4K滤镜扩展
if /i "%choice%"=="09" goto 启用Anime4K滤镜扩展
if /i "%choice%"=="10" goto 修复客户端目录权限
if /i "%choice%"=="11" goto 清除所有服务器账户
if /i "%choice%"=="12" goto 清除日志和页面缓存
if /i "%choice%"=="13" goto 完全卸载客户端
if /i "%choice%"=="0" goto 退出工具
goto :eof

:启用媒体库背景图模糊化
call :结束进程
xcopy /y "%~dp0external\emby.enable\www\modules\themes\darkgradient\theme.css" "%~dp0electronapp\www\modules\themes\darkgradient\theme.css"
xcopy /y "%~dp0external\emby.enable\www\modules\layout.css" "%~dp0electronapp\www\modules\layout.css"
call :启动程序
cls
goto 界面菜单
goto :eof

:禁用媒体库背景图模糊化
call :结束进程
xcopy /y "%~dp0external\emby.disable\www\modules\themes\darkgradient\theme.css" "%~dp0electronapp\www\modules\themes\darkgradient\theme.css"
xcopy /y "%~dp0external\emby.disable\www\modules\layout.css" "%~dp0electronapp\www\modules\layout.css"
call :启动程序
cls
goto 界面菜单
goto :eof

:启用停靠窗口自适应缩放
cls
set "file_path=%~dp0electronapp\main.js"
if exist "%file_path%" (
    powershell "(Get-Content \"%file_path%\" -Encoding UTF8) -replace \"sendJavascript\(``window.platform\", \"//sendJavascript(``window.platform\" -replace \"transparent: true\", \"transparent: false\" | Set-Content \"%file_path%\" -Encoding UTF8"
    if %errorlevel% equ 0 echo 已成功更新
) else (
    echo 找不到文件
)
call :结束进程
call :启动程序
cls
goto 界面菜单
goto :eof

:禁用停靠窗口自适应缩放
cls
set "file_path=%~dp0electronapp\main.js"
if exist "%file_path%" (
    powershell "(Get-Content \"%file_path%\" -Encoding UTF8) -replace \"//sendJavascript\(``window.platform\", \"sendJavascript(``window.platform\" -replace \"transparent: false\", \"transparent: true\" | Set-Content \"%file_path%\" -Encoding UTF8"
    if %errorlevel% equ 0 echo 已成功更新
) else (
    echo 找不到文件
)
call :结束进程
call :启动程序
cls
goto 界面菜单
goto :eof

:启用弹幕功能扩展
::禁用延迟环境变量扩展
endlocal
cls
set "file_path=%~dp0electronapp\www\index.html"
if /I exist "%file_path%" (
    if %errorlevel% equ 0 (
        powershell -Command "(Get-Content '%file_path%' -Encoding UTF8) -replace '<!--弹幕接入预留勿删-->', '<script type=\"text/javascript\" src=\"https://danmaku.movie.kg/ext.js\"></script><link rel=\"stylesheet\" href=\"https://danmaku.movie.kg/ext.css\"/>' | Set-Content '%file_path%' -Encoding UTF8"
        echo 已成功更新
    )
) else (
    echo 找不到文件
)
call :结束进程
call :启动程序
cls
goto 界面菜单
goto :eof

:禁用弹幕功能扩展
::禁用延迟环境变量扩展
endlocal
cls
set "file_path=%~dp0electronapp\www\index.html"
if /I exist "%file_path%" (
    if %errorlevel% equ 0 (
        powershell -Command "(Get-Content '%file_path%' -Encoding UTF8) -replace '<script type=\"text/javascript\" src=\"https://danmaku.movie.kg/ext.js\"></script><link rel=\"stylesheet\" href=\"https://danmaku.movie.kg/ext.css\"/>', '<!--弹幕接入预留勿删-->' | Set-Content '%file_path%' -Encoding UTF8"
        echo 已成功更新
    )
) else (
    echo 找不到文件
)
call :结束进程
call :启动程序
cls
goto 界面菜单
goto :eof

:启用SVP补帧扩展
wmic ENVIRONMENT where "name='path' and username='<system>'" set VariableValue="C:\Program Files (x86)\SVP 4\mpv64;%path%"
setx /m PYTHONPATH "C:\Program Files (x86)\SVP 4\mpv64"
:: 旧版配置不启用但保留【Start】
::md "%appdata%\mpv"
::echo input-ipc-server=mpvpipe >> "%appdata%\mpv\mpv.conf"
::echo hwdec-codecs=all >> "%appdata%\mpv\mpv.conf"
::echo hr-seek-framedrop=no >> "%appdata%\mpv\mpv.conf"
:: 旧版配置不启用但保留【End】
cls
echo.
echo 已成功导入内部播放器【SVP】补帧工具所需的环境配置！！
echo.
echo SVP安装路径必须为【C:\Program Files (x86)\SVP 4】同时必须安装【libmpv based (64-bit)】扩展支持
echo.
pause
cls
goto 界面菜单
goto :eof

:禁用SVP补帧扩展
setx /M PATH "%PATH:C:\Program Files (x86)\SVP 4\mpv64;=%"
wmic ENVIRONMENT where "name='PYTHONPATH'" delete
:: 旧版配置不启用但保留【Start】
::del /s /q "%appdata%\mpv\mpv.conf"
::set "file_path=%appdata%\mpv\mpv.conf"
::if exist "%file_path%" (
    ::if %errorlevel% equ 0 (
        ::powershell "(Get-Content \"%file_path%\" -Encoding UTF8) -replace \"input-ipc-server=mpvpipe\", \"\" | Set-Content \"%file_path%\" -Encoding UTF8"
        ::echo 已成功移除
    ::)
    ::if %errorlevel% equ 0 (
        ::powershell "(Get-Content \"%file_path%\" -Encoding UTF8) -replace \"hwdec-codecs=all\", \"\" | Set-Content \"%file_path%\" -Encoding UTF8"
        ::echo 已成功移除
    ::)
    ::if %errorlevel% equ 0 (
        ::powershell "(Get-Content \"%file_path%\" -Encoding UTF8) -replace \"hr-seek-framedrop=no\", \"\" | Set-Content \"%file_path%\" -Encoding UTF8"
        ::echo 已成功移除
    ::)
::) else (
    ::echo 找不到文件
::)
:: 旧版配置不启用但保留【End】
cls
echo.
echo 已成功移除内部播放器【SVP】补帧工具所需的环境配置！！
echo.
echo SVP安装路径必须为【C:\Program Files (x86)\SVP 4】同时必须安装【libmpv based (64-bit)】扩展支持
echo.
pause
cls
goto 界面菜单
goto :eof

:启用Anime4K滤镜扩展
:: 旧版配置不启用但保留【Start】
::set "file_path=%appdata%\mpv\mpv.conf"
::if exist "%file_path%" (
    ::if %errorlevel% equ 0 (
        ::powershell "(Get-Content \"%file_path%\" -Encoding UTF8) -replace \"include = \"\"~~/Anime4K.conf\"\"\", \"\" | Set-Content \"%file_path%\" -Encoding UTF8"
        ::echo 已成功移除
    ::)
::) else (
    ::echo 找不到文件
::)
:: 旧版配置不启用但保留【End】
xcopy /E /I /Y "%~dp0external\Anime4K" "%appdata%\mpv"
::echo include = "~~/Anime4K.conf" >> "%appdata%\mpv\mpv.conf"
cls
echo.
echo 已成功导入内部播放器【Anime4K】滤镜着色器支持！！
echo.
echo 内部播放器【Anime4K】滤镜快捷键：启用——Ctrl + 1（数字键）
echo.
echo 内部播放器【Anime4K】滤镜快捷键：禁用——Ctrl + 0（数字键）或 Ctrl + `（英文键）
echo.
pause
cls
goto 界面菜单
goto :eof

:清除所有服务器账户
::弹窗确认是否要进行下一步
set Vbscript=Msgbox("是否要重建 Emby 桌面客户端（Emby Theater）交互界面数据缓存及用户配置 ？这个过程可能需要花费30秒左右，如超过这个时间建议重新执行！",1,"Emby 桌面客户端（Emby Theater）")
for /f "Delims=" %%a in ('MsHta VBScript:Execute("CreateObject(""Scripting.Filesystemobject"").GetStandardStream(1).Write(%Vbscript:"=""%)"^)(Close^)') do Set "MsHtaReturnValue=%%a"
set ReturnValue1=确定
set ReturnValue2=取消或关闭窗口
echo 你点击了!ReturnValue%MsHtaReturnValue%!
if %MsHtaReturnValue% == 1 (
goto 确认重建缓存
) else (
goto 退出工具
)
pause
:确认重建缓存
call :结束进程
cls
echo.正在清除缓存中......
cd %~dp0
rd /s /q cache
rd /s /q logs
rd /s /q data
::显示执行结果
start mshta vbscript:msgbox("Emby 桌面客户端（Emby Theater）交互界面数据缓存及用户配置已经重建完成",0,"Emby 桌面客户端（Emby Theater）配置工具")(window.close)
attrib -h -s -r -a %0
ping /n 3 127.1>nul
cd %~dp0
call :启动程序
goto :eof

:清除日志和页面缓存
call :结束进程
rd /s /q cache
rd /s /q logs
::删除文件夹
for /d %%F in ("data\electron\*") do (
    if /i not "%%~nxF"=="Local Storage" (
        echo Deleting folder: "%%F"
        rd /s /q "%%F"
    )
)
::删除文件
for %%F in ("data\electron\*") do (
    if /i not "%%~nxF"=="Local Storage" (
        echo Deleting file: "%%F"
        del /q "%%F"
    )
)
::显示执行结果
start mshta vbscript:msgbox("Emby 桌面客户端（Emby Theater）日志以及页面缓存已清理完成",0,"Emby 桌面客户端（Emby Theater）配置工具")(window.close)
goto :eof

:修复客户端目录权限
call :结束进程
::管理员获取目录权限
cd %~dp0 && cd.. 
cacls "Emby Theater" /e /g everyone:f Administrator:f
attrib -s -r -h "Emby Theater"
cd %~dp0
call :启动程序
goto :eof

:完全卸载客户端
::弹窗确认是否要进行下一步
set Vbscript=Msgbox("是否要卸载 Emby 桌面客户端（Emby Theater）？？？",1,"Emby 桌面客户端（Emby Theater）")
for /f "Delims=" %%a in ('MsHta VBScript:Execute("CreateObject(""Scripting.Filesystemobject"").GetStandardStream(1).Write(%Vbscript:"=""%)"^)(Close^)') do Set "MsHtaReturnValue=%%a"
set ReturnValue1=确定
set ReturnValue2=取消或关闭窗口
echo 你点击了!ReturnValue%MsHtaReturnValue%!
if %MsHtaReturnValue% == 1 (
goto 确认卸载
) else (
goto 退出工具
)
pause
:确认卸载
call :结束进程
::移除SVP补帧环境配置
setx /M PATH "%PATH:C:\Program Files (x86)\SVP 4\mpv64;=%"
wmic ENVIRONMENT where "name='PYTHONPATH'" delete
cls
echo.客户端卸载中......
rd /s /q "%USERPROFILE%\AppData\Roaming\Electron"
rd /s /q "%USERPROFILE%\AppData\Roaming\Emby Theater"
rd /s /q "%USERPROFILE%\AppData\Roaming\Emby-Theater"
rd /s /q "%USERPROFILE%\AppData\Roaming\Emby-InstallLogs"
rd /s /q "%USERPROFILE%\AppData\Roaming\mpv"
rd /s /q "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Emby Theater"
del /s /q "%USERPROFILE%\Desktop\Emby 桌面端(内置播放器).lnk"
del /s /q "%USERPROFILE%\Desktop\Emby 桌面端(外置播放器).lnk"
del /s /q "%USERPROFILE%\Desktop\Emby 桌面端(缓存重建).lnk"
del /s /q "%USERPROFILE%\Desktop\Emby 桌面端(卸载).lnk"
del /s /q "%USERPROFILE%\Desktop\Emby 桌面端.lnk"
del /s /q "%USERPROFILE%\Desktop\Emby 桌面客户端.lnk"
del /s /q "%USERPROFILE%\Desktop\Emby 桌面端缓存重建.lnk"
del /s /q "%USERPROFILE%\Desktop\Emby 桌面端卸载.lnk"
cd %~dp0 && cd.. 
rd /s /q "Emby Theater"
::显示执行结果
start mshta vbscript:msgbox("Emby 桌面客户端（Emby Theater）已经卸载完成",0,"Emby 桌面客户端（Emby Theater）卸载工具")(window.close)
attrib -h -s -r -a %0
del %0
goto :eof

:结束进程
taskkill /f /im Emby.Theater.exe & taskkill /f /im electron.exe
goto :eof

:启动程序
cd %~dp0
start Emby.Theater.exe
goto :eof

:退出工具
exit
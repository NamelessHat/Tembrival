// Some Windows sessions ignore Electron's first topmost request. Apply the
// native flag only to this process's own mini window, without activating it.
const {execFile}=require('node:child_process');
module.exports=async function keepMiniOnTop(window){
 window.setAlwaysOnTop(true);if(process.platform!=='win32')return window.isAlwaysOnTop();
 const handle=window.getNativeWindowHandle().readBigUInt64LE().toString();
 const script=`Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class LumaMiniWindow {
 [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int hgt,uint flags);
}
'@
$handleValue=[IntPtr]::new([long]${handle});[uint32]$ownerId=0
[void][LumaMiniWindow]::GetWindowThreadProcessId($handleValue,[ref]$ownerId)

if($ownerId -ne ${process.pid} -or -not [LumaMiniWindow]::IsWindow($handleValue)){exit 1}
for($attempt=0;$attempt -lt 8;$attempt++){
 [void][LumaMiniWindow]::SetWindowPos($handleValue,[IntPtr]::new(-1),0,0,0,0,19)
 [Threading.Thread]::Sleep(80)
 if(([LumaMiniWindow]::GetWindowLongPtr($handleValue,-20).ToInt64() -band 8) -ne 0){Write-Output 'pinned';exit 0}
}
exit 1`;
 return await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:8000},error=>error?reject(Error('Не удалось закрепить мини-плеер поверх окон')):resolve(true)));
};

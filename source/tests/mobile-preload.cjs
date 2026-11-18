const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('Android',{call:(method,args)=>JSON.stringify(ipcRenderer.sendSync('native-test',method,JSON.parse(args)))});

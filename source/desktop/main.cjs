const {app,BrowserWindow,ipcMain,dialog,shell,clipboard,safeStorage}=require('electron');
const path=require('node:path');
const buildInfo=require('../package.json');
let win,library,sync,mini,miniState={title:'Ваша музыка ждёт',artist:'Tembrival',art:'',playing:false};
// Keep the established profile and Chromium storage origin when the display brand changes.
// Explicit test profiles and --user-data-dir overrides must keep working.
const previousProfile=app.getPath('userData');
if(!app.commandLine.hasSwitch('user-data-dir')&&previousProfile===path.join(app.getPath('appData'),app.getName()))app.setPath('userData',path.join(app.getPath('appData'),'luma-music'));
app.setPath('sessionData',app.getPath('userData'));
app.setName('Tembrival');
app.setAppUserModelId('local.luma.music');
const gotLock=app.requestSingleInstanceLock();if(!gotLock)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(async()=>{
  const {Library}=await import('./library.mjs');const {startSync}=await import('./sync.mjs');
  if(!safeStorage.isEncryptionAvailable())throw Error('Windows secret storage is unavailable. Secure sync cannot start.');
  const secrets={protect:value=>safeStorage.encryptString(value).toString('base64'),unprotect:value=>safeStorage.decryptString(Buffer.from(value,'base64'))};
  library=await new Library(path.join(app.getPath('userData'),'library'),secrets).init();
  await library.save();
  library.onChanged=()=>{if(win&&!win.isDestroyed())win.webContents.send('library-changed');};
  const apkPath=app.isPackaged?path.join(process.resourcesPath,'Tembrival-Android.apk'):path.join(__dirname,'../release/Tembrival-Android.apk');
  const syncOptions={apkPath,appVersion:buildInfo.version,versionCode:buildInfo.androidVersionCode,...secrets};
  try{sync=await startSync(library,syncOptions);}catch(e){if(e.code==='EADDRINUSE')sync=await startSync(library,{...syncOptions,port:0});else throw e;}
  ipcMain.handle('luma',async(event,method,args)=>{
    if(!win||win.isDestroyed())return null;
    if(mini&&!mini.isDestroyed()&&event.sender===mini.webContents){if(method==='miniLoad')return miniState;if(method==='miniControl'&&['toggle','prev','next'].includes(args?.action)){win.webContents.send('mini-control',args.action);return true;}if(method==='closeMini'){mini.close();return true;}throw Error('Unknown operation');}
    if(event.sender!==win.webContents)throw new Error('Unknown sender');
    if(method==='analysisData'){const t=library.data.tracks.find(t=>t.id===args.id);if(!t)throw Error('Трек не найден');if(Number.isFinite(t.meanDb))return {meanDb:t.meanDb,peakDb:t.peakDb};if(t.size>64*1024*1024||t.duration>1200)return {live:true};return {bytes:await require('node:fs/promises').readFile(library.file(t))};}
    if(method==='saveAnalysis'){const t=library.data.tracks.find(t=>t.id===args.id);if(t&&Number.isFinite(args.meanDb)&&Number.isFinite(args.peakDb)&&args.meanDb<=0&&args.peakDb<=1){t.meanDb=args.meanDb;t.peakDb=args.peakDb;await library.save();}return true;}
    if(method==='savePlaylists')return library.mergePlaylists(args.records||[]);
    if(method==='saveFavorites')return library.mergeFavorites(args.records||[]);
    if(method==='miniState'){miniState={...miniState,...args};if(mini&&!mini.isDestroyed())mini.webContents.send('mini-state',args);return true;}
    if(method==='openMini'){if(mini&&!mini.isDestroyed()){mini.focus();return true;}mini=new BrowserWindow({width:440,height:170,minWidth:320,minHeight:140,alwaysOnTop:true,frame:false,autoHideMenuBar:true,backgroundColor:'#4c3048',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});mini.webContents.setWindowOpenHandler(()=>({action:'deny'}));mini.webContents.on('will-navigate',e=>e.preventDefault());await mini.loadFile(path.join(__dirname,'../ui/mini.html'));mini.showInactive();return {pinned:await require('./mini-top.cjs')(mini)};}
    if(method==='deviceStatus')return {devices:sync.devices(),pairingRevision:sync.pairingRevision};
    if(method==='runtimeLicense')return require('node:fs/promises').readFile(app.isPackaged?path.join(path.dirname(process.execPath),'third-party-source/LGPL-2.1.txt'):path.join(__dirname,`../release/runtime-source/FFmpeg-Electron-${process.versions.electron}-win32-x64-source/COPYING.LGPLv2.1`),'utf8');
    if(method==='openRuntimeSources'){const location=app.isPackaged?path.join(path.dirname(process.execPath),'third-party-source'):path.join(__dirname,'../release/runtime-source');const error=await shell.openPath(location);if(error)throw Error('Не удалось открыть папку исходников runtime');return true;}
    if(method==='load')return {...library.snapshot(),devices:sync.devices(),pairingRevision:sync.pairingRevision,platform:'desktop',base:`http://127.0.0.1:${sync.port}`,token:sync.desktopToken,serverAddresses:sync.addresses(),discoveryAvailable:sync.discovery.active,appVersion:buildInfo.version};
    if(method==='import'){
      const selected=await dialog.showOpenDialog(win,{title:'Добавить папки с музыкой',properties:['openDirectory','multiSelections']});
      if(selected.canceled)return null;
      return library.importFolders(selected.filePaths,p=>!win?.isDestroyed()&&win?.webContents.send('progress',p),args||{});
    }
    if(method==='importFiles'){
      const selected=await dialog.showOpenDialog(win,{title:'Добавить аудиофайлы',properties:['openFile','multiSelections'],filters:[{name:'Музыка',extensions:['mp3','flac','m4a','aac','ogg','opus','wav','aiff','aif','wma']}]});
      if(selected.canceled)return null;
      return library.importFolders(selected.filePaths,p=>!win?.isDestroyed()&&win?.webContents.send('progress',p),args||{});
    }
    if(method==='updateTrack')return library.updateTrack(args.id,args.details);
    if(method==='editCollection')return library.editCollection(args);
    if(method==='showTrackFile'){const t=library.data.tracks.find(t=>t.id===args.id);if(!t)throw Error('Трек не найден');const fs=require('node:fs');shell.showItemInFolder(t.sourcePath&&fs.existsSync(t.sourcePath)?t.sourcePath:library.file(t));return true;}
    if(method==='copyTrackText'){const tracks=library.data.tracks.filter(t=>args.ids?.includes(t.id));clipboard.writeText(tracks.map(t=>t.artist+' — '+t.title).join('\n'));return true;}
    if(method==='replaceAudio'){const selected=await dialog.showOpenDialog(win,{title:'Заменить аудио трека',properties:['openFile'],filters:[{name:'Аудио',extensions:['mp3','flac','m4a','aac','ogg','opus','wav','aiff','wma']}]});if(selected.canceled)return null;return library.replaceAudio(args.id,selected.filePaths[0]);}
    if(method==='removeTracks')return library.removeTracks(args.ids);
    if(method==='networkInfo'){
      const addresses=sync.installInfo().addresses,QRCode=require('qrcode');for(const a of addresses)a.qr=await QRCode.toDataURL(a.url+'/install',{width:220,margin:1});return {addresses,version:buildInfo.version};
    }
    if(method==='importPaths'){
      const fs=require('node:fs/promises');
      if(!Array.isArray(args.paths)||!args.paths.length)throw new Error('Перетащите папку с музыкой');
      for(const folder of args.paths)if(typeof folder!=='string'||!path.isAbsolute(folder)||!(await fs.stat(folder)))throw new Error('Выберите файлы или папки с музыкой');
      return library.importFolders(args.paths,p=>!win?.isDestroyed()&&win?.webContents.send('progress',p),args||{});
    }
    if(method==='inspectPeer')throw Error('Only Android performs peer inspection');
    if(method==='pair'){
      const info=sync.pairInfo();const QRCode=require('qrcode');
      info.addresses=sync.addresses();
      for(const a of info.addresses){a.pairUrl='luma://pair?host='+encodeURIComponent(a.url)+'&pin='+info.pin+'&fingerprint='+info.fingerprint;a.qr=await QRCode.toDataURL(a.pairUrl,{width:220,margin:1,color:{dark:'#192020',light:'#ffffff'}});}
      return info;
    }
    if(method==='stopPairing'){sync.stopPairing();return true;}
    if(method==='revoke'){library.data.devices=library.data.devices.filter(d=>d.id!==args.id);await library.save();return true;}
    if(method==='openData'){await shell.openPath(library.root);return true;}
    throw new Error('Unknown operation');
  });
  win=new BrowserWindow({width:1360,height:900,minWidth:850,minHeight:650,icon:path.join(__dirname,'icon.png'),backgroundColor:'#39273f',title:'Tembrival',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.on('closed',()=>{mini?.destroy();});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  await win.loadFile(path.join(__dirname,'../ui/index.html'));
}).catch(e=>{dialog.showErrorBox('Tembrival',e.stack||e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{sync?.server.close();});



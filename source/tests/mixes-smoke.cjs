const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tembrival-mixes-'));app.setPath('userData',root);await app.whenReady();
 const tracks=Array.from({length:35},(_,i)=>({id:(i+1).toString(16).padStart(64,'0'),title:i<2?'Одна песня':'Песня '+i,artist:i<3?'Первый автор':'Второй автор',album:i%2?'Вечер':'Общий альбом',folder:'Тест',duration:180+i,size:100,addedAt:i,ext:'.mp3'}));
 const data={tracks,revision:0,connection:{},syncStatus:'',playlistRecords:[],favoriteRecords:[]};let status={revision:0,position:43000,duration:180000,playing:false,ids:[]},calls=[];
 ipcMain.on('native-test',(e,method,args)=>{
  calls.push({method,args});let result={};
  if(method==='load')result=data;else if(method==='status')result=status;
  else if(method==='savePlaylists'){data.playlistRecords=args.records;result=args.records;}else if(method==='saveFavorites'){data.favoriteRecords=args.records;result=args.records;}
  else if(['play','restorePlayback'].includes(method)){status={...status,...args,id:args.ids[args.index],playing:method==='play',position:args.position||0,duration:180000,queueToken:''};}
  else if(method==='setQueue'){assert.equal(args.ids[args.index],status.id,'native update preserves the playing track');status={...status,...args};}
  else if(method==='editCollection'){const previous=args.key;for(const t of tracks)if(t[args.type]===previous&&(args.type!=='album'||args.artist==null||t.artist===args.artist))t[args.type]=args.name;result={name:args.name};}
  e.returnValue=result;
 });
 const win=new BrowserWindow({width:1280,height:900,useContentSize:true,show:true,webPreferences:{preload:path.join(__dirname,'mobile-preload.cjs'),sandbox:true,backgroundThrottling:false}});const errors=[];win.webContents.on('console-message',(_e,_level,message)=>{if(/Uncaught|Refused to|violates.*security/i.test(message)){errors.push(message);console.error(message);}});
 const run=s=>win.webContents.executeJavaScript(s.includes("await ")?"(async()=>{"+s+"})()":s,true).catch(e=>{console.error("Renderer step:",s);throw e;}),wait=async s=>{for(let i=0;i<100;i++){if(await run(s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+s);};
 await win.loadFile(path.resolve('ui/index.html'));await wait('state.tracks.length===35&&typeof editMix==="function"');
 await run(`savePlaylists([{id:'test-playlist',name:'Тестовый плейлист',tracks:state.tracks.slice(1,5).map(t=>t.id),description:'',image:''}]);navigate('mixes');document.querySelector('#new-mix').click();document.querySelector('#mix-name').value='Моя лента';[...document.querySelectorAll('.mix-source')].find(r=>r.textContent.includes('Первый автор')).querySelector('input').click()`);
 assert.equal(await run(`document.querySelectorAll('[data-mix-pick]').length`),2);
 await run(`document.querySelector('[data-mix-tab="album"]').click()`);assert.equal(await run(`document.querySelectorAll('[data-mix-pick]').length`),2);
 await run(`window.compilation=[...document.querySelectorAll('.mix-source')].find(r=>r.textContent.includes('Общий альбом'));compilation.querySelector('input').click()`);
 assert.equal(await run(`MixTools.members(MixTools.options('album',state.tracks,playlists).find(s=>s.key==='Общий альбом'),state.tracks,playlists).length`),18);
 assert.equal(await run(`MixTools.options('album',state.tracks,playlists).find(s=>s.key==='Общий альбом').artist`),null);
 await run(`compilation.querySelector('input').click();document.querySelector('[data-mix-tab="playlist"]').click()`);assert.equal(await run(`document.querySelectorAll('[data-mix-pick]').length`),1);
 await run(`document.querySelector('[data-mix-pick]').click();document.querySelector('[data-mix-tab="track"]').click();document.querySelector('[data-mix-pick]').click();document.querySelector('#mix-search').value='нет такого';document.querySelector('#mix-search').dispatchEvent(new Event('input'))`);
 assert.equal(await run(`document.querySelectorAll('[data-remove-source]').length`),3);
 await run(`document.querySelector('#mix-save').click()`);assert.equal(await run('mixRecords.length'),1);assert.equal(await run('MixTools.resolve(mixRecords[0].sources,state.tracks,playlists).length'),5);
 await run(`startMix(mixRecords[0].id)`);await run('refreshNativePlayback()');assert.equal(await run('queue.length'),5);assert.equal(await run('new Set(queue.map(t=>t.id)).size'),5);assert.equal(status.repeat,0);
 await run(`queue=state.tracks.slice(0,6).map(t=>({...t}));index=2;current=queue[index];await call('play',{ids:queue.map(t=>t.id),index,shuffle:false,repeat:2});await refreshNativePlayback();`);status.position=43000;status.playing=false;await run('refreshNativePlayback()');const id=status.id;
 const playsBefore=calls.filter(c=>c.method==='play').length;await run('startMix(mixRecords[0].id,true)');await run('refreshNativePlayback()');assert.equal(status.id,id);assert.equal(status.position,43000);assert.equal(status.playing,false);assert.equal(calls.filter(c=>c.method==='play').length,playsBefore);assert.ok(!status.ids.slice(status.index+1).includes(id));assert.equal(status.repeat,0);
 await run(`queue=[{...state.tracks[0]},{...state.tracks[1]},{...state.tracks[0]},{...state.tracks[2]}];index=2;current=queue[index];await call('play',{ids:queue.map(t=>t.id),index,shuffle:false,repeat:0});showQueue()`);status.position=52000;
 assert.equal(await run(`document.querySelectorAll('[data-queue-handle]').length`),4);assert.equal(await run(`document.querySelectorAll('[data-queue-remove]').length`),3);
 await run(`document.querySelectorAll('[data-queue-handle]')[2].focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true}))`);await wait('index===1');assert.equal(status.position,52000);assert.equal(status.id,tracks[0].id);assert.equal(await run(`document.activeElement.dataset.queueHandle===queue[index].queueKey`),true);
 await run(`moveQueueEntry(queue[0].queueKey,3)`);assert.equal(await run('index'),0);assert.equal(await run('queue[3].id'),tracks[0].id);assert.equal(status.position,52000);
 // Real mouse events exercise pointer capture and insertion, rather than calling the move helper.
 const positions=await run(`[...document.querySelectorAll('[data-queue-handle]')].map(b=>{const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})`);const moving=await run('queue[0].queueKey');
 win.webContents.sendInputEvent({type:'mouseMove',...positions[0]});win.webContents.sendInputEvent({type:'mouseDown',...positions[0],button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:positions[3].x,y:positions[3].y+20});await new Promise(r=>setTimeout(r,100));win.webContents.sendInputEvent({type:'mouseUp',x:positions[3].x,y:positions[3].y+20,button:'left',clickCount:1});await wait(`queue[3].queueKey===${JSON.stringify(moving)}`);assert.equal(status.position,52000);
 // Cancelling a captured gesture leaves the order unchanged.
 const order=await run('queue.map(t=>t.queueKey).join()');const cancelPos=await run("(()=>{const r=document.querySelector('[data-queue-handle]').getBoundingClientRect();return {x:Math.round(r.x+15),y:Math.round(r.y+15)}})()");win.webContents.sendInputEvent({type:'mouseDown',...cancelPos,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:cancelPos.x,y:cancelPos.y+70});await wait('!!queueDrag?.moved');
 await run('endQueueDrag(false)');assert.equal(await run('queue.map(t=>t.queueKey).join()'),order);
 await run(`closeQueuePanel(false);editMix(mixRecords[0].id)`);assert.equal(await run(`document.querySelectorAll('[data-remove-source]').length`),3);await run(`document.querySelector('#mix-cancel').click();renameMixSources({type:'artist',key:'Первый автор'},'Новое имя')`);assert.equal(await run(`mixRecords[0].sources.find(s=>s.type==='artist').key`),'Новое имя');
 await run(`editMix();document.querySelector('#mix-name').value='Пустая';document.querySelector('#mix-save').click();navigate('mixes')`);assert.equal(await run(`document.querySelectorAll('[data-mix-play]:disabled').length`),1);
 // Both themes and phone layouts; screenshots are generated artifacts only.
 for(const theme of ['day','night'])for(const width of [1280,390]){
  win.setContentSize(width,900);await run(`Sound.update({theme:${JSON.stringify(theme)},animations:false});navigate('mixes');editMix(mixRecords[0].id);document.fonts.ready`);await new Promise(r=>setTimeout(r,200));
  assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));assert.ok(await run(`document.querySelector('#modal').getBoundingClientRect().width<=innerWidth`));
  await fs.writeFile(path.resolve(`release/mixes-${theme}-${width}.png`),(await win.webContents.capturePage()).toPNG());await run(`document.querySelector('#modal').close()`);
 }
 // Background/native transition during a drag uses the newly active occurrence on commit.
 win.setContentSize(1280,900);await run(`queue=state.tracks.map(t=>({...t}));index=0;current=queue[0];await call('play',{ids:queue.map(t=>t.id),index,shuffle:false,repeat:0});showQueue()`);
 const p=await run(`(()=>{const r=document.querySelector('[data-queue-handle]').getBoundingClientRect();return {x:Math.round(r.x+15),y:Math.round(r.y+15)}})()`);win.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:p.x,y:p.y+70});await wait('!!queueDrag?.moved');status.index=1;status.id=status.ids[1];status.position=6000;await run('refreshNativePlayback()');assert.equal(await run('index'),1);await run(`queueDrag.beforeKey=queue[4].queueKey;endQueueDrag(true)`);await wait('index===0');assert.equal(status.position,6000);
 // Auto-scroll is bounded to the queue, and cancellation does not reorder.
 const beforeAuto=await run('queue.map(t=>t.queueKey).join()');const box=await run(`(()=>{const r=document.querySelector('#editable-queue').getBoundingClientRect(),h=document.querySelector('[data-queue-handle]').getBoundingClientRect();return {x:Math.round(h.x+15),y:Math.round(h.y+15),bottom:Math.round(r.bottom-2)}})()`);
 win.webContents.sendInputEvent({type:'mouseMove',x:box.x,y:box.y});win.webContents.sendInputEvent({type:'mouseDown',x:box.x,y:box.y,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:box.x,y:box.bottom});await new Promise(r=>setTimeout(r,450));assert.ok(await run(`document.querySelector('#editable-queue').scrollTop>0`));await run('endQueueDrag(false)');assert.equal(await run('queue.map(t=>t.queueKey).join()'),beforeAuto);
 await run(`document.querySelector('#editable-queue').scrollTop=0`);
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true});
 const touchPos=await run(`(()=>{const r=document.querySelector('[data-queue-handle]').getBoundingClientRect();return {x:Math.round(r.x+15),y:Math.round(r.y+15)}})()`),touchKey=await run('queue[0].queueKey');
 const touch=(type,y)=>win.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type,touchPoints:['touchCancel','touchEnd'].includes(type)?[]:[{x:touchPos.x,y,id:1}]});
 await touch('touchStart',touchPos.y);await touch('touchMove',touchPos.y+145);await wait('!!queueDrag?.moved');await touch('touchCancel');await wait('queueDrag===null');assert.equal(await run('queue[0].queueKey'),touchKey);
 await touch('touchStart',touchPos.y);await touch('touchMove',touchPos.y+145);await wait('!!queueDrag?.moved');await touch('touchEnd');await wait(`queue[0].queueKey!==${JSON.stringify(touchKey)}`);
 await run(`queue=state.tracks.slice(0,5).map(t=>({...t}));index=3;current=queue[index];await call('play',{ids:queue.map(t=>t.id),index,shuffle:false,repeat:0});showQueue()`);status.position=26000;const beforeRemovalId=status.id;
 await run(`document.querySelector('[data-queue-remove]').click()`);await wait('queue.length===4&&index===2');assert.equal(status.id,beforeRemovalId);assert.equal(status.position,26000);assert.equal(await run(`document.querySelector('.queue-entry.current [data-queue-remove]')===null`),true);
 await run(`document.querySelector('#editable-queue').scrollTop=20;document.querySelectorAll('[data-queue-play]')[1].click()`);await wait('index===1');await run('refreshNativePlayback()');assert.equal(await run(`document.querySelector('#queue-panel').open`),true);assert.equal(await run(`document.querySelector('.queue-entry.current').dataset.queueKey===queue[1].queueKey`),true);assert.equal(status.position,0);
 await fs.writeFile(path.resolve('release/queue-editor-night.png'),(await win.webContents.capturePage()).toPNG());await run(`closeQueuePanel(false);saveResume(true)`);
 const saved=await run('JSON.parse(localStorage.getItem("resume-playback")).queue.map(t=>t.id)');assert.deepEqual(saved,status.ids);
 await win.reload();await wait('state.tracks.length===35&&mixRecords.length===2');assert.equal(await run('mixRecords[1].name'),'Пустая');assert.deepEqual(errors,[]);
 for(const theme of ['day','night'])for(const width of [1600,1280,1024,650,390,360]){
  win.setContentSize(width,900);await run(`Sound.update({theme:${JSON.stringify(theme)},animations:false});navigate('tracks');showQueue()`);await new Promise(r=>setTimeout(r,120));
  const geometry=await run(`(()=>{const p=queuePanel.getBoundingClientRect(),m=document.querySelector('main').getBoundingClientRect(),player=document.querySelector('.player').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:p.left,right:p.right,mainRight:m.right,playerWidth:player.width,playerTop:player.top,panelBottom:p.bottom,modal:queuePanel.matches(':modal'),docked:document.body.classList.contains('queue-panel-docked')}})()`);
  assert.ok(geometry.scroll<=geometry.width,JSON.stringify(geometry));assert.ok(geometry.left>=0&&geometry.right<=geometry.width+1,JSON.stringify(geometry));
  if(width>=1200){assert.ok(geometry.docked&&!geometry.modal);assert.ok(geometry.mainRight<=geometry.left+1);assert.ok(geometry.panelBottom<=geometry.playerTop+1);assert.ok(geometry.playerWidth>=width-20);await run(`document.querySelector('[data-view="albums"]').click()`);assert.equal(await run('view'),'albums');assert.equal(await run('queuePanel.open'),true);await run(`navigate('tracks');scrollTo(0,200)`);const pageScroll=await run('scrollY');await run(`document.querySelector('#editable-queue').scrollTop=120`);assert.equal(await run('scrollY'),pageScroll);}
  else {assert.ok(geometry.modal&&!geometry.docked);await run('handleBackNavigation()');assert.equal(await run('queuePanel.open'),false);await run('showQueue()');}
  await run(`scrollTo(0,0);document.querySelector('#editable-queue').scrollTop=0`);await new Promise(r=>setTimeout(r,100));
  if([1280,390].includes(width))await fs.writeFile(path.resolve(`release/queue-panel-${theme}-${width}.png`),(await win.webContents.capturePage()).toPNG());
 }
 win.setContentSize(1280,900);await new Promise(r=>setTimeout(r,120));await run('showQueue()');await win.reload();await wait('state.tracks.length===35&&queuePanel.open');assert.equal(await run(`document.body.classList.contains('queue-panel-docked')`),true);
 await run(`document.querySelector('#queue').click()`);assert.equal(await run('queuePanel.open'),false);assert.equal(await run(`document.activeElement.id`),'queue');await win.reload();await wait('state.tracks.length===35');assert.equal(await run('queuePanel.open'),false);
 assert.deepEqual(errors,[]);console.log('Mixes/queue UI passed: saved sources, playback/order, pointer/touch, dock/drawer across six widths, library access, independent scroll, Android back, panel preference, both themes and focus return.');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});

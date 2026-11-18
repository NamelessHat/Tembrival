'use strict';
function deviceCards(devices){return devices.length?devices.map(d=>`<div class="device" data-device="${esc(d.id)}"><span><strong>${esc(d.name)}</strong><small class="device-presence" data-online="${!!d.online}">${d.online?'● На связи':'○ Нет связи'}</small></span><button class="secondary" data-revoke="${esc(d.id)}">Отключить доступ</button></div>`).join(''):'<p class="muted">Пока нет знакомых телефонов.</p>';}
// Poll only this small status projection, without rerendering the library or dialogs.
if(!mobile){let polling=false;setInterval(async()=>{if(view!=='sync'||document.hidden||polling)return;polling=true;try{const status=await call('deviceStatus');if(!status?.devices)return;state.devices=status.devices;document.querySelectorAll('[data-device]').forEach(row=>{const d=status.devices.find(d=>d.id===row.dataset.device),label=row.querySelector('.device-presence');if(d&&label){label.textContent=d.online?'● На связи':'○ Нет связи';label.dataset.online=String(!!d.online);}});}catch{}finally{polling=false;}},5000);}
let networkDiscoveryStarted=false,lastNetworkList='',lastAutoConnection=0,skipAutoDiscoveryUntil=0;
const syncBeforeDiscovery=renderSync;
renderSync=function(){
 syncBeforeDiscovery();
 const guide=document.createElement('details');guide.className='hotspot-guide';guide.innerHTML='<summary>Нет общей сети? Подключиться через точку доступа телефона</summary><ol><li>На телефоне включите «Точку доступа Wi-Fi».</li><li>На ПК подключитесь к этой сети по её имени и паролю.</li><li>Оставьте Tembrival на ПК открытой. На телефоне нажмите «Найти ПК».</li></ol><p>Интернет для передачи не нужен. Файлы идут между устройствами по локальной сети. Если ПК не находится, проверьте разрешение Luma в брандмауэре Windows и доступ к локальной сети в VPN.</p>';
 if(mobile){
  lastNetworkList='';const intro=$('#content .sync-panel > p');if(intro)intro.textContent='Общая Wi-Fi-сеть или точка доступа телефона. Интернет для передачи не нужен.';
  const server=$('#server'),label=server.closest('label'),manual=document.createElement('details');manual.className='manual-server';manual.innerHTML='<summary>Адрес компьютера вручную</summary>';label.before(manual);manual.append(label);
  const finder=document.createElement('div');finder.className='network-finder';finder.innerHTML='<p class="muted">Первое подключение — по QR с экрана ПК или по коду ниже.</p><button class="secondary" id="find-computers">⌕ Найти ПК</button><p id="network-connected" class="muted"></p><div id="discovered-computers" aria-live="polite"></div>';
  const reconnect=document.createElement('button');reconnect.id='reconnect-pc';reconnect.className='primary';reconnect.textContent='⇄ Подключиться к знакомому ПК';reconnect.onclick=guard(async()=>{await call('connect');toast('Проверяем связь со знакомым ПК…');});finder.append(reconnect);
  manual.before(finder);$('#sync-status').after(guide);
  const settings=document.createElement('button');settings.className='secondary';settings.textContent='Открыть настройки сети телефона';settings.onclick=guard(()=>call('networkSettings'));guide.append(settings);
  $('#find-computers').onclick=guard(async()=>{lastNetworkList='';$('#discovered-computers').textContent='Ищем компьютеры в локальной сети…';await call('discover');});
  $('#server').placeholder='https://192.168.1.10:47832';
  $('#pair-phone').onclick=guard(async()=>{
    const server=$('#server').value.trim(),pin=$('#pin').value.trim();if(!/^\d{6}$/.test(pin))throw Error('Введите 6 цифр с экрана ПК');
    const peer=await call('inspectPeer',{server});
    modal(`<h3>Это ваш компьютер?</h3><p>Сравните удостоверение ниже с окном подключения на ПК. Все восемь групп должны совпадать. Если отличаются — отмените подключение.</p><code class="peer-code">${esc(peer.code)}</code><div class="editor-actions"><button class="secondary" id="peer-cancel">Отмена</button><button class="primary" id="peer-confirm">Коды совпадают — подключить</button></div>`);
    $('#peer-cancel').onclick=()=>$('#modal').close();$('#peer-confirm').onclick=guard(async()=>{await call('pair',{server,pin,fingerprint:peer.fingerprint});$('#modal').close();toast('Проверяем защищённое подключение…');});
  });
  refreshNetworkStatus(nativeStatus||{});
  if(!networkDiscoveryStarted&&Date.now()>=skipAutoDiscoveryUntil){networkDiscoveryStarted=true;setTimeout(()=>{if(view==='sync'&&$('#find-computers')&&!nativeStatus.busy)$('#find-computers').click();},100);}
 }else{
  $('#pair-desktop').after(guide);
  if(state.discoveryAvailable===false){const note=document.createElement('p');note.className='warning';note.textContent='Автопоиск сейчас недоступен. Закройте другие копии Tembrival или подключитесь по QR / адресу вручную.';guide.after(note);}
  const pair=$('#pair-desktop'),previous=pair.onclick;pair.onclick=async()=>{await previous();if($('#pair-expiry')){const hint=$('#modal-content > .muted');if(hint)hint.textContent='Сканируйте QR камерой телефона и откройте ссылку в Tembrival. QR передаёт удостоверение ПК. При ручном подключении дополнительно сравните все группы кода удостоверения на обоих устройствах.';}};
 }
};
addressCards=function(addresses){return '<div class="queue-list">'+(addresses.map((a,i)=>`<div class="qr-pair"><img src="${a.qr}" alt="${a.pairUrl?'QR подключения телефона':'QR загрузки APK'}"><div><small class="muted">${esc(a.name)}${i===0?' · рекомендуемый адрес':''}</small><code class="address">${esc(a.url)}</code><p class="muted">${a.pairUrl?'Сканируйте камерой телефона →<br>«Подключить в приложении».':'Сканируйте для установки или обновления Android.'}</p></div></div>`).join('')||'<p class="warning">Подключите ПК к Wi-Fi или точке доступа телефона.</p>')+'</div>';};
window.refreshNetworkStatus=function(status){
 if(!mobile||view!=='sync'||!$('#discovered-computers'))return;
 const connection=status.connection||state.connection||{},busy=!!status.busy;
 $('#network-connected').textContent=connection.token?'Знакомый ПК: '+(connection.serverName||connection.server||'Компьютер')+'. Используйте повторное подключение или сразу выберите передачу — новый QR не нужен.':'Пока нет подключённого ПК.';
 $('#reconnect-pc').hidden=!connection.token;$('#reconnect-pc').disabled=busy;
 $('#find-computers').disabled=busy;$('#pair-phone').disabled=busy;
 document.querySelectorAll('.sync-directions button').forEach(b=>b.disabled=b.id==='cancel-sync'?!busy:busy);
 if($('#check-update'))$('#check-update').disabled=busy;
 const computers=new Map();for(const pc of status.discoveredServers||[])if(!computers.has(pc.serverId)||pc.url===connection.server)computers.set(pc.serverId,pc);const list=[...computers.values()],key=JSON.stringify([list,connection.serverId]);if(key!==lastNetworkList){lastNetworkList=key;$('#discovered-computers').innerHTML=list.map((pc,i)=>`<button class="discovered-computer secondary" data-computer="${i}"><strong>${esc(pc.name||'Компьютер')}${pc.serverId===connection.serverId?' · знакомый ПК':''}</strong><small>${esc(pc.url)}</small></button>`).join('')||'<p class="muted">Нажмите «Найти ПК». Если поиск не помогает, используйте QR или адрес вручную.</p>';
  document.querySelectorAll('[data-computer]').forEach(b=>b.onclick=()=>{const chosen=list[Number(b.dataset.computer)];if(chosen.serverId===connection.serverId){call('connect').catch(e=>toast(e.message));return;}$('#server').value=chosen.url;document.querySelectorAll('[data-computer]').forEach(x=>x.classList.toggle('active',x===b));$('#network-connected').textContent='Выбран: '+list[Number(b.dataset.computer)].name+'. Введите код с экрана ПК.';$('#pin').focus();});
 }
 if(!busy&&status.discoveryRevision>lastAutoConnection&&connection.serverId&&list.some(pc=>pc.serverId===connection.serverId)){lastAutoConnection=status.discoveryRevision;call('connect').catch(e=>toast(e.message));}
};
if(mobile)window.onPairLink=async(host,pin,fingerprint)=>{skipAutoDiscoveryUntil=Date.now()+10000;networkDiscoveryStarted=true;navigate('sync');$('#server').value=host;$('#pin').value=pin;try{if(!/^https:\/\//.test(host)||!/^\d{6}$/.test(pin)||!/^[a-f0-9]{64}$/.test(fingerprint||''))throw Error('Нужен новый защищённый QR из Tembrival на ПК.');let status=JSON.parse(Android.call('status','{}'));if(status.busy&&status.connectionState==='searching'){await call('cancelSync');for(let n=0;n<30&&status.busy;n++){await new Promise(r=>setTimeout(r,200));status=JSON.parse(Android.call('status','{}'));}}modal(`<h3>Подключить компьютер?</h3><p>Продолжайте, если вы только что сканировали QR в окне Tembrival на своём ПК. Посторонние ссылки не подтверждайте.</p><code class="address">${esc(host)}</code><div class="editor-actions"><button class="secondary" id="qr-cancel">Отмена</button><button class="primary" id="qr-connect">Подключить</button></div>`);$('#qr-cancel').onclick=()=>$('#modal').close();$('#qr-connect').onclick=guard(async()=>{await call('pair',{server:host,pin,fingerprint});$('#modal').close();toast('Проверяем удостоверение ПК…');});}catch(e){toast(e.message);}};

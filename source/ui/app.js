'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mobile=!!window.Android;
const call=async(method,args={})=>{const result=mobile?JSON.parse(Android.call(method,JSON.stringify(args))):await Luma.call(method,args);if(result?.error)throw new Error(result.error);return result;};
let state={tracks:[],devices:[]},view='home',group=null,queue=[],index=-1,shuffle=false,repeat=0,playing=false,current=null,nativeStatus={},pairTimer;
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
let favorites=new Set(read('favorites',[])),playlists=read('playlists',[]);
const deviceId=read('playlist-device',null)||crypto.randomUUID();localStorage.setItem('playlist-device',JSON.stringify(deviceId));
let playlistRecords=read('playlist-records',[]),playlistSave=Promise.resolve();
function storePlaylistRecords(records){localStorage.setItem('playlist-records',JSON.stringify(records));playlistRecords=records;playlists=records.filter(p=>!p.deleted);localStorage.removeItem('playlists');}
function savePlaylists(next){const live=new Map(next.map(p=>[p.id,p])),records=playlistRecords.map(p=>({...p,clock:{...p.clock}}));for(const p of next){const old=records.find(r=>r.id===p.id);if(old&&!old.deleted&&PlaylistSync.payload(old)===PlaylistSync.payload({...p,deleted:false}))continue;const clock={...(old?.clock||{})};clock[deviceId]=(clock[deviceId]||0)+1;const n={...p,clock,editId:crypto.randomUUID(),deleted:false};if(old)Object.assign(old,n);else records.push(n);}for(const p of records)if(!p.deleted&&!live.has(p.id)){p.deleted=true;p.editId=crypto.randomUUID();p.clock[deviceId]=(p.clock[deviceId]||0)+1;}storePlaylistRecords(PlaylistSync.merge([],records));persistPlaylistBackend();}
function persistPlaylistBackend(){const snapshot=playlistRecords;playlistSave=playlistSave.catch(()=>{}).then(()=>call('savePlaylists',{records:snapshot})).catch(e=>toast('Плейлисты сохранены локально: '+e.message));}
function acceptPlaylists(records){const merged=PlaylistSync.merge(playlistRecords,records||[]);if(JSON.stringify(merged)!==JSON.stringify(playlistRecords)){storePlaylistRecords(merged);if(group?.type==='playlist'){const p=playlists.find(p=>p.id===group.key);if(p)group.label=p.name;else group=null;}}if(JSON.stringify(merged)!==JSON.stringify(records||[]))persistPlaylistBackend();}
if(!playlistRecords.length&&playlists.length)savePlaylists(playlists);else playlists=playlistRecords.filter(p=>!p.deleted);
let favoriteRecords=FavoriteSync.merge([],read('favorite-records',[])),favoriteSave=Promise.resolve(),favoriteReady=false;
function storeFavoriteRecords(records){favoriteRecords=records;favorites=new Set(records.filter(r=>r.liked).map(r=>r.id));localStorage.setItem('favorite-records',JSON.stringify(records));localStorage.setItem('favorites',JSON.stringify([...favorites]));}
function persistFavoriteBackend(){const records=favoriteRecords;favoriteSave=favoriteSave.catch(()=>{}).then(()=>call('saveFavorites',{records})).catch(e=>toast('Избранное сохранено локально: '+e.message));}
function persistFavorites(){const desired=new Set(favorites),old=new Map(favoriteRecords.map(r=>[r.id,r]));for(const id of new Set([...desired,...old.keys()])){if(!/^[a-f0-9]{64}$/.test(id))continue;const previous=old.get(id),liked=desired.has(id);if(previous?.liked===liked||!previous&&!liked)continue;old.set(id,{id,liked,version:(previous?.version||0)+1,actor:deviceId});}storeFavoriteRecords(FavoriteSync.merge([],[...old.values()]));persistFavoriteBackend();}
function acceptFavorites(records=[]){if(!favoriteReady){favoriteReady=true;const known=new Set([...favoriteRecords,...records].map(r=>r.id));for(const id of favorites)if(/^[a-f0-9]{64}$/.test(id)&&!known.has(id))favoriteRecords.push({id,liked:true,version:1,actor:deviceId});}const merged=FavoriteSync.merge(favoriteRecords,records);storeFavoriteRecords(merged);if(JSON.stringify(merged)!==JSON.stringify(records))persistFavoriteBackend();}
const persist=()=>{persistFavorites();savePlaylists(playlists);};
const audio=$('#audio');if(!mobile)audio.crossOrigin='anonymous';audio.volume=Number(read('volume',.75));$('#volume').value=audio.volume;
const time=s=>{s=Math.max(0,Math.floor(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const mediaUrl=(t,kind='audio')=>mobile?`https://app.luma.local/${kind}/${t.id}`:`${state.base}/v1/${kind}/${t.id}?token=${state.token}`;
const art=t=>t?.customCover?`<img class="cover" src="${esc(t.customCover)}" alt="">`:t?.cover?`<img class="cover" src="${esc(mediaUrl(t,'art'))}" alt="">`:`<div class="cover placeholder tape-${parseInt(t?.id?.slice(0,2)||'0',16)%4}"><svg class="cassette-art" viewBox="0 0 96 72" aria-hidden="true"><path class="tape-shell" d="M8 8h80v4h4v48h-4v4H8v-4H4V12h4z"/><path class="tape-label" d="M12 16h72v30H12z"/><path class="tape-stripe" d="M12 32h72v5H12z"/><path fill="#fff2d8" d="M20 21h56v3H20z"/><path fill="#50344f" d="M25 37h46v12H25zM29 52h38l5 8H24z"/><path fill="#f7e4cf" d="M22 37h12v12H22zM62 37h12v12H62z"/><path fill="#63445c" d="M26 41h4v4h-4zM66 41h4v4h-4z"/><path fill="#fff4e1" d="M10 12h3v3h-3zM83 12h3v3h-3zM10 56h3v3h-3zM83 56h3v3h-3z"/></svg></div>`;
$('#now-cover').outerHTML=art(null).replace('class="cover','id="now-cover" class="cover');
const toast=msg=>{$('#toast').textContent=msg;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',6000);};
const guard=fn=>async(...args)=>{try{return await fn(...args);}catch(e){toast(e.message||String(e));}};
function modal(html){$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
$('.modal-close').onclick=()=>$('#modal').close();
$('#modal').addEventListener('close',()=>{if($('#modal').open)return;clearInterval(pairTimer);if(!mobile&&$('#modal-content').querySelector('#pair-expiry,.qr-pair'))call('stopPairing').catch(()=>{});});
const titles={home:'Привал',tracks:'Все треки',albums:'Альбомы',artists:'Исполнители',folders:'Папки',favorites:'Любимое',playlists:'Плейлисты',settings:'Настройки лагеря',sync:'Wi-Fi-синхронизация'};
function navigate(next){view=next;group=null;$('#search').value='';render();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
function filtered(){
 let tracks=[...state.tracks],q=$('#search').value.toLocaleLowerCase();
 if(view==='favorites')tracks=tracks.filter(t=>favorites.has(t.id));
 if(group){if(group.type==='playlist'){const ids=playlists.find(p=>p.id===group.key)?.tracks||[];const positions=new Map(ids.map((id,i)=>[id,i]));tracks=tracks.filter(t=>positions.has(t.id)).sort((a,b)=>positions.get(a.id)-positions.get(b.id));}else tracks=tracks.filter(t=>String(t[group.type]||'')===group.key);}
 if(q)tracks=tracks.filter(t=>[t.title,t.artist,t.album,t.folder].join(' ').toLocaleLowerCase().includes(q));
 if(group?.type==='playlist')return tracks;
 const sort=$('#sort').value;tracks.sort(sort==='added'?(a,b)=>b.addedAt-a.addedAt:sort==='album'?(a,b)=>a.album.localeCompare(b.album,'ru')||a.disc-b.disc||a.number-b.number:(a,b)=>String(a[sort]).localeCompare(String(b[sort]),'ru'));return tracks;
}
// Generate the current record directly: no second parse/serialization of the whole list.
function rowArt(track){const cover=art(track).replace('<img ','<img loading="lazy" decoding="async" ');return track.id===current?.id?'<div class="cover track-record"><span class="record-label">'+cover+'</span><i></i></div>':cover;}
function rows(tracks){return `<table><thead><tr><th>#</th><th>НАЗВАНИЕ / ИСПОЛНИТЕЛЬ</th><th>АЛЬБОМ</th><th>ПАПКА</th><th>ВРЕМЯ</th></tr></thead><tbody>${tracks.map((t,i)=>`<tr class="track ${t.id===current?.id?'playing':''}" data-id="${t.id}"><td>${t.id===current?.id?'<span class="pixel-meter" role="img" aria-label="Текущий трек"><i></i><i></i><i></i></span>':i+1}</td><td><div class="track-info">${rowArt(t)}<div><div class="track-title">${esc(t.title)}</div><small class="track-artist">${esc(t.artist)}</small></div></div></td><td>${esc(t.album)}</td><td>${esc(t.folder)}</td><td><div class="row-actions"><span class="row-duration">${time(t.duration)}</span><button class="tiny favorite" data-id="${t.id}" title="В избранное">${favorites.has(t.id)?'♥':'♡'}</button><button class="tiny track-menu" data-id="${t.id}" title="Плейлисты и очередь">⋮</button></div></td></tr>`).join('')}</tbody></table>`;}
function empty(title,description,action=false){return `<div class="empty"><div class="empty-icon">♫</div><h3>${title}</h3><p>${description}</p>${action?'<button class="primary empty-import">＋ Добавить музыку</button>':''}</div>`;}
function playlistArt(p){return p.image?`<img class="cover" src="${esc(p.image)}" alt="">`:art(state.tracks.find(t=>p.tracks.includes(t.id)));}
function render(){
 document.body.classList.toggle('settings-view',view==='settings');$('#import').hidden=view==='settings';$('#section-caption').textContent=view==='settings'?'ТВОЙ ЛИЧНЫЙ ПРИВАЛ':'КАССЕТЫ ИЗ ТВОЕГО РЮКЗАКА';document.body.classList.toggle('mobile',mobile);document.body.classList.toggle('sync-view',view==='sync');
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('#heading').innerHTML=`${esc(group?.label||titles[view])} <small id="heading-count">${filtered().length}</small>`;
 $('#crumb').textContent=titles[view];$('#track-count').textContent=state.tracks.length;
 $('#library-size').textContent=`${state.tracks.length} треков • ${(state.tracks.reduce((s,t)=>s+t.size,0)/1073741824).toFixed(2)} ГБ`;
 $('#import').textContent='＋ Добавить';$('.hero').hidden=view!=='home';$('#sort').hidden=['sync','settings'].includes(view);$('#library-tools').hidden=['sync','settings'].includes(view);
 $('#play-selection').hidden=!group&&!['tracks','favorites'].includes(view);$('#shuffle-selection').hidden=$('#play-selection').hidden;$('#play-selection').textContent=view==='tracks'&&!group?($('#search').value?'▶ Слушать найденное':'▶ Слушать все'):'▶ Слушать подборку';$('#library-tools').hidden=['home','sync','settings'].includes(view);$('#sort').hidden=['home','sync','settings'].includes(view);
 if(view==='home'){$('#content').innerHTML=`<div class="library-home"><button class="library-destination" data-open-view="tracks"><span>♫</span><strong>Все треки</strong><small>${state.tracks.length} песен в твоей коллекции</small></button><button class="library-destination" data-open-view="folders"><span>▤</span><strong>Папки</strong><small>Загруженные музыкальные папки</small></button><button class="library-destination" data-open-view="playlists"><span>♥</span><strong>Плейлисты</strong><small>Подборки для любого маршрута</small></button></div>`;return;}
 if(view==='settings'){renderSettings();return;}
 if(view==='sync'){renderSync();return;}
 if(view==='mixes')return;
 const tracks=filtered();let html=group?'<button class="secondary back" id="back">← Назад</button>':'';
 if(view==='playlists'&&!group){html='<button class="secondary" id="new-playlist">＋ Новый плейлист</button><div class="cards playlist-cards">'+playlists.map(p=>`<button class="card" data-playlist="${p.id}">${playlistArt(p)}<strong>${esc(p.name)}</strong><small class="playlist-description">${esc(p.description||'')}</small><small>${p.tracks.length} треков</small></button>`).join('')+'</div>';}
 else if(['albums','artists','folders'].includes(view)&&!group){
  const key={albums:'album',artists:'artist',folders:'folder'}[view],groups=new Map();for(const t of tracks){const k=t[key]||'Без названия';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);}
  html+='<div class="cards">'+[...groups].sort((a,b)=>a[0].localeCompare(b[0],'ru')).map(([name,items])=>`<button class="card" data-group="${esc(name)}" data-type="${key}">${art(items.find(t=>t.cover||t.customCover)||items[0])}<strong>${esc(name)}</strong><small>${items.length} треков${view==='albums'?' • '+esc(items[0].artist):''}</small></button>`).join('')+'</div>';
  if(!tracks.length)html+=empty('Пока здесь тихо','Добавьте песни или скопируйте коллекцию с другого устройства.',true);
 }else{
  if(group?.type==='playlist'){const p=playlists.find(p=>p.id===group.key);html+=`<div class="playlist-intro">${playlistArt(p)}<div><p>${esc(p.description||'Твоя музыка для особенного момента.')}</p><button class="secondary" id="edit-playlist">Редактировать плейлист</button></div></div>`;}
  html+=tracks.length?rows(tracks):empty(state.tracks.length?'Здесь пока нет треков':'Пока здесь тихо',state.tracks.length?'Измените поиск или добавьте песни в этот раздел.':'Добавьте отдельные файлы, папку или перенесите музыку по Wi-Fi.',!state.tracks.length);
 }
 $('#content').innerHTML=html;
}
$('#content').onclick=guard(async e=>{
 const b=e.target.closest('button'),row=e.target.closest('tr[data-id]');
 if(b?.dataset.openView)return navigate(b.dataset.openView);
 if(e.target.matches('.track-select'))return;
 if(b?.classList.contains('favorite'))return toggleFavorite(b.dataset.id);
 if(b?.classList.contains('track-menu'))return trackMenu(b.dataset.id,b);
 if(b?.dataset.group){return openCollection({type:b.dataset.type,key:b.dataset.group,label:b.dataset.group});}
 if(b?.dataset.playlist){const p=playlists.find(p=>p.id===b.dataset.playlist);return openCollection({type:'playlist',key:p.id,label:p.name});}
 if(row){if(window.selectionMode)return toggleSelection(row.dataset.id);return playTracks(filtered(),row.dataset.id);}
 if(b?.id==='back'){if(!window.handleBackNavigation?.()){group=null;render();}}
 if(b?.classList.contains('empty-import'))importMenu();
 if(b?.id==='new-playlist')newPlaylist();
 if(b?.id==='edit-playlist')editPlaylist(group.key);
});
function newPlaylist(trackId){editPlaylist(null,trackId);}
function editPlaylist(id,trackId){
 const old=playlists.find(p=>p.id===id),draft=old?{...old,tracks:[...old.tracks]}:{id:crypto.randomUUID(),name:'',description:'',image:'',tracks:trackId?[trackId]:[]};
 modal(`<h3>${old?'Редактировать':'Новый'} плейлист</h3><div class="playlist-editor"><label>Название<input id="playlist-name" maxlength="100" value="${esc(draft.name)}" placeholder="Например, Дорога к вершине"></label><label>Описание<textarea id="playlist-description" maxlength="1000" rows="3" placeholder="Какое настроение у этой подборки?">${esc(draft.description||'')}</textarea></label><div class="cover-editor"><div id="playlist-cover-preview">${playlistArt(draft)}</div><div><label class="secondary file-label">Выбрать картинку<input type="file" id="playlist-image" accept="image/png,image/jpeg,image/webp,image/gif"></label><button class="secondary" id="clear-playlist-image">Убрать картинку</button></div></div><div class="picker-modes"><button class="secondary active" id="pick-by-tracks">По трекам</button><button class="secondary" id="pick-by-folders">Целыми папками</button></div><label>Добавить в плейлист<input id="playlist-track-search" placeholder="Поиск треков для плейлиста"></label><div id="playlist-pick-tracks" class="track-picker">${state.tracks.map(t=>`<label data-pick-title="${esc((t.artist+' '+t.title).toLocaleLowerCase())}"><input type="checkbox" value="${t.id}" ${draft.tracks.includes(t.id)?'checked':''}><span>${esc(t.artist)} — ${esc(t.title)}</span></label>`).join('')||'<p class="muted">Сначала добавьте музыку в библиотеку.</p>'}</div><div id="playlist-pick-folders" class="track-picker" hidden></div><p id="playlist-pick-count" class="muted"></p><div class="editor-actions"><button class="primary" id="create-playlist">Сохранить</button>${old?'<button class="secondary" id="delete-playlist">Удалить плейлист</button>':''}</div></div>`);
 $('#playlist-name').focus();window.enhancePlaylistPicker?.(draft);
 $('#playlist-track-search').oninput=e=>document.querySelectorAll('[data-pick-title]').forEach(row=>row.hidden=!row.dataset.pickTitle.includes(e.target.value.toLocaleLowerCase()));
 $('#playlist-image').onchange=guard(async e=>{const file=e.target.files[0];if(!file)return;const image=await CoverEditor.pick(file,{title:'Обложка плейлиста'});if(image){draft.image=image;$('#playlist-cover-preview').innerHTML=playlistArt(draft);}e.target.value='';});
 $('#clear-playlist-image').onclick=()=>{draft.image='';$('#playlist-cover-preview').innerHTML=playlistArt(draft);};
 $('#create-playlist').onclick=guard(()=>{const name=$('#playlist-name').value.trim();if(!name)throw new Error('Введите название плейлиста');draft.name=name;draft.description=$('#playlist-description').value.trim();draft.tracks=[...new Set([...draft.tracks.filter(id=>!state.tracks.some(t=>t.id===id)),...document.querySelectorAll('#playlist-pick-tracks input:checked')].map(c=>typeof c==='string'?c:c.value))];const next=old?playlists.map(p=>p.id===id?draft:p):[...playlists,draft];try{savePlaylists(next);}catch{throw new Error('Не удалось сохранить. Попробуйте уменьшить количество обложек.');}if(group?.key===id)group.label=name;$('#modal').close();render();toast('Плейлист сохранён');});
 if(old)$('#delete-playlist').onclick=()=>{modal(`<h3>Удалить плейлист «${esc(old.name)}»?</h3><p>Песни останутся в библиотеке.</p><button class="primary" id="confirm-delete-playlist">Удалить плейлист</button>`);$('#confirm-delete-playlist').onclick=guard(()=>{savePlaylists(playlists.filter(p=>p.id!==id));if(group?.key===id)group=null;$('#modal').close();render();});};
}
function trackMenu(id){
 const track=state.tracks.find(t=>t.id===id);if(!track)return;
 modal(`<h3>${esc(track.title)}</h3><div class="menu-actions"><button class="primary" id="add-queue">＋ В очередь следом</button><button class="secondary" id="play-now">▶ Слушать сейчас</button></div><p class="muted">Добавить в плейлист</p><div class="queue-list">${playlists.map(p=>`<button class="queue-item" data-add="${p.id}">${esc(p.name)}</button>`).join('')}</div><p><button class="secondary" id="create-for-track">＋ Новый плейлист</button></p>${group?.type==='playlist'?'<button class="secondary" id="remove-from-playlist">Убрать из плейлиста</button>':''}`);
 $('#add-queue').onclick=guard(async()=>{queue=MusicTools.enqueue(queue,index,track);await syncNativeQueue();$('#modal').close();toast('Трек добавлен следом в очередь');});
 $('#play-now').onclick=guard(async()=>{await playTracks(filtered(),id);$('#modal').close();});
 document.querySelectorAll('[data-add]').forEach(b=>b.onclick=guard(()=>{const next=playlists.map(p=>p.id===b.dataset.add?{...p,tracks:p.tracks.includes(id)?p.tracks:[...p.tracks,id]}:p);savePlaylists(next);$('#modal').close();render();toast('Добавлено в плейлист');}));
 $('#create-for-track').onclick=()=>newPlaylist(id);
 if($('#remove-from-playlist'))$('#remove-from-playlist').onclick=guard(()=>{savePlaylists(playlists.map(p=>p.id===group.key?{...p,tracks:p.tracks.filter(t=>t!==id)}:p));$('#modal').close();render();});
}
function toggleFavorite(id){if(!id)return;favorites.has(id)?favorites.delete(id):favorites.add(id);persist();$('#like').textContent=favorites.has(current?.id)?'♥':'♡';render();}
function showDuplicates(){
 const groups=MusicTools.duplicateGroups(state.tracks);
 if(!groups.length){modal('<h3>Повторы не найдены</h3><p>Нет треков с совпадающими названием, исполнителем и близкой длительностью.</p>');return;}
 modal(`<h3>Похожие треки: ${groups.length} групп</h3><p class="muted">Выберите версию, которую оставить. Снимите отметку с группы, если нужны все версии. Сравнение по тегам и длительности — прослушайте варианты при сомнении. Исходные файлы вне приложения не изменяются.</p><div class="duplicate-list">${groups.map((g,i)=>`<fieldset data-duplicate-group="${i}"><legend><label><input type="checkbox" class="duplicate-enabled" checked> ${esc(g[0].artist)} — ${esc(g[0].title)}</label></legend>${g.map((t,j)=>`<label class="duplicate-option"><input type="radio" name="keep-${i}" value="${t.id}" ${j===0?'checked':''}><span><b>${esc(t.ext.slice(1).toUpperCase())} • ${time(t.duration)} • ${(t.size/1048576).toFixed(1)} МБ</b><small>${esc(t.album)} • ${esc(t.filename)}${j===0?' • Рекомендуем оставить':''}</small></span></label>`).join('')}</fieldset>`).join('')}</div><button class="primary" id="remove-duplicates">Оставить выбранные версии</button>`);
 $('#remove-duplicates').onclick=guard(async()=>{const ids=[],replacements={};for(const field of document.querySelectorAll('[data-duplicate-group]')){if(!field.querySelector('.duplicate-enabled').checked)continue;const keep=field.querySelector('input[type=radio]:checked').value;for(const t of groups[Number(field.dataset.duplicateGroup)])if(t.id!==keep){ids.push(t.id);replacements[t.id]=keep;}}if(!ids.length)throw new Error('Выберите хотя бы одну группу');await call('removeTracks',{ids});await pruneRemoved(ids,replacements);$('#modal').close();await reload();toast(`Удалено повторов: ${ids.length}`);});
}
async function pruneRemoved(ids,replacements={}){
 if(current&&ids.includes(current.id)){if(mobile)await call('control',{action:'stop'});else audio.pause();current=null;playing=false;}
 const oldCurrent=queue[index],seen=new Set();queue=queue.map(t=>replacements[t.id]?{...state.tracks.find(x=>x.id===replacements[t.id]),requested:t.requested}:t).filter(t=>{if(!t.id||ids.includes(t.id)||(!t.requested&&seen.has(t.id)))return false;seen.add(t.id);return true;});index=current&&oldCurrent?queue.findIndex(t=>t.id===oldCurrent.id):-1;
 favorites=new Set([...favorites].map(id=>replacements[id]||id).filter(id=>!ids.includes(id)));savePlaylists(playlists.map(p=>({...p,tracks:[...new Set(p.tracks.map(id=>replacements[id]||id).filter(id=>!ids.includes(id)))]})));persistFavorites();await syncNativeQueue();
}
async function syncNativeQueue(){if(mobile&&current)await call('setQueue',{ids:queue.map(t=>t.id),index:Math.max(0,index),shuffle,repeat});}
function updateModes(){ $('#shuffle').classList.toggle('active',shuffle);$('#repeat').classList.toggle('active',repeat>0);$('#repeat').textContent=repeat===1?'↻¹':'↻';$('#repeat').title=['Повтор выключен','Повтор трека','Повтор очереди'][repeat];}
async function playTracks(tracks,id,options={}){
 if(!tracks.length){toast('Сначала добавьте музыку');return;}
 shuffle=options.random??shuffle;queue=[...tracks];
 if(shuffle){const selected=id&&queue.find(t=>t.id===id);queue=selected?[selected,...MusicTools.shuffled(queue.filter(t=>t.id!==id))]:MusicTools.shuffled(queue);}
 index=id?Math.max(0,queue.findIndex(t=>t.id===id)):0;updateModes();
 if(mobile){window.clearNativeQueueWrite?.();current=queue[index];await call('play',{ids:queue.map(t=>t.id),index,shuffle,repeat});updateNow();render();}else await playIndex(index);
}
async function playIndex(i){if(i<0||i>=queue.length)return;index=i;current={...queue[i],...state.tracks.find(t=>t.id===queue[i].id)};queue[i]=current;audio.src=mediaUrl(current);try{await Sound.start();await audio.play();Sound.track(current);}catch(e){toast('Не удалось воспроизвести этот файл: '+e.message);}updateNow();render();}
function updateNow(){
 document.body.classList.toggle('is-playing',playing);if(!current)return;if($('#now-cover').dataset.trackId!==current.id||$('#now-cover').dataset.coverVersion!==String(current.detailsUpdatedAt||0)){$('#now-cover').outerHTML=`<div id="now-cover" class="cover vinyl" data-track-id="${current.id}" data-cover-version="${current.detailsUpdatedAt||0}"><div class="vinyl-label">${art(current)}</div><i></i></div>`;}$('#now-title').textContent=current.title;$('#now-artist').textContent=current.artist;$('#like').textContent=favorites.has(current.id)?'♥':'♡';$('#play').textContent=playing?'Ⅱ':'▶';$('#duration').textContent=time(current.duration);
 if(!mobile&&'mediaSession'in navigator)navigator.mediaSession.metadata=new MediaMetadata({title:current.title,artist:current.artist,album:current.album,artwork:current.cover||current.customCover?[{src:current.customCover||mediaUrl(current,'art')}]:[]});
}
async function togglePlay(){if(!mobile)await Sound.start();
 if(!current)return playTracks(queue.length?queue:state.tracks);
 if(mobile)return call('control',{action:'toggle'});
 if(audio.paused){await audio.play();Sound.track(current);}else audio.pause();
}
async function next(direction=1,ended=false){
 if(mobile)return call('control',{action:direction>0?'next':'prev'});
 if(!queue.length)return;if(ended&&repeat===1)return playIndex(index);let target=index+direction;
 if(target>=queue.length){if(repeat===2)target=0;else return;}
 if(target<0)target=queue.length-1;await playIndex(target);
}
$('#play').onclick=guard(togglePlay);$('#hero-play').onclick=guard(()=>playTracks(state.tracks,null,{random:false}));$('#hero-shuffle').onclick=guard(()=>playTracks(state.tracks,null,{random:true}));
$('#prev').onclick=guard(()=>next(-1));$('#next').onclick=guard(()=>next());$('#like').onclick=guard(()=>toggleFavorite(current?.id));
$('#shuffle').onclick=guard(async()=>{if(!shuffle)await shuffleUpcoming();else{shuffle=false;updateModes();await syncNativeQueue();if(mobile)await call('mode',{shuffle,repeat});}});
$('#repeat').onclick=guard(async()=>{repeat=(repeat+1)%3;updateModes();if(mobile)await call('mode',{shuffle,repeat});});
audio.onplay=()=>{playing=true;updateNow();render();};audio.onpause=()=>{playing=false;updateNow();};audio.onended=guard(()=>next(1,true));audio.onerror=()=>toast('Не удалось прочитать аудио. Возможно, формат не поддерживается системой.');
function timeline(position,duration){$('#elapsed').textContent=time(position);$('#duration').textContent=time(duration);if(!$('#seek').matches(':active'))$('#seek').value=duration?Math.round(position/duration*1000):0;}
audio.ontimeupdate=()=>timeline(audio.currentTime,audio.duration||current?.duration||0);
$('#seek').onchange=guard(async e=>{const pos=Number(e.target.value)/1000*(mobile?(nativeStatus.duration||0)/1000:audio.duration||0);if(mobile)await call('seek',{position:Math.round(pos*1000)});else if(Number.isFinite(pos))audio.currentTime=pos;});
$('#volume').oninput=e=>{audio.volume=Number(e.target.value);localStorage.setItem('volume',audio.volume);};
async function shuffleUpcoming(){if(queue.length-index<3){toast('Добавьте хотя бы два следующих трека');return;}queue=[...queue.slice(0,index+1),...MusicTools.shuffled(queue.slice(index+1))];shuffle=true;updateModes();await syncNativeQueue();if(mobile)await call('mode',{shuffle,repeat});window.saveResume?.(true);}
function showQueue(){
 modal(`<h3>Очередь воспроизведения</h3><p class="muted">Треки из троеточия играют следом за текущим, в порядке добавления. Здесь можно перемешать, переставить или убрать следующие песни.</p><div class="queue-actions"><button class="primary" id="shuffle-queue" ${queue.length-index<3?'disabled':''}>⤨ Перемешать следующие треки</button></div><div class="queue-list">${queue.map((t,i)=>`<div class="queue-entry ${i===index?'current':''}"><button class="queue-item" data-index="${i}">${i===index?'▶ ':''}${esc(t.artist)} — ${esc(t.title)}${t.requested?' • добавлено тобой':''}</button>${i>index?`<div><button class="tiny" data-move="${i}" data-direction="-1" title="Выше">↑</button><button class="tiny" data-move="${i}" data-direction="1" title="Ниже">↓</button><button class="tiny" data-remove-queue="${i}" title="Убрать из очереди">×</button></div>`:''}</div>`).join('')||'<p class="muted">Добавьте треки через троеточие или включите всю библиотеку.</p>'}</div>${queue.length?'<p><button class="secondary" id="clear-queue">Очистить следующие треки</button></p>':''}`);
 $('#shuffle-queue').onclick=guard(async()=>{await shuffleUpcoming();showQueue();});
 document.querySelectorAll('[data-index]').forEach(b=>b.onclick=guard(async()=>{const i=Number(b.dataset.index);if(mobile){index=i;current=queue[i];await call('play',{ids:queue.map(t=>t.id),index,shuffle,repeat});}else await playIndex(i);$('#modal').close();}));
 document.querySelectorAll('[data-move]').forEach(b=>b.onclick=guard(async()=>{const i=Number(b.dataset.move),j=i+Number(b.dataset.direction);if(j<=index||j>=queue.length)return;[queue[i],queue[j]]=[queue[j],queue[i]];await syncNativeQueue();showQueue();}));
 document.querySelectorAll('[data-remove-queue]').forEach(b=>b.onclick=guard(async()=>{queue.splice(Number(b.dataset.removeQueue),1);await syncNativeQueue();showQueue();}));
 if($('#clear-queue'))$('#clear-queue').onclick=guard(async()=>{queue=queue.slice(0,index+1);await syncNativeQueue();showQueue();});
}
$('.transport-buttons').appendChild($('#queue'));$('#queue').onclick=showQueue;
if(!mobile&&'mediaSession'in navigator)for(const [name,fn]of Object.entries({play:()=>audio.play(),pause:()=>audio.pause(),previoustrack:()=>next(-1),nexttrack:()=>next()}))navigator.mediaSession.setActionHandler(name,guard(fn));
$('#search').oninput=()=>{if(view==='home'){view='tracks';group=null;}render();};$('#sort').onchange=render;$('#find-duplicates').onclick=showDuplicates;$('#play-selection').onclick=guard(()=>playTracks(filtered(),null,{random:false}));$('#shuffle-selection').onclick=guard(()=>playTracks(filtered(),null,{random:true}));
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus();}if(e.code==='Space'&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)&&!$('#modal').open){e.preventDefault();guard(togglePlay)();}});
async function acceptLibrary(data){if(!data)return;state=data;acceptPlaylists(state.playlistRecords);acceptFavorites(state.favoriteRecords||[]);await window.applyTrackReplacements?.();if(current){const fresh=state.tracks.find(t=>t.id===current.id);if(fresh)Object.assign(current,fresh);updateNow();if(!mobile&&Sound.context)Sound.track(current);}render();}
async function reload(){await acceptLibrary(await call('load'));}
function importMenu(){
 modal(`<h3>Добавить музыку</h3><p>Можно выбрать один трек или несколько сразу${mobile?'.':', а также целые папки с подпапками.'}</p><label class="check-option"><input type="checkbox" id="skip-similar" checked> Пропускать похожие повторы при импорте</label><p class="muted">Совпадение названия, исполнителя, альбома и длительности. Снимите отметку, чтобы сохранить разные версии. Полностью одинаковые файлы всегда пропускаются.</p><div class="menu-actions"><button class="primary" id="choose-files">＋ Отдельные файлы</button>${mobile?'':'<button class="secondary" id="choose-folders">＋ Папки с музыкой</button>'}</div>`);
 $('#choose-files').onclick=()=>{const skip=$('#skip-similar').checked;$('#modal').close();importMusic(null,'importFiles',skip);};
 if($('#choose-folders'))$('#choose-folders').onclick=()=>{const skip=$('#skip-similar').checked;$('#modal').close();importMusic(null,'import',skip);};
}
async function importMusic(paths,method='import',skipSimilar=true){
 $('#import').disabled=true;
 try{const report=await call(Array.isArray(paths)?'importPaths':method,{...(Array.isArray(paths)?{paths}:{}),skipSimilar});
  if(mobile){toast('Выберите песни. Импорт продолжится в уведомлении.');return;}
  if(report){await reload();modal(`<h3>Импорт завершён</h3><p>Добавлено: ${report.added}. Одинаковых файлов: ${report.duplicates}. Похожих повторов: ${report.similar||0}.</p>${report.errors.length?`<p class="warning">Не удалось импортировать: ${report.errors.length}</p><div class="queue-list">${report.errors.map(e=>`<p class="muted">${esc(e.file)}: ${esc(e.message)}</p>`).join('')}</div>`:''}`);}
 }catch(e){toast(e.message);}finally{$('#import').disabled=false;$('#import-progress').hidden=true;}
}
$('#import').onclick=importMenu;
if(!mobile){Luma.onProgress(p=>{const box=$('#import-progress');box.hidden=!p;if(p)box.textContent=`Копируем и читаем теги: ${p.done+1} / ${p.total} — ${p.file}`;});Luma.onLibraryChanged?.(guard(async()=>{const previous=state.pairingRevision||0,pairOpen=$('#modal').open&&!!$('#pair-expiry'),data=await call('load');await acceptLibrary(data);if(pairOpen&&data.pairingRevision>previous){$('#modal').close();toast('Телефон подключён');}}));}
function renderSync(){
 if(mobile){
  $('#content').innerHTML=`<div class="sync-panel"><h3>Музыка в обе стороны</h3><p>Подключите телефон и ПК к одной сети Wi-Fi. Интернет не нужен. На ПК откройте этот раздел и нажмите «Подключить телефон».</p><label>Адрес компьютера<input id="server" placeholder="http://192.168.1.10:47832" value="${esc(state.connection?.server||'')}" inputmode="url"></label><label>Код с экрана ПК<input id="pin" placeholder="6 цифр" inputmode="numeric" maxlength="6"></label><button class="primary" id="pair-phone">Подключить</button><div class="sync-directions"><button class="secondary" id="sync-phone">↓ Скопировать с ПК на телефон</button><button class="secondary" id="upload-phone">↑ Передать музыку с телефона на ПК</button><button class="secondary" id="sync-playlists">⇄ Плейлисты и избранное</button><button class="secondary" id="cancel-sync">Отменить передачу</button></div><p class="status" id="sync-status">${esc(state.syncStatus||'Выберите направление передачи. Песни сохраняются в памяти устройства.')}</p><p class="muted">Избранное и плейлисты с описаниями и обложками синхронизируются в обе стороны при передаче музыки. Копируются только отсутствующие файлы. Удалённые через поиск дублей файлы не возвращаются при следующей передаче.</p></div><div class="sync-panel update-panel"><h3>Обновление приложения</h3><p>Установленная версия: ${esc(state.appVersion||'—')}. APK загружается прямо с подключённого ПК, музыка и плейлисты сохраняются.</p><button class="secondary" id="check-update">Проверить обновление на ПК</button><button class="primary" id="install-update" ${state.updateReady?'':'hidden'}>Установить обновление</button><p class="muted">Android попросит разрешить обновления из Tembrival и подтвердить установку.</p></div>`;
  $('#pair-phone').onclick=guard(async()=>{await call('pair',{server:$('#server').value.trim(),pin:$('#pin').value.trim()});toast('Подключение…');});
  $('#sync-phone').onclick=guard(async()=>{await Promise.all([playlistSave,favoriteSave]);await call('sync');toast('Копирование на телефон запущено');});
  $('#upload-phone').onclick=guard(async()=>{await Promise.all([playlistSave,favoriteSave]);await call('upload');toast('Передача на ПК запущена');});
  $('#sync-playlists').onclick=guard(async()=>{await Promise.all([playlistSave,favoriteSave]);await call('syncPlaylists');toast('Синхронизация плейлистов и избранного…');});
  $('#cancel-sync').onclick=guard(()=>call('cancelSync'));
  $('#check-update').onclick=guard(async()=>{await call('update');toast('Проверяем обновление на подключённом ПК…');});
  $('#install-update').onclick=guard(()=>call('installUpdate'));
 }else{
  $('#content').innerHTML=`<div class="sync-panel"><h3>Музыка между ПК и телефоном</h3><p>Передавайте коллекцию в обе стороны по общей сети Wi-Fi. На телефоне добавляйте отдельные файлы, затем выбирайте направление передачи. Плейлисты с обложками обновляются в обе стороны. Независимые правки сохраняются как две версии.</p><div class="server-addresses">${(state.serverAddresses||[]).map(a=>`<p><small>${esc(a.name)}</small><code class="address">${esc(a.url)}</code></p>`).join('')}</div><button class="primary" id="pair-desktop">⇄ Подключить телефон</button><p class="muted">Во время передачи ПК и плеер должны работать. Подойдёт и точка доступа телефона.</p><h3>Знакомые устройства</h3><p>Сопряжение сохраняется после выхода. Статус связи обновляется автоматически; при обрыве сети — в течение 45 секунд. Старые лишние записи можно убрать кнопкой «Отключить доступ».</p><div id="known-devices">${deviceCards(state.devices)}</div></div><div class="sync-panel update-panel"><h3>Обновить приложение на телефоне</h3><p>APK этой сборки: ${esc(state.appVersion||'0.4.0')}. Можно скачать по QR без нового сопряжения. В новой Android-версии также есть кнопка проверки обновлений с ПК.</p><button class="secondary" id="update-desktop">Обновить Android по Wi-Fi</button></div>`;
  $('#pair-desktop').onclick=guard(async()=>{const previous=state.pairingRevision||0,info=await call('pair');modal(`<h3>Подключение Android</h3><p class="muted">На телефоне введите адрес ПК и код. Код действует 5 минут и используется один раз.</p><div class="pin">${info.pin}</div><p class="muted">Удостоверение ПК (для ручного подключения):</p><code class="peer-code">${esc(info.verificationCode)}</code>${addressCards(info.addresses)}<p class="muted" id="pair-expiry">Код действует до ${new Date(info.expires).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</p>`);pairTimer=setInterval(guard(async()=>{const data=await call('load');if(data.pairingRevision>previous){state=data;$('#modal').close();render();toast('Телефон подключён');}else if(Date.now()>info.expires){$('#pair-expiry').textContent='Код истёк. Закройте окно и создайте новый.';clearInterval(pairTimer);}}),2000);});
  $('#update-desktop').onclick=guard(async()=>{const info=await call('networkInfo');modal(`<h3>Обновить Android • ${esc(info.version)}</h3><p>Откройте адрес с <b>/install</b> в конце или сканируйте QR камерой телефона. Скачайте APK и установите поверх текущей версии. Удалять приложение не нужно.</p>${addressCards(info.addresses)}<p class="muted">Музыка и плейлисты сохранятся. Подтверждение установки выполните на телефоне.</p>`);});
  document.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=guard(async()=>{await call('revoke',{id:b.dataset.revoke});await reload();toast('Доступ отключён');}));
 }
}
function addressCards(addresses){return '<div class="queue-list">'+(addresses.map(a=>`<div class="qr-pair"><img src="${a.qr}" alt="QR загрузки APK"><div><small class="muted">${esc(a.name)}</small><code class="address">${esc(a.url)}</code><p class="muted">Сканируйте камерой для установки<br>или обновления APK по Wi-Fi.</p></div></div>`).join('')||'<p class="warning">Подключите ПК к домашней сети.</p>')+'</div>';}
window.onNativeRefresh=reload;
if(mobile){
 window.onPairLink=(host,pin)=>{navigate('sync');$('#server').value=host;$('#pin').value=pin;};
 let nativePollBusy=false;
 window.refreshNativePlayback=async()=>{if(nativePollBusy)return;nativePollBusy=true;try{
  const s=JSON.parse(Android.call('status','{}'));if(window.nativeQueueWritePending?.(s))return;nativeStatus=s;state.connection=s.connection||state.connection;window.refreshNetworkStatus?.(s);
  if(s.id){const changed=current?.id!==s.id;current=state.tracks.find(t=>t.id===s.id)||current;playing=s.playing;index=s.index;
   if(s.ids&&s.ids.join('|')!==queue.map(t=>t.id).join('|'))queue=s.ids.map(id=>state.tracks.find(t=>t.id===id)).filter(Boolean);
   shuffle=s.shuffle??shuffle;repeat=s.repeat??repeat;updateModes();updateNow();timeline(s.position/1000,s.duration/1000);if(changed)render();
  }else if(playing){playing=false;updateNow();}
  if($('#sync-status'))$('#sync-status').textContent=s.syncStatus||'';
  if($('#install-update'))$('#install-update').hidden=!s.updateReady;
  if(s.revision!==state.revision)await reload();
  if(s.error&&s.error!==window.lastError){window.lastError=s.error;toast(s.error);}if(!s.error)window.lastError='';
 }catch{}finally{nativePollBusy=false;}};
 setInterval(window.refreshNativePlayback,900);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.refreshNativePlayback();});
 window.addEventListener('pageshow',window.refreshNativePlayback);
}
reload().catch(e=>{toast('Ошибка загрузки: '+e.message);$('#content').innerHTML=empty('Не удалось открыть библиотеку',esc(e.message));});
if(!mobile){let depth=0;document.addEventListener('dragenter',e=>{e.preventDefault();depth++;document.body.classList.add('dragging');});document.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});document.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;document.body.classList.remove('dragging');}});document.addEventListener('drop',e=>{e.preventDefault();depth=0;document.body.classList.remove('dragging');const paths=[...e.dataTransfer.files].map(f=>Luma.filePath(f)).filter(Boolean);if(paths.length)importMusic(paths);});}


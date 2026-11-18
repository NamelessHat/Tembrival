'use strict';

async function deleteLibraryTracks(ids,playlistId=null){
 ids=[...new Set(ids)].filter(id=>state.tracks.some(t=>t.id===id));
 if(current&&ids.includes(current.id)){
  if(mobile)await call('control',{action:'stop'});else{audio.pause();audio.removeAttribute('src');audio.load();}
 }
 if(ids.length)await call('removeTracks',{ids});
 if(group?.type==='playlist'&&group.key===playlistId)group=null;
 if(playlistId)savePlaylists(playlists.filter(p=>p.id!==playlistId));
 await pruneRemoved(ids);await Promise.all([playlistSave,favoriteSave]);
 ids.forEach(id=>selectedIds.delete(id));
 if(!current){localStorage.removeItem('resume-playback');nativeStatus={};timeline(0,0);}else window.saveResume?.(true);
 if(group?.type==='playlist'&&group.key===playlistId)group=null;
 await reload();updateNow();if(!current){$('#now-cover').outerHTML='<div id="now-cover" class="cover placeholder">♫</div>';$('#now-title').textContent='Ваша музыка ждёт';$('#now-artist').textContent='Выберите трек из библиотеки';$('#play').textContent='▶';$('#like').textContent='♡';if(!mobile&&'mediaSession'in navigator)navigator.mediaSession.metadata=null;}
}
function confirmTrackDeletion(ids){
 const tracks=state.tracks.filter(t=>ids.includes(t.id));if(!tracks.length)return toast('Сначала выберите треки');
 closeTrackMenu();modal(`<h3>${tracks.length===1?'Удалить трек?':'Удалить выбранные треки?'}</h3><p>${tracks.length===1?esc(tracks[0].artist)+' — '+esc(tracks[0].title):'Выбрано треков: '+tracks.length}</p><p class="muted">Песни будут удалены из библиотеки на этом устройстве, всех её плейлистов, избранного и очереди.${mobile?'':' Исходные файлы в ваших папках сохранятся.'}</p><div class="editor-actions"><button class="secondary" id="cancel-delete-tracks">Отмена</button><button class="primary" id="confirm-delete-tracks">Удалить из библиотеки</button></div><p id="delete-error" role="alert"></p>`);
 $('#cancel-delete-tracks').onclick=()=>$('#modal').close();$('#confirm-delete-tracks').onclick=()=>executeDeletion(()=>deleteLibraryTracks(tracks.map(t=>t.id)),tracks.length);
}
function confirmPlaylistDeletion(id){
 const p=playlists.find(p=>p.id===id);if(!p)return;
 const ids=[...new Set(p.tracks)].filter(id=>state.tracks.some(t=>t.id===id));
 const shared=ids.filter(id=>playlists.some(other=>other.id!==p.id&&other.tracks.includes(id))).length;
 closeTrackMenu();modal(`<h3>Удалить плейлист «${esc(p.name)}»?</h3><p>Можно удалить только подборку или вместе с её песнями.</p><label class="delete-option"><input type="checkbox" id="delete-playlist-tracks" ${ids.length?'':'disabled'}><span>Также удалить треки из библиотеки: ${ids.length}</span></label><p class="muted" id="delete-playlist-note">Без этой отметки песни останутся в библиотеке и других плейлистах.</p><div class="editor-actions"><button class="secondary" id="cancel-delete-playlist">Отмена</button><button class="primary" id="confirm-delete-playlist">Удалить только плейлист</button></div><p id="delete-error" role="alert"></p>`);
 $('#delete-playlist-tracks').onchange=e=>{const all=e.target.checked;$('#confirm-delete-playlist').textContent=all?'Удалить плейлист и треки':'Удалить только плейлист';$('#delete-playlist-note').textContent=all?'Песни будут удалены на этом устройстве из библиотеки, избранного, очереди и всех плейлистов.'+(shared?' В других плейлистах используются '+shared+' из этих треков — оттуда они тоже исчезнут.':'')+(mobile?'':' Исходные файлы в ваших папках сохранятся.'):'Без этой отметки песни останутся в библиотеке и других плейлистах.';};
 $('#cancel-delete-playlist').onclick=()=>$('#modal').close();$('#confirm-delete-playlist').onclick=()=>{const all=$('#delete-playlist-tracks').checked;executeDeletion(()=>deleteLibraryTracks(all?ids:[],id),all?ids.length:0,true);};
}
async function executeDeletion(action,count,playlist=false){
 const buttons=[...$('#modal-content').querySelectorAll('button,input')];buttons.forEach(b=>b.disabled=true);
 try{await action();$('#modal').close();toast(playlist?'Плейлист удалён'+(count?' вместе с треками: '+count:''): 'Удалено треков: '+count);}
 catch(e){if($('#delete-error'))$('#delete-error').textContent=e.message;else toast(e.message);buttons.forEach(b=>b.disabled=false);}
}
function playlistMenu(id,anchor){
 const p=playlists.find(p=>p.id===id);if(!p)return;
 openTrackPopover(`<h3>${esc(p.name)}</h3><div class="track-context-menu"><button id="playlist-menu-edit">✎ <span>Редактировать плейлист</span></button><button class="delete-action" id="playlist-menu-delete">× <span>Удалить плейлист…</span></button></div>`,anchor);
 $('#playlist-menu-edit').onclick=()=>editPlaylist(id);$('#playlist-menu-delete').onclick=()=>confirmPlaylistDeletion(id);
}
const menuBeforeDeletion=trackMenu;trackMenu=function(id,anchor){menuBeforeDeletion(id,anchor);const menu=$('#track-popover .track-context-menu');if(!menu||!state.tracks.some(t=>t.id===id))return;const button=document.createElement('button');button.id='delete-track';button.className='delete-action';button.setAttribute('role','menuitem');button.innerHTML='× <span>Удалить из библиотеки…</span>';button.onclick=()=>confirmTrackDeletion([id]);menu.append(button);const popover=$('#track-popover');popover.style.top=Math.max(8,Math.min(parseFloat(popover.style.top)||8,innerHeight-popover.offsetHeight-8))+'px';};
const editBeforeDeletion=editPlaylist;editPlaylist=function(id,trackId){editBeforeDeletion(id,trackId);if($('#delete-playlist'))$('#delete-playlist').onclick=()=>confirmPlaylistDeletion(id);};
const renderBeforeDeletion=render;render=function(){
 renderBeforeDeletion();
 if($('#selection-tools')){const button=document.createElement('button');button.id='delete-selected';button.className='secondary delete-action';button.textContent='Удалить выбранные…';button.disabled=!selectedIds.size;button.onclick=()=>confirmTrackDeletion([...selectedIds]);$('#selection-tools').append(button);}
 if(group?.type==='playlist'&&$('#edit-playlist')){const button=document.createElement('button');button.id='delete-current-playlist';button.className='secondary delete-action';button.textContent='Удалить плейлист…';button.onclick=()=>confirmPlaylistDeletion(group.key);$('#edit-playlist').after(button);}
 if(view==='playlists'&&!group)document.querySelectorAll('.card[data-playlist]').forEach(card=>{const id=card.dataset.playlist,wrap=document.createElement('div'),button=document.createElement('button');wrap.className='playlist-card-wrap';card.replaceWith(wrap);wrap.append(card);button.className='secondary playlist-more';button.title='Действия с плейлистом';button.setAttribute('aria-label','Действия с плейлистом');button.textContent='⋮';button.onclick=()=>playlistMenu(id,button);wrap.append(button);card.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();playlistMenu(id,{x:e.clientX,y:e.clientY});};});
};

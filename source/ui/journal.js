'use strict';
// Static paper and pixel details. No timers, scroll handlers, or extra list passes.
(()=>{
 const paths={
  folder:'<path fill="#83b8ad" d="M2 7h9l3 3h16v19H2z"/><path fill="#b8d6c0" d="M2 12h28v4H2z"/><path fill="#fce7bf" d="M7 20h12v3H7z"/>',
  album:'<path fill="#deb383" d="M3 4h26v26H3z"/><path fill="#fff0cd" d="M6 7h20v20H6z"/><path fill="#65445c" d="M12 9h8v3h3v8h-3v3h-8v-3H9v-8h3z"/><path fill="#dd8c9b" d="M14 14h4v4h-4z"/>',
  artist:'<path fill="#b988a6" d="M12 4h8v3h3v10h-3v3h-8v-3H9V7h3zM6 24h20v6H6z"/><path fill="#f6d6b5" d="M12 8h8v7h-8z"/>',
  playlist:'<path fill="#ab9abd" d="M3 5h26v24H3z"/><path fill="#f8e5c1" d="M7 10h18v6H7zM7 21h5v4H7zM20 21h5v4h-5z"/><path fill="#d97f9b" d="M14 20h4v5h-4z"/>',
  crystal:'<path fill="#75aaa8" d="m16 2 10 11-10 17L6 13z"/><path fill="#b7dfcf" d="m16 2 1 13-11-2z"/><path fill="#e1f0d9" d="m16 2 10 11-9 2z"/><path fill="#4e858d" d="m17 15 9-2-10 17z"/>',
  flag:'<path fill="#9c6985" d="M8 3h3v27H8zM4 28h15v3H4z"/><path fill="#dd7c97" d="M11 4h17l-5 5 5 5H11z"/><path fill="#ffd4b0" d="M11 4h4v10h-4z"/>'
 };
 const icon=kind=>`<svg class="journal-pixel" viewBox="0 0 32 32" aria-hidden="true">${paths[kind]||paths.crystal}</svg>`;
 const routes={home:['flag','ПРИВАЛ НА МАРШРУТЕ'],tracks:['crystal','ВСЯ МУЗЫКА В РЮКЗАКЕ'],albums:['album','ИСТОРИИ НА SIDE A'],artists:['artist','ЗНАКОМЫЕ ГОЛОСА'],folders:['folder','ПОЛОЧКИ ТВОЕЙ КОЛЛЕКЦИИ'],favorites:['crystal','СОБРАНО С ЛЮБОВЬЮ'],playlists:['playlist','МУЗЫКА ДЛЯ СВОЕГО ПУТИ'],sync:['flag','НА СВЯЗИ'],settings:['flag','ОБУСТРОИТЬ ПРИВАЛ']};
 const labels={folder:['ПАПКА','СОХРАНЕНО РЯДОМ'],album:['АЛЬБОМ','СТОРОНА A · 33⅓'],artist:['ИСПОЛНИТЕЛЬ','ГОЛОСА НА МАРШРУТЕ'],playlist:['ПОДБОРКА','СОБРАНО ТОБОЙ']};
 const emptyBeforeJournal=empty;
 empty=function(title,description,action=false){const kind=view==='playlists'?'playlist':view==='folders'?'folder':view==='favorites'?'crystal':'album';const scene=`<div class="empty-scene" aria-hidden="true"><svg viewBox="0 0 180 82"><path fill="#d9c1bd" d="m8 67 35-42 23 22L101 8l65 59z"/><path fill="#fdf1dc" d="m101 8-17 20 13-3 7 9 8-8 11 5zM43 25 31 40l12-3 9 6 5-3z"/><path fill="#b5c7b5" d="M0 67h180v7H0z"/><path fill="#90aaa1" d="M7 74h166v3H7z"/><path fill="#8a646e" d="m116 63 24-3 11 6-2 5-35-3z"/><path fill="#dc8a7b" d="M125 50h11v16h-15V56h4z"/><path fill="#f5c183" d="M128 44h5v12h5v7h-13V53h3z"/><path fill="#fff0c6" d="M129 55h4v9h-4z"/><path fill="#a77787" d="M26 49h3v19h-3z"/><path fill="#dc849e" d="M29 49h17l-4 5 4 4H29z"/></svg><span>${icon(kind)}</span></div>`;return emptyBeforeJournal(title,description,action).replace('<div class="empty-icon">♫</div>',scene);};
 $('.player .now-text').insertAdjacentHTML('afterbegin','<span class="now-caption" aria-hidden="true">СЕЙЧАС ЗВУЧИТ</span>');
 const divider=document.createElement('div');divider.className='journal-divider';divider.setAttribute('aria-hidden','true');divider.innerHTML=icon('crystal')+'<span><svg class="night-route" viewBox="0 0 760 18" preserveAspectRatio="none" aria-hidden="true"><path d="m0 12 95-7 140 8 150-9 170 8 108-7 97 6" fill="none" stroke="#466b71" stroke-width="1"/><g fill="#89bca9"><path d="M94 2h2v3h3v2h-3v3h-2V7h-3V5h3zM384 1h2v2h2v2h-2v2h-2V5h-2V3h2zM662 2h2v2h2v2h-2v2h-2V6h-2V4h2z"/></g><g fill="#c99c7d"><path d="M234 10h2v2h2v2h-2v2h-2v-2h-2v-2h2zM554 9h2v2h2v2h-2v2h-2v-2h-2v-2h2z"/></g></svg></span>'+icon('flag');$('.section-heading').after(divider);
 const routeMotif='<svg class="collection-route" viewBox="0 0 180 32" aria-hidden="true"><path d="m3 21 38-12 36 13 46-15 54 12" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4"/><path d="M120 2h2v20h-2zM122 2h11l-3 4 3 4h-11z" fill="currentColor"/></svg>';
 const mirrorMotif='<svg class="collection-mirrors" viewBox="0 0 180 38" aria-hidden="true"><path d="m8 26 32-20-5 27zM130 2l35 12-20 22z" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1"/><path d="M24 13v13m-6-7h12M148 12v12m-6-6h12M80 12v9m-4-4h8" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
 function decorateCard(card,kind){
  if(card.querySelector('.collection-visual'))return;
  const cover=card.querySelector(':scope > .cover');if(!cover)return;
  if(cover.tagName==='IMG'){cover.loading='lazy';cover.decoding='async';}
  else if(cover.classList.contains('placeholder'))cover.innerHTML=icon(kind);
  const visual=document.createElement('span');visual.className='collection-visual';visual.setAttribute('aria-hidden','true');
  const object=document.createElement('span');object.className='collection-object object-'+kind;
  const face=document.createElement('span');face.className='object-face';cover.before(visual);face.append(cover);
  if(kind==='album')object.innerHTML='<i class="object-vinyl"></i>';
  if(kind==='folder')object.innerHTML='<i class="object-tab"></i><i class="object-file"></i>';
  object.append(face);
  if(kind==='playlist')object.insertAdjacentHTML('beforeend','<span class="object-reels"><i></i><b></b><i></i></span><i class="object-seam"></i>');
  if(kind==='artist'||kind==='folder')object.insertAdjacentHTML('beforeend','<i class="object-mark"></i>');
  visual.append(object);visual.insertAdjacentHTML('beforeend',routeMotif+mirrorMotif);
 }
 const renderBeforeJournal=render;
 render=function(){renderBeforeJournal();const route=routes[view]||routes.tracks,chapter=$('.trail-chapter');if(chapter.dataset.journalRoute!==view){chapter.dataset.journalRoute=view;chapter.innerHTML=icon(route[0])+'<span>'+route[1].replace('SIDE A',document.documentElement.dataset.theme==='night'?'SIDE B':'SIDE A')+'</span><i>✦</i><span class="reflection-sigil" aria-hidden="true"><svg viewBox="0 0 28 18"><path fill="#87beac" d="m7 1 6 8-6 8-6-8z"/><path fill="#d5a487" d="m21 1 6 8-6 8-6-8z"/><path fill="#193d46" d="M7 5v8l3-4zM21 5l-3 4 3 4z"/></svg></span>';}
  divider.hidden=['sync','settings'].includes(view);
  // Only collection cards are decorated. Track rows stay untouched.
  if(['albums','artists','folders','playlists'].includes(view))document.querySelectorAll('#content .card').forEach(card=>{const scope=card.dataset.collectionOpen?JSON.parse(card.dataset.collectionOpen):null,kind=scope?.type||'playlist',label=labels[kind]||labels.playlist;card.dataset.sleeve=kind;card.dataset.caption=document.documentElement.dataset.theme==='night'?'Side B · МЕЧТЫ':'Side A · ИССЛЕДОВАНИЯ';decorateCard(card,kind);if(!card.querySelector('.sleeve-label'))card.insertAdjacentHTML('afterbegin',`<span class="sleeve-label" aria-hidden="true">${icon(kind)}<span>${label[0]}</span><i>✦</i></span>`);});
  if(view==='home')document.querySelectorAll('.library-destination').forEach(card=>{const kind={tracks:'album',folders:'folder',playlists:'playlist'}[card.dataset.openView];if(kind)card.firstElementChild.innerHTML=icon(kind);});
 };
 function refreshSides(){const side=document.documentElement.dataset.theme==='night'?'B':'A';document.querySelectorAll('#content .card[data-sleeve]').forEach(card=>card.dataset.caption=side==='B'?'Side B · МЕЧТЫ':'Side A · ИССЛЕДОВАНИЯ');const chapter=document.querySelector('.trail-chapter[data-journal-route=albums]>span');if(chapter)chapter.textContent='ИСТОРИИ НА SIDE '+side;const caption=document.querySelector('.art-caption');if(caption?.firstChild?.nodeType===Node.TEXT_NODE)caption.firstChild.textContent='Side '+side+' ';}
 document.addEventListener('luma-theme-changed',refreshSides);
 render();refreshSides();
})();

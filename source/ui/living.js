'use strict';
function recordSource(track){if(track?.customCover)return track.customCover;if(!track?.cover)return '';const src=mediaUrl(track,'art');return src+(src.includes('?')?'&':'?')+'v='+encodeURIComponent(track.detailsUpdatedAt||0);}
function refreshLiving(){const src=recordSource(current);RecordPalette.paint($('#now-cover'),src);RecordPalette.paint($('.player'),src);document.querySelectorAll('.track-record').forEach(el=>RecordPalette.paint(el,src));const like=$('#like');like.setAttribute('aria-pressed',String(favorites.has(current?.id)));like.title=favorites.has(current?.id)?'Убрать из избранного':'В избранное';}
const updateBeforeLiving=updateNow;updateNow=function(){updateBeforeLiving();refreshLiving();};
const renderBeforeLiving=render;render=function(){renderBeforeLiving();refreshLiving();};
let favoriteOrigin;
document.addEventListener('click',e=>{const button=e.target.closest('#like,.favorite');favoriteOrigin=button?button.getBoundingClientRect():null;},true);
const favoriteBeforeLiving=toggleFavorite;toggleFavorite=function(id){const added=id&&!favorites.has(id),rect=favoriteOrigin||$('#like').getBoundingClientRect();favoriteOrigin=null;favoriteBeforeLiving(id);refreshLiving();if(!added)return;const sparks=document.createElement('span');sparks.className='favorite-sparks';sparks.setAttribute('aria-hidden','true');for(let i=0;i<6;i++)sparks.append(document.createElement('i'));sparks.style.left=Math.min(innerWidth-34,Math.max(0,rect.left+rect.width/2-16))+'px';sparks.style.top=Math.min(innerHeight-34,Math.max(0,rect.top+rect.height/2-16))+'px';document.body.append(sparks);setTimeout(()=>sparks.remove(),700);};
render();updateNow();

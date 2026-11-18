'use strict';
const routeHistory=[];
const strawberry='<svg class="trail-berry" viewBox="0 0 20 24" aria-hidden="true"><path fill="#88b8a2" d="M5 0h3v3h4V0h3v3h3v3H2V3h3z"/><path fill="#e786a1" d="M2 7h16v3h2v7h-3v3h-3v3H6v-3H3v-3H0v-7h2z"/><path fill="#ffe6bf" d="M4 10h2v2H4zM11 9h2v2h-2zM15 13h2v2h-2zM7 15h2v2H7zM10 19h2v2h-2z"/></svg>';
const backButton=document.createElement('button');backButton.id='nav-back';backButton.className='icon';backButton.setAttribute('aria-label','Вернуться назад');backButton.title='Назад · Alt + ←';backButton.textContent='←';$('header').prepend(backButton);
$('#section-caption').insertAdjacentHTML('beforebegin','<span class="trail-chapter" aria-hidden="true">'+strawberry+'<span>ЕЩЁ ОДНА ГЛАВА</span><i>✦</i></span>');
function routeSnapshot(){return {view,group:group?{...group}:null,query:$('#search').value,scroll:window.scrollY};}
function rememberRoute(){const next=routeSnapshot(),last=routeHistory.at(-1);if(!last||JSON.stringify([last.view,last.group,last.query])!==JSON.stringify([next.view,next.group,next.query]))routeHistory.push(next);if(routeHistory.length>60)routeHistory.shift();}
const coreNavigate=navigate;navigate=function(next){window.closeTrackMenu?.();if(next!==view||group)rememberRoute();coreNavigate(next);window.scrollTo(0,0);};
window.openCollection=function(next){rememberRoute();group=next;$('#search').value='';render();window.scrollTo(0,0);};
function dismissOverlay(){const crop=document.querySelector('#crop-dialog');if(crop?.open){crop.close();return true;}if($('#track-popover')&&!$('#track-popover').hidden){closeTrackMenu(true);return true;}if($('#modal').open){$('#modal').close();return true;}if(window.closeQueueDrawer?.())return true;return false;}
window.handleBackNavigation=function(){if(dismissOverlay())return true;const previous=routeHistory.pop();if(previous){view=previous.view;group=previous.group;if(group?.type==='playlist'&&!playlists.some(p=>p.id===group.key))group=null;if(group&&['folder','album','artist'].includes(group.type)&&!collectionMembers(collectionScope(group.type,group.key,group.artist??null)).length)group=null;$('#search').value=previous.query;render();requestAnimationFrame(()=>window.scrollTo(0,previous.scroll));return true;}if(group){group=null;$('#search').value='';render();window.scrollTo(0,0);return true;}return false;};
backButton.onclick=()=>{if(!handleBackNavigation()&&view!=='tracks')navigate('tracks');};document.addEventListener('keydown',e=>{if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();handleBackNavigation();}});
const renderWithSelection=render;render=function(){renderWithSelection();localStorage.setItem('last-view',JSON.stringify(view));backButton.disabled=!routeHistory.length&&!group&&view==='tracks';document.body.dataset.route=view;};
const last=read('last-view','tracks');if(['home','tracks','albums','artists','folders','favorites','playlists','mixes','sync','settings'].includes(last))view=last;
// Bind again after wrapping navigate, so every navigation button records history.
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));render();


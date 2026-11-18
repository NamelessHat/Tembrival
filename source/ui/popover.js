'use strict';
let trackMenuAnchor;
function closeTrackMenu(restoreFocus=false){const root=$('#track-popover');if(!root||root.hidden)return;root.hidden=true;if(restoreFocus&&trackMenuAnchor?.isConnected)trackMenuAnchor.focus();}
window.closeTrackMenu=closeTrackMenu;
function openTrackPopover(html,anchor){
 if($('#modal').open)$('#modal').close();let root=$('#track-popover');if(!root){root=document.createElement('div');root.id='track-popover';root.hidden=true;root.setAttribute('role','menu');root.setAttribute('aria-label','Действия с треком');document.body.append(root);
  root.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.disabled)closeTrackMenu();},true);
  root.onkeydown=e=>{const buttons=[...root.querySelectorAll('button:not(:disabled)')];let i=buttons.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();closeTrackMenu(true);return;}if(e.key==='ArrowDown')i=(i+1)%buttons.length;else if(e.key==='ArrowUp')i=(i-1+buttons.length)%buttons.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=buttons.length-1;else return;e.preventDefault();buttons[i]?.focus();};
 }
 root.innerHTML=html;root.querySelectorAll('button').forEach(b=>b.setAttribute('role','menuitem'));root.hidden=false;root.style.visibility='hidden';
 trackMenuAnchor=anchor instanceof Element?anchor:document.activeElement instanceof HTMLElement?document.activeElement:null;let x,y;
 if(anchor instanceof Element){const r=anchor.getBoundingClientRect();x=r.right-root.offsetWidth;y=r.bottom+5;if(y+root.offsetHeight>innerHeight-8)y=r.top-root.offsetHeight-5;}
 else if(anchor&&Number.isFinite(anchor.x)){x=anchor.x;y=anchor.y;}
 else{const r=$('.now').getBoundingClientRect();x=Math.min(r.right,innerWidth-root.offsetWidth-10);y=Math.max(8,r.top-root.offsetHeight);}
 root.style.left=Math.max(8,Math.min(x,innerWidth-root.offsetWidth-8))+'px';root.style.top=Math.max(8,Math.min(y,innerHeight-root.offsetHeight-8))+'px';root.style.visibility='';root.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
document.addEventListener('pointerdown',e=>{const root=$('#track-popover');if(root&&!root.contains(e.target))closeTrackMenu();});window.addEventListener('resize',()=>closeTrackMenu());window.addEventListener('scroll',e=>{if(!$('#track-popover')?.contains(e.target))closeTrackMenu();},true);
function changeTrackCover(t){modal(`<h3>Обложка трека</h3><p class="muted">${esc(t.artist)} — ${esc(t.title)}</p><div class="track-cover-panel">${art(t)}</div><div class="cover-panel-actions"><label class="primary file-label">Выбрать изображение<input id="cover-panel-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><button class="secondary" id="restore-track-cover" ${t.customCover?'':'disabled'}>Вернуть оригинальную</button></div>`);$('#modal').classList.add('cover-panel-dialog');$('#cover-panel-file').onchange=guard(async e=>{const image=await CoverEditor.pick(e.target.files[0],{title:'Обложка трека'});if(image){await call('updateTrack',{id:t.id,details:{customCover:image}});await reload();$('#modal').close();toast('Обложка сохранена');}else e.target.value='';});$('#restore-track-cover').onclick=guard(async()=>{await call('updateTrack',{id:t.id,details:{customCover:''}});await reload();$('#modal').close();toast('Оригинальная обложка восстановлена');});}
const baseModal=modal;modal=function(html){$('#modal').classList.remove('cover-panel-dialog');baseModal(html);};

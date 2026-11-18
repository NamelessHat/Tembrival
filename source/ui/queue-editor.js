'use strict';
let queueDrag=null,queueRenderSignature='',queueWrite=null;
window.clearNativeQueueWrite=()=>{queueWrite=null;};
function ensureQueueKeys(){const seen=new Set();queue=queue.map(t=>{let key=t.queueKey;if(!key||seen.has(key)){key=crypto.randomUUID();t={...t,queueKey:key};}seen.add(key);return t;});}
const syncQueueBeforeEditor=syncNativeQueue;
syncNativeQueue=async function(){ensureQueueKeys();if(mobile&&current){const token=crypto.randomUUID();queueWrite={token,time:Date.now()};try{await call('setQueue',{ids:queue.map(t=>t.id),index:Math.max(0,index),shuffle,repeat,queueToken:token});}catch(e){queueWrite=null;throw e;}}else await syncQueueBeforeEditor();window.saveResume?.(true);};
window.nativeQueueWritePending=s=>{if(!queueWrite)return false;if(s.queueToken===queueWrite.token){queueWrite=null;return false;}if(Date.now()-queueWrite.time<4000)return true;queueWrite=null;toast('Проверьте порядок очереди: плеер не подтвердил изменение');return false;};
function queueMarkup(){return queue.map((t,i)=>`<div class="queue-entry ${i===index?'current':''}" data-queue-key="${esc(t.queueKey)}"><button class="queue-handle" data-queue-handle="${esc(t.queueKey)}" aria-label="Переместить ${esc(t.title)}. Alt и стрелки вверх или вниз" title="Перетащить · Alt + ↑/↓">⠿</button><button class="queue-item" data-queue-play="${esc(t.queueKey)}" ${i===index?'aria-current="true"':''}><span class="queue-playing" aria-hidden="true">${i===index?'▶':''}</span><span>${esc(t.title)}<small>${esc(t.artist)}${t.requested?' · добавлено тобой':''}</small></span><small class="queue-duration">${time(t.duration)}</small></button>${i!==index?`<button class="tiny queue-remove" data-queue-remove="${esc(t.queueKey)}" aria-label="Убрать ${esc(t.title)} из очереди">×</button>`:'<span class="queue-remove-space" aria-hidden="true"></span>'}</div>`).join('')||'<p class="muted">Добавьте музыку или запустите ленту.</p>';}
function queueSignature(){return JSON.stringify([index,queue.map(t=>[t.queueKey,t.id,t.title,t.artist,t.requested])]);}
async function removeQueueEntry(key){
 endQueueDrag();const at=queue.findIndex(t=>t.queueKey===key);if(at<0||at===index)return;
 queue.splice(at,1);if(at<index)index--;await syncNativeQueue();refreshQueueView(true);
 const announcement=$('#queue-announcement');if(announcement)announcement.textContent='Трек убран из очереди. Файл остался в библиотеке.';
}
function refreshQueueView(force=false){
 const list=$('#editable-queue');if(!list||!document.querySelector('#queue-panel')?.open||queueDrag)return;ensureQueueKeys();const signature=queueSignature();if(!force&&signature===queueRenderSignature)return;const count=$('#queue-panel-count');if(count)count.textContent=String(queue.length);const title=$('#queue-panel-now-title');if(title)title.textContent=current?.title||'Пока тихо';const artist=$('#queue-panel-now-artist');if(artist)artist.textContent=current?.artist||'Выбери музыку в библиотеке';const scroll=list.scrollTop,focused=document.activeElement?.dataset.queueHandle;list.innerHTML=queueMarkup();list.scrollTop=scroll;queueRenderSignature=signature;
 const shuffleButton=$('#shuffle-queue');if(shuffleButton)shuffleButton.disabled=queue.length-index<3;if(focused)list.querySelector(`[data-queue-handle="${focused}"]`)?.focus({preventScroll:true});
}
window.refreshQueueView=refreshQueueView;
async function moveQueueEntry(key,to){ensureQueueKeys();const from=queue.findIndex(t=>t.queueKey===key);if(from<0||to<0||to>=queue.length||from===to){refreshQueueView(true);return;}
 const moved=MixTools.move(queue,index,from,to);queue=moved.items;index=moved.index;await syncNativeQueue();refreshQueueView(true);$('#queue-announcement').textContent=`Трек перемещён на позицию ${to+1} из ${queue.length}`;
}
function endQueueDrag(commit=false){const drag=queueDrag;if(!drag)return;queueDrag=null;cancelAnimationFrame(drag.frame);drag.list.classList.remove('is-reordering');drag.list.querySelectorAll('.queue-dragging,.queue-drop-before,.queue-drop-after').forEach(el=>el.classList.remove('queue-dragging','queue-drop-before','queue-drop-after'));try{drag.handle.releasePointerCapture(drag.pointerId);}catch{}
 if(commit&&drag.moved){const from=queue.findIndex(t=>t.queueKey===drag.key),anchor=drag.beforeKey?queue.findIndex(t=>t.queueKey===drag.beforeKey):queue.length;if(from<0||anchor<0){refreshQueueView(true);return;}const to=Math.max(0,Math.min(queue.length-1,anchor-(from<anchor?1:0)));guard(moveQueueEntry)(drag.key,to);}else refreshQueueView(true);
}
function updateQueueDrop(drag){const bounds=drag.list.getBoundingClientRect(),rows=[...drag.list.querySelectorAll('[data-queue-key]')];let before=null;for(const row of rows){const r=row.getBoundingClientRect();if(drag.y<r.top+r.height/2){before=row;break;}}drag.beforeKey=before?.dataset.queueKey||null;for(const row of rows)row.classList.remove('queue-drop-before','queue-drop-after');if(before)before.classList.add('queue-drop-before');else rows.at(-1)?.classList.add('queue-drop-after');
 const edge=45;drag.speed=drag.y<bounds.top+edge?-Math.min(13,(bounds.top+edge-drag.y)/3):drag.y>bounds.bottom-edge?Math.min(13,(drag.y-bounds.bottom+edge)/3):0;
}
function bindQueueDrag(list){
 list.addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-queue-handle]');if(!handle||e.button!==0||queueDrag)return;ensureQueueKeys();try{handle.setPointerCapture(e.pointerId);}catch{return;}queueDrag={list,handle,key:handle.dataset.queueHandle,pointerId:e.pointerId,startY:e.clientY,y:e.clientY,moved:false,beforeKey:handle.closest('[data-queue-key]').dataset.queueKey,speed:0};handle.focus({preventScroll:true});e.preventDefault();});
 list.addEventListener('pointermove',e=>{const drag=queueDrag;if(!drag||e.pointerId!==drag.pointerId)return;drag.y=e.clientY;if(!drag.moved&&Math.abs(drag.y-drag.startY)<5)return;if(!drag.moved){drag.moved=true;list.classList.add('is-reordering');drag.handle.closest('[data-queue-key]').classList.add('queue-dragging');const tick=()=>{if(queueDrag!==drag)return;if(drag.speed){list.scrollTop+=drag.speed;updateQueueDrop(drag);}drag.frame=requestAnimationFrame(tick);};drag.frame=requestAnimationFrame(tick);}updateQueueDrop(drag);e.preventDefault();});
 list.addEventListener('pointerup',e=>{if(queueDrag?.pointerId===e.pointerId)endQueueDrag(true);});list.addEventListener('pointercancel',()=>endQueueDrag());list.addEventListener('lostpointercapture',()=>endQueueDrag());
 list.addEventListener('keydown',e=>{if(e.key==='Escape'&&queueDrag){e.preventDefault();endQueueDrag();return;}const key=e.target.dataset.queueHandle;if(key&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const from=queue.findIndex(t=>t.queueKey===key);guard(moveQueueEntry)(key,from+(e.key==='ArrowUp'?-1:1));}});
}
const modalBeforeQueueEditor=modal;modal=function(html){endQueueDrag();modalBeforeQueueEditor(html);};
const nowBeforeQueueEditor=updateNow;updateNow=function(){nowBeforeQueueEditor();refreshQueueView();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)endQueueDrag();});

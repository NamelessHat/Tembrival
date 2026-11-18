'use strict';
const queuePanel=document.createElement('dialog');queuePanel.id='queue-panel';queuePanel.className='queue-dialog queue-panel';queuePanel.setAttribute('aria-labelledby','queue-panel-title');
queuePanel.innerHTML='<div class="queue-panel-heading"><div><span class="queue-panel-eyebrow">МУЗЫКА РЯДОМ</span><h2 id="queue-panel-title">Очередь <small id="queue-panel-count">0</small></h2></div><button class="icon" id="queue-panel-close" aria-label="Свернуть очередь" title="Свернуть очередь">×</button></div><div class="queue-panel-now"><span>СЕЙЧАС ЗВУЧИТ</span><strong id="queue-panel-now-title">Пока тихо</strong><small id="queue-panel-now-artist">Выбери музыку в библиотеке</small></div><div class="queue-list" id="editable-queue" aria-label="Порядок воспроизведения"></div><div class="queue-panel-footer"><p id="queue-announcement" class="queue-announcement" role="status" aria-live="polite"></p><div class="queue-panel-actions"><button class="secondary" id="shuffle-queue">⤨ Перемешать следующие</button><button class="secondary" id="clear-queue">Очистить следующие</button></div><small class="queue-panel-hint">Переноси за ⠿ · с клавиатуры Alt + ↑/↓</small></div>';
document.body.append(queuePanel);
const queueDockMedia=matchMedia('(min-width:1200px)');let queuePanelWide=queueDockMedia.matches;
function saveQueuePanelPreference(open){if(!queueDockMedia.matches)return;try{localStorage.setItem('queue-panel-open',JSON.stringify(open));}catch{}}
function updateQueuePanelState(){const open=queuePanel.open;document.body.classList.toggle('queue-panel-docked',open&&queueDockMedia.matches);$('#queue').setAttribute('aria-expanded',String(open));$('#queue').setAttribute('aria-controls','queue-panel');$('#queue').classList.toggle('active',open);queuePanel.setAttribute('role',queueDockMedia.matches?'complementary':'dialog');if(open&&!queueDockMedia.matches)queuePanel.setAttribute('aria-modal','true');else queuePanel.removeAttribute('aria-modal');}
function closeQueuePanel(returnFocus=true){if(!queuePanel.open)return;endQueueDrag();queuePanel.close();updateQueuePanelState();saveQueuePanelPreference(false);if(returnFocus)$('#queue').focus({preventScroll:true});}
function openQueuePanel(remember=true){
 ensureQueueKeys();if(!queuePanel.open){if(queueDockMedia.matches)queuePanel.show();else queuePanel.showModal();}updateQueuePanelState();refreshQueueView(true);if(remember)saveQueuePanelPreference(true);
}
showQueue=function(){openQueuePanel();};
$('#queue').onclick=()=>queuePanel.open?closeQueuePanel():openQueuePanel();$('#queue-panel-close').onclick=()=>closeQueuePanel();
$('#shuffle-queue').onclick=guard(async()=>{await shuffleUpcoming();refreshQueueView(true);});
$('#clear-queue').onclick=guard(async()=>{endQueueDrag();queue=queue.slice(0,index+1);await syncNativeQueue();refreshQueueView(true);});
$('#editable-queue').onclick=guard(async e=>{
 const play=e.target.closest('[data-queue-play]'),remove=e.target.closest('[data-queue-remove]');if(remove){await removeQueueEntry(remove.dataset.queueRemove);return;}if(!play)return;
 const i=queue.findIndex(t=>t.queueKey===play.dataset.queuePlay);if(i<0)return;
 if(mobile){queueWrite=null;index=i;current=queue[i];nativeStatus={...nativeStatus,id:current.id,index,position:0};await call('play',{ids:queue.map(t=>t.id),index,shuffle,repeat});}else await playIndex(i);
 updateNow();window.saveResume?.(true);refreshQueueView(true);
});
bindQueueDrag($('#editable-queue'));
queuePanel.addEventListener('cancel',e=>{e.preventDefault();closeQueuePanel();});
queuePanel.addEventListener('close',()=>{if(queuePanel.open)return;endQueueDrag();updateQueuePanelState();});
queuePanel.addEventListener('click',e=>{if(queueDockMedia.matches||e.target!==queuePanel)return;const r=queuePanel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeQueuePanel();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&queuePanel.open&&!$('#modal').open&&!document.querySelector('#crop-dialog')?.open&&!document.querySelector('#track-popover:not([hidden])')){e.preventDefault();closeQueuePanel();}});
window.closeQueueDrawer=()=>{if(queuePanel.open&&!queueDockMedia.matches){closeQueuePanel();return true;}return false;};
queueDockMedia.addEventListener('change',()=>{
 endQueueDrag();const open=queuePanel.open,scroll=$('#editable-queue').scrollTop,focus=document.activeElement,key=focus?.dataset.queueHandle;
 if(open){queuePanel.close();if(queueDockMedia.matches)queuePanel.show();else queuePanel.showModal();}
 queuePanelWide=queueDockMedia.matches;updateQueuePanelState();if(open){refreshQueueView(true);$('#editable-queue').scrollTop=scroll;if(key)queuePanel.querySelector(`[data-queue-handle="${key}"]`)?.focus({preventScroll:true});else if(queuePanel.contains(focus))focus.focus({preventScroll:true});}
});
updateQueuePanelState();if(queuePanelWide&&read('queue-panel-open',false)){const focus=document.activeElement;openQueuePanel(false);focus?.focus({preventScroll:true});}

'use strict';
window.attachAlbumPicker=function(input){
  if(!input||input.closest('.album-picker'))return;
  const normalize=value=>String(value).normalize('NFKC').trim().toLocaleLowerCase();
  const names=new Map();for(const track of state.tracks){if(String(track.album||'').trim()&&!names.has(normalize(track.album)))names.set(normalize(track.album),track.album);}
  const albums=[...names.values()].sort((a,b)=>a.localeCompare(b,'ru'));
  const wrapper=document.createElement('span');wrapper.className='album-picker';input.replaceWith(wrapper);wrapper.append(input);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='album-picker-toggle';toggle.textContent='▾';toggle.setAttribute('aria-label','Выбрать альбом');toggle.title='Все альбомы';wrapper.append(toggle);
  const list=document.createElement('span');list.className='album-picker-list';list.id=input.id+'-options';list.role='listbox';list.setAttribute('aria-label','Альбомы');list.hidden=true;wrapper.append(list);
  const hint=document.createElement('small');hint.className='album-picker-hint';hint.id=input.id+'-hint';hint.textContent='Выбери существующий альбом или введи название нового';wrapper.after(hint);
  input.placeholder='Выбрать или создать альбом';input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');input.setAttribute('aria-describedby',hint.id);
  let options=[],active=-1;
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function mark(index){active=index;[...list.querySelectorAll('[role=option]')].forEach((row,i)=>{row.setAttribute('aria-selected',String(i===index));if(i===index){input.setAttribute('aria-activedescendant',row.id);row.scrollIntoView({block:'nearest'});}});}
  function choose(index){if(input.disabled)return;input.value=options[index];close();input.focus({preventScroll:true});close();input.dispatchEvent(new Event('change',{bubbles:true}));}
  function show(all=false){
    if(input.disabled)return;
    const query=normalize(input.value),typed=input.value.trim();options=albums.filter(name=>all||normalize(name).includes(query));active=-1;list.replaceChildren();
    const add=(name,label,isNew=false)=>{const row=document.createElement('button');row.type='button';row.tabIndex=-1;row.role='option';row.id=list.id+'-'+list.children.length;row.setAttribute('aria-selected','false');row.textContent=label;row.title=label;if(isNew)row.className='album-picker-new';const index=options.indexOf(name);row.onpointerdown=e=>e.preventDefault();row.onclick=()=>choose(index);list.append(row);};
    for(const name of options)add(name,name);
    if(typed&&!names.has(query)){options.push(typed);add(typed,'＋ Новый альбом «'+typed+'»',true);}
    if(!options.length){const empty=document.createElement('span');empty.className='album-picker-empty';empty.textContent='Пока нет альбомов. Введи название нового.';list.append(empty);}
    list.hidden=false;input.setAttribute('aria-expanded','true');
    const field=input.getBoundingClientRect(),dialog=input.closest('dialog')?.getBoundingClientRect();wrapper.classList.toggle('album-picker-above',!!dialog&&dialog.bottom-field.bottom<180&&field.top-dialog.top>180);
  }
  input.addEventListener('focus',()=>show());input.addEventListener('input',()=>show());
  toggle.onclick=()=>{if(input.disabled)return;const wasOpen=!list.hidden;input.focus({preventScroll:true});if(wasOpen)close();else show(true);};
  input.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const opened=list.hidden;if(opened)show();if(options.length)mark(opened?(e.key==='ArrowDown'?0:options.length-1):(active+(e.key==='ArrowDown'?1:-1)+options.length)%options.length);}
    if(e.key==='Enter'&&!list.hidden){e.preventDefault();if(active>=0)choose(active);else close();}
    if(e.key==='Escape'&&!list.hidden){e.preventDefault();e.stopPropagation();close();}
    if(e.key==='Tab')close();
  });
  wrapper.addEventListener('focusout',()=>{setTimeout(()=>{if(!wrapper.contains(document.activeElement)){const match=names.get(normalize(input.value));if(match)input.value=match;close();}},0);});
  const observer=new MutationObserver(()=>{toggle.disabled=input.disabled;if(input.disabled)close();});observer.observe(input,{attributes:true,attributeFilter:['disabled']});
  input.closest('dialog')?.addEventListener('close',()=>{close();observer.disconnect();},{once:true});
};

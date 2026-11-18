'use strict';
// Runs before the stylesheets so a saved night theme never flashes a light panel.
window.LumaTheme=(()=>{
 const normalize=value=>value==='night'?'night':'day';
 const name=()=>document.documentElement.dataset.theme==='night'?'Iskavell':'Tembrival';
 function brand(){const title=name();document.documentElement.style.setProperty('--app-display-name',JSON.stringify(title));document.querySelectorAll('[data-brand-name]').forEach(el=>el.textContent=title);document.title=title+(document.querySelector('#mini-art')?' • Маленький привал':'');}
 function apply(value){const theme=normalize(value);if(document.documentElement.dataset.theme===theme)return;document.documentElement.dataset.theme=theme;brand();document.dispatchEvent(new Event('luma-theme-changed'));}
 let saved;try{saved=JSON.parse(localStorage.getItem('sound-settings')||'{}').theme;}catch{}
 apply(saved);
 document.addEventListener('DOMContentLoaded',()=>{
  brand();
  if(!document.querySelector('#settings'))return;
  const button=document.createElement('button');button.id='theme-toggle';button.className='secondary';button.type='button';document.querySelector('#settings').before(button);
  const refresh=()=>{const night=document.documentElement.dataset.theme==='night',label=night?'Включить светлую тему — Side A':'Включить тёмную тему — Side B';button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(night));button.innerHTML=night?'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 0h4v4h-4zM10 20h4v4h-4zM0 10h4v4H0zM20 10h4v4h-4zM4 3h3v4H3V4h1zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4zM9 6h6v3h3v6h-3v3H9v-3H6V9h3z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 2h8v3h-6v3H8v8h3v3h8v-3h3v4h-3v3H8v-3H4v-4H1V8h3V4h5z"/></svg>';};
  button.onclick=()=>{Sound.update({theme:document.documentElement.dataset.theme==='night'?'day':'night'});if(view==='settings')renderSettings();};
  document.addEventListener('luma-theme-changed',refresh);refresh();
 });
 return {normalize,apply,name};
})();

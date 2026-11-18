'use strict';
globalThis.MixTools={
 key(source){return JSON.stringify([source.type,source.key,source.artist??null]);},
 options(type,tracks,playlists){
  if(type==='track')return tracks.map(t=>({type,key:t.id,label:t.title+' · '+t.artist}));
  if(type==='playlist')return playlists.map(p=>({type,key:p.id,label:p.name}));
  if(!['album','artist'].includes(type))return [];
  // Match the top-level library cards: a compilation album is one source, regardless of its artists.
  const groups=new Map();for(const t of tracks){const key=String(t[type]||'');if(!groups.has(key))groups.set(key,{type,key,artist:null});}return [...groups.values()];
 },
 members(source,tracks,playlists){
  if(source.type==='track')return tracks.filter(t=>t.id===source.key);
  if(source.type==='playlist'){const ids=new Set(playlists.find(p=>p.id===source.key)?.tracks||[]);return tracks.filter(t=>ids.has(t.id));}
  if(!['album','artist'].includes(source.type))return [];
  return tracks.filter(t=>String(t[source.type]||'')===source.key&&(source.type!=='album'||source.artist==null||t.artist===source.artist));
 },
 resolve(sources,tracks,playlists){const found=new Map();for(const source of sources)for(const t of this.members(source,tracks,playlists))found.set(t.id,t);return [...found.values()];},
 move(items,currentIndex,from,to){
  if(from<0||from>=items.length||to<0||to>=items.length)return {items:[...items],index:currentIndex};
  const positions=items.map((_,i)=>i),next=[...items];positions.splice(to,0,positions.splice(from,1)[0]);next.splice(to,0,next.splice(from,1)[0]);
  return {items:next,index:currentIndex<0?-1:positions.indexOf(currentIndex)};
 },
 renamed(sources,scope,name){return sources.map(s=>{
  const next={...s};if(s.type===scope.type&&s.key===scope.key&&(s.type!=='album'||scope.artist==null||s.artist===scope.artist)){next.key=name;next.label=name;}
  if(scope.type==='artist'&&s.type==='album'&&s.artist===scope.key)next.artist=name;return next;
 });}
};

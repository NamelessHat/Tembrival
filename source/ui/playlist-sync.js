/* Offline playlist records. Vector clocks detect edits made independently. */
(function(root){
 const payload=p=>JSON.stringify([p.name,p.description,p.image,p.tracks,p.deleted]);
 function clean(p){
  if(!p||typeof p.id!=='string'||!/^[-a-zA-Z0-9_~]{1,120}$/.test(p.id))throw Error('Некорректный плейлист');
  const image=String(p.image||'');if(image.length>700000||image&&!/^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(image))throw Error('Слишком большая или неподдерживаемая обложка');
  const clock={};for(const [k,v]of Object.entries(p.clock||{})){if(!/^[-a-zA-Z0-9_]{1,80}$/.test(k)||!Number.isSafeInteger(v)||v<0)throw Error('Некорректная версия плейлиста');clock[k]=v;}
  return {id:p.id,name:String(p.name||'Плейлист').slice(0,100),description:String(p.description||'').slice(0,1000),image,tracks:[...new Set((p.tracks||[]).filter(x=>/^[a-f0-9]{64}$/.test(x)))],clock,editId:String(p.editId||p.id).replace(/[^a-zA-Z0-9-]/g,'').slice(0,80),deleted:!!p.deleted};
 }
 function compare(a,b){let greater=false,less=false;for(const k of new Set([...Object.keys(a),...Object.keys(b)])){greater||=(a[k]||0)>(b[k]||0);less||=(a[k]||0)<(b[k]||0);}return greater&&less?2:greater?1:less?-1:0;}
 function merge(a,b){
  const map=new Map();if(a.length+b.length>2000)throw Error('Слишком много плейлистов');
  for(const raw of [...a,...b]){const p=clean(raw),old=map.get(p.id);if(!old){map.set(p.id,p);continue;}const c=compare(p.clock,old.clock);
   if(c===1){map.set(p.id,p);continue;}if(c===-1)continue;
   if(payload(p)===payload(old)){for(const k of Object.keys(p.clock))old.clock[k]=Math.max(old.clock[k]||0,p.clock[k]);old.editId=[old.editId,p.editId].sort().at(-1);continue;}
   const [loser,winner]=[old,p].sort((x,y)=>x.editId.localeCompare(y.editId));map.set(p.id,winner);
   if(!loser.deleted){const fork={...loser,id:'fork-'+loser.editId,name:loser.name.endsWith(' (другая версия)')?loser.name:loser.name.slice(0,83)+' (другая версия)'};if(!map.has(fork.id))map.set(fork.id,fork);}
  }return [...map.values()].sort((a,b)=>a.id.localeCompare(b.id));
 }
 root.PlaylistSync={clean,merge,compare,payload};
})(globalThis);

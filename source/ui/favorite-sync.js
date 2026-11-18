/* Per-track logical versions; an unlike wins concurrent equal-version edits. */
(function(root){
 function clean(r){if(!r||typeof r.id!=='string'||!/^([a-f0-9]{64})$/.test(r.id)||typeof r.liked!=='boolean'||!Number.isSafeInteger(r.version)||r.version<1||typeof r.actor!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(r.actor))throw Error('Некорректное избранное');return {id:r.id,liked:r.liked,version:r.version,actor:r.actor};}
 function merge(a,b){const map=new Map();for(const list of [a,b]){if(!Array.isArray(list)||list.length>100000)throw Error('Слишком много отметок избранного');for(const raw of list){const r=clean(raw),old=map.get(r.id);if(!old||r.version>old.version||r.version===old.version&&(Number(!r.liked)>Number(!old.liked)||r.liked===old.liked&&r.actor>old.actor))map.set(r.id,r);}}if(map.size>100000)throw Error('Слишком много отметок избранного');return [...map.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
 root.FavoriteSync={clean,merge};
})(globalThis);

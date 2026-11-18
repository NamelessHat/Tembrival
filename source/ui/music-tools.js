'use strict';
globalThis.MusicTools={
  normalize(value){return String(value||'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');},
  shuffled(items,random=Math.random){const next=[...items];for(let i=next.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[next[i],next[j]]=[next[j],next[i]];}return next;},
  enqueue(items,index,track){const next=[...items];let at=index+1;while(next[at]?.requested)at++;next.splice(at,0,{...track,requested:true});return next;},
  duplicateGroups(tracks){
    const buckets=new Map();for(const t of tracks){if(!t.title||!t.artist||!(t.duration>0))continue;const key=this.normalize(t.title)+'|'+this.normalize(t.artist);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(t);}
    const groups=[];for(const bucket of buckets.values()){bucket.sort((a,b)=>a.duration-b.duration);let group=[];for(const t of bucket){if(group.length&&t.duration-group[0].duration>1.5){if(group.length>1)groups.push(group);group=[];}group.push(t);}if(group.length>1)groups.push(group);}
    const quality=t=>(['.flac','.wav','.aiff','.aif'].includes(t.ext)?1e10:0)+(t.bitrate||t.size*8/t.duration||0);
    return groups.map(g=>g.sort((a,b)=>quality(b)-quality(a)));
  }
};

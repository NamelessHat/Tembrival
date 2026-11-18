'use strict';
// Shared by both windows. Only local artwork is sampled; cache size stays bounded.
window.RecordPalette=(()=>{
 const fallback={accent:'rgb(173, 109, 140)',light:'rgb(234, 190, 183)'},cache=new Map();
 function sample(data){
  const buckets=new Map();
  for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);if(data[i+3]<180||hi<35||lo>225)continue;
   const key=(r>>5)*64+(g>>5)*8+(b>>5),entry=buckets.get(key)||{r:0,g:0,b:0,n:0,weight:0};entry.r+=r;entry.g+=g;entry.b+=b;entry.n++;entry.weight+=1+(hi-lo)/128;buckets.set(key,entry);
  }
  const best=[...buckets.values()].sort((a,b)=>b.weight-a.weight)[0];if(!best)return fallback;
  const rgb=[best.r,best.g,best.b].map(v=>Math.round(v/best.n*.68+110*.32));
  return {accent:`rgb(${rgb.join(', ')})`,light:`rgb(${rgb.map(v=>Math.round(v*.5+245*.5)).join(', ')})`};
 }
 function get(src){if(!src)return Promise.resolve(fallback);if(cache.has(src))return cache.get(src);
  const promise=new Promise(resolve=>{const img=new Image();let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;resolve(value);};const timer=setTimeout(()=>finish(fallback),5000);
   img.crossOrigin='anonymous';img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,32,32);finish(sample(ctx.getImageData(0,0,32,32).data));}catch{finish(fallback);}};img.onerror=()=>finish(fallback);img.src=src;
  });cache.set(src,promise);if(cache.size>128)cache.delete(cache.keys().next().value);return promise;
 }
 function apply(element,palette=fallback){if(!element)return;element.style.setProperty('--record-accent',palette.accent);element.style.setProperty('--record-light',palette.light);}
 function paint(element,src){if(!element||element.dataset.paletteSource===src)return;element.dataset.paletteSource=src;apply(element);get(src).then(p=>{if(element.isConnected&&element.dataset.paletteSource===src)apply(element,p);});}
 return {get,paint,apply,sample,fallback};
})();

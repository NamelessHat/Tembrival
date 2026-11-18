import test from 'node:test';import assert from 'node:assert/strict';import '../ui/mix-tools.js';import '../ui/music-tools.js';
const tracks=[{id:'a',title:'Song',artist:'A',album:'Shared'},{id:'b',title:'Other',artist:'A',album:'Solo'},{id:'c',title:'Song',artist:'B',album:'Shared'},{id:'d',title:'Song',artist:'A',album:'Shared'}],playlists=[{id:'p',tracks:['a','c','gone']}];
test('picker matches library albums across artists, artists stay unique and playlist IDs remain distinct',()=>{
 const albums=MixTools.options('album',tracks,playlists);assert.equal(albums.length,2);const shared=albums.find(s=>s.key==='Shared');assert.equal(shared.artist,null);assert.deepEqual(MixTools.members(shared,tracks,playlists).map(t=>t.id),['a','c','d']);
 assert.deepEqual(MixTools.options('artist',tracks,playlists).map(s=>s.key),['A','B']);
 const named=[{id:'p',name:'Same',tracks:['a']},{id:'p2',name:'Same',tracks:['c']}];const options=MixTools.options('playlist',tracks,named);assert.equal(options.length,2);assert.notEqual(MixTools.key(options[0]),MixTools.key(options[1]));assert.deepEqual(MixTools.resolve(options,tracks,named).map(t=>t.id),['a','c']);
});
test('mixed sources resolve fresh with exact-ID deduplication and scoped albums',()=>{
 const sources=[{type:'artist',key:'A'},{type:'album',key:'Shared',artist:'A'},{type:'playlist',key:'p'},{type:'track',key:'a'}];
 assert.deepEqual(MixTools.resolve(sources,tracks,playlists).map(t=>t.id).sort(),['a','b','c','d']);
 assert.deepEqual(MixTools.members(sources[1],tracks,playlists).map(t=>t.id),['a','d']);
 assert.equal(MixTools.resolve(sources,[...tracks,{id:'e',artist:'A',album:'New'}],playlists).length,5);
 assert.deepEqual(MixTools.resolve([{type:'playlist',key:'gone'},{type:'track',key:'gone'}],tracks,playlists),[]);
});
test('shuffle has each entry once and does not mutate the source',()=>{const copy=tracks.map(t=>t.id),mixed=MusicTools.shuffled(tracks,()=>0);assert.equal(mixed.length,tracks.length);assert.deepEqual(mixed.map(t=>t.id).sort(),copy.slice().sort());assert.deepEqual(tracks.map(t=>t.id),copy);assert.notDeepEqual(mixed.map(t=>t.id),copy);});
test('all moves preserve the current occurrence, including duplicate track IDs',()=>{
 const items=[{id:'a',occurrence:0},{id:'a',occurrence:1},{id:'b',occurrence:2},{id:'c',occurrence:3}];
 for(let current=0;current<4;current++)for(let from=0;from<4;from++)for(let to=0;to<4;to++){const result=MixTools.move(items,current,from,to);assert.equal(result.items[result.index],items[current]);assert.equal(result.items[to],items[from]);assert.equal(new Set(result.items).size,4);}
 assert.deepEqual(items.map(x=>x.occurrence),[0,1,2,3]);
 assert.equal(MixTools.move(items,-1,0,2).index,-1);
});
test('renaming collection updates relevant recipes while preserving scoped albums',()=>{
 const sources=[{type:'artist',key:'A'},{type:'album',key:'Shared',artist:'A'},{type:'album',key:'Shared',artist:'B'}];
 const renamed=MixTools.renamed(sources,{type:'artist',key:'A'},'New A');assert.equal(renamed[0].key,'New A');assert.equal(renamed[1].artist,'New A');assert.equal(renamed[2].artist,'B');
 const album=MixTools.renamed(sources,{type:'album',key:'Shared',artist:'A'},'New album');assert.equal(album[1].key,'New album');assert.equal(album[2].key,'Shared');assert.equal(sources[1].key,'Shared');
});

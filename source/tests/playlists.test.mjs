import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm}from'node:fs/promises';import os from'node:os';import path from'node:path';import {Library}from'../desktop/library.mjs';import{startSync}from'../desktop/sync.mjs';import{mergePlaylists}from'../desktop/playlists.mjs';
const record=(name,clock,editId='00000000-0000-4000-8000-000000000001')=>({id:'p1',name,description:'offline',image:'data:image/png;base64,YQ==',tracks:['a'.repeat(64)],clock,editId,deleted:false});
test('Playlist merge retains covers, independent edits and deletion tombstones without resurrection',()=>{
 const initial=record('walk',{pc:1}),phone=record('phone edit',{pc:1,phone:1},'00000000-0000-4000-8000-000000000002'),pc=record('pc edit',{pc:2},'00000000-0000-4000-8000-000000000003');
 assert.equal(mergePlaylists([initial],[phone])[0].name,'phone edit');const merged=mergePlaylists([phone],[pc]);assert.equal(merged.length,2);assert.deepEqual(mergePlaylists([pc],[phone]),merged);assert.deepEqual(mergePlaylists(merged,merged),merged);assert.equal(merged[0].image,initial.image);
 const deleted={...phone,deleted:true,clock:{pc:1,phone:2},editId:'00000000-0000-4000-8000-000000000004'};assert.equal(mergePlaylists([deleted],[initial])[0].deleted,true);assert.equal(mergePlaylists([phone],[deleted])[0].deleted,true);
 assert.throws(()=>mergePlaylists([],[{...initial,image:'https://example.com/image.png'}]));
});
test('Authenticated playlist exchange persists metadata and cover across server restart',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'luma-playlists-'));let service;try{const library=await new Library(root).init();service=await startSync(library,{port:0});const base='http://127.0.0.1:'+service.port;assert.equal((await fetch(base+'/v1/playlists',{method:'POST',body:'{}'})).status,401);
 const records=[record('Summit',{pc:1})];const response=await fetch(base+'/v1/playlists',{method:'POST',headers:{Authorization:'Bearer '+service.desktopToken,'Content-Type':'application/json'},body:JSON.stringify({records})});assert.equal(response.status,200);assert.deepEqual((await response.json()).records,records);await new Promise(r=>service.server.close(r));service=null;assert.deepEqual((await new Library(root).init()).snapshot().playlistRecords,records);
 }finally{service?.server.close();await rm(root,{recursive:true,force:true});}
});

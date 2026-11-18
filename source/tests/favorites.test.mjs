import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {mergeFavorites} from '../desktop/favorites.mjs';
import {Library} from '../desktop/library.mjs';
import {startSync} from '../desktop/sync.mjs';
const id='a'.repeat(64),other='b'.repeat(64),r=(id,liked,version,actor)=>({id,liked,version,actor});
test('Favorites converge with offline edits, removal tombstones, and a later explicit re-like',()=>{
 const pc=[r(id,true,1,'pc')],phone=[r(other,true,1,'phone')];const union=mergeFavorites(pc,phone);assert.equal(union.length,2);assert.deepEqual(mergeFavorites(phone,pc),union);
 const unlike=r(id,false,2,'phone');assert.equal(mergeFavorites(pc,[unlike]).find(r=>r.id===id).liked,false);assert.deepEqual(mergeFavorites(mergeFavorites(pc,[unlike]),pc),mergeFavorites(pc,[unlike]));
 assert.equal(mergeFavorites([r(id,true,2,'z')],[unlike])[0].liked,false);assert.equal(mergeFavorites([unlike],[r(id,true,3,'pc')])[0].liked,true);
 assert.deepEqual(mergeFavorites(union,union),union);assert.throws(()=>mergeFavorites([],[r(id,true,0,'pc')]));assert.throws(()=>mergeFavorites([],[r(id,'true',1,'pc')]));
});
test('Authenticated two-way favorite exchange persists likes for missing audio and propagates unlikes after restart',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'luma-favorites-'));let sync;try{
  const pc=await new Library(path.join(root,'pc')).init(),phone=await new Library(path.join(root,'phone')).init();await pc.mergeFavorites([r(id,true,1,'pc')]);await phone.mergeFavorites([r(other,true,1,'phone')]);sync=await startSync(pc,{port:0});const url='http://127.0.0.1:'+sync.port+'/v1/favorites';
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
  const exchange=async()=>{const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+sync.desktopToken,'Content-Type':'application/json'},body:JSON.stringify({records:phone.data.favoriteRecords})});assert.equal(response.status,200);await phone.mergeFavorites((await response.json()).records);};
  await exchange();assert.equal(pc.data.tracks.length,0);assert.deepEqual(pc.data.favoriteRecords,phone.data.favoriteRecords);assert.equal(pc.data.favoriteRecords.length,2);
  await phone.mergeFavorites([r(id,false,2,'phone')]);await exchange();assert.equal(pc.data.favoriteRecords.find(r=>r.id===id).liked,false);
  await new Promise(r=>sync.server.close(r));sync=null;const restored=await new Library(path.join(root,'pc')).init();assert.deepEqual(restored.snapshot().favoriteRecords,phone.data.favoriteRecords);
  await restored.mergeFavorites([r(id,true,1,'pc')]);assert.equal(restored.data.favoriteRecords.find(r=>r.id===id).liked,false);
 }finally{sync?.server.close();await fs.rm(root,{recursive:true,force:true});}
});

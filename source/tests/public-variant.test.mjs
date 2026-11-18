import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
test('public desktop deletion removes selected tracks without a downloader or calls to it',async()=>{
 const calls=[],elements=new Map(),state={tracks:[{id:'remove'},{id:'keep'}]};
 const context=vm.createContext({state,mobile:false,current:null,group:null,selectedIds:new Set(['remove']),nativeStatus:{},window:{},navigator:{},localStorage:{removeItem(){}},timeline(){},updateNow(){},reload:async()=>{},pruneRemoved:async()=>{},playlistSave:Promise.resolve(),favoriteSave:Promise.resolve(),trackMenu(){},editPlaylist(){},render(){},$:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id)},call:async(method,args)=>{calls.push(method);assert.equal(method,'removeTracks');state.tracks=state.tracks.filter(t=>!args.ids.includes(t.id))},Luma:{call:()=>{throw Error('Public deletion must not call the private downloader')}}});
 vm.runInContext(await fs.readFile(new URL('../ui/library-actions.js',import.meta.url),'utf8'),context);
 await vm.runInContext('deleteLibraryTracks(["remove"])',context);
 assert.deepEqual(state.tracks.map(t=>t.id),['keep']);assert.deepEqual(calls,['removeTracks']);assert.equal(context.selectedIds.has('remove'),false);
});

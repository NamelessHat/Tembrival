const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),yauzl=require('yauzl');
async function loadApk(file){return new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(error,zip)=>{
 if(error)return reject(error);const assets=new Map();zip.on('error',reject);zip.on('end',()=>resolve(assets));zip.on('entry',entry=>{
  if(!/^assets\/.+[^/]$|^classes\d*\.dex$/.test(entry.fileName)){zip.readEntry();return;}
  zip.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const chunks=[];stream.on('error',reject);stream.on('data',b=>chunks.push(b));stream.on('end',()=>{assets.set(entry.fileName,Buffer.concat(chunks));zip.readEntry();});});
 });zip.readEntry();
}));}
async function assetPolicy(){
 const java=await fs.readFile(path.resolve(__dirname,'../android/src/local/luma/music/MainActivity.java'),'utf8');
 const raw=[...java.matchAll(/p\.matches\("((?:\\.|[^"\\])*)"\)/g)].map(m=>JSON.parse('"'+m[1]+'"')).find(s=>s.startsWith('/(index.html|'));
 assert.ok(raw,'Missing explicit Android UI resource policy');const scripts=new RegExp('^(?:'+raw+')$');
 const images=[...java.matchAll(/p\.equals\("(\/assets\/[^"\n]+)"\)/g)].map(m=>m[1]);
 return {raw,allows:p=>scripts.test(p)||images.includes(p)||/^\/assets\/ambient-(wind|snow|fire)\.wav$/.test(p)};
}
async function auditApk(file){
 const assets=await loadApk(file),policy=await assetPolicy(),html=assets.get('assets/index.html')?.toString();assert.ok(html,'Missing APK index');
 const refs=['index.html',...[...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)].map(m=>m[1])];
 const denied=refs.filter(name=>!policy.allows('/'+name));assert.deepEqual(denied,[],'Android blocks APK interface resources: '+denied.join(', '));
 for(const name of refs)assert.ok(assets.get('assets/'+name)?.length,'Missing APK UI file '+name);
 const dex=[...assets].filter(([name])=>/^classes\d*\.dex$/.test(name)).map(([,b])=>b);assert.ok(dex.some(b=>b.includes(Buffer.from(policy.raw))),'APK compiled resource policy differs from the reviewed Android source');
 assert.equal(policy.allows('/private-key.jks'),false);assert.equal(policy.allows('/../mixes.js'),false);assert.equal(policy.allows('/arbitrary.js'),false);
 return {assets,policy,count:refs.length};
}
module.exports={loadApk,assetPolicy,auditApk};
if(require.main===module)(async()=>{for(const file of process.argv.slice(2)){const result=await auditApk(path.resolve(file));console.log(path.basename(file)+': '+result.count+' UI entry resources are present and permitted by the compiled Android policy.');}})().catch(e=>{console.error(e);process.exitCode=1;});

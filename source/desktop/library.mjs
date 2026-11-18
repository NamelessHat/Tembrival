import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseFile } from 'music-metadata';

import {cleanDetails,applyRemoteDetails,detailKeys} from './track-details.mjs';
import {mergePlaylists} from './playlists.mjs';
import {mergeFavorites} from './favorites.mjs';

export const extensions = new Set(['.mp3','.flac','.m4a','.aac','.ogg','.opus','.wav','.aiff','.aif','.wma']);
export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export class Library {
  constructor(root,{protect,unprotect}={}) { this.root=root; this.busy=false; this.progress=null; this.protect=protect; this.unprotect=unprotect; }
  async init() {
    await fs.mkdir(path.join(this.root,'audio'),{recursive:true});
    await fs.mkdir(path.join(this.root,'art'),{recursive:true});
    try { this.data=JSON.parse(await fs.readFile(path.join(this.root,'library.json'),'utf8')); }
    catch(e) { if(e.code!=='ENOENT') throw e; this.data={version:1,tracks:[],devices:[]}; }
    for(const device of this.data.devices)if(device.tokenProtected){if(!this.unprotect)throw Error("Windows secret storage is required");device.token=this.unprotect(device.tokenProtected);delete device.tokenProtected;}
    this.data.replacements ||= {};this.data.ignored ||= [];this.data.playlistRecords ||= [];this.data.favoriteRecords ||= [];this.data.collectionRecords ||= [];
    return this;
  }
  async save() {
    const disk={...this.data,devices:this.data.devices.map(d=>this.protect?{...d,token:undefined,tokenProtected:this.protect(d.token)}:d)};
    const content=JSON.stringify(disk);
    this.pendingSave=(this.pendingSave||Promise.resolve()).catch(()=>{}).then(async()=>{
      const target=path.join(this.root,'library.json');
      await fs.writeFile(target+'.tmp',content);
      await fs.rename(target+'.tmp',target);
    });
    await this.pendingSave;
    this.onChanged?.();
  }
  async mergePlaylists(records){const next=mergePlaylists(this.data.playlistRecords||[],records);if(JSON.stringify(next)!==JSON.stringify(this.data.playlistRecords)){this.data.playlistRecords=next;await this.save();}return next;}
  async mergeFavorites(records){const next=mergeFavorites(this.data.favoriteRecords||[],records);if(JSON.stringify(next)!==JSON.stringify(this.data.favoriteRecords)){this.data.favoriteRecords=next;await this.save();}return next;}
  async mergeCollections(records){const next=mergePlaylists(this.data.collectionRecords||[],records);if(JSON.stringify(next)!==JSON.stringify(this.data.collectionRecords)){this.data.collectionRecords=next;await this.save();}return next;}
  async editCollection({type,key,artist=null,name,image}={}){
    if(this.busy)throw Error('Дождитесь завершения импорта');if(!['album','artist'].includes(type)||typeof key!=='string'||artist!==null&&typeof artist!=='string')throw Error('Некорректная подборка');
    name=String(name||'').trim().slice(0,100);if(!name)throw Error('Введите название');if(image!==undefined)cleanDetails({customCover:image});
    const members=this.data.tracks.filter(t=>String(t[type]||'')===key&&(type!=='album'||artist===null||t.artist===artist));if(!members.length)throw Error('Подборка не найдена');
    if(name!==key&&this.data.tracks.some(t=>t[type]===name&&(type!=='album'||artist===null||t.artist===artist)))throw Error('Такое название уже есть. Выберите другое.');
    const scope=JSON.stringify({type,artist:type==='album'?artist:null}),records=structuredClone(this.data.collectionRecords||[]),old=records.find(r=>{try{const meta=JSON.parse(r.description);return !r.deleted&&r.name===key&&meta.type===type&&(meta.artist??null)===(type==='album'?artist:null);}catch{return false;}});
    this.data.collectionActor ||= 'collections-'+randomUUID();const actor=this.data.collectionActor,tick=r=>({...r,clock:{...r.clock,[actor]:(r.clock?.[actor]||0)+1},editId:randomUUID()});
    const record=tick({...(old||{id:'collection-'+randomUUID(),clock:{},image:''}),name,description:scope,image:image===undefined?old?.image||'':image,tracks:members.map(t=>t.id),deleted:false});
    let incoming=[record];if(type==='artist'&&name!==key)for(const r of records){let meta;try{meta=JSON.parse(r.description);}catch{continue;}if(!r.deleted&&meta.type==='album'&&meta.artist===key)incoming.push(tick({...r,description:JSON.stringify({...meta,artist:name})}));}
    const merged=mergePlaylists(records,incoming),ids=new Set(members.map(t=>t.id));
    this.data.tracks=this.data.tracks.map(t=>ids.has(t.id)?{...t,[type]:name,...(type==='artist'&&t.albumArtist===key?{albumArtist:name}:{}),detailsUpdatedAt:Math.max(Date.now(),(t.detailsUpdatedAt||0)+1)}:t);this.data.collectionRecords=merged;await this.save();return {name,updated:members.length};
  }
  snapshot() { return {collectionRecords:this.data.collectionRecords,favoriteRecords:this.data.favoriteRecords,replacements:this.data.replacements,playlistRecords:this.data.playlistRecords,tracks:this.data.tracks,devices:this.data.devices.map(({token,...d})=>d),progress:this.progress}; }
  file(t) { return path.join(this.root,'audio',t.id+t.ext); }
  async mergeReplacements(incoming){if(this.busy)throw Error('Дождитесь завершения импорта');if(!incoming||typeof incoming!=='object'||Array.isArray(incoming)||Object.keys(incoming).length>10000)throw Error('Некорректные замены аудио');for(const [a,b]of Object.entries(incoming))if(!/^[a-f0-9]{64}$/.test(a)||typeof b!=='string'||!/^[a-f0-9]{64}$/.test(b))throw Error('Некорректная замена аудио');const removed=[];let changed=false;for(const [id,target]of Object.entries(incoming)){let final=target;const seen=new Set([id]);while(incoming[final]){if(seen.has(final))throw Error('Циклическая замена аудио');seen.add(final);final=incoming[final];}if(id===final||!this.data.tracks.some(t=>t.id===final)||this.data.replacements[id]===final)continue;this.data.replacements[id]=final;changed=true;if(this.data.tracks.some(t=>t.id===id))removed.push(id);}if(removed.length)await this.removeTracks(removed);else if(changed)await this.save();return this.data.replacements;}
  async updateTrack(id,details,remote=false){const t=this.data.tracks.find(t=>t.id===id);if(!t)throw Error('Трек не найден');if(remote){if(!applyRemoteDetails(t,details))return t;}else Object.assign(t,cleanDetails(details),{detailsUpdatedAt:Math.max(Date.now(),(t.detailsUpdatedAt||0)+1)});await this.save();return t;}
  async replaceAudio(id,file){
    if(this.busy)throw Error('Дождитесь завершения импорта');const old=this.data.tracks.find(t=>t.id===id);if(!old)throw Error('Трек не найден');
    const metadata=await parseFile(file,{duration:true});if(!(metadata.format.duration>0))throw Error('Выберите корректный аудиофайл');const hash=await sha256(file);if(hash===id)return {oldId:id,newId:id};if(this.data.tracks.some(t=>t.id===hash))throw Error('Этот файл уже есть в библиотеке. Выберите другое аудио.');
    const result=await this.importFolders([file],()=>{},{skipSimilar:false});if(result.errors.length||!result.added)throw Error(result.errors[0]?.message||'Не удалось заменить аудио');const next=this.data.tracks.find(t=>t.id===hash);if(!next)throw Error('Файл изменился во время замены. Исходный трек сохранён.');
    for(const key of [...detailKeys,'folder','addedAt'])if(old[key]!==undefined)next[key]=old[key];next.detailsUpdatedAt=Math.max(Date.now(),(old.detailsUpdatedAt||0)+1);
    if(old.cover&&!next.cover){await fs.copyFile(path.join(this.root,'art',id),path.join(this.root,'art',hash));next.cover=true;next.coverType=old.coverType;}
    this.data.replacements[id]=hash;await this.removeTracks([id]);return {oldId:id,newId:hash,track:next};
  }
  async importFolders(folders,onProgress=()=>{},options={}) {
    if(this.busy) throw new Error('Импорт уже выполняется');
    this.busy=true;
    const report={added:0,duplicates:0,similar:0,errors:[]}, files=[];
    const walk=async(dir)=>{
      for(const item of await fs.readdir(dir,{withFileTypes:true})) {
        const full=path.join(dir,item.name);
        if(item.isSymbolicLink()) continue;
        if(item.isDirectory()) await walk(full);
        else if(item.isFile()&&extensions.has(path.extname(item.name).toLowerCase())) files.push(full);
      }
    };
    try {
      for(const folder of folders) {
        const stat=await fs.stat(folder);
        if(stat.isDirectory())await walk(folder);
        else if(stat.isFile()&&extensions.has(path.extname(folder).toLowerCase()))files.push(folder);
        else throw new Error('Выберите аудиофайлы или папки с музыкой');
      }
      for(let i=0;i<files.length;i++) {
        const file=files[i]; this.progress={done:i,total:files.length,file:path.basename(file)}; onProgress(this.progress);
        let tmp;
        try {
          // Hash the managed copy: the source may change while it is being copied.
          tmp=path.join(this.root,'audio',randomBytes(10).toString('hex')+'.part');
          await fs.copyFile(file,tmp);
          const id=await sha256(tmp);
          if(this.data.tracks.some(t=>t.id===id)) { report.duplicates++; await fs.unlink(tmp); continue; }
          const ext=path.extname(file).toLowerCase();
          let metadata={common:{},format:{}};
          try { metadata=await parseFile(tmp,{duration:true}); } catch {}
          const c=metadata.common, f=metadata.format;
          const supplied=options.metadata?.[file]||{};
          const stem=path.basename(supplied.filename||file,ext), pieces=stem.split(/\s+[-–—]\s+/);
          const t={id,ext,size:(await fs.stat(tmp)).size,title:c.title||(pieces.length>1?pieces.slice(1).join(' — '):stem),artist:c.artist||(pieces.length>1?pieces[0]:'Неизвестный исполнитель'),album:c.album||path.basename(path.dirname(file)),albumArtist:c.albumartist||c.artist||'',genre:c.genre||[],year:c.year||null,number:c.track?.no||0,disc:c.disk?.no||1,duration:f.duration||0,folder:path.basename(path.dirname(file)),filename:path.basename(file),addedAt:Date.now(),cover:false};
          t.bitrate=f.bitrate||0;if(!options.metadata?.[file])t.sourcePath=file;applyRemoteDetails(t,supplied);
          for(const key of ['title','artist','album','folder','filename'])if(supplied[key]&&!c[key])t[key]=String(supplied[key]).slice(0,500);
          if(!t.duration&&Number.isFinite(supplied.duration))t.duration=supplied.duration;
          if(options.skipSimilar&&this.data.tracks.some(other=>similarTrack(t,other))) {report.similar++;await fs.unlink(tmp);continue;}
          const picture=c.picture?.[0];
          if(picture?.data?.length) {
            await fs.writeFile(path.join(this.root,'art',id),picture.data); t.cover=true; t.coverType=picture.format;
          } else {
            for(const name of ['cover.jpg','folder.jpg','front.jpg','cover.png','folder.png']) {
              try { await fs.copyFile(path.join(path.dirname(file),name),path.join(this.root,'art',id)); t.cover=true; t.coverType=name.endsWith('png')?'image/png':'image/jpeg'; break; } catch {}
            }
          }
          await fs.rename(tmp,this.file(t)); this.data.tracks.push(t);this.data.ignored=this.data.ignored.filter(x=>x!==id);report.added++;
          await this.save();
        } catch(e) { report.errors.push({file:path.basename(file),message:e.message}); if(tmp) await fs.unlink(tmp).catch(()=>{}); }
      }
      return report;
    } finally { this.busy=false; this.progress=null; onProgress(null); }
  }
  async removeTracks(ids) {
    if(this.busy)throw new Error('Дождитесь завершения импорта');
    if(!Array.isArray(ids)||ids.some(id=>!/^([a-f0-9]{64})$/.test(id)))throw new Error('Некорректный список треков');
    this.busy=true;
    try{
    const removed=this.data.tracks.filter(t=>ids.includes(t.id));
    this.data.tracks=this.data.tracks.filter(t=>!ids.includes(t.id));
    this.data.ignored=[...new Set([...this.data.ignored,...removed.map(t=>t.id)])];
    this.data.collectionRecords=(this.data.collectionRecords||[]).map(record=>{if(record.deleted)return record;let meta;try{meta=JSON.parse(record.description);}catch{return record;}const exists=this.data.tracks.some(t=>String(t[meta.type]||'')===record.name&&(meta.type!=='album'||meta.artist==null||t.artist===meta.artist)),tracks=record.tracks.filter(id=>!ids.includes(id));if(exists&&tracks.length===record.tracks.length)return record;this.data.collectionActor ||= 'collections-'+randomUUID();const actor=this.data.collectionActor;return {...record,tracks,image:exists?record.image:'',deleted:!exists,clock:{...record.clock,[actor]:(record.clock?.[actor]||0)+1},editId:randomUUID()};});
    await this.save();
    for(const t of removed){await fs.unlink(this.file(t)).catch(()=>{});await fs.unlink(path.join(this.root,'art',t.id)).catch(()=>{});}
    return {removed:removed.length};
    }finally{this.busy=false;}
  }
}
const normalized=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
export function similarTrack(a,b) {
  return a.duration>0&&b.duration>0&&Math.abs(a.duration-b.duration)<=1.5&&normalized(a.title)===normalized(b.title)&&normalized(a.artist)===normalized(b.artist)&&normalized(a.artist)!=='неизвестный исполнитель'&&normalized(a.album)===normalized(b.album);
}

import {promises as fs} from 'node:fs';
import path from 'node:path';
import {extensions,sha256} from './library.mjs';
export class Uploads {
  constructor(library){this.library=library;this.root=path.join(library.root,'incoming');this.locks=new Set();}
  validate(t){if(!t||!/^([a-f0-9]{64})$/.test(t.id)||!extensions.has(t.ext)||!Number.isSafeInteger(t.size)||t.size<1||t.size>8*1024**3)throw new Error('Некорректный аудиофайл');}
  meta(id){if(!/^([a-f0-9]{64})$/.test(id))throw new Error('Некорректный файл');return path.join(this.root,id+'.json');}
  part(t){return path.join(this.root,t.id+t.ext+'.part');}
  async start(t){
    this.validate(t);if(this.library.data.tracks.some(x=>x.id===t.id)){await this.library.updateTrack(t.id,t,true);return {exists:true};}
    if(this.library.data.ignored.includes(t.id))return {ignored:true};
    await fs.mkdir(this.root,{recursive:true});
    const disk=await fs.statfs(this.root);if(disk.bavail*disk.bsize<t.size+16*1024*1024)throw new Error('На ПК недостаточно свободного места для передачи');
    const pending=(await fs.readdir(this.root)).filter(name=>name.endsWith('.json'));if(pending.length>=32&&!pending.includes(t.id+'.json'))throw new Error('Слишком много незавершённых передач. Продолжите текущие файлы');
    const known=await fs.readFile(this.meta(t.id),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(known&&(known.ext!==t.ext||known.size!==t.size))throw new Error('Метаданные передачи изменились');
    const track={};for(const key of ['id','ext','size','title','artist','album','folder','filename','duration','year','genre','number','trackVolume','detailsUpdatedAt','customCover'])if(t[key]!==undefined)track[key]=typeof t[key]==='string'?t[key].slice(0,key==='customCover'?700000:500):t[key];
    await fs.writeFile(this.meta(t.id),JSON.stringify(track));
    const offset=await fs.stat(this.part(track)).then(s=>s.size).catch(()=>0);return {offset};
  }
  async chunk(id,offset,request){
    if(this.locks.has(id))throw new Error('Передача этого файла уже выполняется');this.locks.add(id);
    try{
      const t=JSON.parse(await fs.readFile(this.meta(id),'utf8'));this.validate(t);
      const file=this.part(t),size=await fs.stat(file).then(s=>s.size).catch(()=>0);
      if(!Number.isSafeInteger(offset)||offset!==size)throw new Error('Смещение изменилось. Повторите передачу');
      const chunks=[];let bytes=0;
      for await(const chunk of request){bytes+=chunk.length;if(bytes>4*1024*1024||size+bytes>t.size)throw new Error('Слишком большой фрагмент');chunks.push(chunk);}
      await fs.appendFile(file,Buffer.concat(chunks));return {offset:size+bytes};
    }finally{this.locks.delete(id);}
  }
  async finish(id){
    if(this.locks.has(id))throw new Error('Передача этого файла уже выполняется');this.locks.add(id);
    try{
      const t=JSON.parse(await fs.readFile(this.meta(id),'utf8'));this.validate(t);const part=this.part(t);
      if((await fs.stat(part)).size!==t.size)throw new Error('Файл ещё не передан полностью');
      if(await sha256(part)!==t.id){await fs.unlink(part);throw new Error('Проверка SHA-256 не пройдена. Повторите передачу');}
      if(this.library.data.tracks.some(x=>x.id===id)){await fs.unlink(part);await fs.unlink(this.meta(id));return {added:0};}
      const source=path.join(this.root,t.id+t.ext);await fs.rename(part,source);
      let report;try{report=await this.library.importFolders([source],()=>{},{metadata:{[source]:t}});}catch(e){await fs.rename(source,part).catch(()=>{});throw e;}
      if(report.errors.length){await fs.rename(source,part).catch(()=>{});throw new Error(report.errors[0].message);}
      await fs.unlink(source);await fs.unlink(this.meta(id));return {added:report.added};
    }finally{this.locks.delete(id);}
  }
}

import fs from 'node:fs/promises';
import path from 'node:path';
export function wav(seconds=1,frequency=440){
  const length=44100*seconds,buf=Buffer.alloc(44+length*2);buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(44100,24);buf.writeUInt32LE(88200,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(length*2,40);for(let i=0;i<length;i++)buf.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*frequency/44100)*600),44+i*2);return buf;
}
export async function fixture(dir){await fs.mkdir(path.join(dir,'Album','Nested'),{recursive:true});await fs.writeFile(path.join(dir,'Album','Artist — Song.wav'),wav());await fs.writeFile(path.join(dir,'Album','Nested','Second.wav'),wav(1,220));await fs.writeFile(path.join(dir,'Album','copy.wav'),wav());await fs.writeFile(path.join(dir,'Album','ignore.txt'),'not music');return dir;}

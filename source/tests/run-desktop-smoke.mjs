import {spawn} from 'node:child_process';
import path from 'node:path';
for(const file of process.argv.slice(2)){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(path.resolve('node_modules/electron/dist/electron.exe'),[file],{env,stdio:'inherit',windowsHide:true});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});if(code!==0)process.exit(code||1);
}

import https from 'node:https';
import {X509Certificate,createHash} from 'node:crypto';
export function tlsRequest(sync,route,{method='GET',headers={},body,pin=sync.fingerprint}={}){
 return new Promise((resolve,reject)=>{
  const request=https.request({host:'127.0.0.1',port:sync.securePort,path:route,method,headers,ca:sync.tlsServer.certForTest,
    checkServerIdentity:(_host,certificate)=>{
      const actual=createHash('sha256').update(new X509Certificate(certificate.raw).publicKey.export({type:'spki',format:'der'})).digest('hex');return actual===pin?undefined:Error('PIN_MISMATCH');
    },agent:false},response=>{const chunks=[];response.on('data',b=>chunks.push(b));response.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:response.statusCode,headers:new Headers(response.headers),text:async()=>bytes.toString(),json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes});});response.on('error',reject);});request.on('error',reject);request.end(body);
 });
}
export async function prepareTLS(sync,root){const fs=await import('node:fs/promises');const path=await import('node:path');sync.tlsServer.certForTest=JSON.parse(await fs.readFile(path.join(root,'security/tls-identity.json'),'utf8')).certificate;return sync;}

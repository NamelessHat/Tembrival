import {promises as fs} from 'node:fs';
import path from 'node:path';
import {X509Certificate,createHash,createPrivateKey,randomBytes} from 'node:crypto';
import selfsigned from 'selfsigned';

export const keyFingerprint=certificate=>createHash('sha256').update(new X509Certificate(certificate).publicKey.export({type:'spki',format:'der'})).digest('hex');
export const verificationCode=fingerprint=>fingerprint.slice(0,32).toUpperCase().match(/.{4}/g).join(' ');
export async function loadIdentity(root,{protect,unprotect}={}){
  const directory=path.join(root,'security');await fs.mkdir(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,'tls-identity.json');let record,key;
  try{record=JSON.parse(await fs.readFile(file,'utf8'));key=record.protected?unprotect?.(record.key):record.key;if(!key)throw Error('Не удалось открыть ключ защищённого соединения');}
  catch(e){if(e.code!=='ENOENT')throw e;
    const generated=selfsigned.generate([{name:'commonName',value:'Tembrival local device'}],{keySize:3072,algorithm:'sha256',days:3650,extensions:[{name:'basicConstraints',cA:false},{name:'keyUsage',digitalSignature:true,keyEncipherment:true},{name:'extKeyUsage',serverAuth:true}]});
    key=generated.private;record={certificate:generated.cert,key:protect?protect(key):key,protected:!!protect};
    const temporary=file+'.'+randomBytes(8).toString('hex')+'.tmp';await fs.writeFile(temporary,JSON.stringify(record),{mode:0o600,flag:'wx'});await fs.rename(temporary,file);
  }
  const certificate=new X509Certificate(record.certificate);if(!certificate.checkPrivateKey(createPrivateKey(key)))throw Error('Ключ TLS не соответствует сертификату');
  if(new Date(certificate.validTo)<=new Date())throw Error('Сертификат ПК истёк. Требуется обновление удостоверения и повторное сопряжение.');
  if(!record.protected&&protect){record={...record,key:protect(key),protected:true};await fs.writeFile(file+'.tmp',JSON.stringify(record),{mode:0o600});await fs.rename(file+'.tmp',file);}
  return {key,cert:record.certificate,fingerprint:keyFingerprint(record.certificate)};
}

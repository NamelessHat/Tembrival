import dgram from 'node:dgram';
import os from 'node:os';
export const DISCOVERY_PORT=47833;
export const localIPv4=ip=>typeof ip==='string'&&/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|127\.)/.test(ip)&&ip.split('.').length===4&&ip.split('.').every(n=>/^\d{1,3}$/.test(n)&&Number(n)<=255);
export function networkAddresses(port,interfaces=os.networkInterfaces()){
 const priority=name=>/vpn|tun|tap|virtual|wireguard|wintun|clash|mihomo|tailscale|zerotier|hyper-v|vmware|vbox/i.test(name)?2:/wi-?fi|wireless|wlan|беспровод/i.test(name)?0:1;
 return Object.entries(interfaces).flatMap(([name,items])=>(items||[]).filter(i=>i.family==='IPv4'&&!i.internal&&localIPv4(i.address)).map(i=>({name,url:`http://${i.address}:${port}`}))).sort((a,b)=>priority(a.name)-priority(b.name)||a.name.localeCompare(b.name));
}
export async function startDiscovery({port=DISCOVERY_PORT,info}){
 const socket=dgram.createSocket({type:'udp4',reuseAddr:true});let active=false;const last=new Map();
 socket.on('error',()=>{active=false;});socket.on('message',(bytes,remote)=>{
  if(bytes.length>512||!localIPv4(remote.address))return;
  try{const request=JSON.parse(bytes);if(request.type!=='luma-discover-v1'||! /^[a-f0-9]{32}$/.test(request.nonce))return;
   const now=Date.now();if(now-(last.get(remote.address)||0)<200)return;if(last.size>256)last.clear();last.set(remote.address,now);
   const data=info();socket.send(Buffer.from(JSON.stringify({type:'luma-server-v1',nonce:request.nonce,...data})),remote.port,remote.address,()=>{});
  }catch{}
 });
 await new Promise(resolve=>{socket.once('error',resolve);socket.bind(port,'0.0.0.0',()=>{active=true;socket.unref();resolve();});});
 return {get active(){return active;},port:active?socket.address().port:null,close(){try{socket.close();}catch{}}};
}

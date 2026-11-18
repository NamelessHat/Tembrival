export const detailKeys=['title','artist','album','year','genre','number','trackVolume','customCover'];
export function cleanDetails(raw){
 const out={};for(const k of ['title','artist','album'])if(raw[k]!==undefined){const v=String(raw[k]).trim().slice(0,500);if(k==='title'&&!v)throw Error('Введите название трека');out[k]=v;}
 if(raw.year!==undefined){const y=raw.year===''||raw.year==null?null:Number(raw.year);if(y!==null&&(!Number.isInteger(y)||y<1||y>9999))throw Error('Некорректный год');out.year=y;}
 if(raw.number!==undefined){const n=Number(raw.number);if(!Number.isInteger(n)||n<0||n>9999)throw Error('Некорректный номер трека');out.number=n;}
 if(raw.genre!==undefined)out.genre=(Array.isArray(raw.genre)?raw.genre:String(raw.genre).split(',')).map(s=>String(s).trim().slice(0,100)).filter(Boolean).slice(0,20);
 if(raw.trackVolume!==undefined){const v=Number(raw.trackVolume);if(!Number.isFinite(v)||v<0||v>1)throw Error('Громкость трека должна быть от 0 до 100%');out.trackVolume=v;}
 if(raw.customCover!==undefined){const image=String(raw.customCover||'');if(image.length>700000||image&&!/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(image))throw Error('Некорректная обложка');out.customCover=image;}
 return out;
}
export function applyRemoteDetails(track,raw){if(Number.isSafeInteger(raw.detailsUpdatedAt)&&raw.detailsUpdatedAt>(track.detailsUpdatedAt||0)){Object.assign(track,cleanDetails(raw),{detailsUpdatedAt:raw.detailsUpdatedAt});return true;}return false;}

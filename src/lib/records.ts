import { currentRecords, subscribe } from './session';
export const db={};
export function collection(_db:unknown,name:string){return {path:name,filters:[] as any[]};}
export function doc(_db:unknown,...parts:string[]){return {path:parts.join('/'),filters:[] as any[]};}
export function where(field:string,op:string,value:any){return {field,op,value};}
export function query(ref:any,...filters:any[]){return {...ref,filters};}
export function onSnapshot(ref:any,callback:(snapshot:any)=>void,onError?:(e:unknown)=>void){
 const emit=()=>{try{
  const records=currentRecords();
  const snapshot=(path:string,data:any)=>({id:path.split('/').pop(),exists:()=>data!==undefined,data:()=>data});
  if(ref.path.split('/').length%2===0)callback(snapshot(ref.path,records[ref.path]));
  else callback({docs:Object.entries(records).filter(([path,data]:any)=>path.startsWith(ref.path+'/')&&path.split('/').length===ref.path.split('/').length+1&&ref.filters.every((f:any)=>f.op==='=='?data[f.field]===f.value:f.op==='in'?f.value.includes(data[f.field]):f.op==='>='?data[f.field]>=f.value:false)).map(([path,data])=>snapshot(path,data))});
 }catch(e){onError?.(e);}};
 queueMicrotask(emit);return subscribe(emit);
}

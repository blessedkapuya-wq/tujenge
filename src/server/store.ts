export interface Store { records:Record<string,any> }
export function collection(store:Store,name:string){return {store,path:name};}
export function doc(base:any,...parts:string[]){const path=parts.length?parts.join('/'):base.path+'/'+crypto.randomUUID();return {store:base.store||base,path,id:path.split('/').pop()};}
export function serverTimestamp(){return {__timestamp:Date.now()};}
export async function getDoc(ref:any){const data=ref.store.records[ref.path];return {id:ref.path.split('/').pop(),exists:()=>data!==undefined,data:()=>data};}
function writer(store:Store){return {
 get:getDoc,
 set(ref:any,data:any,options?:any){store.records[ref.path]=options?.merge?{...store.records[ref.path],...data}:data;},
 update(ref:any,data:any){if(!store.records[ref.path])throw new Error('Record not found.');store.records[ref.path]={...store.records[ref.path],...data};},
 delete(ref:any){delete store.records[ref.path];},
 async commit(){}
};}
export function writeBatch(store:Store){return writer(store);}
export async function runTransaction(store:Store,fn:(tx:any)=>Promise<any>){return fn(writer(store));}
export async function setDoc(ref:any,data:any,options?:any){writer(ref.store).set(ref,data,options);}
export async function updateDoc(ref:any,data:any){writer(ref.store).update(ref,data);}
export async function deleteDoc(ref:any){writer(ref.store).delete(ref);}

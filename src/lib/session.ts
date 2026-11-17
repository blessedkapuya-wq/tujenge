export interface User { uid: string; email: string | null; displayName: string | null; phoneNumber: string | null; emailVerified: boolean; role: 'admin' | 'member' }
export const auth: { currentUser: User | null } = { currentUser: null };
export const ADMIN_BOOTSTRAP_EMAIL = 'blessedkapuya@gmail.com';
const listeners = new Set<(user: User | null) => void>();
const updates = new Set<() => void>();
let records: Record<string, any> = {};
let pending: Promise<void> | null = null;
let loaded = false;
export async function api(path: string, body?: unknown) {
 const response = await fetch(path, {method:body===undefined?'GET':'POST',credentials:'same-origin',signal:AbortSignal.timeout(15000),headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json(); if(!response.ok) throw new Error(data.error||'Unable to complete your request.'); return data;
}
function revive(value:any):any {
 if(Array.isArray(value)) return value.map(revive);
 if(value&&typeof value==='object') {
  if(typeof value.__timestamp==='number') return {toMillis:()=>value.__timestamp,toDate:()=>new Date(value.__timestamp)};
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,revive(v)]));
 } return value;
}
export async function refresh() {
 if(pending) return pending;
 pending=(async()=>{
  const data=await api('/api/workspace');
  const changed=!loaded||JSON.stringify(auth.currentUser)!==JSON.stringify(data.user);
  loaded=true;auth.currentUser=data.user;records=revive(data.records);
  if(changed) listeners.forEach(fn=>fn(auth.currentUser));
  updates.forEach(fn=>fn());
 })().finally(()=>{pending=null;});return pending;
}
export function onAuthStateChanged(_auth:unknown,fn:(user:User|null)=>void) {
 listeners.add(fn);if(loaded)queueMicrotask(()=>fn(auth.currentUser));
 void refresh().catch(()=>{if(!loaded){loaded=true;listeners.forEach(cb=>cb(null));}});
 return ()=>{listeners.delete(fn);};
}
export async function signOutUser(){await api('/api/auth/logout',{});await refresh();}
export async function authenticate(mode:string,phone:string,pin:string,email:string){await api('/api/auth/'+mode,{phone,pin,email});await refresh();}
export function subscribe(fn:()=>void){updates.add(fn);void refresh().catch(console.error);const timer=setInterval(()=>{void refresh().catch(console.error);},12000);return ()=>{updates.delete(fn);clearInterval(timer);};}
export function currentRecords(){return records;}

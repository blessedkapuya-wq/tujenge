import {createOperations} from './operations';
import {normalizeTzPhone,MOBILE_NETWORKS} from '../types/vicoba';
interface Env { DB:any; ASSETS:{fetch(request:Request):Promise<Response>} }
const encoder=new TextEncoder();
const ADMIN_EMAIL='blessedkapuya@gmail.com';
const COOKIE='tujenge_session';
const sessionAge=7*24*60*60;
class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
function requireValue(ok:any,message:string,status=400):asserts ok {if(!ok)throw new HttpError(status,message);}
function json(data:any,status=200,headers:any={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
function hex(data:ArrayBuffer){return Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('');}
async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
function random(){return hex(crypto.getRandomValues(new Uint8Array(32)).buffer);}
async function hash(secret:string,salt=random()){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),'PBKDF2',false,['deriveBits']);return salt+'.'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256));}
async function verify(secret:string,stored:string){const actual=await hash(secret,stored.split('.')[0]);let difference=actual.length^stored.length;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^(stored.charCodeAt(i)||0);return difference===0;}
function cookie(token:string,maxAge=sessionAge){return COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge;}
function cookieToken(request:Request){return request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
async function actor(request:Request,env:Env){
 const token=cookieToken(request);if(!/^[a-f0-9]{64}$/.test(token))return null;
 return env.DB.prepare('SELECT u.* FROM tujenge_sessions s JOIN tujenge_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first();
}
function publicUser(user:any){return user?{uid:user.id,email:user.email||null,displayName:user.display_name||null,phoneNumber:user.phone||null,emailVerified:user.role==='admin',role:user.role}:null;}
async function session(user:any,env:Env){const token=random();await env.DB.prepare('INSERT INTO tujenge_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),user.id,Date.now()+sessionAge*1000).run();return json({user:publicUser(user)},200,{'Set-Cookie':cookie(token)});}
async function limit(env:Env,key:string,max:number,seconds:number){
 const window=Math.floor(Date.now()/(seconds*1000));const id=await digest(key+':'+window);
 const row=await env.DB.prepare('INSERT INTO tujenge_auth_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(id,Date.now()+seconds*2000).first();
 requireValue(row.count<=max,'Too many attempts. Please try again later.',429);
}
async function state(env:Env){const row=await env.DB.prepare('SELECT payload,revision FROM tujenge_app_state WHERE id=1').first();requireValue(row,'The ledger is not initialized.',503);return {records:JSON.parse(row.payload),revision:row.revision};}
async function mutate(env:Env,fn:(store:any)=>Promise<any>){
 for(let attempt=0;attempt<5;attempt++){
  const store=await state(env);const result=await fn(store);
  const saved=await env.DB.prepare('UPDATE tujenge_app_state SET payload=?,revision=revision+1 WHERE id=1 AND revision=?').bind(JSON.stringify(store.records),store.revision).run();
  if(saved.meta.changes===1)return result;
 }throw new HttpError(409,'The ledger changed while saving. Please try again.');
}
function rows(records:any,collection:string){return Object.entries(records).filter(([path])=>path.startsWith(collection+'/')&&path.split('/').length===2).map(([path,data]:any)=>({id:path.split('/')[1],...data}));}
function string(value:any,max=4000){requireValue(typeof value==='string'&&value.length<=max,'Invalid text value.');return value.trim();}
function amount(value:any,min=1,max=100000000){requireValue(typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max,'Enter a valid amount.');return value;}
const memberActions=new Set(['joinVicobaGroup','fetchMemberPrivatePii','payWithMobileMoney','requestMemberLoan','ensureInitialGroupSeeded','sendMeetingReminderBroadcast']);
const adminActions=new Set(['approvePendingLoan','declinePendingLoan','issueMemberLoan','addGroupDocument','deleteGroupDocument','addGroupMeeting','toggleMeetingStatus','applySundayFineToMember','sendSundayRollCallReminder','recordJamiiPayout','adjustOrReversePayment','relinkMemberPhoneAndUid']);
async function action(env:Env,user:any,body:any){
 const name=body.action;requireValue(memberActions.has(name)||adminActions.has(name),'Unknown operation.',404);requireValue(user,'Please sign in first.',401);
 requireValue(!adminActions.has(name)||user.role==='admin','Admin permission required.',403);
 requireValue(Array.isArray(body.args)&&body.args.length<=2,'Invalid operation.');
 if(name==='ensureInitialGroupSeeded')return;
 if(name==='sendMeetingReminderBroadcast'&&user.role!=='admin')return;
 return mutate(env,async store=>{
  const operations:any=createOperations(store);const args=structuredClone(body.args);let p=args[0];
  if(p&&typeof p==='object'){p.uid=user.id;p.actorUid=user.id;p.adminUid=user.id;p.senderUid=user.id;p.email=user.email||'';p.adminName=user.display_name||'Sarah Kapuya';p.memberCount=rows(store.records,'members').length;}
  const get=(collection:string,id:any)=>{requireValue(typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id),'Invalid record.');const data=store.records[collection+'/'+id];requireValue(data,'Record not found.',404);return {id,...data};};
  if(p?.member){p.member=get('members',p.member.id);requireValue(user.role==='admin'||p.member.uid===user.id,'You can only change your own member record.',403);}
  if(p?.loan)p.loan=get('loans',p.loan.id);
  if(p?.payment)p.payment=get('payments',p.payment.id);
  if(p?.meeting)p.meeting=get('meetings',p.meeting.id);
  if(name==='fetchMemberPrivatePii'){const member=get('members',p);requireValue(user.role==='admin'||member.uid===user.id,'Private record access denied.',403);}
  if(name==='joinVicobaGroup'){
   requireValue(p&&typeof p==='object','Invalid membership details.');
   for(const key of ['fullName','nextOfKinName','nextOfKinPhone','mtaaHouseNumber'])requireValue(string(p[key],140).length>=2,'Complete the membership form.');
   p.phone=user.phone||normalizeTzPhone(string(p.phone,24));
   requireValue(MOBILE_NETWORKS.some(n=>n.id===p.preferredNetwork),'Choose a supported mobile network.');
   amount(p.startingCommitmentShares,0,1000);
   if(p.nationalId!==undefined)string(p.nationalId,40);
  }
  if(['payWithMobileMoney','recordJamiiPayout'].includes(name))amount(p.amountTsh,1000);
  if(name==='payWithMobileMoney'){
   requireValue(['weekly_contribution','shares','social_fund','loan_repayment','fine'].includes(p.category),'Invalid payment category.');
   requireValue(MOBILE_NETWORKS.some(n=>n.id===p.provider),'Choose a supported mobile network.');
   requireValue(/^[a-zA-Z0-9_-]{5,40}$/.test(p.reference),'Enter a valid transaction reference.');
   string(p.phone,24);amount(p.sharesCount,0,10000);
  }
  if(['requestMemberLoan','issueMemberLoan'].includes(name)){amount(p.principalTsh,10000);amount(p.durationMonths,1,6);requireValue(string(p.purpose,120).length>=2,'Enter the loan purpose.');}
  if(name==='applySundayFineToMember'){amount(p.fineTsh,1000);string(p.weekLabel,80);}
  if(name==='adjustOrReversePayment'){requireValue(['adjusted','reversed'].includes(p.action),'Invalid adjustment.');if(p.action==='adjusted')amount(p.newAmountTsh,1000);requireValue(string(p.reason,200).length>=3,'Enter the reason.');}
  if(name==='toggleMeetingStatus'){args[0]=get('meetings',p.id);}
  if(name==='declinePendingLoan')get('loans',p);
  if(name==='deleteGroupDocument')get('documents',p);
  if(name==='addGroupDocument'){requireValue(string(p.title,120).length>=2&&string(p.content,4000).length>=5,'Document title and content are required.');requireValue(['Policy','Constitution','Meeting Minutes','Financial Form','Notice'].includes(p.category),'Invalid document category.');requireValue(['public','members'].includes(p.visibility),'Invalid visibility.');if(p.externalUrl){const u=new URL(p.externalUrl);requireValue(['https:','http:'].includes(u.protocol),'Use a web link.');}}
  if(name==='addGroupMeeting'){for(const key of ['title','quarterLabel','meetingDate','meetingTime','location','agenda'])string(p[key],500);requireValue(/^\d{4}-\d{2}-\d{2}$/.test(p.meetingDate),'Invalid meeting date.');}
  if(name==='recordJamiiPayout'){requireValue(['Illness','Bereavement','Family Emergency','Maternity','Other'].includes(p.reason),'Invalid payout reason.');string(p.notes,240);requireValue(/^\d{4}-\d{2}-\d{2}$/.test(p.payoutDate),'Invalid payout date.');}
  if(name==='relinkMemberPhoneAndUid'){
   const m=get('members',p.memberId);
   if(p.newUid){const linked=await env.DB.prepare('SELECT id,phone FROM tujenge_users WHERE id=?').bind(p.newUid).first();requireValue(linked,'Create the member account before linking it.');p.newPhone=linked.phone||p.newPhone;}
   if(p.newPhone){p.newPhone=normalizeTzPhone(p.newPhone);requireValue(/^\+255[67]\d{8}$/.test(p.newPhone),'Enter a valid Tanzanian number.');const linked=await env.DB.prepare('SELECT id FROM tujenge_users WHERE phone=?').bind(p.newPhone).first();requireValue(linked,'Create an account with this number first, then link it.');p.newUid=linked.id;}
   requireValue(!rows(store.records,'members').some((other:any)=>other.uid===p.newUid&&other.id!==m.id),'That account is already linked to another member.');
  }
  return operations[name](...args);
 });
}
async function scheduler(env:Env,user:any,pathname:string,body:any){
 requireValue(user?.role==='admin','Admin permission required.',403);
 return mutate(env,async store=>{
  const config=store.records['_system/scheduler']||{enabled:true,sundayHourEat:8,sundayMinuteEat:0,eveningRollCallHourEat:19,nextMeetingTitle:'Quarterly VICOBA Meeting',nextMeetingDate:'2026-11-29',pendingMemberNumbers:[],pendingCount:0};
  const history=store.records['_system/history']||[];
  if(pathname.endsWith('/config')){for(const key of ['enabled','sundayHourEat','sundayMinuteEat','eveningRollCallHourEat','nextMeetingTitle','nextMeetingDate','pendingMemberNumbers'])if(body[key]!==undefined)config[key]=body[key];requireValue(typeof config.enabled==='boolean'&&Number.isInteger(config.sundayHourEat)&&config.sundayHourEat>=0&&config.sundayHourEat<24,'Invalid reminder schedule.');config.pendingCount=config.pendingMemberNumbers.length;store.records['_system/scheduler']=config;}
  const now=new Date();const eat=new Date(now.getTime()+10800000);const label=eat.toISOString().slice(0,16).replace('T',' ')+' EAT';
  const messages={en:'Tujenge Hub: Sunday contribution reminder. Minimum 12,000 TSH (10,000 Hisa + 2,000 Jamii).',sw:'Tujenge Hub: Ukumbusho wa mchango wa Jumapili. Angalau 12,000 TSH (10,000 Hisa + 2,000 Jamii).'};
  let entry:any=null;
  if(pathname.endsWith('/run-now')){
   requireValue(['sunday_morning','sunday_rollcall','quarterly_meeting'].includes(body.type),'Invalid reminder type.');
   if(body.type==='quarterly_meeting'){messages.en='Meeting reminder: '+config.nextMeetingTitle+' on '+config.nextMeetingDate;messages.sw='Ukumbusho wa mkutano: '+config.nextMeetingTitle+' tarehe '+config.nextMeetingDate;}
   entry={id:crypto.randomUUID(),type:body.type,triggeredAtIso:now.toISOString(),eatTimeLabel:label,summary:messages.en,webhookStatus:'not_configured'};history.unshift(entry);store.records['_system/history']=history.slice(0,50);
   store.records['notifications/'+entry.id]={senderUid:user.id,eventType:'meeting_reminder',title:'Tujenge Hub Reminder',message:messages.en,recipientCount:rows(store.records,'members').length,createdAt:{__timestamp:Date.now()}};
  }
  return {eatNow:{dateStr:eat.toISOString().slice(0,10),weekday:new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'Africa/Dar_es_Salaam'}).format(now),hour:eat.getUTCHours(),minute:eat.getUTCMinutes(),label},config,history,webhookConfigured:false,previewMessages:messages,messages,entry};
 });
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   requireValue(env.DB,'Storage is temporarily unavailable.',503);
   const write=request.method!=='GET'&&request.method!=='HEAD';
   if(write){requireValue(request.method==='POST','Method not allowed.',405);requireValue(request.headers.get('Origin')===url.origin,'Request origin rejected.',403);requireValue(request.headers.get('Content-Type')?.startsWith('application/json'),'JSON is required.',415);}
   let body:any={};if(write){const raw=await request.text();requireValue(raw.length<32768,'Request is too large.',413);try{body=JSON.parse(raw);}catch{throw new HttpError(400,'Invalid request.');}}
   const user=await actor(request,env);
   if(url.pathname==='/api/health')return json({ok:true,auth:'cloudflare-session',database:'d1'});
   if(url.pathname==='/api/workspace'&&!write){
    const store=await state(env);const member=rows(store.records,'members').some((m:any)=>m.uid===user?.id);const visible:any={};
    for(const [path,data] of Object.entries(store.records) as any){
     const collection=path.split('/')[0];
     if(path.split('/').length!==2)continue;
     if(collection==='groups'||collection==='members'||collection==='documents'&&(data.visibility==='public'||user&&(member||user.role==='admin'))||user&&(member||user.role==='admin')&&['payments','loans','notifications','meetings','jamii_payouts'].includes(collection)||user?.role==='admin'&&collection==='payment_adjustments')visible[path]=data;
    }
    if(user?.role==='admin')visible['admins/'+user.id]={role:'admin'};return json({user:publicUser(user),records:visible});
   }
   if(url.pathname==='/api/auth/logout'&&write){if(cookieToken(request))await env.DB.prepare('DELETE FROM tujenge_sessions WHERE token_hash=?').bind(await digest(cookieToken(request))).run();return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
   if(['/api/auth/login','/api/auth/register','/api/auth/admin'].includes(url.pathname)&&write){
    const ip=request.headers.get('CF-Connecting-IP')||'local';await limit(env,'ip:'+ip,30,900);
    const phone=normalizeTzPhone(String(body.phone||''));const admin=url.pathname.endsWith('/admin');const identity=admin?String(body.email||'').toLowerCase().trim():phone;
    requireValue(admin||/^\+255[67]\d{8}$/.test(phone),'Enter a valid Tanzanian mobile number.');const pin=String(body.pin||'');requireValue(admin?pin.length>=12&&pin.length<=128:/^\d{6}$/.test(pin),admin?'Enter your admin password.':'Enter a 6-digit PIN.');
    await limit(env,'identity:'+identity,5,900);
    if(url.pathname.endsWith('/register')){
     requireValue(!user,'Sign out before creating another account.',409);
     const existing=await env.DB.prepare('SELECT id FROM tujenge_users WHERE phone=?').bind(phone).first();requireValue(!existing,'This number already has an account. Please sign in.',409);
     const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO tujenge_users(id,phone,email,role,display_name,secret_hash) VALUES(?,?,NULL,?,?,?)').bind(id,phone,'member',null,await hash(pin)).run();return session({id,phone,role:'member'},env);
    }
    const account=await env.DB.prepare(admin?'SELECT * FROM tujenge_users WHERE email=? AND role=\'admin\'':'SELECT * FROM tujenge_users WHERE phone=? AND role=\'member\'').bind(identity).first();
    const valid=await verify(pin,account?.secret_hash||('0'.repeat(64)+'.'+'0'.repeat(64)));
    requireValue(account&&valid,'Incorrect sign-in details.',401);return session(account,env);
   }

   if(url.pathname==='/api/auth/change'&&write){
    requireValue(user,'Please sign in first.',401);await limit(env,'change:'+user.id,5,900);
    const current=String(body.current||'');const next=String(body.next||'');
    requireValue(await verify(current,user.secret_hash),'Current credential is incorrect.',401);
    requireValue(user.role==='admin'?next.length>=12&&next.length<=128:/^\d{6}$/.test(next),user.role==='admin'?'Use a password of 12 to 128 characters.':'Use a 6-digit PIN.');
    await env.DB.batch([env.DB.prepare('UPDATE tujenge_users SET secret_hash=? WHERE id=?').bind(await hash(next),user.id),env.DB.prepare('DELETE FROM tujenge_sessions WHERE user_id=?').bind(user.id)]);
    return session(user,env);
   }
   if(url.pathname==='/api/auth/reset-member'&&write){
    requireValue(user?.role==='admin','Admin permission required.',403);await limit(env,'reset:'+user.id,10,900);
    const phone=normalizeTzPhone(String(body.phone||''));const pin=String(body.pin||'');requireValue(/^\d{6}$/.test(pin),'Use a 6-digit PIN.');
    const target=await env.DB.prepare("SELECT id FROM tujenge_users WHERE phone=? AND role='member'").bind(phone).first();requireValue(target,'Member account not found.',404);
    await env.DB.batch([env.DB.prepare('UPDATE tujenge_users SET secret_hash=? WHERE id=?').bind(await hash(pin),target.id),env.DB.prepare('DELETE FROM tujenge_sessions WHERE user_id=?').bind(target.id)]);
    return json({ok:true});
   }
   if(url.pathname==='/api/action'&&write){const result=await action(env,user,body);if(body.action==='joinVicobaGroup'&&user)await env.DB.prepare('UPDATE tujenge_users SET display_name=? WHERE id=?').bind(String(body.args[0].fullName).trim().slice(0,80),user.id).run();return json({result:result??null});}
   if(url.pathname.startsWith('/api/scheduler/'))return json(await scheduler(env,user,url.pathname,body));
   return json({error:'Endpoint not found.'},404);
  }catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);if(e instanceof Error&&e.message.includes('UNIQUE constraint'))return json({error:'This account already exists.'},409);return json({error:e instanceof Error?e.message:'Unable to complete your request.'},400);}
 }
};

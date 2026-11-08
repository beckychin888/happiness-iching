import { reports } from '../lib/reports.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 if(!env.DB)return json({error:'尚未綁定 Cloudflare D1 資料庫。'},503);
 let input;try{input=await request.json()}catch{return json({error:'請提供正確的資料格式'},400)}
 const email=String(input.email||'').trim().toLowerCase(),name=String(input.name||'').trim();
 const number=Number(input.number),consent=input.marketing_consent===true;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||name.length>80||!Number.isInteger(number)||number<1||number>64)return json({error:'Email 或卦象資料不正確'},400);
 const report=reports[String(number)];if(!report)return json({error:'卦象不存在'},400);
 // Before public launch, add and verify Cloudflare Turnstile to prevent automated submissions.
 try{
  await env.DB.prepare("INSERT INTO visitors (email,name) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET name=CASE WHEN excluded.name <> '' THEN excluded.name ELSE visitors.name END").bind(email,name).run();
  const visitor=await env.DB.prepare('SELECT id FROM visitors WHERE email=?').bind(email).first();
  await env.DB.prepare('INSERT INTO draws (visitor_id,hexagram_number) VALUES (?,?)').bind(visitor.id,number).run();
  await env.DB.prepare('INSERT INTO consents (visitor_id,marketing_consent,policy_version) VALUES (?,?,?)').bind(visitor.id,consent?1:0,'draft-v1').run();
  return json({ok:true,report:{number:report.number,name:report.name,symbol:report.symbol,full_name:report.full_name,theme:report.theme,sections:report.sections}});
 }catch(e){console.error('Claim storage failed',String(e));return json({error:'資料儲存失敗，請稍後重試'},500)}
}

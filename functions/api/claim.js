import { reports } from '../lib/reports.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  const draw=await env.DB.prepare('INSERT INTO draws (visitor_id,hexagram_number) VALUES (?,?)').bind(visitor.id,number).run();
  await env.DB.prepare('INSERT INTO consents (visitor_id,marketing_consent,policy_version) VALUES (?,?,?)').bind(visitor.id,consent?1:0,'draft-v1').run();
  let sent=false,providerId=null;
  if(env.RESEND_API_KEY&&env.EMAIL_FROM){
   const sections=Object.entries(report.sections).map(([h,t])=>`<h3>${escapeHtml(h)}</h3><p style="white-space:pre-line;line-height:1.8">${escapeHtml(t)}</p>`).join('');
   const body=`<div style="font-family:sans-serif;max-width:640px;margin:auto"><h1>☯️ ${escapeHtml(report.symbol)} ${escapeHtml(report.name)}（${escapeHtml(report.full_name)}）</h1><h2>${escapeHtml(report.theme)}</h2>${sections}<hr><p>幸福力學院｜覺察・轉念・行動</p><p>卦象為生活反思參考，並非對未來的確定預言。</p></div>`;
   try{const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[email],subject:`☯️ 你的今日易經深度解讀｜${report.name}（${report.full_name}）`,html:body})});const result=await res.json();sent=res.ok&&Boolean(result.id);providerId=sent?result.id:null;if(!sent)console.error('Resend delivery rejected',res.status,result.message||result.name||'unknown');}catch(e){console.error('Resend request failed',String(e))}
  }
  await env.DB.prepare('INSERT INTO email_deliveries (draw_id,status,provider_id) VALUES (?,?,?)').bind(draw.meta.last_row_id,sent?'accepted':'not_sent',providerId).run();
  if(consent&&env.MAILERLITE_API_KEY&&env.MAILERLITE_GROUP_ID){
   try{const res=await fetch('https://connect.mailerlite.com/api/subscribers',{method:'POST',headers:{Authorization:`Bearer ${env.MAILERLITE_API_KEY}`,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({email,fields:{name,source:'iching_oracle',last_hexagram:report.full_name},groups:[env.MAILERLITE_GROUP_ID]})});if(!res.ok)console.error('MailerLite subscribe rejected',res.status)}catch(e){console.error('MailerLite request failed',String(e))}
  }
  return json({ok:true,email_sent:sent,report:{number:report.number,name:report.name,symbol:report.symbol,full_name:report.full_name,theme:report.theme,sections:report.sections}});
 }catch(e){console.error('Claim storage failed',String(e));return json({error:'資料儲存失敗，請稍後重試'},500)}
}

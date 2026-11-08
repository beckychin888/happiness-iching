const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function onRequestPost({request,env}){
 if(!env.DB)return json({error:'尚未綁定 Cloudflare D1 資料庫。'},503);
 let input;try{input=await request.json()}catch{return json({error:'請提供正確的資料格式'},400)}
 const email=String(input.email||'').trim().toLowerCase(),name=String(input.name||'').trim();
 const number=Number(input.number),consent=input.marketing_consent===true;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||name.length>80||!Number.isInteger(number)||number<1||number>64)return json({error:'Email 或卦象資料不正確'},400);
 // Production requirement: enable Turnstile and verify token server-side before accepting public submissions.
 const url=new URL('/hexagrams.json',request.url);let cards;
 try{const r=await env.ASSETS.fetch(new Request(url));cards=await r.json()}catch{return json({error:'卦象資料暫時無法讀取'},503)}
 const card=cards.find(c=>c.number===number);if(!card)return json({error:'卦象不存在'},400);
 try{
 await env.DB.prepare('INSERT INTO visitors (email,name) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET name=CASE WHEN excluded.name <> \'\' THEN excluded.name ELSE visitors.name END').bind(email,name).run();
 const visitor=await env.DB.prepare('SELECT id FROM visitors WHERE email=?').bind(email).first();
 const draw=await env.DB.prepare('INSERT INTO draws (visitor_id,hexagram_number) VALUES (?,?)').bind(visitor.id,number).run();
 await env.DB.prepare('INSERT INTO consents (visitor_id,marketing_consent,policy_version) VALUES (?,?,?)').bind(visitor.id,consent?1:0,'draft-v1').run();
 let sent=false,providerId=null;
 if(env.RESEND_API_KEY&&env.EMAIL_FROM){
 const body=`<div style="font-family:sans-serif;max-width:600px;margin:auto"><h1>☯️ ${escapeHtml(card.symbol)} ${escapeHtml(card.name)}（${escapeHtml(card.full_name)}）</h1><h2>${escapeHtml(card.theme)}</h2>${[['卦象解析',card.analysis],['宇宙提醒',card.reminder],['今日覺察提問',card.question],['今日行動建議',card.action]].map(([h,t])=>`<h3>${escapeHtml(h)}</h3><p>${escapeHtml(t)}</p>`).join('')}<hr><p>幸福力學院｜覺察・轉念・行動</p></div>`;
 try{const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[email],subject:`☯️ 你的今日易經指引｜${card.name}（${card.full_name}）`,html:body})});const data=await res.json();sent=res.ok;providerId=data.id||null}catch{}
 }
 await env.DB.prepare('INSERT INTO email_deliveries (draw_id,status,provider_id) VALUES (?,?,?)').bind(draw.meta.last_row_id,sent?'accepted':'not_sent',providerId).run();
 if(consent&&env.MAILERLITE_API_KEY&&env.MAILERLITE_GROUP_ID){
 try{await fetch('https://connect.mailerlite.com/api/subscribers',{method:'POST',headers:{Authorization:`Bearer ${env.MAILERLITE_API_KEY}`,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({email,fields:{name,source:'iching_oracle',last_hexagram:card.full_name},groups:[env.MAILERLITE_GROUP_ID]})})}catch{}
 }
 return json({ok:true,email_sent:sent});
 }catch{return json({error:'資料儲存失敗，請稍後重試'},500)}
}

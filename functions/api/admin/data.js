const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const decode=s=>{const b=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(b+'='.repeat((4-b.length%4)%4)),c=>c.charCodeAt(0))};
async function authorized(request,env){
 const domain=String(env.ACCESS_TEAM_DOMAIN||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
 const aud=String(env.ACCESS_AUD||'');
 if(!domain||!aud)return false;
 const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token)return false;
 const parts=token.split('.');if(parts.length!==3)return false;
 let header,payload;try{header=JSON.parse(new TextDecoder().decode(decode(parts[0])));payload=JSON.parse(new TextDecoder().decode(decode(parts[1])))}catch{return false}
 if(header.alg!=='RS256'||!header.kid||payload.iss!==`https://${domain}`||!(Array.isArray(payload.aud)?payload.aud.includes(aud):payload.aud===aud)||!Number.isFinite(payload.exp)||payload.exp<=Date.now()/1000||!Number.isFinite(payload.nbf)&&payload.nbf!==undefined||payload.nbf>Date.now()/1000)return false;
 try{const res=await fetch(`https://${domain}/cdn-cgi/access/certs`);if(!res.ok)return false;const keys=await res.json();const jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return false;const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));}catch{return false}
}
const consentExpr=`COALESCE((SELECT c.marketing_consent FROM consents c WHERE c.visitor_id=v.id ORDER BY c.created_at DESC,c.id DESC LIMIT 1),0)`;
export async function onRequestGet({request,env}){
 if(!await authorized(request,env))return json({error:'未授權。請確認 Cloudflare Access 設定及登入狀態。'},401);
 if(!env.DB)return json({error:'D1 DB 未綁定'},503);
 const url=new URL(request.url);const exportMode=url.searchParams.get('export');
 try{
 const totals=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM visitors) AS emails,(SELECT COUNT(*) FROM visitors v WHERE ${consentExpr}=1) AS subscribed,(SELECT COUNT(*) FROM draws) AS draws,(SELECT COUNT(*) FROM visitors WHERE date(created_at)=date('now')) AS today`).first();
 const daily=(await env.DB.prepare("SELECT date(created_at) AS day,COUNT(*) AS count FROM visitors GROUP BY date(created_at) ORDER BY day DESC LIMIT 30").all()).results;
 const rows=(await env.DB.prepare(`SELECT v.id,v.name,v.email,v.created_at,${consentExpr} AS marketing_consent,(SELECT COUNT(*) FROM draws d WHERE d.visitor_id=v.id) AS draw_count,(SELECT d.hexagram_number FROM draws d WHERE d.visitor_id=v.id ORDER BY d.created_at DESC,d.id DESC LIMIT 1) AS latest_hexagram,(SELECT d.created_at FROM draws d WHERE d.visitor_id=v.id ORDER BY d.created_at DESC,d.id DESC LIMIT 1) AS latest_draw_at FROM visitors v ORDER BY v.created_at DESC,v.id DESC LIMIT 5000`).all()).results;
 if(exportMode==='all'||exportMode==='subscribed'){
  const filtered=exportMode==='subscribed'?rows.filter(r=>r.marketing_consent===1):rows;
  const csvCell=v=>{let s=String(v??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
  const headers=['name','email','marketing_consent','created_at','draw_count','latest_hexagram','latest_draw_at'];
  const csv='\ufeff'+[headers.join(','),...filtered.map(r=>headers.map(k=>csvCell(r[k])).join(','))].join('\r\n');
  return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="iching-${exportMode}.csv"`,'cache-control':'no-store','x-content-type-options':'nosniff'}});
 }
 return json({totals,daily,visitors:rows,limit:5000});
 }catch(e){console.error('Admin D1 query error',String(e));return json({error:'資料查詢失敗，請檢查 D1 資料表結構。'},500)}
}

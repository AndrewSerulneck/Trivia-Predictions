// Phase 3a: Clover v2 OAuth probe. Run: node --env-file=.env.local clover-spike/oauth-probe.cjs <tokenOutFile>
// then open http://localhost:8787/callback. Needs the sandbox app Site URL = http://localhost:8787/callback
// and Alternate Launch Path = /callback. Prints statuses only; writes the access token (mode 600) to <tokenOutFile>.
// Delete the token file afterwards. Proves billing_info accepts OUR app token (200) and rejects others.
const http=require("http"),fs=require("fs");
const A=process.env.CLOVER_SANDBOX_APP_ID,SEC=process.env.CLOVER_SANDBOX_APP_SECRET,B="https://apisandbox.dev.clover.com";
const OUT=process.argv[2];
const AUTH=`https://sandbox.dev.clover.com/oauth/v2/authorize?client_id=${A}&redirect_uri=${encodeURIComponent("http://localhost:8787/callback")}`;
http.createServer(async(req,res)=>{
 const u=new URL(req.url,"http://localhost:8787");
 if(!u.searchParams.get("code")){console.log("no code; params:",[...u.searchParams.keys()].join(","));res.writeHead(302,{Location:AUTH});res.end();return;}
 const m=u.searchParams.get("merchant_id");
 const r=await fetch(`${B}/oauth/v2/token`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_id:A,client_secret:SEC,code:u.searchParams.get("code")})});
 const j=await r.json().catch(()=>({}));
 console.log("token exchange",r.status,"keys:",Object.keys(j).join(","),"access_token_expiration:",j.access_token_expiration);
 if(j.access_token){fs.writeFileSync(OUT,j.access_token,{mode:0o600});
  for(const[l,p]of[["merchant",`/v3/merchants/${m}`],["billing_info our app",`/v3/apps/${A}/merchants/${m}/billing_info`],["billing_info wrong app",`/v3/apps/AAAAAAAAAAAAA/merchants/${m}/billing_info`],["billing_info wrong merchant",`/v3/apps/${A}/merchants/AAAAAAAAAAAAA/billing_info`]]){
   const x=await fetch(B+p,{headers:{Authorization:`Bearer ${j.access_token}`}});console.log(l,x.status,(await x.text()).slice(0,140).replace(/[A-Z0-9]{13}/g,"<ID>"));}}
 res.end("Done - you can close this tab and go back to Claude.");
}).listen(8787,()=>console.log("listening"));

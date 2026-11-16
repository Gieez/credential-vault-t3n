import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
async function main(){
 const [base='http://127.0.0.1:3191',other=base]=process.argv.slice(2);
 const env=Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
 const login=await fetch(base+'/api/auth/key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({privateKey:env.T3N_API_KEY})});
 const json=await login.json();assert.equal(login.status,200,JSON.stringify(json));
 const setCookie=login.headers.get('set-cookie')!;assert(setCookie.includes('HttpOnly'));assert(setCookie.includes('SameSite=strict'));assert(setCookie.includes('Max-Age=1800'));
 const cookie=setCookie.split(';')[0];assert.match(cookie,/^vg_session=[0-9a-f]{64}$/);assert(!cookie.includes(env.T3N_API_KEY));
 console.log('PASS login with opaque 30-minute HttpOnly cookie');
 const me=await fetch(other+'/api/auth/me',{headers:{Cookie:cookie}});const user=await me.json();assert.equal(user.authenticated,true,JSON.stringify(user));assert.equal(user.user.did,json.did);console.log('PASS session restored on independent instance');
 const vault=await fetch(other+'/api/vault',{headers:{Cookie:cookie}});const aliases=await vault.json();assert.equal(vault.status,200,JSON.stringify(aliases));console.log('PASS authenticated vault read');
 const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{Cookie:cookie}});assert.equal(logout.status,200,await logout.text());assert(logout.headers.get('set-cookie')?.includes('Max-Age=0'));console.log('PASS logout confirmed in registry and cookie cleared');
 // Intentionally replay the saved cookie on both instances, including a previously warm cache.
 for(const host of new Set([base,other])){
 const replay=await fetch(host+'/api/auth/me',{headers:{Cookie:cookie}});assert.equal((await replay.json()).authenticated,false);
 const blocked=await fetch(host+'/api/vault',{headers:{Cookie:cookie}});assert.equal(blocked.status,401);}
 console.log('PASS copied cookie rejected after logout on both instances');
 const legacy=await fetch(other+'/api/auth/me',{headers:{Cookie:'vg_session=legacy.encrypted.cookie'}});assert.equal((await legacy.json()).authenticated,false);console.log('PASS legacy cookie rejected');
}
main().catch(e=>{console.error('SESSION TEST FAILED:',e.message);process.exitCode=1;});

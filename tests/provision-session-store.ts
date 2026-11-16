import {readFileSync} from 'node:fs';
import {T3nClient,TenantClient,setEnvironment,loadWasmComponent,resolveTrustAnchor,eth_get_address,metamask_sign,createEthAuthInput,getNodeUrl} from '@terminal3/t3n-sdk';
async function main(){
 for(const line of readFileSync('.env','utf8').split('\n')){const i=line.indexOf('=');if(i>0&&!line.startsWith('#'))process.env[line.slice(0,i).trim()]=line.slice(i+1).trim();}
 setEnvironment('testnet'); const key=process.env.T3N_API_KEY!; const address=eth_get_address(key);
 const client=new T3nClient({trustAnchor:await resolveTrustAnchor('testnet'),wasmComponent:await loadWasmComponent(),handlers:{EthSign:metamask_sign(address,undefined,key)}});
 await client.handshake();const did=await client.authenticate(createEthAuthInput(address));
 const tenant=new TenantClient({t3n:client,baseUrl:getNodeUrl(),tenantDid:did.value});
 try{await tenant.maps.create({tail:'web-sessions',visibility:'private',readers:{only:[]},writers:{only:[]}});console.log('private session map created');}catch(e){if(!/already exists/i.test(String(e)))throw e; console.log('session map already exists');}
 const id='probe-'+Date.now();await tenant.maps.entrySet('web-sessions',id,JSON.stringify({state:'active',expiresAt:Date.now()+60000}));
 const active=JSON.parse((await tenant.maps.entryGet('web-sessions',id))!);if(active.state!=='active')throw Error('read mismatch');console.log('owner-private read/write verified');
 await tenant.maps.entrySet('web-sessions',id,JSON.stringify({state:'revoked',expiresAt:Date.now()+60000}));
 const revoked=JSON.parse((await tenant.maps.entryGet('web-sessions',id))!);if(revoked.state!=='revoked')throw Error('revoke mismatch');console.log('persistent revoke readback verified');
}
main().catch(e=>{console.error('probe failed:',e.message);process.exitCode=1;});

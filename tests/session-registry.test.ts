import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionRegistry, SESSION_TTL_MS, type SessionStorage } from '../frontend/src/lib/session-registry';
const did='did:t3n:'+'1'.repeat(40), privateKey='0x'+'a'.repeat(64), secret='local-test-only-'.repeat(4);
function fixture(){const rows=new Map<string,string>();const storage:SessionStorage={get:async k=>rows.get(k)??null,set:async(k,v)=>{rows.set(k,v);}};return {rows,storage};}
test('replayed cookie rejected by another instance after logout',async()=>{
 const {storage,rows}=fixture();const a=createSessionRegistry(storage,secret),b=createSessionRegistry(storage,secret);
 const {id}=await a.issue(did,privateKey); assert.match(id,/^[0-9a-f]{64}$/);assert.equal((await b.read(id))?.did,did);
 assert(!id.includes(privateKey));assert(!Array.from(rows.values()).join().includes(privateKey));
 await a.revoke(id);assert.equal(await a.read(id),null);assert.equal(await b.read(id),null);
 assert(!Array.from(rows.values()).join().includes('sealed'));
});
test('expiry applies across warm and cold instances',async()=>{
 const {storage}=fixture();let time=1000;const a=createSessionRegistry(storage,secret,()=>time);const {id}=await a.issue(did,privateKey);
 time+=SESSION_TTL_MS;assert.equal(await a.read(id),null);assert.equal(await createSessionRegistry(storage,secret,()=>time).read(id),null);
});
test('missing configuration, tampering, wrong secret and legacy cookies rejected',async()=>{
 const {storage,rows}=fixture();assert.throws(()=>createSessionRegistry(storage,''));
 const a=createSessionRegistry(storage,secret);const {id}=await a.issue(did,privateKey);
 assert.equal(await createSessionRegistry(storage,'other-secret-'.repeat(4)).read(id),null);
 assert.equal(await a.read('old.encrypted.cookie'),null);
 const [k,v]=Array.from(rows.entries())[0];const row=JSON.parse(v);const parts=row.sealed.split('.');parts[1]=Buffer.alloc(16).toString('base64url');row.sealed=parts.join('.');rows.set(k,JSON.stringify(row));
 assert.equal(await a.read(id),null);
});
test('store failure never authenticates and failed revoke is surfaced',async()=>{
 const registry=createSessionRegistry({get:async()=>{throw Error('offline');},set:async()=>{throw Error('offline');}},secret);
 await assert.rejects(registry.issue(did,privateKey),/offline/);await assert.rejects(registry.read('a'.repeat(64)),/offline/);await assert.rejects(registry.revoke('a'.repeat(64)),/offline/);
});

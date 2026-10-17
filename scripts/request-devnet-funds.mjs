// One request only; no retry loop or circumvention of faucet limits.
import {readFile,writeFile} from 'node:fs/promises';
const addresses=JSON.parse(await readFile('docs/demo-addresses.json','utf8'));
const address=addresses.a.solana.address;
const endpoint='https://api.devnet.solana.com';
async function rpc(method,params=[]){const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});return {http:response.status,body:await response.json()};}
const identity=await rpc('getGenesisHash');
if(identity.body.result!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw new Error('Not Devnet');
const current=await rpc('getBalance',[address]);
const record={checkedAt:new Date().toISOString(),network:'Solana Devnet',address,balanceLamports:current.body.result?.value??null,funding:'not-requested',transactions:[]};
if((record.balanceLamports??0)<10000000){const response=await rpc('requestAirdrop',[address,10000000]);record.funding=response.body.result?'submitted':`unavailable (HTTP ${response.http}, RPC ${response.body.error?.code??'unknown'})`;if(response.body.result)record.fundingSignature=response.body.result;}
else record.funding='already-funded';
await writeFile('docs/live-validation.json',JSON.stringify(record,null,2));
console.log(`Solana Devnet funding: ${record.funding}. No transfer claimed; see docs/live-validation.json.`);

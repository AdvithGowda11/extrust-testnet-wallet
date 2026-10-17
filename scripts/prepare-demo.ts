// Creates two NEW test-only vaults. Never reads an existing browser wallet.
import { mkdir,writeFile,readFile,access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { WalletService } from '../services/walletService';
import { BackupService } from '../services/backupService';
import { CHAINS,NETWORKS } from '../config/networks';
async function main(){
const directory='.demo-secrets';
await mkdir(directory,{recursive:true,mode:0o700});
try{await access(`${directory}/wallet-a.json`);console.log('Demo vaults already exist; preserving them.');process.exit(0);}catch{}
const password=randomBytes(24).toString('base64url');
// Separate file; never emitted to terminal, logs, source, or evidence.
await writeFile(`${directory}/passphrase.txt`,password,{mode:0o600,flag:'wx'});
const publicAddresses:Record<string,unknown>={};
for(const name of ['a','b']){
 const wallet=WalletService.createMultiChainWallet();
 const encrypted=await BackupService.encrypt(wallet,password);
 await writeFile(`${directory}/wallet-${name}.json`,JSON.stringify(encrypted,null,2),{mode:0o600,flag:'wx'});
 WalletService.validateWallet(await BackupService.decrypt(JSON.parse(await readFile(`${directory}/wallet-${name}.json`,'utf8')),password));
 publicAddresses[name]=Object.fromEntries(CHAINS.map(n=>[n,{network:NETWORKS[n].name,address:wallet.accounts[n]!.address,faucet:NETWORKS[n].faucet}]));
}
await writeFile('docs/demo-addresses.json',JSON.stringify(publicAddresses,null,2));
console.log('Created and verified two encrypted test-only vaults. Public addresses: docs/demo-addresses.json. Passphrase remains in .demo-secrets/passphrase.txt.');

}
main().catch(()=>{console.error("Demo setup failed; existing files were preserved.");process.exitCode=1;});

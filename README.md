# EXTrust test-network wallet

A Next.js/React educational wallet for live, signed native-coin transfers on six public test networks. Test coins have no monetary value. No AI service is integrated. This is not a production custody product.

| Network | Asset | Identity |
| --- | --- | --- |
| Ethereum Sepolia | test ETH | 11155111 |
| Polygon Amoy | test POL | 80002 |
| BNB Testnet | test BNB | 97 |
| Base Sepolia | test ETH | 84532 |
| Solana Devnet | test SOL | verified Devnet genesis |
| Bitcoin Signet | test BTC | verified Signet genesis |

## Run

Use Node.js 22 or newer and npm. Install with `npm ci`, then `npm run dev`; open `http://localhost:3000`. For production, run `npm run build` and `npm start`. The default server listens only on loopback.

`.env.example` lists optional configuration. Public RPC defaults work without paid keys, subject to their availability. Only `TEST_RPC_*` overrides are used; old mainnet RPC variables are deliberately ignored. No service-role key is required. Never expose secrets through `NEXT_PUBLIC_*` variables.

Each computer may run its own copy at localhost. Alternatively both computers can open the same HTTPS deployment. Plain HTTP on a LAN address does not provide the secure browser context required for encryption and Web Locks. A local HTTP server on the second computer's localhost works without buying hosting.

## Two-computer demonstration

1. Create a different wallet on each computer. Save each encrypted backup and its passphrase separately. Do not share recovery phrases or private keys.
2. Select the same test network on both computers. Computer B opens **Receive / fund** and shares only its public address.
3. Use the linked faucet to obtain free test coins on A. Faucet accounts, CAPTCHA, quotas and availability vary. The application cannot mint native public-network coins. Funding on one network does not fund another, including the two ETH networks.
4. A sends a small amount to B, reviews the network, recipient, amount and estimated fee, then confirms. Keep enough test coins for fees on the return transfer. For SOL, the first payment must meet the receiving account's rent requirement. For Bitcoin, wait for confirmed spendable funding and allow for its dust and fee rules.
5. Keep B's wallet visible. Balances and activity refresh approximately every five seconds, with backoff on errors. Confirm the transaction in the linked explorer. A submitted transaction is not a confirmed one.
6. B sends a small amount back to A. Repeat for all six networks: twelve transfers total. Export transaction evidence from both computers and record network, hash, sender, recipient, amount, fee and observed status.

`scripts/prepare-demo.ts` can prepare two separate encrypted demonstration wallets: `node --import tsx scripts/prepare-demo.ts`. Public addresses are saved in `docs/demo-addresses.json`; encrypted wallets and their passphrase are saved under ignored `.demo-secrets/`. Never publish that directory. The existing public validation record is `docs/live-validation.json`. It currently records failed Solana faucet funding, **not successful public transfers**.

## Security and recovery

Keys are derived and signatures created in the browser using established libraries. Full wallet data, including imported accounts, is encrypted using Web Crypto AES-GCM with PBKDF2 before storage. Unlock is required after reload; idle wallets lock after five minutes. Encryption does not protect an unlocked wallet from a compromised device, malicious browser extension or application code.

Legacy plaintext storage is preserved byte-for-byte in a separate encrypted archive before removal. It is not silently converted into new test accounts. A mnemonic-only backup cannot recover unrelated imported private keys. Keep original legacy exports; do not assume the new Solana/Bitcoin derivation reproduces the old application's addresses.

The transaction journal stores public signed transactions before broadcast. If a response is lost, use **Rebroadcast same signed transaction** after checking status. This resends the same transaction rather than signing a duplicate. An unresolved outgoing transaction blocks a new send from that account. Browser storage must be available and have sufficient space.

Optional Supabase backups require the URL, a publishable or legacy anonymous key, and application of `supabase/migrations/001_wallet_backups.sql`. The migration replaces policies only on the dedicated backup table and enforces ownership. It is deployed on the connected project, where rollback-only two-user SQL tests verified own-row CRUD, cross-user isolation, format validation and anonymous denial. Rehearse the final email sign-up and confirmation flow before a presentation because delivery depends on the project's Auth configuration. Existing v1 cloud backups are rejected for direct restore to avoid silently changing their account derivation; retain the original database rows and legacy recovery software.

## Verification

- `npm run check`: TypeScript, ESLint and unit tests.
- `npm run build`: production bundle.
- `npx playwright install chromium`, then `npm run test:browser`: browser tests. Transfer tests use real signing with **simulated network responses** and independent browser contexts. They are not proof of public-network settlement or two physical computers.
- `npm run test:networks`: read-only identity checks of all six public networks.
- `npm audit`: known dependency advisories at the time of the check.

See `docs/LIMITATIONS.md` for implementation boundaries and remaining acceptance work. Original tutorial provenance: [The Blockchain Coders](https://www.theblockchaincoders.com/).

## Typography

The interface uses Athelas for reading text and Vanguard CF Heavy Oblique for display headings when those fonts are installed and licensed on the device. The app bundles the open-license Literata and Barlow Condensed fallbacks so the same pairing works on other computers without paid font files or a third-party font service. No Athelas or Vanguard binaries are redistributed in this repository. Publishing the exact commercial fonts as webfonts requires the appropriate licenses from [TypeTogether](https://www.typetogether.com/licences) and [Connary Fagen](https://connary.com/fonts/vanguard/).

## GitHub

Repository: https://github.com/AdvithGowda11/extrust-testnet-wallet (private). The included GitHub Actions workflow runs install, static checks, unit tests, production build and simulated browser tests on pushes and pull requests without wallet secrets or faucet access.

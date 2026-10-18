# Online demonstration

**Live website:** https://extrust-testnet-wallet.vercel.app

The production site, public Supabase client configuration, confirmation redirects,
and 600-requests-per-minute-per-IP API firewall rule are configured. The setup
section below documents those settings for future maintenance; users can start
with **Move the existing wallets to the hosted site**.

Use one stable HTTPS production URL on both computers. Windows needs a current
Chrome or Edge browser and internet access; it does not need Git, Node, or a copy
of the source. The application signs locally in each browser and sends transactions
to public test networks. Supabase is optional encrypted-backup storage, not a ledger
or a source of coins.

## Hosting configuration

1. Import `AdvithGowda11/extrust-testnet-wallet` into Vercel using the free Hobby
   workspace. Keep the repository private and select `main` as production branch.
2. Select Next.js, Node 24, repository root, `npm ci`, and `npm run build`.
   `vercel.json` preserves the webpack build needed by the signing dependencies.
   Do not use static export: the wallet requires its API routes.
   GitHub CI also checks Node 22. The Bitcoin WASM dependency must remain external
   on the server and included in the function trace; `npm run test:build` verifies
   that it loads after relocation from the build directory.
3. Add the existing `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` as production environment variables before
   building. These are public client configuration; never put a service-role key,
   recovery words, private keys, or wallet passwords in Vercel variables.
   RPC overrides and `ETHERSCAN_API_KEY` are optional server-only variables.
4. Keep preview protection enabled and allow public access to the production
   domain. Do not enable a paid plan, paid build machine, or purchased domain.
5. In Firewall, add one active rule: path starts with `/api/`, rate limit by IP,
   fixed 60-second window, 600 requests, deny excess requests. This is a shared
   edge limit; the application's in-process limiter alone is insufficient across
   serverless instances. Verify the Hobby quota in the current dashboard.
6. In Supabase **Authentication → URL Configuration**, set Site URL to the exact
   production origin. Add the production `/?screen=wallet-setup` and
   `/?screen=cloud-backup` URLs to allowed redirects. Preserve required local
   development entries. Do not allow arbitrary preview domains for production
   accounts. Email confirmation must return to the same site used to sign up.
7. Check the production page without a Vercel login. In an isolated test browser,
   create a disposable wallet, lock, unlock, reload, open Receive and the six-network
   funding screen. Confirm that real balance reads work and unsupported network
   requests fail. Repeat cloud sign-in, encrypted upload and restore using a test
   account before presenting cloud backup.

## Move the existing wallets to the hosted site

The hosted domain and `127.0.0.1` have separate browser storage. A blank hosted
wallet does not mean the local wallet was deleted.

1. On the Mac's existing local site, unlock with its **local vault passphrase**.
   Export the encrypted wallet from the menu and keep its backup passphrase.
2. On the hosted site, choose Restore encrypted file or cloud backup. Select the
   export, enter its backup passphrase, then choose and repeat a local vault
   passphrase for the hosted browser. Alternatively, import the existing 12-word
   phrase. A phrase restores derived accounts only; encrypted exports also preserve
   separately imported keys.
3. On Windows, open the same production URL. Import the **other** wallet's 12 words
   or encrypted backup and choose a local vault passphrase. Do not import the same
   wallet onto both machines for this two-wallet demonstration.
4. Check each network's public address against its original wallet. Keep each
   recovery phrase and password private; none is needed to receive funds.
5. Lock and unlock both wallets once before adding funds. Save offline encrypted
   backups. Do not clear browser storage while relying on an unexported wallet.

## Obtain free test coins

1. On each wallet, open **Menu → Get free test coins** (also available through
   **Receive / fund → Fund all six networks**).
2. For each card, copy the receiving address and open its faucet. Choose the exact
   network and its native coin:

   | Network          | Native coin |
   | ---------------- | ----------- |
   | Ethereum Sepolia | ETH         |
   | Polygon Amoy     | POL         |
   | BNB Testnet      | BNB         |
   | Base Sepolia     | ETH         |
   | Solana Devnet    | SOL         |
   | Bitcoin Signet   | BTC         |

3. Complete any faucet login or CAPTCHA yourself. If a link does not open in
   the app browser, use **Copy faucet link** and paste it into your regular
   browser. Each funding card also has **Faucet not working? Other options**.
   These services may be empty, delayed, or rate limited. Do not buy coins for
   this demo. In particular, BNB Chain's own faucet may demand 0.002 real BNB
   on BSC Mainnet; skip that route and use the linked QuickNode BNB Testnet
   faucet, which advertises a free basic claim without a mainnet balance.
4. Return and click **Check balances**. A confirmed positive balance displays
   **Funds detected**. **Balance unavailable** is a failed read, not a zero balance.
   Bitcoin's pending net change is separate; wait for incoming outputs to confirm.
5. Fund both wallets ahead of presentation day. A positive balance is not a promise
   that every amount can be sent; Send verifies the amount and current network fee.

## Perform and record the live demonstration

1. Open the same network on both computers. Copy Windows' address from Receive.
2. On Mac, choose Send, paste the Windows address and enter a small amount below
   the available balance. Review the network, recipient, amount and fee, then send.
3. Keep both browser tabs visible. Wait for the recipient's balance and history to
   update. Open the transaction in the explorer and verify the recipient, amount,
   network and confirmation status. Record the transaction hash and explorer URL.
4. Send a small amount back from Windows to the Mac's address on that same network.
   Leave enough native coins for fees. Bitcoin incoming outputs must confirm first.
5. Repeat on all six networks: twelve explorer-confirmed transactions in total.
   The computer receives no direct peer connection: each browser observes the same
   public blockchain ledger.
6. If the response is lost or a transfer is marked unknown, inspect its saved hash
   and reconcile before trying again. Never start a new transfer merely because a
   timeout appeared; the original may already have been broadcast.

## Evidence and remaining acceptance

Automated tests with mocked RPC responses check signing and UI behavior. They do
not prove faucet funding or real settlement. `docs/demo-addresses.json` and
`docs/live-validation.json` are historical test artifacts; do not fund those old
addresses without checking the current wallet. The funding screen exports only the
current public receiving addresses for convenient exchange between computers.

Deployment and read-only hosted network checks passed on 2026-10-18. Account access,
faucet acceptance and all twelve public transfers still need their own evidence.
Free hosting and public RPC availability cannot be guaranteed.

References: [Vercel Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs),
[Vercel rate limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting),
[Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls).

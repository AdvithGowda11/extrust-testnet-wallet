# Verification record — 2026-10-17

## Automated checks

- `npm run check`: TypeScript and ESLint passed; 26 unit tests passed.
- `npm run build`: optimized Next.js production build passed.
- `npm audit --omit=dev`: zero known production dependency vulnerabilities at check time.
- `npm run test:networks`: all six public endpoint identities passed (Ethereum Sepolia, Polygon Amoy, BNB Testnet, Base Sepolia, Solana Devnet, Bitcoin Signet).
- Chromium browser tests: all 11 tests passed against the final production build (1.2 minutes), including both transfer directions on all six networks and locked-vault restoration and ERC-20 history persistence regression coverage.

Unit coverage includes ERC-20 exact amounts, direction, deduplication, bounded RPC pagination and local-to-chain merging; precise amount parsing; wallet derivation and provenance; imported-key recovery; encrypted vault authentication and tampering; legacy byte preservation; invalid RPC rejection; Bitcoin PSBT signing, fees, change, dust and forged inputs; multi-instruction Solana history; finalized-state preservation; storage quota failure; uncertain broadcast and identical-byte retry; finalized-height expiry.

Browser transfer checks create independent wallets in separate browser contexts and use the actual application signing paths. Network responses and ledger settlement are simulated. These tests cover twelve transfers, not twelve public settlements. The rendered Bitcoin activity screen and receive screen were visually inspected for layout and readable amounts/addresses.

## Public-network evidence

Read-only network identity checks succeeded. The Solana funding attempt returned RPC error -32603 and the observed wallet balance was zero. The machine-readable record is `docs/live-validation.json`; it contains no successful public transfers. No claim is made that faucet funding, six-network public settlement, or two-physical-computer operation has passed.

## Not verified here

Presentation-day email sign-up/confirmation and cloud upload/restore with the final accounts; other browser engines/mobile devices; physical second-computer networking; sustained load or hostile-provider testing; independent cryptographic/security audit; twelve explorer-confirmed public transactions. See `docs/LIMITATIONS.md` and the unchecked stages in `WORK_PLAN.md`.

## Connected services follow-up

The configured Supabase project `crypto-wallet-jnnce` is active and healthy. Migration `upgrade_wallet_backups_v2` (`20261017100422`) added the required format version, forced RLS, removed anonymous access and installed the authenticated ownership policy. The rollback-only assertions in `supabase/tests/wallet_backups.sql` passed against the deployed database for own-row CRUD, cross-user isolation, format validation and anonymous denial; the transaction left zero backup rows and no test users. Post-deployment inspection confirmed `format_version` is required with default `2`, RLS is enabled and forced, anonymous SELECT is denied and authenticated SELECT remains policy-controlled. Live financial/test-network transfers remain deferred at the user’s request.

A clean publication checkout with no `.env` passed `npm ci --ignore-scripts`, type checking, lint, all 26 unit tests, production build and all 11 Chromium browser tests. The install audit reported zero known vulnerabilities across production and development dependencies.

The first GitHub Actions run exposed an optional `utf-8-validate` peer omitted by npm 11 but required by npm 10. Commit `07151e2` adds the registry-generated lock entry; an isolated npm 10 clean install and audit passed. The workflow now uses the Node 24-based v7 checkout and setup-node actions. Supabase security advisors reported only informational no-policy notices on the two unused legacy cache tables; these remain deny-by-default and are not used by this wallet.

After the Supabase deployment, the full local verification was repeated: TypeScript, ESLint and all 26 unit tests passed; the production build completed; all 11 Chromium browser tests passed; all six public test-network identities were verified; and `npm audit --omit=dev` reported zero vulnerabilities.

## GitHub Linux result

[Wallet checks run 39023976478](https://github.com/AdvithGowda11/extrust-testnet-wallet/actions/runs/39023976478) completed successfully for final code commit `bac8ddb172eaacf0ec0fd4130f1365c7b2c18306`: the v7 checkout and setup-node actions, clean npm install, TypeScript, ESLint, 26 unit tests, production build and 11 browser tests all passed in 3 minutes 19 seconds. GitHub reported only its platform notice that the `ubuntu-latest` label will move to Ubuntu 26.

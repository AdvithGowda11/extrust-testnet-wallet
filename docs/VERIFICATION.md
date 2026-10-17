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

Authenticated Supabase backup CRUD and two-user RLS isolation after deployment; other browser engines/mobile devices; physical second-computer networking; sustained load or hostile-provider testing; independent cryptographic/security audit; twelve explorer-confirmed public transactions. See `docs/LIMITATIONS.md` and the unchecked stages in `WORK_PLAN.md`.

## Connected services follow-up

The configured Supabase project `crypto-wallet-jnnce` was restored from pause. Its public schema was empty. The migration attempt was not executed because automatic approval review hit an account usage limit. `supabase/tests/wallet_backups.sql` is ready for rollback-only ownership checks once the migration can run. Live financial/test-network transfers remain deferred at the user’s request.

A clean publication checkout with no `.env` passed `npm ci --ignore-scripts`, type checking, lint, all 26 unit tests, production build and all 11 Chromium browser tests. The install audit reported zero known vulnerabilities across production and development dependencies.

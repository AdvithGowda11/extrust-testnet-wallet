# Scope, limitations and remaining acceptance work

No finite test suite establishes that nothing can fail. The following boundaries must remain explicit in the project demonstration.

## Implemented protections

- Test-network registry, verified EVM chain IDs and Solana/Bitcoin genesis identities; no mainnet sending mode.
- RPC method allowlists, bounded batches and upstream responses, request throttling, timeouts and sanitized errors.
- Browser-side signing using ethers, Solana web3 and bitcoinjs; no private keys sent to RPC servers.
- Encrypted versioned wallet vault; complete imported-account backup, passphrase checks and authenticated decryption.
- Standard mnemonic derivation, recorded provenance and validation of keys against addresses.
- Exact decimal parsing; fee reserves, fresh preparation, review and quote expiration.
- EVM pending nonce handling, gas estimation, Base additional fee reserve and receipt reconciliation.
- Solana blockhash expiry, signature-status reconciliation, fee and new-account funding checks.
- Bitcoin confirmed UTXOs, previous-output verification, PSBT signatures, change, dust and fee limits.
- Durable signed-transaction journal, unresolved-send guard and cross-tab Web Locks.
- Same-transaction rebroadcast, explicit unknown/failed/expired/replaced states.
- Provider failures displayed as unavailable, timestamped balances and visible-tab polling.
- Chain-specific explorers and history parsing, Bitcoin change exclusion, separate Solana instruction records and persisted observed history.
- Legacy-data preservation, confirmation before replacing even a locked vault, optional user-owned cloud records.
- CSP, accessible form labels and error messages; no AI integration.

## Public-network and operational boundaries

1. Faucets may require accounts, CAPTCHA, cooldowns, balances on other chains or may be empty. No bypass is included.
2. Test coins pay network fees but cannot buy real goods; zero-money means no purchase of coins, not absence of electricity, internet or hardware costs.
3. Six networks require independent funding. Bridge support is not included.
4. Public RPC services can throttle, fail, censor or return stale data. Identity checks do not prove that all provider responses are honest.
5. Network congestion changes fees and settlement times. Review estimates can differ from final fees.
6. A transaction may be broadcast successfully when the response is lost. Unknown is deliberately not treated as failed.
7. Confirmations can be reorganized. One observed confirmation is not a guarantee of permanent finality. Older stored records are not continuously audited for deep reorgs.
8. Bitcoin Signet requires confirmations before spending incoming outputs; this can make a return transfer slower than account-based chains.
9. SOL blockhashes expire; an expired transaction needs a newly reviewed send after reconciliation.
10. EVM replacement/cancellation workflows and Bitcoin fee bumping are not implemented. An unresolved transaction can require explorer/operator investigation.
11. Public infrastructure and free hosting do not provide uptime guarantees. Polling is paused in hidden tabs and resumes when visible.
12. Two browser contexts on one machine do not prove two-physical-computer networking. The physical demonstration remains an acceptance step.
13. The attempted Solana faucet request failed; no twelve-transfer public-network acceptance result exists yet.

## History and asset boundaries

14. The core acceptance scope is six native coins. Basic custom ERC-20 balance/send support is available on EVM networks; it is not a complete token portfolio indexer.
15. Tracked ERC-20 incoming/outgoing events are queried in 2,000-block pages and saved locally. Automatic discovery of unknown tokens, SPL tokens, NFTs, staking, swaps, dApps, account abstraction, hardware wallets and multisig are outside the implemented flow.
16. EVM native history uses an optional explorer or bounded block scanning. Internal contract transfers are not a full trace index. Load older pages when needed.
17. Solana history parses native system transfer instructions; it is not a complete account/program balance-change report.
18. Bitcoin collaborative transactions and unusual scripts are not fully modeled as payment histories. Sending uses this wallet's native SegWit accounts only.
19. Persisted observed history improves continuity but is not a full archival ledger. Browser deletion loses it; vault backups preserve keys, not all activity or custom token settings.
20. Price conversion is deliberately absent because test coins have no monetary value.

## Security, recovery and hosting boundaries

21. This code has not received an independent security audit. Do not import keys controlling real funds.
22. Device compromise, malicious extensions, phishing and injected code while unlocked can expose keys. JavaScript cannot guarantee physical memory erasure.
23. Lost encrypted backups and forgotten passphrases cannot be recovered by the app.
24. Browser quota, private mode, site-data deletion and OS failure can prevent persistence. Preserve offline encrypted backups.
25. A legacy mnemonic cannot reconstruct unrelated imported keys or an undocumented old derivation. Legacy archives preserve bytes; direct legacy cloud restore remains unsupported.
26. The configured Supabase project is active and the supplied v2 migration is deployed. Rollback-only two-user SQL tests passed for own-row create/read/update/delete, cross-user isolation, format validation and anonymous denial. Email delivery and confirmation still depend on the project's Auth configuration and the user's reachable email account.
27. The API rate limiter is per process. Public multi-instance deployments need an edge/shared limiter and operational monitoring.
28. HTTPS or localhost, modern Web Crypto, Web Locks and supported browsers are required. Mobile/Safari/Firefox coverage is not established by Chromium tests.
29. Dependency audit results cover known advisories at check time, not future disclosures or a complete code audit.
30. Continuous public RPC monitoring, disaster recovery drills and production custody operations are not provided by this educational application.

## Acceptance gates still open

- Obtain free funding for both directions on every network without purchasing assets.
- Run and record all twelve public transactions on two independent computers, verifying balances and explorer receipts.
- Complete one presentation-day sign-up, email confirmation, upload and restore rehearsal with the final email accounts if cloud backup is shown.
- Resolve the additional asset/history features above if they are required by the project guide; do not present them as implemented.

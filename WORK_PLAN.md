# Six-network test wallet implementation

Only test assets are supported. No AI services or custom cryptography.

- [x] 1. Network isolation, identity verification, protected RPC routes
- [x] 2. Versioned wallet derivation, encrypted vault, legacy preservation
- [x] 3. EVM transaction preparation, review, broadcast and reconciliation
- [x] 4. Solana exact amounts, fee checks, expiry and reconciliation
- [x] 5. Bitcoin Signet UTXO selection, PSBT signing, fees and change
- [x] 6. Live native balances/history and tracked ERC-20 event pagination implemented; general contract traces remain outside the wallet scope
- [x] 7. Local backup restoration and documentation implemented; Supabase project restored; cloud migration applied; rollback-only two-user ownership SQL tests passed
- [x] 8. Automated unit and browser tests, production build, dependency audit (see docs/VERIFICATION.md)
- [ ] 9. Public-network funding and twelve independently verified transfers on two physical computers — now requested; not yet verified
- [x] 10. Public HTTPS deployment at https://extrust-testnet-wallet.vercel.app with shared API rate limiting and production Supabase redirects; hosted onboarding and six-network API checks passed
- [x] 11. Six-network faucet guide, actual balance checks and public-only receiving-address export

External checks retain their actual status. A simulated test is never evidence of a public transfer. See docs/LIMITATIONS.md for detailed boundaries and acceptance gates.
Source snapshot: /private/tmp/trust-wallet-before-testnets.tgz (no environment secrets).

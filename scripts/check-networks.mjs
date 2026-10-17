// Read-only public endpoint checks. No keys, wallet creation, funding, or broadcasts.
try {
  process.loadEnvFile(".env");
} catch {}
const networks = [
  [
    "Ethereum Sepolia",
    process.env.TEST_RPC_ETHEREUM ||
      "https://ethereum-sepolia-rpc.publicnode.com",
    "eth_chainId",
    "0xaa36a7",
  ],
  [
    "Polygon Amoy",
    process.env.TEST_RPC_POLYGON ||
      "https://polygon-amoy-bor-rpc.publicnode.com",
    "eth_chainId",
    "0x13882",
  ],
  [
    "BNB Testnet",
    process.env.TEST_RPC_BINANCE || "https://bsc-testnet-rpc.publicnode.com",
    "eth_chainId",
    "0x61",
  ],
  [
    "Base Sepolia",
    process.env.TEST_RPC_BASE || "https://sepolia.base.org",
    "eth_chainId",
    "0x14a34",
  ],
  [
    "Solana Devnet",
    process.env.TEST_RPC_SOLANA || "https://api.devnet.solana.com",
    "getGenesisHash",
    "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  ],
];
let failed = false;
for (const [name, url, method, expected] of networks) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (data.result !== expected)
      throw new Error("identity mismatch or RPC error");
    console.log(`${name}: verified ${expected}`);
  } catch {
    failed = true;
    console.log(
      `${name}: UNAVAILABLE or incorrect network; no transaction attempted`,
    );
  }
}
try {
  const response = await fetch(
    "https://mempool.space/signet/api/block-height/0",
    { signal: AbortSignal.timeout(15000) },
  );
  if (
    (await response.text()).trim() !==
    "00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6"
  )
    throw new Error("identity mismatch");
  console.log("Bitcoin Signet: genesis verified");
} catch {
  failed = true;
  console.log("Bitcoin Signet: UNAVAILABLE; no transaction attempted");
}
process.exitCode = failed ? 1 : 0;

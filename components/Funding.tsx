"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHAINS, NETWORKS, explorerUrl } from "@/config/networks";
import { BlockchainNetwork, MultiChainWallet } from "@/types";
import { BlockchainService } from "@/services/blockchainService";
import { errorMessage, parseAmount } from "@/lib/amounts";
import { Screen, ErrorNotice, Notice, download } from "./Screen";
import NetworkLogo from "./NetworkLogo";

type Balance = { balance: string; pending: string; checkedAt: number };
type Result = { value?: Balance; error?: string };
const otherFaucets: Record<BlockchainNetwork, { name: string; url: string }[]> =
  {
    ethereum: [
      {
        name: "Sepolia browser-work faucet",
        url: "https://sepolia-faucet.pk910.de/",
      },
      {
        name: "Ethereum faucet list",
        url: "https://ethereum.org/developers/docs/networks/#sepolia",
      },
    ],
    polygon: [
      { name: "OpenFaucet Amoy", url: "https://openfaucet.org/polygon-amoy" },
    ],
    binance: [
      { name: "Browser-work BNB faucet", url: "https://pow.zalalena.com/bsc" },
      {
        name: "BNB Chain support options",
        url: "https://docs.bnbchain.org/docs/bsc-faucet/",
      },
    ],
    base: [
      {
        name: "More Base Sepolia faucets",
        url: "https://basehub.org/network/network-faucets/",
      },
    ],
    solana: [
      {
        name: "QuickNode Solana Devnet",
        url: "https://faucet.quicknode.com/solana/devnet",
      },
      {
        name: "Solana faucet guide",
        url: "https://solana.com/developers/cookbook/development/airdrops-and-faucets",
      },
    ],
    bitcoin: [
      {
        name: "Alternate Signet faucet",
        url: "https://signet.bublina.eu.org/",
      },
    ],
  };

export default function Funding({
  wallet,
  onBack,
}: {
  wallet: MultiChainWallet;
  onBack: () => void;
}) {
  const [results, setResults] = useState<
    Partial<Record<BlockchainNetwork, Result>>
  >({});
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const generation = useRef(0);
  const networks = CHAINS.filter((network) => wallet.accounts[network]);
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    setBusy(true);
    setResults({});
    await Promise.all(
      CHAINS.filter((network) => wallet.accounts[network]).map(
        async (network) => {
          let result: Result;
          try {
            const value = await BlockchainService.getBalance(
              wallet.accounts[network]!.address,
              network,
            );
            parseAmount(value.balance, NETWORKS[network].decimals);
            // Bitcoin's pending net change may be negative after an outgoing spend.
            parseAmount(
              value.pending.replace(/^-/, ""),
              NETWORKS[network].decimals,
            );
            result = { value: { ...value, checkedAt: Date.now() } };
          } catch (e) {
            result = { error: errorMessage(e) };
          }
          if (generation.current === id)
            setResults((previous) => ({ ...previous, [network]: result }));
        },
      ),
    );
    if (generation.current === id) setBusy(false);
  }, [wallet]);
  useEffect(() => {
    const activeGeneration = generation;
    void refresh();
    return () => {
      activeGeneration.current++;
    };
  }, [refresh]);

  async function copy(network: BlockchainNetwork) {
    setError("");
    try {
      await navigator.clipboard.writeText(wallet.accounts[network]!.address);
      setNotice(`${NETWORKS[network].name} address copied.`);
    } catch {
      setError(
        "Clipboard unavailable. Select and copy the address shown below.",
      );
    }
  }

  async function copyFaucet(network: BlockchainNetwork) {
    setError("");
    try {
      await navigator.clipboard.writeText(NETWORKS[network].faucet);
      setNotice(
        `${NETWORKS[network].name} faucet link copied. Open it in a browser and paste your public receiving address there.`,
      );
    } catch {
      setError(
        "Clipboard unavailable. Use the faucet link or another browser.",
      );
    }
  }

  return (
    <Screen title="Get free test coins" onBack={onBack}>
      <p>
        Copy your address, open its faucet, and request the native test coin on
        the exact network shown. Return here and check balances after the faucet
        sends it.
      </p>
      <p className="muted">
        Faucets may require sign-in, CAPTCHA, or a cooldown. A faucet request
        alone does not confirm a deposit. Fund both computers’ wallets
        separately before the demonstration.
      </p>
      <p className="muted small">
        If a faucet asks you to hold real coins on mainnet, skip it and use a
        different option below. Faucet amounts and availability are set by the
        provider, not by this wallet.
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={() => void refresh()}
      >
        {busy ? "Checking balances…" : "Check balances"}
      </button>
      <button
        onClick={() =>
          download(
            "extrust-public-addresses.json",
            JSON.stringify(
              {
                environment: "testnet",
                accounts: networks.map((network) => ({
                  network,
                  networkId: NETWORKS[network].id,
                  name: NETWORKS[network].name,
                  symbol: NETWORKS[network].symbol,
                  address: wallet.accounts[network]!.address,
                })),
              },
              null,
              2,
            ),
          )
        }
      >
        Download public receiving addresses
      </button>
      <p className="muted small">
        This address list contains no recovery words or private keys. It cannot
        restore or unlock a wallet.
      </p>
      {notice && <Notice>{notice}</Notice>}
      <ErrorNotice message={error} />
      {networks.map((network) => {
        const config = NETWORKS[network];
        const result = results[network];
        const value = result?.value;
        const funded =
          value && parseAmount(value.balance, config.decimals) > 0n;
        return (
          <section
            className="card funding-card"
            key={network}
            aria-label={config.name}
          >
            <div className="row">
              <span
                className="funding-coin"
                style={{ background: config.color }}
                aria-hidden="true"
              >
                <NetworkLogo network={network} />
              </span>
              <h2>{config.name}</h2>
            </div>
            <p className="break financial-data">
              {wallet.accounts[network]!.address}
            </p>
            <p role="status">
              {!result
                ? "Checking balance…"
                : result.error
                  ? "Balance unavailable"
                  : funded
                    ? "Funds detected"
                    : "No confirmed funds yet"}
            </p>
            {value && (
              <>
                <p className="financial-data">
                  {value.balance} {config.symbol}
                </p>
                {value.pending !== "0" && (
                  <p>
                    Pending net change:{" "}
                    <span className="financial-data">
                      {value.pending} {config.symbol}
                    </span>
                  </p>
                )}
                <p className="muted small">
                  Checked{" "}
                  <time
                    className="financial-data"
                    dateTime={new Date(value.checkedAt).toISOString()}
                  >
                    {new Date(value.checkedAt).toLocaleTimeString()}
                  </time>
                  . Send checks whether the balance covers your amount and fee.
                </p>
              </>
            )}
            <ErrorNotice message={result?.error || ""} />
            <div className="actions">
              <button onClick={() => void copy(network)}>Copy address</button>
              <a
                className="button"
                href={config.faucet}
                target="_blank"
                rel="noreferrer"
              >
                Open faucet ↗
              </a>
              <button onClick={() => void copyFaucet(network)}>
                Copy faucet link
              </button>
            </div>
            <details className="funding-options">
              <summary>Faucet not working? Other options</summary>
              <p className="muted small">
                Use the same network and this card’s public address. If a link
                does not open here, copy the faucet link and paste it into your
                regular browser. Claims can be delayed, empty, or rate limited.
              </p>
              <ul>
                {otherFaucets[network].map((option) => (
                  <li key={option.url}>
                    <a href={option.url} target="_blank" rel="noreferrer">
                      {option.name} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </details>
            <a
              href={explorerUrl(
                network,
                wallet.accounts[network]!.address,
                "address",
              )}
              target="_blank"
              rel="noreferrer"
            >
              Check deposits on explorer ↗
            </a>
            {network === "bitcoin" && (
              <p className="muted small">
                Signet only. Incoming coins must confirm before this wallet can
                spend them.
              </p>
            )}
          </section>
        );
      })}
    </Screen>
  );
}

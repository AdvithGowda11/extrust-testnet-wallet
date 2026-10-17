"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlockchainNetwork,
  MultiChainWallet,
  Token,
  Transaction,
} from "@/types";
import { CHAINS, NETWORKS, explorerUrl, isEVM } from "@/config/networks";
import { StorageService } from "@/services/storageService";
import { BlockchainService } from "@/services/blockchainService";
import { errorMessage } from "@/lib/amounts";
import { mergeHistory } from "@/lib/history";
import { Screen, ErrorNotice, Notice, download } from "./Screen";
import SendTransaction from "./SendTransaction";
import AddToken from "./AddToken";
import TransactionHistory from "./TransactionHistory";
import ExportWallet from "./ExportWallet";
import CloudBackup from "./CloudBackup";
export default function WalletDashboard() {
  const wallet = StorageService.getWallet() as MultiChainWallet;
  const [network, setNetwork] = useState<BlockchainNetwork>(
    CHAINS.find((n) => wallet.accounts[n])!,
  );
  const [screen, setScreen] = useState<
    "assets" | "send" | "token" | "export" | "backup" | "receive"
  >("assets");
  const [balance, setBalance] = useState<string | null>(null);
  const [pending, setPending] = useState("0");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>(
    {},
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokenCursors, setTokenCursors] = useState<
    Record<string, number | undefined>
  >({});
  const [tokenHistoryError, setTokenHistoryError] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [updated, setUpdated] = useState<number | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const failures = useRef(0);
  const account = wallet.accounts[network];
  const refresh = useCallback(async () => {
    if (!account || running.current || !StorageService.getWallet()) return;
    running.current = true;
    setBusy(true);
    const id = generation.current;
    try {
      const stored = StorageService.getTokens().filter(
        (t) => t.network === network,
      );
      const balances = await Promise.allSettled([
        BlockchainService.getBalance(account.address, network),
        ...stored.map((t) =>
          BlockchainService.getTokenBalance(
            t.address,
            account.address,
            network,
          ),
        ),
      ]);
      if (id !== generation.current) return;
      setTokens(stored);
      const native = balances[0];
      if (native.status === "fulfilled") {
        setBalance(native.value.balance);
        setPending("pending" in native.value ? native.value.pending : "0");
        setUpdated(Date.now());
        setError("");
        failures.current = 0;
      } else {
        setError(errorMessage(native.reason));
        failures.current++;
      }
      const values: Record<string, string> = {};
      stored.forEach((t, i) => {
        const r = balances[i + 1];
        if (r.status === "fulfilled") values[t.address] = r.value.balance;
      });
      setTokenBalances(values);
      const local = StorageService.getTransactions().filter(
        (t) => t.network === network,
      );
      const reconciled = await Promise.all(
        local.map(async (t) => {
          if (
            !["prepared", "pending", "unknown"].includes(t.status) &&
            !(network === "solana" && t.status === "confirmed")
          )
            return t;
          try {
            return await BlockchainService.reconcile(t);
          } catch {
            return t;
          }
        }),
      );
      if (id !== generation.current || !StorageService.getWallet()) return;
      for (const t of reconciled) StorageService.updateTransaction(t);
      setTransactions(reconciled);
      try {
        const history = await BlockchainService.getTransactionHistory(
          account.address,
          network,
        );
        if (id !== generation.current) return;
        const merged = mergeHistory(reconciled, history.transactions);
        StorageService.mergeTransactions(merged);
        setTransactions(merged);
        setCursor(history.nextCursor);
        setNotice(history.notice || "");
        setHistoryError("");
      } catch (e) {
        if (id === generation.current) setHistoryError(errorMessage(e));
      }
      const tokenErrors: string[] = [];
      for (const token of stored) {
        try {
          const result = await BlockchainService.getTokenHistory(
            account.address,
            token,
          );
          if (id !== generation.current || !StorageService.getWallet()) return;
          StorageService.mergeTransactions(result.transactions);
          setTransactions((t) => mergeHistory(t, result.transactions));
          setTokenCursors((c) => ({
            ...c,
            [token.address]: Object.hasOwn(c, token.address)
              ? c[token.address]
              : result.nextBlock,
          }));
        } catch (e) {
          tokenErrors.push(`${token.symbol}: ${errorMessage(e)}`);
        }
      }
      if (id === generation.current)
        setTokenHistoryError(tokenErrors.join("; "));
    } catch (e) {
      if (id === generation.current) setError(errorMessage(e));
    } finally {
      running.current = false;
      if (id === generation.current) setBusy(false);
    }
  }, [account, network]);
  useEffect(() => {
    const marker = ++generation.current;
    setBalance(null);
    setPending("0");
    setTransactions([]);
    setTokenBalances({});
    setError("");
    setHistoryError("");
    setUpdated(null);
    setTokenCursors({});
    setTokenHistoryError("");
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      if (!document.hidden) await refresh();
      if (!stopped)
        timer = setTimeout(tick, Math.min(30000, 5000 * 2 ** failures.current));
    };
    timer = setTimeout(tick, 5000);
    const focus = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", focus);
    return () => {
      stopped = true;
      generation.current = marker + 1;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  async function older() {
    if (!cursor || !account) return;
    setBusy(true);
    const id = generation.current;
    try {
      const result = await BlockchainService.getTransactionHistory(
        account.address,
        network,
        cursor,
      );
      if (id !== generation.current) return;
      for (const tx of result.transactions)
        StorageService.updateTransaction(tx);
      setTransactions((t) => mergeHistory(t, result.transactions));
      setCursor(result.nextCursor);
      setNotice(result.notice || "");
    } catch (e) {
      setHistoryError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function olderTokens(token: Token) {
    const end = tokenCursors[token.address];
    if (end === undefined || !account) return;
    const id = generation.current;
    setBusy(true);
    try {
      const result = await BlockchainService.getTokenHistory(
        account.address,
        token,
        end,
      );
      if (id !== generation.current || !StorageService.getWallet()) return;
      StorageService.mergeTransactions(result.transactions);
      setTransactions((t) => mergeHistory(t, result.transactions));
      setTokenCursors((c) => ({ ...c, [token.address]: result.nextBlock }));
      setTokenHistoryError("");
    } catch (e) {
      if (id === generation.current) setTokenHistoryError(errorMessage(e));
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  function back() {
    setScreen("assets");
    void refresh();
  }
  if (screen === "send")
    return (
      <SendTransaction
        wallet={wallet}
        network={network}
        onBack={back}
        onSuccess={back}
      />
    );
  if (screen === "token")
    return <AddToken network={network} onBack={back} onTokenAdded={back} />;
  if (screen === "export")
    return <ExportWallet wallet={wallet} onBack={back} />;
  if (screen === "backup")
    return (
      <CloudBackup
        wallet={wallet}
        onBack={back}
        onWalletRestored={() => window.location.reload()}
      />
    );
  return (
    <Screen
      title={screen === "receive" ? "Receive test coins" : "Wallet"}
      onBack={screen === "receive" ? back : undefined}
    >
      <div className="row">
        <label className="grow">
          Network
          <select
            aria-label="Network"
            value={network}
            onChange={(e) => {
              setNetwork(e.target.value as BlockchainNetwork);
            }}
          >
            {CHAINS.map((n) => (
              <option key={n} value={n} disabled={!wallet.accounts[n]}>
                {NETWORKS[n].name}
                {!wallet.accounts[n] ? " · no account" : ""}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => StorageService.lock()}>Lock</button>
      </div>
      <ErrorNotice message={error} />
      <div className="balance-card">
        <p>{NETWORKS[network].name}</p>
        <p className="balance">
          {balance ?? "—"} <span>{NETWORKS[network].symbol}</span>
        </p>
        {pending !== "0" && <p>Pending net change: {pending} BTC</p>}
        <p className="small">
          {updated
            ? `Last successful update: ${new Date(updated).toLocaleTimeString()}`
            : "Waiting for verified network connection"}
        </p>
        <p className="break">{account?.address}</p>
        <div className="row">
          <button
            disabled={!account}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(account!.address);
                setNotice("Address copied.");
              } catch {
                setError(
                  "Clipboard unavailable. Select and copy the address manually.",
                );
              }
            }}
          >
            Copy address
          </button>
          <button disabled={busy} onClick={() => void refresh()}>
            {busy ? "Updating…" : "Refresh"}
          </button>
        </div>
      </div>
      {screen === "receive" ? (
        <>
          <Notice>
            Send only {NETWORKS[network].symbol} on {NETWORKS[network].name} to
            this address. The same address on another network has a separate
            balance.
          </Notice>
          <a
            className="button primary"
            href={NETWORKS[network].faucet}
            target="_blank"
            rel="noreferrer"
          >
            Open test-coin funding options ↗
          </a>
          <p>
            Faucets may require accounts, CAPTCHAs, or waiting periods. Obtain
            enough for transfer amounts and fees before your presentation.
          </p>
          <a
            href={explorerUrl(network, account!.address, "address")}
            target="_blank"
            rel="noreferrer"
          >
            View receiving address on explorer ↗
          </a>
        </>
      ) : (
        <>
          <div className="actions">
            <button className="primary" onClick={() => setScreen("send")}>
              Send
            </button>
            <button onClick={() => setScreen("receive")}>Receive / fund</button>
            {isEVM(network) && (
              <button onClick={() => setScreen("token")}>Add token</button>
            )}
          </div>
          {tokens.map((t) => (
            <div className="card" key={t.address}>
              <strong>{t.symbol}</strong>
              <p>{tokenBalances[t.address] ?? "Unavailable"}</p>
              <p className="small break">{t.address}</p>
              <button
                onClick={() => {
                  StorageService.removeToken(t);
                  void refresh();
                }}
              >
                Remove token from list
              </button>
            </div>
          ))}
        </>
      )}
      <ErrorNotice message={historyError} />
      <ErrorNotice message={tokenHistoryError} />
      {tokens.length > 0 && (
        <p className="small">
          Tracked ERC-20 transfers: latest 2,000 blocks, plus saved activity.
          Load earlier ranges below. Internal contract calls are available in
          the explorer.
        </p>
      )}
      {tokens
        .filter((t) => tokenCursors[t.address] !== undefined)
        .map((t) => (
          <button
            key={t.address}
            disabled={busy}
            onClick={() => olderTokens(t)}
          >
            Load older {t.symbol} transfers
          </button>
        ))}
      {notice && <Notice>{notice}</Notice>}
      <TransactionHistory
        network={network}
        transactions={transactions}
        onRetry={async (tx) => {
          setBusy(true);
          try {
            const current = await BlockchainService.reconcile(tx);
            if (["unknown", "prepared"].includes(current.status))
              await BlockchainService.broadcast(current);
            else StorageService.updateTransaction(current);
            await refresh();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      {cursor && (
        <button disabled={busy} onClick={older}>
          Load older activity
        </button>
      )}
      <button
        onClick={() =>
          download(
            `transactions-${network}.json`,
            JSON.stringify(
              transactions.map(({ signedTransaction, ...t }) => t),
              null,
              2,
            ),
          )
        }
      >
        Export transaction evidence
      </button>
      <details>
        <summary>Wallet settings and recovery</summary>
        <button onClick={() => setScreen("export")}>
          Export encrypted wallet / recovery keys
        </button>
        <button onClick={() => setScreen("backup")}>
          Cloud backup and restore
        </button>
        <button
          className="danger"
          onClick={() => {
            if (
              window.confirm(
                "Remove the local wallet and its records? You must have an encrypted backup or recovery information. This does not delete the cloud backup.",
              )
            )
              StorageService.deleteWallet();
          }}
        >
          Remove local wallet
        </button>
      </details>
    </Screen>
  );
}

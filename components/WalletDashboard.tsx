"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
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
import NetworkLogo from "./NetworkLogo";
import Funding from "./Funding";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Copy,
  ExternalLink,
  LockKeyhole,
  Menu,
  Plus,
  RefreshCw,
} from "lucide-react";
const COIN_NAMES: Record<BlockchainNetwork, string> = {
  ethereum: "Ethereum",
  polygon: "Polygon",
  binance: "BNB",
  base: "Base",
  solana: "Solana",
  bitcoin: "Bitcoin",
};
export default function WalletDashboard() {
  const wallet = StorageService.getWallet() as MultiChainWallet;
  const [network, setNetwork] = useState<BlockchainNetwork>(
    wallet.accounts.bitcoin
      ? "bitcoin"
      : CHAINS.find((n) => wallet.accounts[n])!,
  );
  const [orbitStep, setOrbitStep] = useState(
    () =>
      -CHAINS.filter((n) => wallet.accounts[n]).indexOf(
        wallet.accounts.bitcoin
          ? "bitcoin"
          : CHAINS.find((n) => wallet.accounts[n])!,
      ),
  );
  const selectedNetworkRef = useRef(network);
  const [menuOpen, setMenuOpen] = useState(false);
  const [screen, setScreen] = useState<
    "assets" | "send" | "token" | "export" | "backup" | "receive" | "fund"
  >("assets");
  useEffect(() => {
    const frame = document.querySelector(".mobile-container");
    if (frame) frame.scrollTop = 0;
  }, [screen]);
  const [balance, setBalance] = useState<string | null>(null);
  const [pending, setPending] = useState("0");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>(
    {},
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [offline, setOffline] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokenCursors, setTokenCursors] = useState<
    Record<string, number | undefined>
  >({});
  const [tokenHistoryError, setTokenHistoryError] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const generation = useRef(0);
  const running = useRef(-1);
  const historyRunning = useRef(-1);
  const tokenBalancesRunning = useRef(-1);
  const failures = useRef(0);
  const ignoreOrbitClick = useRef(false);
  const orbitDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    angle: number;
    distance: number;
    dragging: boolean;
  } | null>(null);
  const account = wallet.accounts[network];
  const availableNetworks = CHAINS.filter((n) => wallet.accounts[n]);
  function selectNetwork(next: BlockchainNetwork) {
    const count = availableNetworks.length;
    const target = availableNetworks.indexOf(next);
    if (target < 0) return;
    selectedNetworkRef.current = next;
    setOrbitStep((current) => {
      const selected = ((-current % count) + count) % count;
      let distance = target - selected;
      if (distance > count / 2) distance -= count;
      if (distance < -count / 2) distance += count;
      return current - distance;
    });
    setNetwork(next);
    setMenuOpen(false);
  }
  function rotateNetwork(direction: number) {
    const count = availableNetworks.length;
    if (count < 2) return;
    const current = availableNetworks.indexOf(selectedNetworkRef.current);
    selectNetwork(availableNetworks[(current + direction + count) % count]);
  }
  function orbitPosition(index: number) {
    const angle =
      -Math.PI / 2 +
      ((index + orbitStep) * 2 * Math.PI) / availableNetworks.length;
    const size = network === availableNetworks[index] ? 64 : 58;
    return {
      x: Math.cos(angle) * 110,
      y: 140 + Math.sin(angle) * 102 - size / 2 - 4,
    };
  }
  function handleOrbitPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    ignoreOrbitClick.current = false;
    const target = event.target;
    if (target instanceof Element && target.closest(".tray-menu")) {
      orbitDrag.current = null;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    orbitDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      angle: Math.atan2(
        event.clientY - bounds.top - 140,
        event.clientX - bounds.left - bounds.width / 2,
      ),
      distance: 0,
      dragging: false,
    };
  }
  function handleOrbitPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = orbitDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (
      !drag.dragging &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8
    )
      return;
    if (!drag.dragging) {
      drag.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const angle = Math.atan2(
      event.clientY - bounds.top - 140,
      event.clientX - bounds.left - bounds.width / 2,
    );
    let delta = angle - drag.angle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    drag.angle = angle;
    drag.distance += delta;
    const step = (2 * Math.PI) / availableNetworks.length;
    while (drag.distance >= step) {
      rotateNetwork(-1);
      drag.distance -= step;
    }
    while (drag.distance <= -step) {
      rotateNetwork(1);
      drag.distance += step;
    }
  }
  function handleOrbitPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = orbitDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    orbitDrag.current = null;
    if (drag.dragging) {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      ignoreOrbitClick.current = true;
    }
  }
  const shortAddress = account?.address
    ? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`
    : "No account";
  const displayBalance =
    balance === "0"
      ? network === "bitcoin"
        ? "0.00000000"
        : "0.0000"
      : (balance ?? "—");
  async function copyAddress() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.address);
      setNotice("Address copied.");
    } catch {
      setError("Clipboard unavailable. Select and copy the address manually.");
    }
  }
  const refreshHistory = useCallback(async () => {
    const id = generation.current;
    if (
      !account ||
      historyRunning.current === id ||
      !StorageService.getWallet()
    )
      return;
    historyRunning.current = id;
    try {
      const stored = StorageService.getTokens().filter(
        (t) => t.network === network,
      );
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
        setHistoryNotice(history.notice || "");
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
      if (id === generation.current) setHistoryError(errorMessage(e));
    } finally {
      if (historyRunning.current === id) historyRunning.current = -1;
    }
  }, [account, network]);
  const refresh = useCallback(async () => {
    const id = generation.current;
    if (!account || running.current === id || !StorageService.getWallet())
      return;
    running.current = id;
    setBusy(true);
    try {
      const stored = StorageService.getTokens().filter(
        (t) => t.network === network,
      );
      setTokens(stored);
      void refreshHistory();
      const native = BlockchainService.getBalance(account.address, network)
        .then((value) => {
          if (id !== generation.current || !StorageService.getWallet()) return;
          setBalance(value.balance);
          setPending(value.pending);
          setConnectionError("");
          failures.current = 0;
        })
        .catch((e) => {
          if (id !== generation.current) return;
          setBalance(null);
          setConnectionError(errorMessage(e));
          failures.current++;
        });
      if (tokenBalancesRunning.current !== id) {
        tokenBalancesRunning.current = id;
        void Promise.allSettled(
          stored.map((t) =>
            BlockchainService.getTokenBalance(
              t.address,
              account.address,
              network,
            ),
          ),
        )
          .then((balances) => {
            if (id !== generation.current || !StorageService.getWallet())
              return;
            const values: Record<string, string> = {};
            stored.forEach((t, i) => {
              const result = balances[i];
              if (result.status === "fulfilled")
                values[t.address] = result.value.balance;
            });
            setTokenBalances(values);
          })
          .finally(() => {
            if (tokenBalancesRunning.current === id)
              tokenBalancesRunning.current = -1;
          });
      }
      await native;
    } catch (e) {
      if (id === generation.current) {
        setBalance(null);
        setConnectionError(errorMessage(e));
      }
    } finally {
      if (running.current === id) running.current = -1;
      if (id === generation.current) setBusy(false);
    }
  }, [account, network, refreshHistory]);
  useEffect(() => {
    const marker = ++generation.current;
    setBalance(null);
    setPending("0");
    setTokens([]);
    setTransactions([]);
    setTokenBalances({});
    setError("");
    setConnectionError("");
    setHistoryError("");
    setNotice("");
    setHistoryNotice("");
    setCursor(undefined);
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
  useEffect(() => {
    const disconnected = () => {
      setOffline(true);
      setBalance(null);
    };
    const reconnected = () => {
      setOffline(false);
      void refresh();
    };
    setOffline(!navigator.onLine);
    window.addEventListener("offline", disconnected);
    window.addEventListener("online", reconnected);
    return () => {
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("online", reconnected);
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
      setHistoryNotice(result.notice || "");
    } catch (e) {
      if (id === generation.current) setHistoryError(errorMessage(e));
    } finally {
      if (id === generation.current) setBusy(false);
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
    setMenuOpen(false);
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
  if (screen === "fund") return <Funding wallet={wallet} onBack={back} />;
  if (screen === "backup")
    return (
      <CloudBackup
        wallet={wallet}
        onBack={back}
        onWalletRestored={() => window.location.reload()}
      />
    );
  if (screen === "receive")
    return (
      <Screen title="Receive test coins" onBack={back}>
        <div className={`receive-mark ${network}`} aria-hidden="true">
          <NetworkLogo network={network} />
        </div>
        <p className="receive-intro">
          Receive {NETWORKS[network].symbol} on {NETWORKS[network].name}
        </p>
        <div className="receive-address">
          <span className="break financial-data">{account?.address}</span>
          <button onClick={copyAddress}>
            <Copy size={17} aria-hidden="true" /> Copy address
          </button>
        </div>
        <Notice>
          Send only {NETWORKS[network].symbol} on {NETWORKS[network].name}.
        </Notice>
        {notice && <Notice>{notice}</Notice>}
        <ErrorNotice message={error} />
        <a
          className="button primary"
          href={NETWORKS[network].faucet}
          target="_blank"
          rel="noreferrer"
        >
          Open faucet <ExternalLink size={17} aria-hidden="true" />
        </a>
        <button onClick={() => setScreen("fund")}>Fund all six networks</button>
        <a
          href={explorerUrl(network, account!.address, "address")}
          target="_blank"
          rel="noreferrer"
        >
          View receiving address on explorer ↗
        </a>
      </Screen>
    );
  return (
    <main className="wallet-home" data-address={account?.address}>
      <h1 className="sr-only">Wallet</h1>
      <header className="wallet-topbar">
        <button
          className="round-control"
          aria-label="Open wallet menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="brand-symbol" aria-hidden="true" />
        </button>
        <div className="wallet-identity">
          <button
            className="wallet-address-button financial-data"
            onClick={copyAddress}
            title={account?.address}
          >
            <span>{shortAddress}</span>
            <Copy size={13} aria-hidden="true" />
          </button>
          <label className="wallet-network-select">
            <span className="sr-only">Network</span>
            <select
              aria-label="Network"
              value={network}
              onChange={(e) => {
                selectNetwork(e.target.value as BlockchainNetwork);
              }}
            >
              {CHAINS.map((n) => (
                <option key={n} value={n} disabled={!wallet.accounts[n]}>
                  {NETWORKS[n].name}
                  {!wallet.accounts[n] ? " · no account" : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
        </div>
        <button
          className="round-control"
          aria-label="Lock"
          onClick={() => StorageService.lock()}
        >
          <LockKeyhole size={21} aria-hidden="true" />
        </button>
      </header>
      <section
        className="wallet-focus balance-card"
        aria-label="Selected network balance"
      >
        <p className="wallet-coin-name">{COIN_NAMES[network]}</p>
        <p className="balance financial-data">{displayBalance}</p>
        <p className="wallet-balance-unit financial-data">
          {NETWORKS[network].symbol} <span>· test coins</span>
        </p>
        {(offline || connectionError) && (
          <div
            className="notice error recovery-panel balance-recovery"
            role="alert"
          >
            <strong>
              {offline ? "You’re offline" : "Connection interrupted"}
            </strong>
            <p>
              {offline
                ? "Reconnect to check your balance."
                : `Couldn’t check this balance. ${connectionError}`}
            </p>
            <button disabled={busy || offline} onClick={() => void refresh()}>
              {busy ? "Checking…" : "Retry network connection"}
            </button>
          </div>
        )}
        {pending !== "0" && (
          <p className="wallet-pending financial-data">
            Pending net change: {pending} BTC
          </p>
        )}
        <div className={`coin-orb ${network}`} aria-hidden="true">
          <NetworkLogo network={network} className="coin-logo" />
        </div>
        <div className="wallet-primary-actions">
          <button
            aria-label="Receive / fund"
            title="Receive / fund"
            onClick={() => setScreen("receive")}
          >
            <ArrowDownLeft size={25} aria-hidden="true" />
          </button>
          <button
            className="action-main"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            title="Open menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Plus size={29} aria-hidden="true" />
          </button>
          <button
            aria-label="Send"
            title="Send"
            onClick={() => setScreen("send")}
          >
            <ArrowUpRight size={25} aria-hidden="true" />
          </button>
        </div>
      </section>
      <div className="wallet-feedback">
        <ErrorNotice message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      {menuOpen && (
        <section className="wallet-action-menu" aria-label="Wallet menu">
          <h2>Quick actions</h2>
          <button onClick={() => setScreen("fund")}>Get free test coins</button>
          {isEVM(network) && (
            <button onClick={() => setScreen("token")}>
              <Plus size={18} aria-hidden="true" /> Add token
            </button>
          )}
          <button disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={18} aria-hidden="true" />{" "}
            {busy ? "Updating…" : "Refresh"}
          </button>
          <button onClick={() => setScreen("export")}>
            Export encrypted wallet / recovery keys
          </button>
          <button onClick={() => setScreen("backup")}>
            Cloud backup and restore
          </button>
        </section>
      )}
      <section className="asset-tray" aria-label="Networks and wallet activity">
        <div className="tray-handle" aria-hidden="true" />
        <div className="tray-heading">
          <h2>Networks</h2>
        </div>
        <div
          className="orbit-stage"
          aria-label="Circular coin selector"
          role="group"
          tabIndex={0}
          onPointerDown={handleOrbitPointerDown}
          onPointerMove={handleOrbitPointerMove}
          onPointerUp={handleOrbitPointerEnd}
          onPointerCancel={handleOrbitPointerEnd}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
              event.preventDefault();
              rotateNetwork(-1);
            } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
              event.preventDefault();
              rotateNetwork(1);
            }
          }}
        >
          {availableNetworks.map((n, index) => {
            const position = orbitPosition(index);
            return (
              <button
                key={n}
                data-network={n}
                className={`network-tile ${n} ${n === network ? "selected" : ""}`}
                style={
                  {
                    "--orbit-x": `${position.x}px`,
                    "--orbit-y": `${position.y}px`,
                  } as CSSProperties
                }
                aria-label={`Switch to ${NETWORKS[n].name}`}
                aria-pressed={n === network}
                onClick={(event) => {
                  if (event.detail > 0 && ignoreOrbitClick.current) return;
                  selectNetwork(n);
                }}
              >
                <span className={`network-coin ${n}`}>
                  <NetworkLogo network={n} className="network-glyph" />
                </span>
                <span>{COIN_NAMES[n]}</span>
              </button>
            );
          })}
          <button
            className="tray-menu"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span>
              <Menu size={22} aria-hidden="true" />
            </span>
            Menu
          </button>
        </div>
        <div className="wallet-details">
          {tokens.length > 0 && (
            <div className="tracked-assets">
              <h2>Tracked tokens</h2>
              {tokens.map((t) => (
                <div className="tracked-token" key={t.address}>
                  <span className="token-symbol">{t.symbol.slice(0, 1)}</span>
                  <span>
                    <strong>{t.symbol}</strong>
                    <small className="break financial-data">{t.address}</small>
                  </span>
                  <strong className="financial-data">
                    {tokenBalances[t.address] ?? "Unavailable"}
                  </strong>
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
            </div>
          )}
          {historyError && (
            <div className="notice error recovery-panel" role="alert">
              <strong>Activity is temporarily unavailable</strong>
              <p>{historyError}</p>
              <p>
                Saved activity remains in this wallet. Check your connection and
                try syncing again.
              </p>
              <button disabled={busy} onClick={() => void refresh()}>
                Retry activity sync
              </button>
            </div>
          )}
          {tokenHistoryError && (
            <div className="notice error recovery-panel" role="alert">
              <strong>Token activity needs a retry</strong>
              <p>{tokenHistoryError}</p>
              <button disabled={busy} onClick={() => void refresh()}>
                Retry token activity
              </button>
            </div>
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
          <TransactionHistory
            network={network}
            transactions={transactions}
            historyNotice={historyNotice}
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
          <details>
            <summary>Wallet settings and recovery</summary>
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
        </div>
      </section>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import {
  BlockchainNetwork,
  MultiChainWallet,
  TransferQuote,
  Token,
  Transaction,
} from "@/types";
import { BlockchainService } from "@/services/blockchainService";
import { StorageService } from "@/services/storageService";
import { NETWORKS, explorerUrl } from "@/config/networks";
import { errorMessage } from "@/lib/amounts";
import { Screen, Notice } from "./Screen";
import NetworkLogo from "./NetworkLogo";
import { Check, ChevronDown } from "lucide-react";
export default function SendTransaction({
  wallet,
  network,
  onBack,
  onSuccess,
}: {
  wallet: MultiChainWallet;
  network: BlockchainNetwork;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorStage, setErrorStage] = useState<"prepare" | "send" | null>(null);
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [sent, setSent] = useState<Transaction | null>(null);
  const account = wallet.accounts[network];
  useEffect(() => {
    try {
      setTokens(
        StorageService.getTokens().filter((t) => t.network === network),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [network]);
  async function prepare(max = false) {
    if (!account) return;
    setBusy(true);
    setError("");
    setErrorStage(null);
    try {
      const q = await BlockchainService.prepare(
        {
          from: account.address,
          to: recipient.trim(),
          amount,
          network,
          tokenAddress: token || undefined,
        },
        max,
      );
      setAmount(q.amount);
      setQuote(q);
    } catch (e) {
      setError(errorMessage(e));
      setErrorStage("prepare");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!quote || !account) return;
    setBusy(true);
    setError("");
    setErrorStage(null);
    try {
      setSent(await BlockchainService.send(quote, account.privateKey));
      setQuote(null);
    } catch (e) {
      setError(errorMessage(e));
      setErrorStage("send");
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <Screen
        title={
          sent.status === "pending"
            ? "Transaction submitted"
            : "Check transaction status"
        }
        onBack={onSuccess}
      >
        {sent.status === "pending" ? (
          <Notice>Broadcast accepted. Waiting for chain confirmation.</Notice>
        ) : (
          <div className="notice error recovery-panel" role="status">
            <strong>Broadcast outcome is uncertain</strong>
            <p>
              The signed transaction is saved in Activity. Check its status
              before sending again; a second new transfer could duplicate it.
            </p>
          </div>
        )}
        <p className="break financial-data">{sent.hash}</p>
        <a
          target="_blank"
          rel="noreferrer"
          href={explorerUrl(network, sent.hash)}
        >
          Open transaction explorer ↗
        </a>
        <button className="primary" onClick={onSuccess}>
          Track in wallet
        </button>
      </Screen>
    );
  return (
    <Screen
      title={`Send on ${NETWORKS[network].name}`}
      onBack={busy ? undefined : onBack}
    >
      {error && (
        <div className="notice error recovery-panel" role="alert">
          <strong>
            {errorStage === "send"
              ? "Transfer status needs checking"
              : "Could not review transfer"}
          </strong>
          <p>{error}</p>
          <p>
            {errorStage === "send"
              ? "A broadcast may have reached the network. Check Activity and the explorer before preparing another transfer."
              : "Your recipient and amount are still here. Check the address, balance, and network, then try again."}
          </p>
          {errorStage === "send" ? (
            <button onClick={onBack}>Check wallet activity</button>
          ) : (
            <button
              disabled={busy || !recipient || !amount}
              onClick={() => void prepare()}
            >
              Try review again
            </button>
          )}
        </div>
      )}
      {quote ? (
        <>
          <h2>Review transfer</h2>
          <dl>
            <dt>Network</dt>
            <dd>{NETWORKS[network].name}</dd>
            <dt>From</dt>
            <dd className="break financial-data">{quote.params.from}</dd>
            <dt>To</dt>
            <dd className="break financial-data">{quote.params.to}</dd>
            <dt>Amount</dt>
            <dd className="financial-data">
              {quote.amount} {quote.symbol}
            </dd>
            <dt>Fee reserve</dt>
            <dd className="financial-data">
              {quote.fee} {NETWORKS[network].symbol}
            </dd>
          </dl>
          <p className="muted">
            Review expires after 45 seconds. Actual fees are shown after
            confirmation. Signing happens locally.
          </p>
          <button className="primary" disabled={busy} onClick={send}>
            {busy ? "Signing and broadcasting…" : "Confirm and send"}
          </button>
          <button disabled={busy} onClick={() => setQuote(null)}>
            Edit transfer
          </button>
        </>
      ) : (
        <>
          <label>
            Asset
            <details className="asset-picker">
              <summary>
                <span className={`asset-picker-mark ${network}`}>
                  {token ? (
                    tokens.find((t) => t.address === token)?.symbol.slice(0, 1)
                  ) : (
                    <NetworkLogo network={network} />
                  )}
                </span>
                <span className="asset-picker-copy">
                  <strong>
                    {token
                      ? tokens.find((t) => t.address === token)?.symbol
                      : `${NETWORKS[network].symbol} (native)`}
                  </strong>
                  <small>
                    {token ? (
                      <span className="financial-data">{`${NETWORKS[network].name} · ${token.slice(0, 8)}…`}</span>
                    ) : (
                      `${NETWORKS[network].name} · Native asset`
                    )}
                  </small>
                </span>
                <ChevronDown size={20} aria-hidden="true" />
              </summary>
              <div className="asset-options" aria-label="Choose an asset">
                <button
                  type="button"
                  className={!token ? "asset-option selected" : "asset-option"}
                  aria-pressed={!token}
                  onClick={(event) => {
                    setToken("");
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                  }}
                >
                  <span className={`asset-picker-mark ${network}`}>
                    <NetworkLogo network={network} />
                  </span>
                  <span className="asset-picker-copy">
                    <strong>{NETWORKS[network].symbol} (native)</strong>
                    <small>{NETWORKS[network].name} · Native asset</small>
                  </span>
                  {!token && <Check size={18} aria-hidden="true" />}
                </button>
                {tokens.map((item) => (
                  <button
                    key={item.address}
                    type="button"
                    className={
                      token === item.address
                        ? "asset-option selected"
                        : "asset-option"
                    }
                    aria-pressed={token === item.address}
                    onClick={(event) => {
                      setToken(item.address);
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                    }}
                  >
                    <span className="asset-picker-mark token-mark">
                      {item.symbol.slice(0, 1)}
                    </span>
                    <span className="asset-picker-copy">
                      <strong>{item.symbol}</strong>
                      <small className="financial-data">
                        {item.address.slice(0, 10)}…
                      </small>
                    </span>
                    {token === item.address && (
                      <Check size={18} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </details>
          </label>
          <label>
            Recipient address
            <input
              className="financial-data"
              autoComplete="off"
              spellCheck={false}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>
          <label>
            Amount
            <input
              className="financial-data"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <button
            disabled={busy || !recipient || errorStage === "send"}
            onClick={() => prepare(true)}
          >
            Use maximum after fee reserve
          </button>
          <button
            className="primary"
            disabled={
              busy || !recipient || !amount || !account || errorStage === "send"
            }
            onClick={() => prepare()}
          >
            {busy ? "Checking funds and fees…" : "Review transfer"}
          </button>
        </>
      )}
    </Screen>
  );
}

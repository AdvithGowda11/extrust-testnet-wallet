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
import { Screen, ErrorNotice, Notice } from "./Screen";
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
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!quote || !account) return;
    setBusy(true);
    setError("");
    try {
      setSent(await BlockchainService.send(quote, account.privateKey));
      setQuote(null);
    } catch (e) {
      setError(errorMessage(e));
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <Screen title="Transaction submitted" onBack={onSuccess}>
        <Notice>
          {sent.status === "pending"
            ? "Broadcast accepted. Waiting for chain confirmation."
            : "Broadcast outcome is uncertain. The signed transaction is saved for status checking."}
        </Notice>
        <p className="break">{sent.hash}</p>
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
      <ErrorNotice message={error} />
      {quote ? (
        <>
          <h2>Review transfer</h2>
          <dl>
            <dt>Network</dt>
            <dd>{NETWORKS[network].name}</dd>
            <dt>From</dt>
            <dd className="break">{quote.params.from}</dd>
            <dt>To</dt>
            <dd className="break">{quote.params.to}</dd>
            <dt>Amount</dt>
            <dd>
              {quote.amount} {quote.symbol}
            </dd>
            <dt>Fee reserve</dt>
            <dd>
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
            <select value={token} onChange={(e) => setToken(e.target.value)}>
              <option value="">{NETWORKS[network].symbol} (native)</option>
              {tokens.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.symbol} · {t.address.slice(0, 10)}…
                </option>
              ))}
            </select>
          </label>
          <label>
            Recipient address
            <input
              autoComplete="off"
              spellCheck={false}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>
          <label>
            Amount
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <button disabled={busy || !recipient} onClick={() => prepare(true)}>
            Use maximum after fee reserve
          </button>
          <button
            className="primary"
            disabled={busy || !recipient || !amount || !account}
            onClick={() => prepare()}
          >
            {busy ? "Checking funds and fees…" : "Review transfer"}
          </button>
        </>
      )}
    </Screen>
  );
}

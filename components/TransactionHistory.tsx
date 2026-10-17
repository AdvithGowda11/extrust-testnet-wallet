"use client";
import { Transaction, BlockchainNetwork } from "@/types";
import { explorerUrl, NETWORKS } from "@/config/networks";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
export default function TransactionHistory({
  transactions,
  network,
  historyNotice,
  onRetry,
}: {
  transactions: Transaction[];
  network: BlockchainNetwork;
  historyNotice?: string;
  onRetry?: (tx: Transaction) => void;
}) {
  return (
    <section aria-label="Transaction history">
      <div className="section-heading">
        <h2>Activity</h2>
        <span className="section-overline">RECENT TRANSFERS</span>
      </div>
      {historyNotice && (
        <details className="history-note">
          <summary>
            History details <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <p>{historyNotice}</p>
        </details>
      )}
      {!transactions.length && (
        <p className="muted">No activity in the loaded history.</p>
      )}
      {transactions.map((tx, i) => (
        <article
          className="transaction"
          key={`${tx.hash}:${tx.tokenAddress || ""}:${i}`}
        >
          <div className="transaction-main">
            <span className={`transaction-icon ${tx.type}`} aria-hidden="true">
              {tx.type === "send" ? (
                <ArrowUpRight size={20} />
              ) : tx.type === "self" ? (
                <ArrowRightLeft size={20} />
              ) : (
                <ArrowDownLeft size={20} />
              )}
            </span>
            <div className="transaction-summary">
              <strong>
                {tx.type === "send"
                  ? "Sent"
                  : tx.type === "self"
                    ? "Self transfer"
                    : "Received"}
              </strong>
              <span className="financial-data">
                {new Date(tx.timestamp).toLocaleString()}
              </span>
            </div>
            <span className="transaction-amount financial-data">
              {tx.type === "send" ? "−" : tx.type === "receive" ? "+" : ""}
              {tx.value}{" "}
              <small>{tx.tokenSymbol || NETWORKS[network].symbol}</small>
            </span>
          </div>
          <div className="transaction-meta">
            <span className={`status ${tx.status}`}>{tx.status}</span>
            <p className="break small financial-data">
              {tx.type === "send" ? "To" : "From"}:{" "}
              {tx.type === "send" ? tx.to : tx.from}
            </p>
          </div>
          <p className="small muted financial-data">
            {tx.fee ? ` · Fee: ${tx.fee} ${NETWORKS[network].symbol}` : ""}
            {tx.confirmations ? ` · ${tx.confirmations} confirmation(s)` : ""}
          </p>
          <a
            className="break small financial-data"
            href={explorerUrl(network, tx.hash)}
            target="_blank"
            rel="noreferrer"
          >
            {tx.hash} <ExternalLink size={14} aria-hidden="true" />
          </a>
          {tx.error && <p className="notice">{tx.error}</p>}
          {tx.status === "failed" && (
            <p className="transaction-recovery">
              This transfer failed on-chain. Check the explorer and your balance
              before preparing a new one; network fees may still have been
              spent.
            </p>
          )}
          {["unknown", "prepared"].includes(tx.status) &&
            tx.signedTransaction &&
            onRetry && (
              <button onClick={() => onRetry(tx)}>
                Rebroadcast same signed transaction
              </button>
            )}
        </article>
      ))}
    </section>
  );
}

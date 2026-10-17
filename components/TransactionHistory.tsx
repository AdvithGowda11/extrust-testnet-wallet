"use client";
import { Transaction, BlockchainNetwork } from "@/types";
import { explorerUrl, NETWORKS } from "@/config/networks";
export default function TransactionHistory({
  transactions,
  network,
  onRetry,
}: {
  transactions: Transaction[];
  network: BlockchainNetwork;
  onRetry?: (tx: Transaction) => void;
}) {
  return (
    <section aria-label="Transaction history">
      <h2>Activity</h2>
      {!transactions.length && (
        <p className="muted">No activity in the loaded history.</p>
      )}
      {transactions.map((tx, i) => (
        <article
          className="transaction"
          key={`${tx.hash}:${tx.tokenAddress || ""}:${i}`}
        >
          <div className="row">
            <strong>
              {tx.type === "send"
                ? "Sent"
                : tx.type === "self"
                  ? "Self transfer"
                  : "Received"}
            </strong>
            <span className={`status ${tx.status}`}>{tx.status}</span>
          </div>
          <p className="amount">
            {tx.value} {tx.tokenSymbol || NETWORKS[network].symbol}
          </p>
          <p className="break small">
            {tx.type === "send" ? "To" : "From"}:{" "}
            {tx.type === "send" ? tx.to : tx.from}
          </p>
          <p className="small muted">
            {new Date(tx.timestamp).toLocaleString()}
            {tx.fee ? ` · Fee: ${tx.fee} ${NETWORKS[network].symbol}` : ""}
            {tx.confirmations ? ` · ${tx.confirmations} confirmation(s)` : ""}
          </p>
          <a
            className="break small"
            href={explorerUrl(network, tx.hash)}
            target="_blank"
            rel="noreferrer"
          >
            {tx.hash} ↗
          </a>
          {tx.error && <p className="notice">{tx.error}</p>}
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

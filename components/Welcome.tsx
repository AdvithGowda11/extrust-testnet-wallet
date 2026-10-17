"use client";
import { Screen } from "./Screen";
export default function Welcome({
  onGetStarted,
  onRestore,
}: {
  onGetStarted: () => void;
  onRestore: () => void;
}) {
  return (
    <Screen title="Your six-network test wallet">
      <div className="card">
        <h2>Make a real test transaction</h2>
        <p>
          Create a wallet, receive free test coins, and send them to another
          wallet. Signing happens on this device.
        </p>
        <p>
          Sepolia · Amoy · BNB Testnet · Base Sepolia · Solana Devnet · Bitcoin
          Signet
        </p>
      </div>
      <button className="primary" onClick={onGetStarted}>
        Create or import wallet
      </button>
      <button onClick={onRestore}>Restore encrypted backup</button>
      <p className="muted">
        Use a different recovery phrase on each computer. Never import a wallet
        containing real funds.
      </p>
    </Screen>
  );
}

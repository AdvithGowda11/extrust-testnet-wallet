"use client";
import { Screen } from "./Screen";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
export default function Welcome({
  onGetStarted,
  onRestore,
}: {
  onGetStarted: () => void;
  onRestore: () => void;
}) {
  return (
    <Screen title="Your six-network test wallet">
      <div className="welcome-hero">
        <p className="welcome-overline">
          <ShieldCheck size={17} aria-hidden="true" /> YOUR KEYS. YOUR WALLET.
        </p>
        <div className="welcome-coin coin-orb bitcoin" aria-hidden="true">
          <span>₿</span>
        </div>
        <h2>
          Move freely.
          <br />
          Start with test coins.
        </h2>
        <p>
          Create a wallet, receive free test coins, and send a real transaction
          to another wallet. Signing stays on this device.
        </p>
      </div>
      <button className="primary" onClick={onGetStarted}>
        Create or import wallet <ArrowRight size={18} aria-hidden="true" />
      </button>
      <button onClick={onRestore}>
        <KeyRound size={18} aria-hidden="true" /> Restore encrypted backup
      </button>
      <p className="muted small">
        Use a different recovery phrase on each computer. Never import a wallet
        containing real funds.
      </p>
    </Screen>
  );
}

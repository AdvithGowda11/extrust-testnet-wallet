"use client";
import { Screen } from "./Screen";
import { ArrowRight, KeyRound } from "lucide-react";
import NetworkLogo from "./NetworkLogo";
export default function Welcome({
  onGetStarted,
  onRestore,
  onRecover,
}: {
  onGetStarted: () => void;
  onRestore: () => void;
  onRecover: () => void;
}) {
  return (
    <Screen title="Your six-network test wallet">
      <div className="welcome-hero">
        <div className="welcome-coin coin-orb bitcoin" aria-hidden="true">
          <NetworkLogo network="bitcoin" className="coin-logo" />
        </div>
        <h2>
          Six networks.
          <br />
          One wallet.
        </h2>
      </div>
      <button className="primary" onClick={onGetStarted}>
        Create wallet <ArrowRight size={18} aria-hidden="true" />
      </button>
      <button onClick={onRestore}>
        <KeyRound size={18} aria-hidden="true" /> Restore encrypted backup
      </button>
      <button onClick={onRecover}>Recover wallet</button>
    </Screen>
  );
}

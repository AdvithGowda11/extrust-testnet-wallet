"use client";
import { useState } from "react";
import { WalletService } from "@/services/walletService";
import { StorageService } from "@/services/storageService";
import { BlockchainNetwork } from "@/types";
import { CHAINS, NETWORKS } from "@/config/networks";
import { errorMessage } from "@/lib/amounts";
import { Screen, ErrorNotice, download } from "./Screen";
export default function CreateWallet({
  onWalletCreated,
  onBack,
  recovery = false,
}: {
  onWalletCreated: () => void;
  onBack: () => void;
  recovery?: boolean;
}) {
  const [mode, setMode] = useState<"create" | "phrase" | "key">(
    recovery ? "phrase" : "create",
  );
  const [phrase, setPhrase] = useState("");
  const [secret, setSecret] = useState("");
  const [network, setNetwork] = useState<BlockchainNetwork>("ethereum");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const wordCount = WalletService.normalizeMnemonic(phrase)
    .split(" ")
    .filter(Boolean).length;
  const replacingWallet = StorageService.hasWallet();
  async function save() {
    setError("");
    setBusy(true);
    try {
      if (password !== repeat) throw new Error("Passphrases do not match");
      if (!confirm)
        throw new Error("Confirm that you saved your recovery information");
      if (replacingWallet && !confirmReplacement)
        throw new Error("Confirm replacement of the current local wallet");
      if (mode !== "key") {
        const issue = WalletService.recoveryPhraseIssue(phrase);
        if (issue) throw new Error(issue);
      }
      const wallet =
        mode === "key"
          ? WalletService.fromPrivateKey(secret, network)
          : WalletService.importWallet(phrase);
      await StorageService.saveWallet(wallet, password);
      setSecret("");
      setPhrase("");
      setPassword("");
      onWalletCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title={
        recovery
          ? "Recover wallet"
          : mode === "create"
            ? "Create wallet"
            : "Import wallet"
      }
      onBack={onBack}
    >
      {replacingWallet && (
        <div className="notice error recovery-panel" role="alert">
          <strong>A locked wallet already exists on this browser.</strong>
          <p>
            {recovery
              ? "Download a copy first. Recovering a wallet replaces this browser’s active encrypted vault."
              : "Creating or importing here replaces its encrypted local vault. Save a copy first in case you later remember its passphrase."}
          </p>
          <button
            type="button"
            onClick={() =>
              download(
                "extrust-testnet-wallet-before-replacement.json",
                StorageService.encryptedVault(),
              )
            }
          >
            Download current encrypted vault
          </button>
        </div>
      )}
      {!recovery && (
        <label>
          Wallet source
          <select
            value={mode}
            disabled={busy}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setPhrase("");
              setSecret("");
              setConfirm(false);
              setError("");
            }}
          >
            <option value="create">New recovery phrase</option>
            <option value="phrase">Import recovery phrase</option>
            <option value="key">Import private key</option>
          </select>
        </label>
      )}
      {mode === "create" ? (
        <>
          <button
            disabled={busy || !!phrase}
            onClick={() => setPhrase(WalletService.generateMnemonic())}
          >
            Generate recovery phrase
          </button>
          {phrase && (
            <div className="secret" aria-label="Recovery phrase">
              {phrase}
            </div>
          )}
        </>
      ) : mode === "phrase" ? (
        <>
          <label>
            Recovery phrase
            <textarea
              autoComplete="off"
              spellCheck={false}
              aria-describedby="recovery-word-count"
              value={phrase}
              onChange={(e) => {
                setPhrase(e.target.value);
                setError("");
              }}
            />
          </label>
          <p id="recovery-word-count" className="muted small" role="status">
            {wordCount} words. Use words only, without numbering or punctuation.
          </p>
        </>
      ) : (
        <>
          <label>
            Network
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value as BlockchainNetwork)}
            >
              {CHAINS.map((n) => (
                <option key={n} value={n}>
                  {NETWORKS[n].name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Private key
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <p className="muted">
            Bitcoin: compressed test-network WIF or hex; imported as native
            SegWit. EVM keys apply to all four EVM test networks.
          </p>
        </>
      )}
      <p className="notice">
        {recovery
          ? "Enter your original recovery words and choose a new local password for this browser."
          : "Write down your recovery phrase or imported key. The local passphrase encrypts this browser’s copy; it cannot recover a lost wallet."}
      </p>
      <label>
        {recovery ? "New local vault passphrase" : "Local vault passphrase"}
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <p className="muted small">
        At least 12 characters. Repeat the same password below.
      </p>
      <label>
        Repeat passphrase
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>
      {repeat && password !== repeat && (
        <p role="status" className="muted small">
          Passphrases do not match.
        </p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        I saved my recovery information and am using test assets only.
      </label>
      {replacingWallet && (
        <label className="check">
          <input
            type="checkbox"
            checked={confirmReplacement}
            onChange={(e) => setConfirmReplacement(e.target.checked)}
          />
          I saved the current encrypted vault and understand that continuing
          replaces this browser’s active wallet.
        </label>
      )}
      <ErrorNotice message={error} />
      <button
        className="primary"
        disabled={
          busy ||
          password.length < 12 ||
          password !== repeat ||
          !confirm ||
          (replacingWallet && !confirmReplacement) ||
          !(mode === "key" ? secret : phrase)
        }
        onClick={save}
      >
        {busy
          ? recovery
            ? "Recovering…"
            : "Encrypting…"
          : recovery
            ? "Recover wallet"
            : "Save encrypted wallet"}
      </button>
    </Screen>
  );
}

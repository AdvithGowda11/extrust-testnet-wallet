"use client";
import { useState } from "react";
import { MultiChainWallet } from "@/types";
import { StorageService } from "@/services/storageService";
import { BackupService } from "@/services/backupService";
import { Screen, ErrorNotice, download } from "./Screen";
import { errorMessage } from "@/lib/amounts";
export default function ExportWallet({
  wallet,
  onBack,
}: {
  wallet: MultiChainWallet;
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function show() {
    setBusy(true);
    setError("");
    try {
      await BackupService.decrypt(
        JSON.parse(StorageService.encryptedVault()),
        password,
      );
      setReveal(true);
      setPassword("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Export and recovery" onBack={onBack}>
      <p className="notice">
        The encrypted file preserves every imported account and derivation path.
        Keep the file and its passphrase separately.
      </p>
      <button
        className="primary"
        onClick={() =>
          download(
            "extrust-testnet-wallet.json",
            StorageService.encryptedVault(),
          )
        }
      >
        Download encrypted wallet
      </button>
      {StorageService.legacyArchive() && (
        <button
          onClick={() =>
            download(
              "extrust-legacy-archive.json",
              StorageService.legacyArchive()!,
            )
          }
        >
          Download preserved legacy archive
        </button>
      )}
      <details>
        <summary>Reveal recovery phrase and private keys</summary>
        <p className="notice">
          Anyone who sees these secrets can control the wallet. Do not include
          them in your demonstration screenshots.
        </p>
        {reveal ? (
          <>
            <button onClick={() => setReveal(false)}>Hide secrets</button>
            {wallet.mnemonic && <p className="secret">{wallet.mnemonic}</p>}
            {Object.values(wallet.accounts).map((a) => (
              <div key={a.network} className="card">
                <strong>{a.network}</strong>
                <p className="secret">{a.privateKey}</p>
                <p className="small">
                  {a.derivationPath || "Imported private key"}
                </p>
              </div>
            ))}
          </>
        ) : (
          <>
            <label>
              Local vault passphrase
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button disabled={busy || !password} onClick={show}>
              {busy ? "Checking…" : "Reveal secrets"}
            </button>
          </>
        )}
        <ErrorNotice message={error} />
      </details>
    </Screen>
  );
}

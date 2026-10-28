"use client";
import { useEffect, useRef, useState } from "react";
import Welcome from "@/components/Welcome";
import CreateWallet from "@/components/CreateWallet";
import WalletDashboard from "@/components/WalletDashboard";
import CloudBackup from "@/components/CloudBackup";
import { Screen, ErrorNotice, download } from "@/components/Screen";
import { StorageService } from "@/services/storageService";
import { errorMessage } from "@/lib/amounts";
import { getSupabase } from "@/lib/supabase/client";
type Page =
  | "loading"
  | "welcome"
  | "create"
  | "recover"
  | "unlock"
  | "dashboard"
  | "restore"
  | "legacy";
export default function Home() {
  const [page, setPage] = useState<Page>("loading");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cloudBackupRequested = useRef(false);
  const walletSetupRequested = useRef(false);
  useEffect(() => {
    if (page === "restore" && cloudBackupRequested.current) return;
    const frame = document.querySelector(".mobile-container");
    if (frame) frame.scrollTop = 0;
  }, [page]);
  function walletReady() {
    cloudBackupRequested.current = false;
    walletSetupRequested.current = false;
    setPage("dashboard");
  }
  const initial = () => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("screen") === "cloud-backup") {
        cloudBackupRequested.current = true;
        url.searchParams.delete("screen");
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      } else if (url.searchParams.get("screen") === "wallet-setup") {
        walletSetupRequested.current = true;
        url.searchParams.delete("screen");
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
        void getSupabase()?.auth.getSession();
      }
      if (walletSetupRequested.current) {
        setPage("create");
        return;
      }
      if (cloudBackupRequested.current) {
        setPage("restore");
        return;
      }
      setPage(
        StorageService.hasLegacy()
          ? "legacy"
          : StorageService.hasWallet()
            ? "unlock"
            : "welcome",
      );
    } catch {
      setError(
        "Browser storage is unavailable. Enable site storage before creating a wallet.",
      );
      setPage("unlock");
    }
  };
  useEffect(() => {
    initial();
    const lock = () => {
      setPassword("");
      cloudBackupRequested.current = false;
      walletSetupRequested.current = false;
      initial();
    };
    const changed = (event: StorageEvent) => {
      if (event.key === StorageService.vaultKey) StorageService.lock();
    };
    window.addEventListener("wallet-lock", lock);
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener("wallet-lock", lock);
      window.removeEventListener("storage", changed);
    };
  }, []);
  useEffect(() => {
    if (page !== "dashboard") return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => StorageService.lock(), 5 * 60 * 1000);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [page]);
  async function unlock() {
    setError("");
    setBusy(true);
    try {
      if (page === "legacy") {
        await StorageService.archiveLegacy(password);
        setPassword("");
        initial();
      } else {
        await StorageService.unlock(password);
        setPassword("");
        walletReady();
      }
    } catch (e) {
      const message = errorMessage(e);
      setError(
        page === "unlock" &&
          message === "Incorrect passphrase or damaged backup"
          ? "Incorrect passphrase or damaged encrypted data. Try your local wallet password, or recover with your 12 words."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }
  if (page === "loading")
    return (
      <Screen title="Loading wallet">
        <p role="status">Checking local storage…</p>
      </Screen>
    );
  if (page === "dashboard") return <WalletDashboard />;
  if (page === "create" || page === "recover")
    return (
      <CreateWallet
        key={page}
        recovery={page === "recover"}
        onBack={() => {
          walletSetupRequested.current = false;
          initial();
        }}
        onWalletCreated={walletReady}
      />
    );
  if (page === "restore")
    return (
      <CloudBackup
        wallet={null}
        returnedFromConfirmation={cloudBackupRequested.current}
        onBack={() => {
          cloudBackupRequested.current = false;
          initial();
        }}
        onWalletRestored={walletReady}
      />
    );
  if (page === "welcome")
    return (
      <>
        <Welcome
          onGetStarted={() => setPage("create")}
          onRestore={() => setPage("restore")}
          onRecover={() => setPage("recover")}
        />
        {StorageService.legacyArchive() && (
          <div className="screen-body">
            <button
              onClick={() =>
                download(
                  "extrust-legacy-archive.json",
                  StorageService.legacyArchive()!,
                )
              }
            >
              Download preserved legacy wallet archive
            </button>
          </div>
        )}
      </>
    );
  return (
    <Screen
      title={
        page === "legacy" ? "Preserve your existing wallet" : "Unlock wallet"
      }
    >
      {page === "legacy" ? (
        <p className="notice">
          This browser contains an older mainnet wallet. First encrypt and
          preserve its exact original data. Its keys will not be changed or used
          on test networks.
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <label>
          {page === "legacy"
            ? "Archive passphrase (at least 12 characters)"
            : "Local vault passphrase"}
          <input
            type="password"
            autoComplete={
              page === "legacy" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <ErrorNotice message={error} />
        <button className="primary" disabled={busy || !password}>
          {busy
            ? "Checking…"
            : page === "legacy"
              ? "Encrypt and preserve original wallet"
              : "Unlock"}
        </button>
      </form>
      {page === "unlock" && (
        <>
          <button onClick={() => setPage("restore")}>
            Restore encrypted file or cloud backup
          </button>
          <button
            onClick={() => {
              setPassword("");
              setError("");
              setPage("recover");
            }}
          >
            Recover with 12 words
          </button>
          <details className="funding-options">
            <summary>Wallet help</summary>
            <p className="muted small">
              Unlock with this browser’s local password. Use your 12 recovery
              words through “Recover with 12 words.” Cloud sign-in is for
              backups. Your wallet locks after five idle minutes.
            </p>
            <button onClick={() => setPage("create")}>
              Create a different wallet
            </button>
            <button
              onClick={() =>
                download(
                  "extrust-testnet-wallet.json",
                  StorageService.encryptedVault(),
                )
              }
            >
              Download locked encrypted vault
            </button>
          </details>
        </>
      )}
    </Screen>
  );
}

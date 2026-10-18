"use client";
import { useEffect, useRef, useState } from "react";
import { MultiChainWallet } from "@/types";
import { StorageService } from "@/services/storageService";
import { BackupService } from "@/services/backupService";
import { WalletService } from "@/services/walletService";
import { getSupabase } from "@/lib/supabase/client";
import { requestJson } from "@/services/blockchainService";
import { Screen, ErrorNotice, Notice } from "./Screen";
import { errorMessage } from "@/lib/amounts";
export default function CloudBackup({
  wallet,
  onBack,
  onWalletRestored,
  returnedFromConfirmation = false,
}: {
  wallet: MultiChainWallet | null;
  onBack: () => void;
  onWalletRestored: () => void;
  returnedFromConfirmation?: boolean;
}) {
  const [file, setFile] = useState("");
  const [password, setPassword] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [email, setEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cloudError, setCloudError] = useState("");
  const [cloudNotice, setCloudNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const cloudCard = useRef<HTMLDivElement>(null);
  const supabase = getSupabase();
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user.email || null);
      if (returnedFromConfirmation) {
        setCloudNotice(
          data.session
            ? "Email confirmed. Your cloud account is signed in."
            : "Email confirmed. Enter the same email and wallet cloud password, then select Sign in. Do not create another account or resend the email.",
        );
      }
    });
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user.email || null);
      if (session) {
        setAwaitingConfirmation(false);
        if (returnedFromConfirmation)
          setCloudNotice("Email confirmed. Your cloud account is signed in.");
      }
    });
    return () => {
      active = false;
      sub.data.subscription.unsubscribe();
    };
  }, [returnedFromConfirmation, supabase]);
  useEffect(() => {
    if (!returnedFromConfirmation) return;
    cloudCard.current?.scrollIntoView({ block: "start" });
  }, [returnedFromConfirmation]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function runCloud(action: () => Promise<void>) {
    setBusy(true);
    setCloudError("");
    setCloudNotice("");
    try {
      await action();
    } catch (e) {
      setCloudError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function headers() {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error("Sign in to cloud backup first");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }
  async function restore(raw: string) {
    if (StorageService.hasWallet() && !confirm)
      throw new Error("Confirm replacement before restoring");
    if (localPassword !== repeat)
      throw new Error("Local passphrases do not match");
    const restored = await BackupService.decrypt(JSON.parse(raw), password);
    WalletService.validateWallet(restored);
    await StorageService.saveWallet(restored, localPassword);
    onWalletRestored();
  }
  function confirmationRedirect() {
    const url = new URL(window.location.origin);
    url.searchParams.set("screen", "wallet-setup");
    return url.toString();
  }
  return (
    <Screen title="Backup and restore" onBack={onBack}>
      <ErrorNotice message={error} />
      {notice && <Notice>{notice}</Notice>}
      <p className="notice">
        A cloud account stores an encrypted copy of a wallet you already
        created. It never creates or reveals a 12-word recovery phrase. If this
        browser already has a wallet, go back and unlock it with its local vault
        passphrase; you can view its recovery information from the wallet menu.
      </p>
      <div className="card">
        <h2>Restore an encrypted file</h2>
        <label>
          Wallet backup file
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 100000) {
                setError("File is too large");
                return;
              }
              setFile(await f.text());
            }}
          />
        </label>
        <label>
          Backup passphrase
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          New local vault passphrase
          <input
            type="password"
            minLength={12}
            value={localPassword}
            onChange={(e) => setLocalPassword(e.target.value)}
          />
        </label>
        <label>
          Repeat local passphrase
          <input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        {StorageService.hasWallet() && (
          <label className="check">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            I exported my current wallet and want to replace this browser’s
            active wallet.
          </label>
        )}
        <button
          disabled={busy || !file || localPassword.length < 12}
          onClick={() => run(() => restore(file))}
        >
          Restore file
        </button>
        <p className="muted">
          Old mainnet archives are preserved exports, not test-network wallets.
          Their original keys are not re-derived.
        </p>
      </div>
      <div className="card" ref={cloudCard}>
        <h2>Optional encrypted cloud backup</h2>
        <ErrorNotice message={cloudError} />
        {cloudNotice && <Notice>{cloudNotice}</Notice>}
        {!supabase ? (
          <p>
            Cloud backup is unavailable on this installation. Encrypted file
            export and restore work without an account.
          </p>
        ) : !user ? (
          <>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Wallet cloud password (not your Google password)
              <input
                type="password"
                autoComplete="current-password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </label>
            <div className="row">
              <button
                disabled={busy}
                onClick={() =>
                  runCloud(async () => {
                    if (!email.trim()) throw new Error("Enter your email");
                    const { error } = await supabase.auth.signInWithPassword({
                      email: email.trim(),
                      password: authPassword,
                    });
                    if (error) throw error;
                    setAuthPassword("");
                  })
                }
              >
                Sign in
              </button>
              {!returnedFromConfirmation && (
                <button
                  disabled={busy}
                  onClick={() =>
                    runCloud(async () => {
                      const normalizedEmail = email.trim();
                      if (!normalizedEmail) throw new Error("Enter your email");
                      if (authPassword.length < 12)
                        throw new Error(
                          "Use at least 12 characters for the cloud account password",
                        );
                      const { data, error } = await supabase.auth.signUp({
                        email: normalizedEmail,
                        password: authPassword,
                        options: { emailRedirectTo: confirmationRedirect() },
                      });
                      if (error) throw error;
                      setAwaitingConfirmation(!data.session);
                      setCloudNotice(
                        data.session
                          ? "Cloud account created and signed in."
                          : "Confirmation email sent. Open it in this browser, confirm the address, then return here.",
                      );
                      setAuthPassword("");
                    })
                  }
                >
                  Create wallet cloud account
                </button>
              )}
            </div>
            {awaitingConfirmation && !returnedFromConfirmation && (
              <button
                disabled={busy || !email.trim()}
                onClick={() =>
                  runCloud(async () => {
                    const { error } = await supabase.auth.resend({
                      type: "signup",
                      email: email.trim(),
                      options: { emailRedirectTo: confirmationRedirect() },
                    });
                    if (error) throw error;
                    setCloudNotice("A new confirmation email was sent.");
                  })
                }
              >
                Resend confirmation email
              </button>
            )}
            <p className="muted">
              Your Google login and Google password do not work here. Use the
              Gmail address that belongs to the Supabase project team, then
              create a separate wallet cloud password with at least 12
              characters.
            </p>
          </>
        ) : (
          <>
            <p>{user}</p>
            <button
              disabled={busy}
              onClick={() =>
                runCloud(async () => {
                  await supabase.auth.signOut();
                  setPassword("");
                  setCloudNotice("Cloud account signed out.");
                })
              }
            >
              Sign out of cloud account
            </button>
            {wallet && (
              <button
                disabled={busy}
                onClick={() =>
                  runCloud(async () => {
                    if (
                      !window.confirm(
                        "Replace your existing cloud backup with this wallet?",
                      )
                    )
                      return;
                    await requestJson("/api/backup", {
                      method: "POST",
                      headers: await headers(),
                      body: StorageService.encryptedVault(),
                    });
                    setCloudNotice(
                      "Encrypted wallet saved. Its passphrase is your current local vault passphrase.",
                    );
                  })
                }
              >
                Upload current encrypted vault
              </button>
            )}
            <button
              disabled={busy || localPassword.length < 12}
              onClick={() =>
                runCloud(async () => {
                  const { backup } = await requestJson("/api/backup", {
                    headers: await headers(),
                  });
                  if (!backup) throw new Error("No cloud backup found");
                  await restore(JSON.stringify(backup));
                })
              }
            >
              Restore cloud backup with passphrases above
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                runCloud(async () => {
                  if (
                    !window.confirm(
                      "Delete the cloud copy? This cannot be undone.",
                    )
                  )
                    return;
                  await requestJson("/api/backup", {
                    method: "DELETE",
                    headers: await headers(),
                  });
                  setCloudNotice("Cloud backup deleted.");
                })
              }
            >
              Delete cloud backup
            </button>
          </>
        )}
      </div>
    </Screen>
  );
}

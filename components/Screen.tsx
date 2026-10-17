"use client";
import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
export function Screen({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <main className="screen">
      <header className="screen-header">
        <div className="screen-brand">
          <span className="brand-symbol" aria-hidden="true" />{" "}
          <strong>EXTrust</strong>
          <span>TESTNET WALLET</span>
        </div>
        {onBack && (
          <button className="back" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden="true" /> Back
          </button>
        )}
        <h1>{title}</h1>
        <p className="muted">Test assets have no monetary value.</p>
      </header>
      <div className="screen-body">{children}</div>
    </main>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="notice error">
      {message}
    </p>
  ) : null;
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="notice">
      {children}
    </p>
  );
}
export function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

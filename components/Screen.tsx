"use client";
import { ReactNode } from "react";
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
        {onBack && (
          <button className="back" onClick={onBack}>
            ← Back
          </button>
        )}
        <p className="eyebrow">EXTrust · Test networks</p>
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

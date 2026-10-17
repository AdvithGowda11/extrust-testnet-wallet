import type { Metadata } from "next";
import "@fontsource/literata/latin-400.css";
import "@fontsource/literata/latin-400-italic.css";
import "@fontsource/literata/latin-700.css";
import "@fontsource/barlow-condensed/latin-900-italic.css";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "EXTrust · Test Wallet",
  description:
    "Multi-chain cryptocurrency wallet supporting Ethereum, Polygon, Binance, Base, Solana, and Bitcoin",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mobile-container">{children}</div>
      </body>
    </html>
  );
}

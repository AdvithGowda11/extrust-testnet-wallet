import {
  siBitcoin,
  siBinance,
  siEthereum,
  siPolygon,
  siSolana,
} from "simple-icons";
import { BlockchainNetwork } from "@/types";

const ICONS = {
  bitcoin: siBitcoin,
  ethereum: siEthereum,
  polygon: siPolygon,
  binance: siBinance,
  solana: siSolana,
} as const;

export default function NetworkLogo({
  network,
  className,
}: {
  network: BlockchainNetwork;
  className?: string;
}) {
  const icon =
    network === "base" || network === "bitcoin" ? null : ICONS[network];

  return (
    <svg
      className={`network-logo ${className ?? ""}`.trim()}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`${network === "binance" ? "BNB" : network} logo`}
      focusable="false"
    >
      {network === "bitcoin" ? (
        <text
          x="12"
          y="17.5"
          textAnchor="middle"
          fontFamily="Arial, sans-serif"
          fontSize="17"
          fontWeight="700"
        >
          ₿
        </text>
      ) : icon ? (
        <path d={icon.path} />
      ) : (
        <circle cx="12" cy="12" r="4.7" />
      )}
    </svg>
  );
}

"use client";
import { useState } from "react";
import { getAddress } from "ethers";
import { BlockchainNetwork, Token } from "@/types";
import { BlockchainService } from "@/services/blockchainService";
import { StorageService } from "@/services/storageService";
import { errorMessage } from "@/lib/amounts";
import { NETWORKS } from "@/config/networks";
import { Screen, ErrorNotice } from "./Screen";
export default function AddToken({
  network,
  onBack,
  onTokenAdded,
}: {
  network: BlockchainNetwork;
  onBack: () => void;
  onTokenAdded: () => void;
}) {
  const [address, setAddress] = useState("");
  const [found, setFound] = useState<Token | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function lookup() {
    setBusy(true);
    setError("");
    setFound(null);
    try {
      const normalized = getAddress(address.trim());
      const metadata = await BlockchainService.getTokenMetadata(
        normalized,
        network,
      );
      setFound({ ...metadata, address: normalized, network });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title={`Add token · ${NETWORKS[network].name}`} onBack={onBack}>
      <p>
        Only add a contract deployed on this test network. Symbols do not
        establish a token’s identity.
      </p>
      <label>
        Contract address
        <input
          className="financial-data"
          disabled={busy}
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setFound(null);
          }}
        />
      </label>
      <ErrorNotice message={error} />
      <button disabled={busy || !address} onClick={lookup}>
        {busy ? "Reading contract…" : "Look up token"}
      </button>
      {found && (
        <div className="card">
          <h2>
            {found.name} ({found.symbol})
          </h2>
          <p className="financial-data">{found.decimals} decimals</p>
          <p className="break financial-data">{found.address}</p>
          <button
            className="primary"
            onClick={() => {
              try {
                StorageService.addToken(found);
                onTokenAdded();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Add verified contract
          </button>
        </div>
      )}
    </Screen>
  );
}

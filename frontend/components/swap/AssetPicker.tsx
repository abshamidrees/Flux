// components/swap/AssetPicker.tsx
// Screen A (spec §7.1). Invoked from a token pill; the overlay hides its own
// heading while this is open so only one "Swap" title is on screen (spec §2.4).
// Search filters on symbol+name; zero-balance rows stay selectable at reduced
// opacity. A token in "Your assets" is never repeated under "All supported".

"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { TOKENS, isSameToken, type TokenInfo } from "../../lib/swap/tokens";
import { useTokenBalances } from "../../hooks/useTokenBalances";
import { useTokenPrices } from "../../hooks/useTokenPrices";
import { formatTokenAmount, formatUsd } from "../../lib/swap/format";
import { TokenIcon } from "./TokenIcon";
import { Skeleton } from "../UI";
import { IconSearch } from "./icons";

function AssetRow({ token, balance, usd, connected, onSelect }: { token: TokenInfo; balance: number | null; usd: number | null; connected: boolean; onSelect: () => void }) {
  const zero = balance === 0;
  return (
    <button type="button" className="swap-asset-row" onClick={onSelect} style={{ opacity: zero ? 0.55 : 1 }}>
      <TokenIcon token={token} size={32} />
      <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: "var(--tx)" }}>{token.name}</div>
        <div style={{ fontSize: 12, color: "var(--tx3)" }}>{token.symbol}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        {!connected ? (
          // Nothing to resolve without a wallet — a dash, not a skeleton (a
          // skeleton implies "resolving soon", which isn't true here).
          <div className="swap-num" style={{ fontSize: 13, color: "var(--tx3)", fontWeight: 600 }}>—</div>
        ) : balance === null ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 3 }}><Skeleton w={52} h={13} br={4} /></div>
        ) : (
          <div className="swap-num" style={{ fontSize: 13, color: "var(--tx)", fontWeight: 600 }}>
            {formatTokenAmount(balance, token.decimals)}
          </div>
        )}
        <div className="swap-num" style={{ fontSize: 12, color: "var(--tx3)" }}>{usd != null ? formatUsd(usd) : "—"}</div>
      </div>
    </button>
  );
}

export function AssetPicker({
  excludeToken,
  onSelect,
  onCancel,
}: {
  excludeToken?: TokenInfo;
  onSelect: (t: TokenInfo) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const { address } = useAccount();
  const { balanceOf } = useTokenBalances();
  const { priceOf } = useTokenPrices();

  const { held, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = TOKENS.filter(
      (t) =>
        (!excludeToken || !isSameToken(t, excludeToken)) &&
        (!q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)),
    );
    const held = base.filter((t) => (balanceOf(t).formatted ?? 0) > 0);
    const heldAddrs = new Set(held.map((t) => t.address.toLowerCase()));
    const rest = base.filter((t) => !heldAddrs.has(t.address.toLowerCase()));
    return { held, rest };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, excludeToken]);

  const total = held.length + rest.length;

  const rowFor = (t: TokenInfo) => {
    const bal = balanceOf(t).formatted;
    const p = priceOf(t);
    const usd = bal != null && p != null ? bal * p : null;
    return <AssetRow key={t.address} token={t} balance={bal} usd={usd} connected={!!address} onSelect={() => onSelect(t)} />;
  };

  return (
    <div className="swap-screen">
      <h2 className="swap-title">Swap</h2>
      <p className="swap-subtitle">Choose which asset to swap</p>

      <div className="swap-search">
        <IconSearch size={16} style={{ color: "var(--tx3)", flexShrink: 0 }} />
        <input
          autoFocus
          className="swap-search-input"
          placeholder="Search assets"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search assets"
        />
      </div>

      {total === 0 ? (
        <div className="swap-empty">No assets match &ldquo;{query}&rdquo;.</div>
      ) : (
        <div style={{ marginTop: 6 }}>
          {held.length > 0 && (
            <>
              <div className="swap-group-label">Your assets</div>
              {held.map(rowFor)}
            </>
          )}
          {rest.length > 0 && (
            <>
              <div className="swap-group-label" style={{ marginTop: held.length > 0 ? 14 : 0 }}>
                All supported assets
              </div>
              {rest.map(rowFor)}
            </>
          )}
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 18 }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

// components/swap/styles.tsx
// Self-contained swap stylesheet. Uses the existing Flux CSS variables (so it is
// automatically theme-aware) and adds no new colors, radii, or fonts outside the
// extracted token set. Injected once by SwapOverlay — globals.css stays untouched
// except for the header entry button, which is an app-shell element.
//
// Focus system (spec §2.1): NO teal box, glow, or thickened border anywhere.
// Inputs show a caret (amount) or a 1px --bdr2 border-within (text fields).
// Keyboard focus on buttons/links/tabs/toggles → a single 1px teal-40% ring.

export function SwapStyles() {
  return (
    <style>{`
    /* ── Overlay chrome ─────────────────────────────────────── */
    .swap-overlay {
      position: fixed; inset: 0; z-index: 300;
      background: var(--bg); color: var(--tx);
      overflow-y: auto; overflow-x: hidden;
      animation: fadeIn 0.15s ease;
    }
    /* Top bar spans the full viewport: × flush left, wallet chip flush right. */
    .swap-overlay-top {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px;
    }
    .swap-col { max-width: 520px; margin: 0 auto; padding: 8px 20px 80px; }
    .swap-title { font-family: 'Manrope',sans-serif; font-size: 32px; font-weight: 800; letter-spacing: -0.03em; color: var(--tx); }
    .swap-subtitle { font-size: 14px; color: var(--tx2); margin-top: 4px; display: flex; align-items: center; gap: 6px; }

    /* ── Tabs + slippage pill ───────────────────────────────── */
    .swap-tabs-row { display: flex; align-items: center; justify-content: space-between; margin: 22px 0 14px; gap: 12px; }
    .swap-tabs { display: inline-flex; gap: 2px; background: var(--bg3); border: 1px solid var(--bdr); border-radius: 9px; padding: 3px; }
    .swap-tab {
      padding: 6px 16px; font-family: 'Manrope',sans-serif; font-size: 13px; font-weight: 700;
      color: var(--tx3); border-radius: 6px; border: none; background: transparent; cursor: pointer; transition: all 0.15s;
    }
    .swap-tab.is-active { background: var(--bg2); color: var(--tx); box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
    .swap-tab:hover:not(.is-active) { color: var(--tx2); }
    .swap-slippage-pill {
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
      background: var(--bg3); border: 1px solid var(--bdr); border-radius: 9px;
      font-family: 'Manrope',sans-serif; font-size: 12px; font-weight: 600; color: var(--tx2);
      cursor: pointer; transition: background 0.15s, border-color 0.15s;
    }
    .swap-slippage-pill:hover { background: var(--bg4); border-color: var(--bdr2); }

    /* ── Cards / zones ──────────────────────────────────────── */
    .swap-card { background: var(--bg2); border: 1px solid var(--bdr); border-radius: 12px; }
    .swap-zone { padding: 16px 18px; }
    .swap-zone-label { font-family: 'Manrope',sans-serif; font-size: 12px; font-weight: 600; color: var(--tx3); margin-bottom: 8px; }
    /* Amount inputs: no border, no background, no focus box — caret only (spec §2.1). */
    .swap-amount-input {
      width: 100%; min-width: 0; background: transparent; border: none; padding: 0;
      font-family: 'Manrope',sans-serif; font-size: 34px; font-weight: 700; letter-spacing: -0.02em;
      color: var(--tx); font-variant-numeric: tabular-nums; line-height: 1.1;
    }
    .swap-amount-input::placeholder { color: var(--tx3); }
    .swap-microline { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; font-size: 12px; min-width: 0; }
    .swap-convert {
      display: inline-flex; align-items: center; gap: 5px; min-width: 0; background: none; border: none; cursor: pointer;
      color: var(--tx3); font-family: 'Manrope',sans-serif; font-size: 12px; padding: 0; transition: color 0.15s;
      font-variant-numeric: tabular-nums;
    }
    .swap-convert span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .swap-convert:hover:not(:disabled) { color: var(--tx2); }
    .swap-convert:disabled { cursor: default; }
    .swap-balance { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; white-space: nowrap; color: var(--tx3); }
    .swap-max {
      background: var(--bg3); border: 1px solid var(--bdr2); color: var(--tx2);
      font-family: 'Manrope',sans-serif; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 6px; cursor: pointer;
      flex-shrink: 0; transition: color 0.15s, border-color 0.15s;
    }
    .swap-max:hover:not(:disabled) { color: var(--teal-l); border-color: var(--teal); }
    .swap-max:disabled { opacity: 0.45; cursor: not-allowed; }
    .swap-num { font-variant-numeric: tabular-nums; }

    /* ── Divider + flip ─────────────────────────────────────── */
    .swap-divider { position: relative; height: 1px; background: var(--bdr); margin: 0 18px; }
    .swap-flip {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
      width: 34px; height: 34px; border-radius: 9px; background: var(--bg3); border: 1px solid var(--bdr2);
      display: inline-flex; align-items: center; justify-content: center; color: var(--tx2); cursor: pointer; transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .swap-flip:hover { background: var(--bg4); border-color: var(--bdr2); color: var(--tx); }

    /* ── Token pill ─────────────────────────────────────────── */
    .swap-token-pill {
      display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
      background: var(--bg3); border: 1px solid var(--bdr); border-radius: 999px; padding: 5px 11px 5px 6px; cursor: pointer; transition: background 0.15s, border-color 0.15s;
    }
    .swap-token-pill:hover { background: var(--bg4); border-color: var(--bdr2); }

    /* ── Routes link + panel ────────────────────────────────── */
    .swap-routes-link {
      display: inline-flex; align-items: center; gap: 6px; margin-top: 12px;
      background: none; border: none; cursor: pointer; color: var(--tx2);
      font-family: 'Manrope',sans-serif; font-size: 13px; font-weight: 600; padding: 4px 2px; transition: color 0.15s;
    }
    .swap-routes-link:hover { color: var(--tx); }
    .swap-route-panel { margin-top: 8px; border: 1px solid var(--bdr); border-radius: 11px; overflow: hidden; }
    .swap-route-auto, .swap-route-main {
      display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
      background: transparent; border: none; cursor: pointer; padding: 12px 14px; transition: background 0.12s;
    }
    .swap-route-auto { flex-direction: column; align-items: flex-start; gap: 1px; border-bottom: 1px solid var(--bdr); }
    .swap-route-auto:hover, .swap-route-main:hover { background: var(--bg3); }
    .swap-route-row { display: flex; align-items: stretch; border-bottom: 1px solid var(--bdr); }
    .swap-route-row:last-child { border-bottom: none; }
    .swap-route-row.is-selected { background: var(--teal-10); }
    .swap-route-row.is-disabled { opacity: 0.6; }
    .swap-route-main { flex: 1; }
    .swap-route-expand {
      background: transparent; border: none; border-left: 1px solid var(--bdr); color: var(--tx3);
      padding: 0 12px; cursor: pointer; display: flex; align-items: center;
    }
    .swap-route-expand:hover { color: var(--tx); }
    .swap-route-detail { grid-column: 1/-1; padding: 4px 14px 12px; }
    .swap-route-detail > div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: var(--tx3); }
    .swap-route-detail > div > span:last-child { color: var(--tx2); }
    .swap-best-badge {
      background: var(--teal-10); color: var(--teal-l); border: 1px solid var(--teal-20);
      font-family: 'Manrope',sans-serif; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; min-width: 52px; text-align: center;
    }
    .swap-route-auto.is-selected { background: var(--teal-10); }

    /* ── Detail rows ────────────────────────────────────────── */
    .swap-detail-list { margin-top: 14px; }
    .swap-detail-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; }

    /* ── Accordion / select / quick buttons ─────────────────── */
    .swap-accordion {
      display: flex; align-items: center; justify-content: space-between; width: 100%;
      background: none; border: none; border-top: 1px solid var(--bdr); margin-top: 12px; padding: 13px 0 6px; cursor: pointer;
      font-family: 'Manrope',sans-serif; font-size: 13px; font-weight: 600; color: var(--tx2);
    }
    .swap-accordion:hover { color: var(--tx); }
    .swap-select { position: relative; display: inline-flex; align-items: center; }
    .swap-select select {
      appearance: none; background: var(--bg3); border: 1px solid var(--bdr); border-radius: 8px;
      padding: 7px 30px 7px 12px; font-family: 'Manrope',sans-serif; font-size: 13px; font-weight: 600; color: var(--tx); cursor: pointer;
      transition: border-color 0.15s;
    }
    .swap-select:focus-within select { border-color: var(--bdr2); }
    .swap-select svg { position: absolute; right: 10px; color: var(--tx3); pointer-events: none; }
    .swap-quick {
      background: var(--bg3); border: 1px solid var(--bdr); border-radius: 7px; color: var(--tx2);
      font-family: 'Manrope',sans-serif; font-size: 12px; font-weight: 600; padding: 5px 10px; cursor: pointer; transition: all 0.15s;
      font-variant-numeric: tabular-nums;
    }
    .swap-quick:hover { border-color: var(--bdr2); color: var(--tx); }
    .swap-quick.is-active { border-color: var(--teal); color: var(--teal); background: var(--teal-10); }

    /* ── Summary strip ──────────────────────────────────────── */
    .swap-summary {
      margin-top: 14px; padding: 12px 15px; background: var(--bg3); border: 1px solid var(--bdr); border-radius: 10px;
      font-family: 'Manrope',sans-serif; font-size: 13px; font-weight: 500; color: var(--tx2); line-height: 1.5;
    }

    /* ── Price-impact warning ───────────────────────────────── */
    .swap-impact-card { margin-top: 14px; padding: 14px 16px; background: var(--red-10); border: 1px solid rgba(239,68,68,0.22); border-radius: 11px; }
    .swap-impact-icon {
      width: 34px; height: 34px; flex-shrink: 0; border-radius: 9px; background: var(--red); color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .swap-impact-ack { display: flex; align-items: center; gap: 9px; margin-top: 12px; cursor: pointer; font-size: 13px; color: var(--tx2); font-weight: 500; }
    .swap-impact-ack input { width: 16px; height: 16px; accent-color: var(--red); cursor: pointer; flex-shrink: 0; }

    /* ── Inline notes ───────────────────────────────────────── */
    .swap-inline-note { font-size: 12px; font-weight: 600; line-height: 1.5; padding: 8px 12px; border-radius: 8px; }
    .swap-inline-note.warn { background: var(--amber-10); border: 1px solid rgba(245,158,11,0.2); color: #fbbf24; }
    .swap-inline-note.err { background: var(--red-10); border: 1px solid rgba(239,68,68,0.2); color: #fca5a5; }

    /* ── Text input (typed loss confirmation) ───────────────── */
    .swap-text-input {
      width: 100%; background: var(--bg3); border: 1px solid var(--bdr); border-radius: 8px; padding: 10px 13px;
      font-family: 'IBM Plex Mono',monospace; font-size: 13px; color: var(--tx); outline: none; transition: border-color 0.15s;
    }
    .swap-text-input:focus { border-color: var(--bdr2); }
    .swap-text-input::placeholder { color: var(--tx3); }

    /* ── Asset picker ───────────────────────────────────────── */
    .swap-screen { padding-top: 4px; }
    .swap-search { display: flex; align-items: center; gap: 10px; background: var(--bg3); border: 1px solid var(--bdr); border-radius: 10px; padding: 11px 14px; margin-top: 18px; transition: border-color 0.15s; }
    .swap-search:focus-within { border-color: var(--bdr2); }
    .swap-search-input { flex: 1; background: none; border: none; outline: none; color: var(--tx); font-family: 'Manrope',sans-serif; font-size: 14px; }
    .swap-search-input::placeholder { color: var(--tx3); }
    .swap-group-label { font-family: 'Manrope',sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tx3); margin: 12px 0 6px; }
    .swap-asset-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 12px; background: transparent; border: none; border-radius: 10px; cursor: pointer; transition: background 0.12s; }
    .swap-asset-row:hover { background: var(--bg2); }
    .swap-empty { text-align: center; color: var(--tx3); font-size: 14px; padding: 40px 0; }

    /* ── Settings modal bits ────────────────────────────────── */
    .swap-settings-label { font-family: 'Manrope',sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: var(--tx3); text-transform: uppercase; margin-bottom: 6px; }
    .swap-preset {
      flex: 1; background: var(--bg3); border: 1px solid var(--bdr); border-radius: 8px; color: var(--tx2);
      font-family: 'Manrope',sans-serif; font-size: 13px; font-weight: 700; padding: 9px 0; cursor: pointer; transition: all 0.15s; font-variant-numeric: tabular-nums;
    }
    .swap-preset:hover { border-color: var(--bdr2); color: var(--tx); }
    .swap-preset.is-active { border-color: var(--teal); color: var(--teal); background: var(--teal-10); }
    .swap-preset-custom { display: flex; align-items: center; gap: 4px; flex: 1; background: var(--bg3); border: 1px solid var(--bdr); border-radius: 8px; padding: 0 12px; transition: border-color 0.15s; }
    .swap-preset-custom:focus-within { border-color: var(--bdr2); }
    .swap-preset-custom.is-active { border-color: var(--teal); }
    .swap-preset-custom input { width: 100%; background: none; border: none; outline: none; color: var(--tx); font-family: 'IBM Plex Mono',monospace; font-size: 13px; padding: 9px 0; text-align: right; }
    .swap-preset-custom span { color: var(--tx3); font-size: 13px; }
    .swap-routes-list { display: flex; flex-direction: column; }
    .swap-route-toggle { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--bdr); }
    .swap-route-toggle:last-child { border-bottom: none; }
    .swap-switch { width: 38px; height: 22px; appearance: none; background: var(--bg4); border: 1px solid var(--bdr2); border-radius: 999px; position: relative; cursor: pointer; transition: background 0.15s; flex-shrink: 0; }
    .swap-switch:checked { background: var(--teal); border-color: var(--teal); }
    .swap-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.15s; }
    .swap-switch:checked::after { transform: translateX(16px); }
    .swap-deadline { display: inline-flex; align-items: center; gap: 6px; background: var(--bg3); border: 1px solid var(--bdr); border-radius: 8px; padding: 9px 12px; transition: border-color 0.15s; }
    .swap-deadline:focus-within { border-color: var(--bdr2); }
    .swap-deadline input { width: 34px; background: none; border: none; outline: none; color: var(--tx); font-family: 'IBM Plex Mono',monospace; font-size: 14px; padding: 0; text-align: right; }
    .swap-deadline .suffix { color: var(--tx3); font-size: 13px; }
    .swap-explainer { background: var(--bg3); border: 1px solid var(--bdr); border-radius: 10px; padding: 12px 14px; }
    .swap-explainer-hd { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; cursor: pointer; padding: 0; color: var(--tx); font-family: 'Manrope',sans-serif; font-size: 13px; font-weight: 700; }
    .swap-explainer-hd:hover { color: var(--teal-l); }
    .swap-explainer p { font-size: 12px; color: var(--tx2); line-height: 1.6; margin: 10px 0 0; }
    .swap-icon-btn { background: none; border: none; cursor: pointer; color: var(--tx3); display: inline-flex; padding: 4px; border-radius: 7px; transition: all 0.15s; }
    .swap-icon-btn:hover { color: var(--tx); background: var(--bg3); }

    /* ── Status ─────────────────────────────────────────────── */
    .swap-status { text-align: center; padding: 24px 8px 8px; }
    .swap-status-icon { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; margin-bottom: 16px; }
    .swap-status-icon.ok { background: var(--green-10); color: var(--green); border: 1px solid var(--green-20); }
    .swap-status-icon.err { background: var(--red-10); color: var(--red); border: 1px solid rgba(239,68,68,0.2); }
    .swap-status-icon.pending { background: var(--teal-10); color: var(--teal-l); border: 1px solid var(--teal-20); }
    .swap-status-title { font-family: 'Manrope',sans-serif; font-size: 20px; font-weight: 800; color: var(--tx); }
    .swap-status-sub { font-size: 14px; color: var(--tx2); margin-top: 6px; line-height: 1.55; }
    .swap-arcscan { display: inline-flex; align-items: center; gap: 6px; color: var(--teal-l); font-family: 'IBM Plex Mono',monospace; font-size: 12px; text-decoration: none; }
    .swap-arcscan:hover { text-decoration: underline; }
    .swap-exec-pill { display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; padding: 8px 14px; background: var(--bg3); border: 1px solid var(--bdr); border-radius: 999px; font-size: 13px; color: var(--tx2); font-weight: 600; }
    .swap-exec-helper { text-align: center; font-size: 13px; color: var(--tx2); margin-top: 14px; font-weight: 500; }

    /* ── Live status cards (Phase F §6): Approve / Confirm phases ──────── */
    .swap-status-summary {
      margin: 14px 0; padding: 10px 14px; background: var(--bg3); border: 1px solid var(--bdr);
      border-radius: 10px; font-size: 13px; color: var(--tx2); font-weight: 600;
      display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;
    }
    .swap-status-wallet { font-size: 13px; color: var(--tx2); font-weight: 500; margin-top: 4px; }
    .swap-prog-track { width: 100%; max-width: 220px; margin: 18px auto 0; height: 4px; border-radius: 3px; background: var(--bdr); overflow: hidden; }
    .swap-prog-indeterminate { width: 40%; height: 100%; border-radius: 3px; background: var(--teal); animation: swap-prog-slide 1.1s ease-in-out infinite; }
    @keyframes swap-prog-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
    @media (prefers-reduced-motion: reduce) { .swap-prog-indeterminate { animation: none; width: 100%; opacity: 0.5; } }

    /* ── History card + rows (spec §3, Phase F §4) ──────────── */
    .swap-hist-card { padding: 0 18px; }
    .swap-hist-row { padding: 13px 0; border-bottom: 1px solid var(--bdr); }
    .swap-hist-row:last-of-type { border-bottom: none; }

    /* Time · From(logo+amount) · arrow · To(logo+amount) · Value · Tx — one row */
    .swap-hist-line { display: flex; align-items: center; gap: 8px; }
    .swap-hist-time { flex: 0 0 auto; font-size: 11px; color: var(--tx3); min-width: 38px; }
    .swap-hist-asset { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 0; }
    .swap-hist-amt { font-size: 13px; font-weight: 600; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .swap-hist-sym { color: var(--tx3); font-weight: 500; }
    .swap-hist-arrow { color: var(--tx3); flex-shrink: 0; }
    .swap-hist-value { flex: 0 0 auto; font-size: 12px; color: var(--tx2); min-width: 0; text-align: right; }
    .swap-hist-tx { flex-shrink: 0; }

    .swap-hist-error {
      display: flex; align-items: center; gap: 8px; margin-top: 8px;
      font-size: 12px; color: var(--red); line-height: 1.4;
    }
    .swap-hist-failed {
      background: var(--red-10); color: #fca5a5; border: 1px solid rgba(239,68,68,0.2);
      font-family: 'Manrope',sans-serif; font-size: 10px; font-weight: 700;
      padding: 1px 7px; border-radius: 999px; flex-shrink: 0;
    }
    .swap-hist-group { font-family: 'Manrope',sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tx3); margin: 14px 0 4px; }

    @media (max-width: 480px) {
      .swap-hist-card { padding: 0 12px; }
      .swap-hist-line { gap: 6px; flex-wrap: wrap; row-gap: 6px; }
      .swap-hist-time { min-width: auto; order: -1; flex-basis: 100%; }
      .swap-hist-value { flex-basis: 100%; text-align: left; order: 5; margin-top: 2px; }
    }

    /* ── Motion / focus (spec §2.1, §11) ────────────────────── */
    .swap-spin { animation: swap-rotate 0.8s linear infinite; transform-origin: center; }
    @keyframes swap-rotate { to { transform: rotate(360deg); } }
    /* No focus box on any field — caret / border-within is the affordance. */
    .swap-overlay input:focus, .swap-overlay input:focus-visible,
    .swap-overlay select:focus, .swap-overlay textarea:focus { outline: none; box-shadow: none; }
    /* Keyboard focus ring: 1px teal 40% — buttons, links, tabs, toggles only. */
    .swap-overlay a:focus-visible,
    .swap-overlay button:focus-visible,
    .swap-overlay [role="tab"]:focus-visible,
    .swap-overlay input[type="checkbox"]:focus-visible {
      outline: 1px solid rgba(20,184,166,0.4); outline-offset: 2px; border-radius: 8px;
    }
    @media (prefers-reduced-motion: reduce) {
      .swap-spin { animation: none; }
      .swap-overlay { animation: none; }
    }

    /* ── Responsive (usable at 375px) ───────────────────────── */
    @media (max-width: 520px) {
      .swap-col { padding: 8px 14px 72px; }
      .swap-title { font-size: 26px; }
      .swap-amount-input { font-size: 28px; }
    }
    `}</style>
  );
}

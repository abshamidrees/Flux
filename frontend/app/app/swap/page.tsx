// app/app/swap/page.tsx
// Linkable, back-button-friendly Swap route. Renders the full-screen overlay
// above the app shell.

import { SwapOverlay } from "../../../components/swap/SwapOverlay";

export default function SwapPage() {
  return <SwapOverlay />;
}

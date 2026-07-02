import { redirect } from "next/navigation";

/** `/tradex` is superseded by `/markets` — the real Axon/TradeX gated token markets. */
export default function TradexRedirect() {
  redirect("/markets");
}

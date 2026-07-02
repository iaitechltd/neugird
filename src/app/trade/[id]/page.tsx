import { redirect } from "next/navigation";

/** `/trade/[id]` is superseded by `/market/[id]` — the real market detail page. */
export default async function TradeRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/market/${id}`);
}

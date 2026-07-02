/** GET /api/markets/[id]/stream — SSE change feed for the trading terminal.
 *
 *  Replaces client polling: the server watches the in-memory store and pushes
 *  small CHANGE SIGNALS; the client refetches through the existing shaped
 *  endpoints (chat) or applies the payload directly (price). Events:
 *    price → { price, ts }          (on any price move)
 *    chat  → { count, last }        (a new message landed — refetch the thread)
 *  Heartbeat comment every 20s keeps proxies from closing the stream.
 */

import { db, dbReady } from "@/lib/store";
import { Markets } from "@/lib/modules";

export const dynamic = "force-dynamic";

const POLL_MS = 1500;
const HEARTBEAT_MS = 20_000;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await dbReady;
  const market = Markets.getMarket(id);
  if (!market) return new Response("not_found", { status: 404 });
  const gridId = market.grid_id;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let lastPrice = NaN;
      let lastMsgCount = -1;
      let lastMsgId = "";
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { closed = true; }
      };

      const tick = () => {
        const m = Markets.getMarket(id);
        if (!m) return;
        const price = Markets.priceOf(m);
        if (price !== lastPrice) { lastPrice = price; send("price", { price, ts: Date.now() }); }
        const msgs = db.messages.filter((x) => x.grid_id === gridId);
        const newest = msgs[msgs.length - 1]?.message_id ?? "";
        if (msgs.length !== lastMsgCount || newest !== lastMsgId) {
          if (lastMsgCount !== -1) send("chat", { count: msgs.length, last: newest });
          lastMsgCount = msgs.length;
          lastMsgId = newest;
        }
      };

      controller.enqueue(enc.encode("retry: 3000\n\n"));
      tick();
      const iv = setInterval(tick, POLL_MS);
      const hb = setInterval(() => { if (!closed) try { controller.enqueue(enc.encode(": hb\n\n")); } catch { closed = true; } }, HEARTBEAT_MS);
      const cleanup = () => { closed = true; clearInterval(iv); clearInterval(hb); try { controller.close(); } catch { /* already closed */ } };
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

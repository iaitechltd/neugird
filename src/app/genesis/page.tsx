import { redirect } from "next/navigation";

/** `/genesis` is superseded by `/genesis/board` — the real reputation-gated funding board. */
export default function GenesisRedirect() {
  redirect("/genesis/board");
}

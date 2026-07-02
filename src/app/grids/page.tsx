import { redirect } from "next/navigation";

/** `/grids` is superseded by `/grids/explore` — the real Grid directory. */
export default function GridsRedirect() {
  redirect("/grids/explore");
}

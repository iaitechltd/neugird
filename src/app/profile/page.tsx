import { redirect } from "next/navigation";

/** `/profile` is superseded by `/me` — the real, data-backed profile + track record. */
export default function ProfileRedirect() {
  redirect("/me");
}

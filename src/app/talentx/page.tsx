import { redirect } from "next/navigation";

/** `/talentx` is superseded by `/talent` — the real talent directory. */
export default function TalentxRedirect() {
  redirect("/talent");
}

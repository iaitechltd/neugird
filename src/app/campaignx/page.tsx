import { redirect } from "next/navigation";

/** `/campaignx` is superseded by `/campaignx/board` — the real distribution-deals board. */
export default function CampaignxRedirect() {
  redirect("/campaignx/board");
}

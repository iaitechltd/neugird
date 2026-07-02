import { redirect } from "next/navigation";

/** `/campaignx/[id]` was a mock detail; deals live on the real `/campaignx/board`. */
export default async function CampaignxDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  await params; // dynamic route param (unused — no standalone deal page)
  redirect("/campaignx/board");
}

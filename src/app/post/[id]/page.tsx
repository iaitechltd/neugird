import { redirect } from "next/navigation";

/** `/post/[id]` was a mock social surface with no real backing — send to the command center. */
export default async function PostRedirect({ params }: { params: Promise<{ id: string }> }) {
  await params; // dynamic route param (unused — no real post entity yet)
  redirect("/home");
}

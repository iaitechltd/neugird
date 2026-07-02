import { redirect } from "next/navigation";

/** `/agents/studio` is superseded by `/agents` — create + manage real agents there. */
export default function AgentStudioRedirect() {
  redirect("/agents");
}

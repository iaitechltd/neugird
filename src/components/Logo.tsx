import Link from "next/link";
import NeuGridMark from "./NeuGridMark";

/** NeuGrid wordmark: grid-mesh mark + bold green wordmark. */
export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5">
      <NeuGridMark size={28} />
      <span className="text-base font-bold tracking-tight text-neon text-glow">NeuGrid</span>
    </Link>
  );
}

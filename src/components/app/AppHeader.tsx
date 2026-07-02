import Link from "next/link";
import Logo from "@/components/Logo";
import PulseWave from "./PulseWave";
import { Avatar, IconBell, IconButton, IconConnect, IconPlus, IconSearch } from "./ui";

/**
 * Global app header matching Figma node 1:1524.
 * Left: NeuGrid logo · Center: live Pulse score with EKG waves ·
 * Right: Start New, connect, search, notifications, profile chip.
 */
export default function AppHeader({ pulse = 872, user = "Neo.Grid" }: { pulse?: number; user?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="relative grid h-16 grid-cols-[1fr_auto_1fr] items-center px-5">
        {/* Left: logo */}
        <div className="justify-self-start">
          <Logo href="/home" />
        </div>

        {/* Center: pulse score */}
        <div className="hidden items-center gap-3 justify-self-center md:flex">
          <PulseWave flip width={180} />
          <span className="mono text-3xl font-bold text-neon text-glow tabular-nums">{pulse}</span>
          <PulseWave width={180} />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2.5 justify-self-end">
          <button className="ng-btn ng-btn-primary hidden h-9 px-3.5 text-xs sm:inline-flex">
            <IconPlus className="h-4 w-4" /> Start New
          </button>
          <IconButton label="Connect">
            <IconConnect className="h-4 w-4" />
          </IconButton>
          <IconButton label="Search">
            <IconSearch className="h-4 w-4" />
          </IconButton>
          <IconButton label="Notifications" badge={3}>
            <IconBell className="h-4 w-4" />
          </IconButton>
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded border border-line py-1 pl-1 pr-2.5 transition hover:border-neon/50"
          >
            <Avatar name={user} size={28} verified />
            <span className="mono hidden text-sm text-ink sm:inline">{user}</span>
          </Link>
        </div>
      </div>
      {/* bottom glow line */}
      <div className="ng-hairline" />
    </header>
  );
}

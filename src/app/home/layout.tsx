import type { ReactNode } from "react";

export const metadata = { title: "Home — NeuGrid" };

export default function HomeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

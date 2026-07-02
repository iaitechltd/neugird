/* eslint-disable @next/next/no-img-element */

/** NeuGrid logo mark — the real green grid-mesh asset (from Figma). */
export default function NeuGridMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/neugrid-logo.png"
      alt="NeuGrid"
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

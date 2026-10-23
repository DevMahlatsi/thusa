import Image from "next/image";

// Brand assets live in public/thusa-logo/. SVGs are served as-is (next/image skips optimising them).
export function Wordmark({ height = 28 }: { height?: number }) {
  // viewBox 5453.3 x 1597.9
  const width = Math.round((height * 5453.3) / 1597.9);
  return <Image src="/thusa-logo/thusa-wordmark.svg" alt="Thusa" width={width} height={height} priority />;
}

export function BrandIcon({ size = 32 }: { size?: number }) {
  return <Image src="/thusa-logo/thusa-icon.svg" alt="" width={size} height={size} aria-hidden="true" />;
}

export function BrandLogo({ className = "", decorative = false }: { className?: string; decorative?: boolean }) {
  return <img className={className} src="/api/branding/logo" alt={decorative ? "" : "Aviator Brewing Company"} aria-hidden={decorative || undefined} />;
}

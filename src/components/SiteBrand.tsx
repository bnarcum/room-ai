import Image from "next/image";
import Link from "next/link";

const defaultImageClass =
  "h-24 w-auto sm:h-[6.375rem] md:h-[7.5rem] lg:h-36";

const defaultSizes =
  "(min-width: 1024px) 42rem, (min-width: 768px) 36rem, (min-width: 640px) 30rem, 24rem";

type SiteBrandLinkProps = {
  className?: string;
  imageClassName?: string;
  sizes?: string;
};

/**
 * Site identity link — large, top-left, same surface as the page (Amazon-style;
 * not a separate header strip). Pass `imageClassName` when embedding beside a
 * short label (e.g. home hero row).
 */
export function SiteBrandLink({
  className = "",
  imageClassName = defaultImageClass,
  sizes = defaultSizes,
}: SiteBrandLinkProps) {
  return (
    <Link
      href="/"
      className={`inline-flex shrink-0 self-start outline-none focus-visible:ring-2 focus-visible:ring-[hsl(277_90%_65%/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220_32%_7%)] rounded-sm ${className}`}
    >
      <Image
        src="/snaproom-logo.png"
        alt="SnapRoom"
        width={612}
        height={408}
        className={imageClassName}
        priority
        sizes={sizes}
      />
    </Link>
  );
}

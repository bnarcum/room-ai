import Image from "next/image";
import Link from "next/link";

/**
 * Site identity link — large, top-left, same surface as the page (Amazon-style;
 * not a separate header strip).
 */
export function SiteBrandLink() {
  return (
    <Link
      href="/"
      className="inline-flex shrink-0 self-start outline-none focus-visible:ring-2 focus-visible:ring-[hsl(277_90%_65%/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220_32%_7%)] rounded-sm"
    >
      <Image
        src="/snaproom-logo.png"
        alt="SnapRoom"
        width={612}
        height={408}
        className="h-16 w-auto sm:h-[4.25rem] md:h-20 lg:h-24"
        priority
        sizes="(min-width: 1024px) 28rem, (min-width: 768px) 24rem, (min-width: 640px) 20rem, 16rem"
      />
    </Link>
  );
}

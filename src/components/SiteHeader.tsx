import Image from "next/image";
import Link from "next/link";

/**
 * Global nav with SnapRoom logo (for dark backgrounds; asset is designed for near-black).
 */
export function SiteHeader() {
  return (
    <header className="border-b border-[hsl(217_33%_25%)] bg-[hsl(222_47%_8%/0.9)]">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[hsl(277_90%_65%/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(222_47%_8%)]"
        >
          <Image
            src="/snaproom-logo.png"
            alt="SnapRoom"
            width={200}
            height={48}
            className="h-8 w-auto sm:h-9"
            priority
          />
        </Link>
      </div>
    </header>
  );
}

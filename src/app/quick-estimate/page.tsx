import { redirect } from "next/navigation";

/** Quick Estimate is no longer a separate product — same photo-first analyze loop. */
export default function QuickEstimateRedirectPage() {
  redirect("/");
}

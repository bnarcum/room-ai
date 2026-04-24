import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guided wizard",
  description:
    "Step-by-step room photo analysis with the same results as the classic form.",
};

export default function WizardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

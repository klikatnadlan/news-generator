import { Suspense } from "react";
import { SiteNav } from "@/components/site-nav";
import { AskPanel } from "@/components/ask-panel";

export const metadata = { title: "שאל את לידרפיד" };

// `?q=` lets the home-page hero hand its question straight to this page, so a
// question typed there lands here already answering instead of asking twice.
export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <>
      <SiteNav />
      <Suspense>
        <AskPanel initialQuestion={(q || "").slice(0, 300)} />
      </Suspense>
    </>
  );
}

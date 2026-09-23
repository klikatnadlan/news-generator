import { Suspense } from "react";
import { SiteNav } from "@/components/site-nav";
import { AskPanel } from "@/components/ask-panel";

export const metadata = { title: "שאל את לידרפיד" };

// `?q=` lets the home-page hero hand its question straight to this page, so a
// question typed there lands here already answering instead of asking twice.
// `?story=` comes from "💬 שאל על זה" on a news card: that item is the subject.
export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; story?: string }>;
}) {
  const { q, story } = await searchParams;
  return (
    <>
      <SiteNav />
      <Suspense>
        <AskPanel initialQuestion={(q || "").slice(0, 300)} storyId={(story || "").slice(0, 64)} />
      </Suspense>
    </>
  );
}

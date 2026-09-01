import { SiteNav } from "@/components/site-nav";
import { AskPanel } from "@/components/ask-panel";

export const metadata = { title: "שאל את לידרפיד" };

export default function AskPage() {
  return (
    <>
      <SiteNav />
      <AskPanel />
    </>
  );
}

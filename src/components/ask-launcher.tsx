"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AskPanel } from "@/components/ask-panel";

/**
 * Floating "ask" button, present on every screen, opening a drawer in place.
 *
 * It deliberately does NOT navigate to /ask. The point is to answer a question
 * without losing your place: you are reading Haifa's city page, you ask
 * something, you read the answer, you close it and you are still on Haifa.
 * Navigating away would make this a shortcut; staying makes it a tool.
 *
 * z-index note: the home and headlines pages have their own fixed bottom action
 * bars at z-50 that appear while items are selected. This sits BELOW them at
 * z-40 on purpose — during selection you are mid-task, and a chat bubble
 * stacked over the toolbar would be in the way rather than available.
 */
export function AskLauncher() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);

  // Redundant on the page that IS the ask box.
  const hidden = pathname.startsWith("/ask");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  // Close on navigation, so the drawer never survives into another screen.
  useEffect(() => { setOpen(false); }, [pathname]);

  if (hidden) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="שאל את לידרפיד"
          className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full pl-4 pr-3.5 h-12 text-white transition-transform hover:scale-105 active:scale-95"
          style={{ background: "#dc2626", boxShadow: "0 6px 20px rgba(220,38,38,0.35)" }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <span className="text-[12.5px] font-bold hidden sm:inline">שאל</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[90]" dir="rtl">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(8,10,14,0.5)", backdropFilter: "blur(2px)" }}
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="שאל את לידרפיד"
            className="absolute bottom-0 left-0 right-0 sm:right-auto sm:left-5 sm:bottom-5 sm:w-[440px] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden lf-animate"
            style={{ background: "var(--lf-bg, #f8f9fb)", maxHeight: "min(86vh, 720px)", boxShadow: "0 12px 48px rgba(0,0,0,0.3)" }}
          >
            <div
              className="flex items-center gap-2 px-4 h-12 shrink-0"
              style={{ background: "linear-gradient(165deg, #0f1419 0%, #161e2b 55%, #1a2335 100%)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-[13px] font-extrabold text-white" style={{ fontFamily: "DM Sans, system-ui" }}>
                שאל את לידרפיד
              </span>
              <a
                href="/ask"
                className="mr-auto text-[10.5px] hover:underline"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                פתח במסך מלא
              </a>
              <button
                onClick={() => setOpen(false)}
                aria-label="סגור"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[15px] hover:bg-white/10"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto">
              <AskPanel embedded />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

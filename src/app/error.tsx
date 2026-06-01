"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Global error boundary. Caught by Next.js whenever an unhandled error
 * happens on the client. The investor demo should never see a blank
 * screen — this gives a recoverable, on-brand fallback.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log so Vercel captures the stack
    console.error("[LeaderFeed error boundary]", error);
  }, [error]);

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--lf-bg, #f8f9fb)" }}
    >
      <div className="lf-card max-w-md w-full p-6 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <div>
          <h1 className="text-[18px] font-bold mb-1" style={{ color: "#0f1419" }}>
            משהו השתבש
          </h1>
          <p className="text-[13px] leading-[1.5]" style={{ color: "#6b7280" }}>
            תקלה רגעית. אפשר לנסות שוב או לחזור למסך הראשי.
            <br />
            אם זה חוזר על עצמו — תכתבו לבן בוואטסאפ.
          </p>
        </div>
        <div className="flex gap-2 justify-center pt-1">
          <button
            onClick={reset}
            className="lf-btn lf-btn-dark text-[13px] !py-2 !px-4"
          >
            🔄 נסה שוב
          </button>
          <Link href="/" className="lf-btn lf-btn-outline text-[13px] !py-2 !px-4">
            ← למסך הראשי
          </Link>
        </div>
        {error?.digest && (
          <p className="text-[10px]" style={{ color: "#9ca3af" }}>
            קוד שגיאה: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--lf-bg, #f8f9fb)" }}
    >
      <div className="text-center space-y-4 max-w-md">
        <div className="text-5xl">🧭</div>
        <h1 className="text-[64px] font-black leading-none" style={{ color: "#0f1419", fontFamily: "DM Sans, system-ui" }}>
          404
        </h1>
        <p className="text-[15px] font-bold" style={{ color: "#0f1419" }}>
          הדף הזה לא קיים בלידרפיד
        </p>
        <p className="text-[13px] leading-[1.5]" style={{ color: "#6b7280" }}>
          אולי הקישור הזה ישן? או שהיתה פה טעות הקלדה?
        </p>
        <Link
          href="/"
          className="inline-block lf-btn lf-btn-dark text-[13px] !py-2.5 !px-5 mt-2"
        >
          ← חזרה למסך הראשי
        </Link>
      </div>
    </div>
  );
}

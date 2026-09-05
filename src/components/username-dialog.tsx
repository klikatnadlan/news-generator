"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NAME_KEY = "news-gen-username";
// Session-scoped on purpose: a skip hides the dialog for this tab (reloads and
// page changes included), but a brand-new visit gets one more chance to opt in.
// The name is pure attribution — the "נשלח ע״י" column in /history — and every
// consumer is already null-safe, so nothing needs it to be REQUIRED. Before
// 2026-09-03 this dialog was the first thing every new visitor saw, with no
// close control and no Escape on mobile: a form standing between a client and
// the product.
const SKIP_KEY = "news-gen-username-skipped";

function rememberSkip() {
  try { sessionStorage.setItem(SKIP_KEY, "1"); } catch { /* private mode etc. */ }
}

export function UsernameDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NAME_KEY);
      const skipped = sessionStorage.getItem(SKIP_KEY);
      if (!stored && !skipped) {
        setOpen(true);
      }
    } catch { /* storage unavailable: stay closed, never block the page */ }
  }, []);

  // Escape closes (same idiom as the SiteNav menu).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { rememberSkip(); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSave = () => {
    if (name.trim()) {
      try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* ignore */ }
      setOpen(false);
    }
  };

  const handleSkip = () => {
    rememberSkip();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onClose={handleSkip} role="dialog" aria-modal="true" aria-labelledby="username-dialog-title">
        <DialogHeader>
          <DialogTitle id="username-dialog-title" className="text-2xl">
            ברוכים הבאים! 👋
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed mt-2">
            לידרפיד עוקב אחרי חדשות הנדל״ן בזמן אמת. אפשר לקרוא, לחפש בארכיון ולשאול שאלות בלי להזדהות.
            <br />
            איך לקרוא לך? לא חובה. השם משמש רק לסימון מי שיתף נוסח.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="font-medium">שם</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="השם שלך..."
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
              className="text-base py-3"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            className="w-full sm:w-auto"
          >
            לא עכשיו
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            className="w-full sm:w-auto text-white font-bold"
            style={{ backgroundColor: "#1d3557" }}
          >
            המשך
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

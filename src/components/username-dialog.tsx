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

export function UsernameDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("news-gen-username");
    if (!stored) {
      setOpen(true);
    }
  }, []);

  const handleSave = () => {
    if (name.trim()) {
      localStorage.setItem("news-gen-username", name.trim());
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle className="text-xl">ברוכים הבאים למחולל הכותרות!</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            הכלי סורק חדשות נדל״ן, מדרג אותן, ומייצר נוסחים מוכנים לשיתוף בוואטסאפ.
            <br />
            הכנס את שמך כדי שנדע מי שלח כל הודעה.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">שם</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="השם שלך..."
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!name.trim()}>
            כניסה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

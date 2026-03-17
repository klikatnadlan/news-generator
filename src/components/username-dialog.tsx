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
          <DialogTitle className="text-2xl">
            ברוכים הבאים! 👋
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed mt-2">
            המערכת מייצרת כותרות ופרשנות יומית לוואטסאפ.
            <br />
            מה השם שלך?
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
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            className="w-full sm:w-auto text-white font-bold"
            style={{ backgroundColor: "#1d3557" }}
          >
            כניסה למערכת
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

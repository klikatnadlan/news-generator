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
          <DialogTitle>מי אתה?</DialogTitle>
          <DialogDescription>שם המשתמש ישמר לצורך מעקב שליחות</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">שם</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="בן סולומון"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

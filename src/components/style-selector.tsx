"use client";

interface StyleSelectorProps {
  value: "short" | "regular" | "commentary";
  onChange: (style: "short" | "regular" | "commentary") => void;
}

const styles = [
  { key: "short" as const, label: "קצר מאוד" },
  { key: "regular" as const, label: "רגיל" },
  { key: "commentary" as const, label: "פרשני" },
];

export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  return (
    <div className="flex gap-2">
      {styles.map((s) => (
        <button
          key={s.key}
          onClick={() => onChange(s.key)}
          className={`px-3 py-1 rounded-md text-sm border transition-colors ${
            value === s.key
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border hover:bg-accent"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

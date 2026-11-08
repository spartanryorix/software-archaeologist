import { useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Accessible tablist with Left/Right + Home/End keyboard navigation. */
export function Tabs({ items, value, onChange, className }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function focusTab(index: number) {
    const idx = (index + items.length) % items.length;
    const item = items[idx];
    if (item.disabled) return focusTab(index + (index < 0 ? 1 : -1));
    onChange(item.id);
    refs.current[item.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn("flex items-center gap-1 overflow-x-auto", className)}
    >
      {items.map((item, i) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[item.id] = el;
            }}
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={active}
            aria-controls={`panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                focusTab(i + 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                focusTab(i - 1);
              } else if (e.key === "Home") {
                e.preventDefault();
                focusTab(0);
              } else if (e.key === "End") {
                e.preventDefault();
                focusTab(items.length - 1);
              }
            }}
            className={cn(
              "relative inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active ? "bg-raised text-fg" : "text-muted hover:bg-raised/60 hover:text-fg",
              item.disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {item.icon && <span aria-hidden="true" className="[&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>}
            {item.label}
            {active && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-px bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

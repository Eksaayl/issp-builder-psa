"use client";

import {
  categoriesForClass,
  categoryById,
  categoryName,
  type ExpenseClass,
} from "@/lib/expense-categories";
import { cn } from "@/lib/utils";

/**
 * Fixed picker for the 30 DICT handout expense categories, filtered to the
 * row's expense class (Capital Outlay rows see only the 5 CO categories; MOOE
 * rows see the 25 MOOE ones). Replaces the old UACS code combobox — the
 * selected id is stored on the line item (`categoryId`).
 */
export function CategorySelect({
  value,
  onChange,
  expenseClass,
  className,
  ariaLabel = "Expense category",
  placeholder = "Select a category…",
}: {
  value: string;
  onChange: (categoryId: string) => void;
  expenseClass: ExpenseClass;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const categories = categoriesForClass(expenseClass);
  const groups = [...new Set(categories.map((c) => c.group))];
  // Keep a stored value selectable even when it is outside this class or an
  // unknown id — never silently drop what a file carries.
  const orphan =
    value && !categories.some((c) => c.id === value) ? (
      <option value={value}>{categoryName(value)}</option>
    ) : null;

  return (
    <select
      aria-label={ariaLabel}
      className={cn(
        "w-full rounded-lg border border-border bg-card px-2.5 py-1 text-sm text-foreground outline-none hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer",
        className
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {orphan}
      {groups.map((group) => (
        <optgroup key={group} label={group}>
          {categories
            .filter((c) => c.group === group)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Amber inline flag shown wherever a line item has no category set. */
export function CategoryMissing({ className }: { className?: string }) {
  return (
    <span className={cn("text-warning font-medium", className)}>Set category</span>
  );
}

/** Convenience: resolve a stored id for display (name, or flag when unset). */
export function categoryDisplay(id: string): string {
  return categoryById(id) ? categoryName(id) : "";
}

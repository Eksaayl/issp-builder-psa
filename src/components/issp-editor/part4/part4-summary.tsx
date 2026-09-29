"use client";

import { Info } from "lucide-react";
import { cn, php } from "@/lib/utils";
import { SectionShell } from "@/components/editor/section-shell";
import type { SummaryRow, CategoryRow, Part4SummaryData } from "./part4-aggregations";

export type { SummaryRow, CategoryRow, Part4SummaryData };

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Summary Table ─────────────────────────────────────────────────────────────

function SummaryTable({
  title,
  subtitle,
  rows,
  yearLabels,
}: {
  title: string;
  subtitle: string;
  rows: SummaryRow[];
  yearLabels: [string, string, string];
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-2.5 font-medium w-1/3">Category</th>
              <th className="text-right px-4 py-2.5 font-medium">{yearLabels[0]}</th>
              <th className="text-right px-4 py-2.5 font-medium">{yearLabels[1]}</th>
              <th className="text-right px-4 py-2.5 font-medium">{yearLabels[2]}</th>
              <th className="text-right px-4 py-2.5 font-medium bg-primary/5">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b last:border-0",
                  row.isTotal
                    ? "bg-muted/30 font-semibold"
                    : "hover:bg-muted/20"
                )}
              >
                <td className="px-4 py-2.5">{row.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {row.year1 > 0 || row.isTotal ? php(row.year1) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {row.year2 > 0 || row.isTotal ? php(row.year2) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {row.year3 > 0 || row.isTotal ? php(row.year3) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={cn("px-4 py-2.5 text-right tabular-nums", row.isTotal ? "bg-primary/5" : "bg-muted/10")}>
                  {php(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Expense Category Table (B.4) ─────────────────────────────────────────────

function CategoryTable({
  rows,
  yearLabels,
}: {
  rows: CategoryRow[];
  yearLabels: [string, string, string];
}) {
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const y1 = rows.reduce((s, r) => s + r.year1, 0);
  const y2 = rows.reduce((s, r) => s + r.year2, 0);
  const y3 = rows.reduce((s, r) => s + r.year3, 0);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">B.4 Object of Expenditure</h2>
        <p className="text-xs text-muted-foreground">
          Costs mapped to the 30 official DICT expense categories, across all projects and years
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-2.5 font-medium">Expense Category</th>
              <th className="text-right px-4 py-2.5 font-medium">{yearLabels[0]}</th>
              <th className="text-right px-4 py-2.5 font-medium">{yearLabels[1]}</th>
              <th className="text-right px-4 py-2.5 font-medium">{yearLabels[2]}</th>
              <th className="text-right px-4 py-2.5 font-medium bg-primary/5">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  No line items with an expense category found. Add items in the Year 1–3
                  breakdowns and pick their category.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.categoryId || "uncategorized"} className="border-b last:border-0 hover:bg-muted/20">
                  <td className={cn("px-4 py-2.5", !row.categoryId && "text-warning")}>{row.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.year1 > 0 ? php(row.year1) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.year2 > 0 ? php(row.year2) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.year3 > 0 ? php(row.year3) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums bg-muted/10">{php(row.total)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-muted/30 font-semibold border-t">
                <td className="px-4 py-2.5">Grand Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{php(y1)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{php(y2)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{php(y3)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums bg-primary/5">{php(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Auto-Calculated Banner ────────────────────────────────────────────────────

function AutoCalculatedBanner() {
  return (
    <div className="sticky top-[41px] z-[9] -mx-4 -mt-6 flex items-center gap-2 border-b border-info-border bg-info-bg px-4 py-2 text-xs text-info md:-mx-8 md:px-8">
      <Info className="h-3.5 w-3.5 shrink-0" />
      <p>
        This page is just for your review — totals are auto-calculated based on your Year 1 to
        Year 3 inputs. Review this section for accuracy before exporting your ISSP.
      </p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function Part4Summary({
  data,
}: {
  data: Part4SummaryData;
}) {
  return (
    <SectionShell
      sectionId="part4/summary"
      title="Summary of Investments"
      description="Consolidated 3-year budget view across all ICT expenditure categories."
      hideMarkDone
    >

      <AutoCalculatedBanner />

      <SummaryTable
        title="B.1 General Summary"
        subtitle="Total ICT investments grouped by functional category"
        rows={data.b1}
        yearLabels={data.yearLabels}
      />

      <SummaryTable
        title="B.2 Fund Source"
        subtitle="Total investments grouped by financial origin"
        rows={data.b2}
        yearLabels={data.yearLabels}
      />

      <SummaryTable
        title="B.3 Statement of Expenditure"
        subtitle="Budget classified by nature of expense per DBM guidelines"
        rows={data.b3}
        yearLabels={data.yearLabels}
      />

      <CategoryTable rows={data.b4} yearLabels={data.yearLabels} />
    </SectionShell>
  );
}

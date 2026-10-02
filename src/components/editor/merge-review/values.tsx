"use client";

import { diffWords } from "diff";
import type { CellDiff } from "@/lib/scope/merge-review";
import { cellLabel, EMPTY, formatValue, htmlToPlainText, lineItemCost, signedPhp } from "./format";

/** The two-column frame every before/after value uses. */
export function MasterIncoming({ master, incoming }: { master: React.ReactNode; incoming: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Master</p>
        <div className="mt-0.5 text-xs text-foreground break-words">{master}</div>
      </div>
      <div className="min-w-0 rounded-md border border-border bg-card px-2.5 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Incoming</p>
        <div className="mt-0.5 text-xs text-foreground break-words">{incoming}</div>
      </div>
    </div>
  );
}

/**
 * Text before/after with word-level highlights: removed words are struck
 * through on the master side, added words are highlighted on the incoming
 * side. Rich text is compared as plain text; a formatting-only edit says so.
 */
export function TextDiff({ before, after, rich }: { before: unknown; after: unknown; rich?: boolean }) {
  const toText = (v: unknown) => (typeof v === "string" ? (rich ? htmlToPlainText(v) : v) : "");
  const a = toText(before);
  const b = toText(after);
  if (rich && a === b) {
    return (
      <div className="space-y-1">
        <p className="text-[11px] italic text-muted-foreground">Formatting changed (bold, italics, or lists) — the words are the same.</p>
        <MasterIncoming master={a || EMPTY} incoming={b || EMPTY} />
      </div>
    );
  }
  const parts = diffWords(a, b);
  return (
    <MasterIncoming
      master={
        a ? (
          <span className="whitespace-pre-wrap">
            {parts.filter((p) => !p.added).map((p, i) =>
              p.removed ? (
                <del key={i} className="rounded-sm bg-destructive/15 text-destructive decoration-destructive/60">{p.value}</del>
              ) : (
                <span key={i}>{p.value}</span>
              )
            )}
          </span>
        ) : (
          <span className="italic text-muted-foreground">{EMPTY}</span>
        )
      }
      incoming={
        b ? (
          <span className="whitespace-pre-wrap">
            {parts.filter((p) => !p.removed).map((p, i) =>
              p.added ? (
                <ins key={i} className="rounded-sm bg-success/15 text-success no-underline">{p.value}</ins>
              ) : (
                <span key={i}>{p.value}</span>
              )
            )}
          </span>
        ) : (
          <span className="italic text-muted-foreground">{EMPTY}</span>
        )
      }
    />
  );
}

const isImage = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");

function Thumb({ src }: { src: unknown }) {
  if (typeof src !== "string" || !src) return <span className="italic text-muted-foreground">No image</span>;
  // eslint-disable-next-line @next/next/no-img-element -- data URL preview, not an optimizable asset
  return <img src={src} alt="" className="max-h-28 w-auto rounded border border-border bg-white object-contain" />;
}

export function ImagePair({ before, after }: { before: unknown; after: unknown }) {
  return <MasterIncoming master={<Thumb src={before} />} incoming={<Thumb src={after} />} />;
}

/** The changed sub-items of an object or row: label, master value, incoming value. */
export function CellTable({ fieldKey, cells }: { fieldKey: string; cells: CellDiff[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-1 font-semibold w-[34%]">Item</th>
            <th className="px-2 py-1 font-semibold">Master</th>
            <th className="px-2 py-1 font-semibold">Incoming</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((c) => {
            const key = String(c.path[c.path.length - 1] ?? "");
            return (
              <tr key={c.path.join(".")} className="border-t border-border align-top">
                <td className="px-2 py-1 font-medium text-muted-foreground">{cellLabel(fieldKey, c)}</td>
                <td className="px-2 py-1 break-words text-destructive/90">{isImage(c.before) ? <Thumb src={c.before} /> : formatValue(c.before, key)}</td>
                <td className="px-2 py-1 break-words text-success">{isImage(c.after) ? <Thumb src={c.after} /> : formatValue(c.after, key)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A whole row in words — for added and removed rows (with its image, for a diagram row). */
export function RowSummary({ row }: { row: unknown }) {
  const image = typeof row === "object" && row !== null ? Object.values(row).find(isImage) : undefined;
  return (
    <div className="space-y-1">
      {image && <Thumb src={image} />}
      <p className="text-xs text-foreground line-clamp-3 break-words">{formatValue(row)}</p>
    </div>
  );
}

/** A Part IV line item's cost before → after, with the signed difference. */
export function LineItemCostLine({ before, after }: { before: unknown; after: unknown }) {
  const b = lineItemCost(before);
  const a = lineItemCost(after);
  if (!b && !a) return null;
  const delta = (a?.total ?? 0) - (b?.total ?? 0);
  return (
    <p className="text-xs tabular-nums text-muted-foreground">
      {b ? <span>{b.text}</span> : <span className="italic">not in the master</span>}
      <span className="px-1.5">→</span>
      {a ? <span className="text-foreground">{a.text}</span> : <span className="italic">removed</span>}
      {delta !== 0 && (
        <span className={`ml-2 font-semibold ${delta > 0 ? "text-warning" : "text-success"}`}>({signedPhp(delta)})</span>
      )}
    </p>
  );
}

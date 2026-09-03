import { useMemo } from "react";
import { useIsspStore } from "@/lib/store";
import { resolveScope, type ResolvedScope } from "@/lib/scope/paths";

/**
 * Returns the resolved edit scope for the currently loaded doc, or `null`
 * when the doc is unscoped (no `editScope`). Consumers pass the result to
 * `isSectionVisible` / `isFieldEditable`, both of which treat `null` as
 * "everything visible/editable" — so an unscoped doc renders exactly as it
 * did before scoped mode existed.
 */
export function useResolvedScope(): ResolvedScope | null {
  const { doc } = useIsspStore();
  const editScope = doc?.editScope;
  return useMemo(
    () => (editScope ? resolveScope(editScope.editable) : null),
    [editScope]
  );
}

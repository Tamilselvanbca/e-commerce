// Category tree helpers: the API returns a flat list with `parentId`.
import type { Category } from "@/lib/types";

export type CategoryNode = { category: Category; depth: number };

const byOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/**
 * Depth-first flattening (parents before children, siblings by sortOrder).
 * Orphans (parent missing) are treated as roots; cycles are cut.
 */
export function flattenCategories(items: Category[]): CategoryNode[] {
  const ids = new Set(items.map((c) => c.id));
  const children = new Map<string | null, Category[]>();
  for (const c of items) {
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(c);
    children.set(parent, list);
  }
  const out: CategoryNode[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const c of [...(children.get(parent) ?? [])].sort(byOrder)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ category: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  // Anything unreachable (cycle) goes last as a root.
  for (const c of items) if (!seen.has(c.id)) out.push({ category: c, depth: 0 });
  return out;
}

/** Options for a <select>, indented by depth. */
export function categoryOptions(items: Category[]): (CategoryNode & { label: string })[] {
  return flattenCategories(items).map((n) => ({
    ...n,
    label: `${"— ".repeat(n.depth)}${n.category.name}${n.category.isActive === false ? " (inactive)" : ""}`,
  }));
}

/** The ids of `id` and all of its descendants. */
export function selfAndDescendants(items: Category[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of items) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

export interface NavigationItem {
  key: string;
  label: string;
  href: string;
  description?: string;
  disabled?: boolean;
  external?: boolean;
  /** Sub-module (user 2026-11-09): shown indented right under this parent item; at top level if the parent is hidden. */
  parent?: string;
}

export interface NavigationGroup {
  key: string;
  label?: string;
  dividerBefore?: boolean;
  items: readonly NavigationItem[];
}

export function findNavigationItem(
  groups: readonly NavigationGroup[],
  key: string,
): NavigationItem | undefined {
  for (const group of groups) {
    const item = group.items.find((candidate) => candidate.key === key);
    if (item) return item;
  }
  return undefined;
}

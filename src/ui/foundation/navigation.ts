export interface NavigationItem {
  key: string;
  label: string;
  href: string;
  description?: string;
  disabled?: boolean;
  external?: boolean;
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

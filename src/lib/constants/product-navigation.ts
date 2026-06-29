export const PRIMARY_NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/create", label: "Create" },
  { href: "/drafts", label: "Drafts" },
  { href: "/#documentation", label: "Documentation" },
] as const;

export function isPrimaryNavLinkActive(pathname: string, href: string): boolean {
  const path = href.split("#")[0] || "/";

  if (path === "/") {
    return pathname === "/";
  }

  return pathname === path || pathname.startsWith(`${path}/`);
}

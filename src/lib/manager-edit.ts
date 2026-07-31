export function managerEditHref(section: string, id: string, type?: string) {
  const returnTo = window.location.pathname + window.location.search + window.location.hash;
  const params = new URLSearchParams({ id, returnTo });
  if (type) params.set("type", type);
  return "/manager/" + section + "/edit?" + params.toString();
}

export function returnFromManagerEdit(returnTo: string | undefined, fallback: string) {
  window.location.assign(returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : fallback);
}

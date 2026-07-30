import { SiteFooterClient } from "@/components/site-footer-client";
import { getAllLocations } from "@/lib/managed-locations";

export async function SiteFooter() {
  const locations = await getAllLocations();
  return <SiteFooterClient locations={locations} />;
}

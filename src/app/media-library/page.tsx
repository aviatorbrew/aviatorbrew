import type { Metadata } from "next";
import { MenuLibraryClient } from "@/components/menu-library-client";

export const metadata: Metadata = {
  title: "Menu Library",
  description: "Secure Aviator operations menu uploads.",
  robots: { index: false, follow: false },
};

export default function MediaLibraryPage() {
  return <MenuLibraryClient />;
}

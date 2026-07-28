import { notFound } from "next/navigation";
import { ManagerPortal } from "@/components/manager-portal";
import { isManagerSection } from "@/lib/manager-sections";

export const dynamic = "force-dynamic";

export default async function ManagerSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isManagerSection(section) || section === "overview") notFound();
  return <ManagerPortal section={section} />;
}

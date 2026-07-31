import { notFound } from "next/navigation";
import { ManagerPortal } from "@/components/manager-portal";
import { isManagerSection } from "@/lib/manager-sections";

export const dynamic = "force-dynamic";

export default async function ManagerEditPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ id?: string; type?: string; returnTo?: string }> }) {
  const { section } = await params;
  const query = await searchParams;
  if (!isManagerSection(section) || section === "overview" || !query.id) notFound();
  const returnTo = query.returnTo && query.returnTo.startsWith("/") && !query.returnTo.startsWith("//") ? query.returnTo : "/manager/" + section;
  return <ManagerPortal section={section} editId={query.id} editType={query.type} returnTo={returnTo} />;
}

import { createHash } from "node:crypto";
import { getPrivateEventSettings } from "@/lib/private-event-settings";
import { cateringMenuPdf } from "@/lib/event-documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){const {catering}=await getPrivateEventSettings();const revision='Menu '+createHash('sha256').update(JSON.stringify(catering)).digest('hex').slice(0,8);return new Response(new Uint8Array(await cateringMenuPdf(catering,revision)),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="aviator-catering-menu.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}

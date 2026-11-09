import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import {foodCostEtag,saveManagerFoodCosts} from '@/lib/food-cost-updates';
import { getPrivateEventSettings, setPrivateEventSettings } from "@/lib/private-event-settings";

export const runtime = "nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0"};

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401,headers });
  const settings=await getPrivateEventSettings();return NextResponse.json(settings,{headers:{...headers,ETag:foodCostEtag(settings.foodCosts)}});
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401,headers });
  try {
    const body = await request.json() as { foodCosts?:unknown; production?:unknown; catering?: unknown; policyText?: unknown; policyVersion?: unknown; bookingFeeCents?: unknown; aviatorWayCopy?: unknown; aviatorWayCopyText?: unknown; inquiryCopy?: unknown; inquiryCopyText?: unknown };
    if(body.foodCosts!==undefined&&Object.keys(body).every(k=>k==='foodCosts')){await saveManagerFoodCosts(body.foodCosts,request.headers.get('if-match'));const settings=await getPrivateEventSettings();return NextResponse.json({ok:true,...settings},{headers:{...headers,ETag:foodCostEtag(settings.foodCosts)}});}
    const input = { foodCosts:body.foodCosts, production:body.production, catering: body.catering, policyText: body.policyText, policyVersion: body.policyVersion,
      ...(body.bookingFeeCents === undefined ? {} : { bookingFeeCents: Number(body.bookingFeeCents) }),
      ...(body.aviatorWayCopyText === undefined ? {} : { aviatorWayCopyText: body.aviatorWayCopyText }),
      ...(body.aviatorWayCopy === undefined || body.aviatorWayCopyText !== undefined ? {} : { aviatorWayCopy: body.aviatorWayCopy }),
      ...(body.inquiryCopyText === undefined ? {} : { inquiryCopyText: body.inquiryCopyText }),
      ...(body.inquiryCopy === undefined || body.inquiryCopyText !== undefined ? {} : { inquiryCopy: body.inquiryCopy }),
    };
    return NextResponse.json({ ok: true, ...(await setPrivateEventSettings(input)) },{headers});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save private event settings." }, { status: 400,headers });
  }
}

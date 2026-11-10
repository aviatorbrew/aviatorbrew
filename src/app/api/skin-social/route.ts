import {NextRequest,NextResponse} from 'next/server';
import {publicSkinSocial,mutateSkinSocial,SkinSocialError} from '@/lib/skin-social';
export const runtime='nodejs';export const dynamic='force-dynamic';const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
const fail=(e:unknown)=>NextResponse.json({error:e instanceof SyntaxError?'Enter valid comment data.':e instanceof SkinSocialError?e.message:'Artwork comments are temporarily unavailable.'},{status:e instanceof SyntaxError?400:e instanceof SkinSocialError?e.status:503,headers});
export async function GET(r:NextRequest){try{const {data,cookie}=await publicSkinSocial(r),result=NextResponse.json(data,{headers});result.cookies.set(cookie);return result;}catch(e){return fail(e);}}
export async function POST(r:NextRequest){try{const raw=await r.text();if(raw.length>12000)throw new SkinSocialError('The comment is too long.',413);return NextResponse.json(await mutateSkinSocial(r,JSON.parse(raw)),{headers});}catch(e){return fail(e);}}

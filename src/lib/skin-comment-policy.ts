export const skinCommentPolicyVersion='v1.0';
export type CommentStatus='pending'|'approved'|'removed';
export const skinCommentRules='Comments are reviewed before appearing. No profanity, advertising, harassment, or hostile attacks on Aviator or America. An optional name is public; email is private and is not a newsletter signup.';
export function parseSkinComment(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Enter a comment.');const b=raw as Record<string,unknown>;
 function text(key:string,max:number){const v=b[key]??'';if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw new Error('Check your comment and optional contact fields.');const normalized=v.trim().normalize('NFKC');if(normalized.length>max)throw new Error('Check the length of your comment or contact fields.');return normalized;}
 const body=text('body',1500),name=text('name',80),email=text('email',200).toLowerCase(),requestId=text('requestId',36),website=text('website',200);if(body.length<3)throw new Error('Enter a comment of 3–1,500 characters.');
 if(name&&(/[@<>\r\n]/.test(name)||/https?:|www\./i.test(name)))throw new Error('Use a display name, not an email or website.');if(email&&!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))throw new Error('Enter a valid optional email address, or leave it blank.');if(!/^[a-f0-9-]{36}$/i.test(requestId))throw new Error('Reload the comment form before submitting.');
 return {body,name,email,requestId,website};
}
export function moderateSkinComment(body:string,name=''){
 const raw=(name+' '+body).normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g,''),words=raw.toLowerCase().replace(/[0@]/g,'a').replace(/[1!]/g,'i').replace(/3/g,'e').replace(/[5$]/g,'s').replace(/7/g,'t'),compact=words.replace(/[^a-z]/g,'');const reasons:string[]=[];
 if(/\b(?:fuck\w*|shit\w*|bullshit|asshole\w*|bitch\w*|cunt\w*|motherfuck\w*|dickhead\w*|nigger\w*|faggot\w*)\b/i.test(words)||/f[\s.*_-]*u[\s.*_-]*c[\s.*_-]*k|s[\s.*_-]*h[\s.*_-]*i[\s.*_-]*t/i.test(raw)||/(?:fuckyou|fuckaviator|fuckamerica|motherfucker)/.test(compact))reasons.push('Vulgarity / abusive language');
 if(/https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b[a-z0-9-]+\.(?:com|net|org|io|co|biz|shop|xyz|beer)\b|\b(?:buy now|promo code|coupon code|click here|dm me|earn money|work from home|crypto investment|visit my|follow my|check out my)\b/i.test(raw))reasons.push('Advertising / promotional links');
 if(/\b(?:i hate|we hate|hate|despise|destroy|boycott|screw|fuck)\s+(?:this\s+)?(?:aviator(?:\s+brewing)?|america|americans|the usa|usa)\b|\b(?:aviator(?:\s+brewing)?|america|americans|usa)\s+(?:is|are)\s+(?:trash|garbage|awful|evil|a scam|scum|terrible)|\b(?:anti[- ]american|anti[- ]aviator)\b/i.test(words))reasons.push('Hostile attack on Aviator / America');
 if(/<\/?[a-z][^>]*>|\b(?:kill yourself|i will kill|death to)\b/i.test(raw))reasons.push('Unsafe or hostile content');
 return {status:(reasons.length?'removed':'pending') as CommentStatus,reasons,policyVersion:skinCommentPolicyVersion};
}

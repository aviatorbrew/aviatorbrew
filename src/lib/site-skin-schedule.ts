import type {SiteTheme,SiteSkin} from '@/lib/site-skins';
import {seasonalSiteTheme} from '@/lib/site-skin-presets';
import {easternLocalTimestamp} from '@/lib/eastern-time';
export const seasonalScheduleDescription=[['Veterans Day','November 8–11'],['Thanksgiving','November 12–Thanksgiving Day'],['Christmas','Day after Thanksgiving–December 25'],['New Year’s','December 26–January 1'],['Valentine’s Day','February 1–14'],['St. Patrick’s Day','March 1–17']] as const;
export function scheduledSkin(now=new Date()):SiteSkin|null{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),year=Number(date.slice(0,4)),md=date.slice(5),first=new Date(Date.UTC(year,10,1)),thanksgiving=1+(4-first.getUTCDay()+7)%7+21,thanksgivingMd='11-'+String(thanksgiving).padStart(2,'0');
 if(md==='01-01'||md>='12-26')return 'new-years';if(md>='02-01'&&md<='02-14')return 'valentines-day';if(md>='03-01'&&md<='03-17')return 'st-patricks-day';if(md>='11-08'&&md<='11-11')return 'veterans-day';if(md>='11-12'&&md<=thanksgivingMd)return 'thanksgiving';if(md>thanksgivingMd&&md<='12-25')return 'christmas';return null;
}
export function resolveScheduledSiteTheme(theme:SiteTheme,now=new Date()):SiteTheme{
 if(!theme.automaticSeasonal||theme.manualOverrideUntil&&Date.parse(theme.manualOverrideUntil)>now.getTime())return theme;const skin=scheduledSkin(now);if(!skin)return {...theme,skin:'classic'};
 // January 1 belongs to the December 31 celebration that just started, not next year's.
 const md=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).slice(5),preset=seasonalSiteTheme(skin,md==='01-01'?new Date(now.getTime()-86400000):now)!;
 if(skin==='new-years'){const year=Number(preset.promotion.date.slice(0,4));preset.expiresAt=new Date(easternLocalTimestamp(`${year+1}-01-02`,'00:00')!).toISOString();}
 return {...preset,automaticSeasonal:true,manualOverrideUntil:theme.manualOverrideUntil,communityEnabled:theme.communityEnabled??true,updatedAt:theme.updatedAt};
}

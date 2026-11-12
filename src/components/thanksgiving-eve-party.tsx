import {getLiveMusicSchedule,liveMusicPageUrl} from '@/lib/live-music';
export async function ThanksgivingEveParty(){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),year=Number(today.slice(0,4));
 const first=new Date(Date.UTC(year,10,1)),day=1+(4-first.getUTCDay()+7)%7+20,date=`${year}-11-${String(day).padStart(2,'0')}`;
 if(today>date||today<`${year}-11-01`)return null;
 const {schedule}=await getLiveMusicSchedule();
 const shows=(schedule?.shows||[]).filter(s=>s.performanceDate===date).sort((a,b)=>Number(/hangar/i.test(b.venueName))-Number(/hangar/i.test(a.venueName))||a.startsAt.localeCompare(b.startsAt));
 const dateLabel=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'America/New_York'}).format(new Date(date+'T12:00:00-05:00'));
 const time=(value:string)=>new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}).format(new Date(value));
 return <section id="thanksgiving-eve" className="thanksgiving-eve-party" aria-labelledby="thanksgiving-eve-title"><p className="eyebrow">The Wednesday before Thanksgiving · {dateLabel}</p><h2 id="thanksgiving-eve-title">Party with us.</h2><p>Bring your friends. Grab a beer. Kick off the holiday with live music at Aviator.</p>{shows.length?<ul>{shows.map(show=><li key={show.id}><strong>{show.band.name}</strong><span>{show.venueName} · {time(show.startsAt)}–{time(show.endsAt)}</span></li>)}</ul>:<p>See Aviator Live for the latest bands and showtimes.</p>}<a className="button" href={liveMusicPageUrl} target="_blank" rel="noreferrer">See the live music lineup</a></section>;
}

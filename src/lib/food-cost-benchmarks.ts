export type FoodBenchmark={id:string;label:string;url:string;sku:string;pack:string;lb:number};
export const foodBenchmarks:FoodBenchmark[]=[
 {id:'breaded-chicken',label:'Cooked breaded chicken',url:'https://www.chefstore.com/p/tyson-red-label-breaded-crispy-cooked-chicken-tenderloin-38321_9778408/',sku:'9778408',pack:'2/5 lb',lb:10},
 {id:'tots',label:'Tater tots',url:'https://www.chefstore.com/p/ore-ida-tater-tots-veritots-potato-bites-bulk_6076020/',sku:'6076020',pack:'6/5 lb',lb:30},
 {id:'mozzarella',label:'Shredded mozzarella',url:'https://www.chefstore.com/p/gardenia-part-skim-mozzarella-cheese-shredded_5461390/',sku:'5461390',pack:'5 lb',lb:5},
 {id:'spinach',label:'Baby spinach',url:'https://www.chefstore.com/p/baby-spinach-clamshell_1090531/',sku:'1090531',pack:'1 lb',lb:1},
 {id:'brisket',label:'Raw boneless brisket',url:'https://www.chefstore.com/p/ibp-boneless-beef-brisket_2968010/',sku:'2968010',pack:'per lb',lb:1},
];
export const foodBenchmarkRules:Record<string,Record<string,number>>={
 'Chicken Fingers':{'breaded-chicken':.85},'Aviator Chicken Tenders':{'breaded-chicken':.85},'Aviator Chicken Tenders with Aviator Sauce':{'breaded-chicken':.85},'Tater Tots':{tots:.9},'Loaded Tots':{tots:.5},'Aviator Pizzeria Pizza Bar':{mozzarella:.3},'Spinach Caprese Salad':{spinach:.4},'Spinach & Artichoke Dip':{spinach:.2,mozzarella:.3},'Roasted Vegetable Lasagna':{mozzarella:.3},'Aviator Beef Brisket':{brisket:.9},'Brisket Crostini':{brisket:.65},'Brisket Crostini / pieces':{brisket:.65}
};
const clean=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
export function readFoodBenchmarkHtml(html:string,b:FoodBenchmark){
 const tags=[...html.matchAll(/<div\b[^>]*class=["'][^"']*\bproduct-widget\b[^"']*["'][^>]*>/gi)];
 const matches=tags.filter(m=>new RegExp(`data-sfitem=["']${b.sku}["']`).test(m[0])&&/data-primary=["']1["']/.test(m[0]));
 if(matches.length!==1)throw new Error('Exact primary supplier item could not be verified.');const tag=matches[0],price=Number(tag[0].match(/data-unitprice=["']([0-9]+(?:\.[0-9]+)?)["']/)?.[1]);
 const section=clean(html.slice(tag.index!+tag[0].length,tag.index!+tag[0].length+6500)),pack=section.match(/unit \(([^)]+)\)/)?.[1];
 if(!(price>0&&price<10000)||(b.pack==='per lb'?!section.includes('item sold per lb'):pack!==b.pack))throw new Error('Supplier price or purchase-unit size could not be verified.');
 return Math.round(price*100/b.lb);
}
export function foodCostWeek(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value])),day=new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`),offset=(day.getUTCDay()+6)%7;
 day.setUTCDate(day.getUTCDate()-offset-(offset===0&&Number(parts.hour)<8?7:0));return day.toISOString().slice(0,10);
}
export function adjustedFoodCost(base:number,weights:Record<string,number>,baseline:Record<string,number>,fresh:Record<string,number>){let ratio=1;for(const [id,share]of Object.entries(weights)){if(!baseline[id]||!fresh[id])return null;const change=fresh[id]/baseline[id];if(change<.8||change>1.2)return null;ratio+=share*(change-1);}return Math.round(base*ratio);}

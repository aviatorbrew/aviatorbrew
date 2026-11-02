import type {FeastItem,FeastPackage,FeastSeason,FeastSettings,FeastSelection} from '@/lib/feast';
const amount=(n:number)=>Number(n.toFixed(3)).toString();
export function feastFinishedWeight(ounces:number){return `${amount(ounces/16)} lb (${amount(ounces)} oz)`;}
export function feastSideOunces(item:FeastItem){return item.category==='sides'&&item.yields.length===1&&item.yields[0].unit==='oz'?item.yields[0].amount:null;}
export function feastSideAllowance(settings:FeastSettings,season:FeastSeason){const sides=settings.items.filter(i=>i.enabled&&i.seasons.includes(season)&&i.category==='sides'),sizes=sides.map(feastSideOunces);return sizes.length&&sizes.every(n=>n!==null&&n===sizes[0])?sizes[0]:null;}
export function feastSideServingDetail(item:FeastItem,servings:number){const ounces=feastSideOunces(item);return ounces===null?item.portion:`${amount(ounces)} oz per serving · ${feastFinishedWeight(ounces*servings)} for ${servings} servings`;}
export function feastPackageServingCount(p:FeastPackage,row:FeastSelection){return p.perGuest?row.quantity:p.servings*row.quantity;}
export function feastPackageQuantityDetails(p:FeastPackage,row:FeastSelection,settings:FeastSettings){
 const servings=feastPackageServingCount(p,row),details:string[]=[];
 if(p.meatsRequired){details.push(`${p.meatsRequired} meat selections · ${amount(p.meatPortionOz)} oz cooked meat each per serving · ${amount(p.meatsRequired*p.meatPortionOz)} oz combined per serving`);for(const id of row.meats){const item=settings.items.find(i=>i.id===id);if(item)details.push(`${item.name}: ${feastFinishedWeight(p.meatPortionOz*servings)} cooked total`);}}
 for(const y of p.included){const total=y.amount*(p.perGuest?servings:row.quantity);details.push(`${y.name}: ${y.unit==='oz'?feastFinishedWeight(total):`${amount(total)} ${y.unit}`} total`);}
 const bread=settings.items.find(i=>i.id===row.bread);if(bread)details.push(`${bread.name}: ${bread.portion} per serving`);
 return details;
}
export function feastTurkeyServingGuide(p:FeastPackage){
 const bird=p.included.find(y=>y.unit==='each'&&/whole turkey/i.test(y.name)&&/before cooking/i.test(y.name)),range=bird?.name.match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*lb/i);
 if(!bird||!range||p.perGuest)return null;const minimum=Number(range[1])*bird.amount,maximum=Number(range[2])*bird.amount;
 return {minimumRawLb:minimum,maximumRawLb:maximum,dinnerServings:p.servings,leftoverServings:Math.floor(minimum/1.5),rawLbPerDinnerGuest:minimum/p.servings,note:`Leftover planning uses the smallest ${amount(minimum)} lb bird and 1½ lb before cooking per adult. Whole-bird weight includes bones; cooked edible meat weighs less. Serving estimates include white and dark meat.`,details:`${amount(minimum)}–${amount(maximum)} lb whole turkey before cooking · ${p.servings} planned dinner servings with the included sides. For generous appetites and leftovers, plan for up to ${Math.floor(minimum/1.5)} adults per package, based on the smallest bird and 1½ lb before cooking per adult. Whole-bird weight includes bones; cooked edible meat weighs less. Serving estimates include white and dark meat.`};
}

'use client';
import {eventMenuPricing} from '@/lib/event-menu-pricing';
import type {EventProductionSettings} from '@/lib/event-production';
import type {EventFoodCostSettings} from '@/lib/event-food-cost';
import {useState} from 'react';
import {eventMenuChoices,eventMenuOrderItem,menuBillingUnits,type MenuBillingUnit} from '@/lib/event-menu-order';
import {money,type CateringCatalog,type EventPlanDetails,type EventOrderItem} from '@/lib/event-plan';

export function EventMenuOrderFields({details,catalog,production,costs,onAdd}:{production:EventProductionSettings;costs:EventFoodCostSettings;details:EventPlanDetails;catalog:CateringCatalog;onAdd:(item:EventOrderItem)=>void}) {
  const [choiceId,setChoiceId]=useState(''),[group,setGroup]=useState('All items'),[search,setSearch]=useState(''),[unit,setUnit]=useState<MenuBillingUnit>('guest'),[quantity,setQuantity]=useState(''),[price,setPrice]=useState<string|null>(null),[portion,setPortion]=useState<string|null>(null),[notes,setNotes]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
  const choices=eventMenuChoices(catalog),groups=[...new Set(choices.map(item=>item.group))],choice=choices.find(item=>item.id===choiceId);
  const visible=choices.filter(item=>(group==='All items'||item.group===group)&&`${item.name} ${item.group}`.toLowerCase().includes(search.trim().toLowerCase()));
  const amount=quantity===''?(unit==='guest'?Math.max(1,details.guestCount):1):Number(quantity);
  const pricing=choice?eventMenuPricing(choice,unit,catalog,production,costs,portion===null?undefined:Number(portion),amount):null;
  const priceCents=price===null?pricing?.suggestedCents??null:price.trim()===''?null:Math.round(Number(price)*100);
  function reset(){setChoiceId('');setPrice(null);setPortion(null);setNotes('');setMessage('');setError('');}
  function add(){try {
    if(priceCents===null)throw new Error('Enter a price override or complete the food cost and portion to calculate a price.');
    const item=eventMenuOrderItem({id:crypto.randomUUID(),choiceId,unit,quantity:amount,unitPriceCents:priceCents,notes,kitchen:pricing?.kitchen},catalog);
    onAdd(item);setError('');setMessage(`Added ${choice!.name}: ${amount} × ${money(priceCents)} = ${money(amount*priceCents)}. Save changes to keep this item.`);
  }catch(e){setMessage('');setError(e instanceof Error?e.message:'Check the menu item.');}}
  return <section className="event-a-la-carte-builder" aria-label="À la carte menu builder">
    <h3>Build an à la carte menu</h3>
    <p>Choose from the full event menu, including premium and manager-only selections. Prices start at a 28% estimated food cost. Choose the quantity and billing unit; edit the portion or selling price when needed.{details.flightPlan?.packageId?' These items are extra charges alongside the selected buffet package.':' No buffet package or package minimum is required.'}</p>
    <div className="event-fields">
      <label>Menu category<select value={group} onChange={e=>{setGroup(e.target.value);reset();}}><option>All items</option>{groups.map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Search menu items<input type="search" value={search} onChange={e=>{setSearch(e.target.value);reset();}} placeholder="Appetizer, steak, pizza, salad…"/></label>
      <label className="event-field-span2">Menu item<select aria-label="À la carte menu item" value={choiceId} onChange={e=>{reset();setChoiceId(e.target.value);}}><option value="">Choose a menu item…</option>{groups.map(name=>{const items=visible.filter(item=>item.group===name);return items.length?<optgroup label={name} key={name}>{items.map(item=><option key={item.id} value={item.id} disabled={item.unavailable}>{item.name}{item.managerOnly?' (manager only)':''}{item.unavailable?' (unavailable)':''}</option>)}</optgroup>:null;})}</select></label>
      <label>Billing unit<select aria-label="À la carte billing unit" value={unit} onChange={e=>{setUnit(e.target.value as MenuBillingUnit);setQuantity('');setPrice(null);setPortion(null);setMessage('');}}>{Object.entries(menuBillingUnits).map(([value,label])=><option key={value} value={value}>{value==='guest'?`Guest serving — guest count ${details.guestCount>0?details.guestCount:'not set'}`:label}</option>)}</select></label>
      <label>Quantity<input aria-label="À la carte quantity" type="number" min={1} max={10000} step={1} value={quantity===''?amount:quantity} onChange={e=>{setQuantity(e.target.value);setMessage('');}}/></label>
      <label>Agreed unit price ($)<input type="number" min={0} max={100000} step="0.01" placeholder="Needs cost or portion" value={price===null?(pricing?.suggestedCents===null||!pricing?'':pricing.suggestedCents/100):price} onChange={e=>{setPrice(e.target.value);setMessage('');}}/></label>
      {choice?<label>{pricing?.cost?.basis==='fl-oz'?'Fluid ounces per billing unit':'Finished ounces per billing unit'}<input aria-label="À la carte portion ounces" type="number" min={.01} max={100000} step="any" value={portion===null?(pricing?.kitchen.ouncesPerUnit??pricing?.kitchen.fluidOzPerUnit??''):portion} placeholder="Enter when needed" onChange={e=>setPortion(e.target.value)}/></label>:null}
      <label className="event-field-wide">Preparation / portion notes<textarea aria-label="À la carte preparation notes" rows={2} maxLength={900} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Sauces, pizza size, tray portions, dietary requests or service instructions"/></label>
    </div>
    {unit==='guest'?<p className="event-package-hint">One serving per guest, priced per person. {details.guestCount>0?`Quantity starts at your event guest count (${details.guestCount}). Change it if fewer guests want this item.`:'Guest count is not set. Enter the number of guests receiving this item.'} Added quantities stay fixed if the event guest count changes later.</p>:null}
    {!visible.length?<p>No matching menu items. Change the category or search.</p>:null}
    {choice?<div className="event-price-guidance" aria-live="polite"><p><strong>{price===null?'Automatic price · 28% food-cost target':'Manual price override'}</strong>{pricing?.unitCostCents!==null&&pricing?.unitCostCents!==undefined?<> · Estimated food cost: {money(pricing.unitCostCents)} per billing unit{priceCents!==null&&priceCents>0?` · ${(pricing.unitCostCents/priceCents*100).toFixed(1)}% at this price`:''}</>:null}</p>{pricing?.suggestedCents!==null&&pricing?.suggestedCents!==undefined?<p>Suggested selling price: {money(pricing.suggestedCents)}. Based on internal costs and portion estimates, before tax or discounts. {pricing.cost?.source}</p>:<p>{pricing?.reason} You can still enter a manual price.</p>}{price!==null?<button type="button" disabled={pricing?.suggestedCents==null} onClick={()=>setPrice(null)}>Use 28% price</button>:null}{choice.name==='Aviator Smoked Wings'?<p>{production.buffetWingsPerGuest||5} wings per guest serving · approximately {production.wingsPerFullTray||200} wing pieces per full tray.{!production.cookedWingsPerLb?' Cooked pieces per pound is not set; piece/tray pricing from a per-pound cost needs a portion weight.':''}</p>:null}</div>:null}
    <div className="event-editor-actions"><button type="button" className="button button-outline" disabled={!choice||choice.unavailable||priceCents===null||details.items.length>=100} onClick={add}>+ Add menu item</button><strong aria-live="polite">Item total: {priceCents===null?'Set price':money(amount*priceCents)}</strong></div>
    {message?<p role="status">{message}</p>:null}{error?<p role="alert" className="event-plan-error">{error}</p>:null}
    <p className="event-package-hint">Items appear in Order summary & custom charges below. Quantities and prices stay as entered when guest count changes. Use + Add order item below for an off-menu dish or other custom charge.</p>
  </section>;
}

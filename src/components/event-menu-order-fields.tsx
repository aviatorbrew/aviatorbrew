'use client';
import {useState} from 'react';
import {eventMenuChoices,eventMenuOrderItem,menuBillingUnits,type MenuBillingUnit} from '@/lib/event-menu-order';
import {money,type CateringCatalog,type EventPlanDetails,type EventOrderItem} from '@/lib/event-plan';

export function EventMenuOrderFields({details,catalog,onAdd}:{details:EventPlanDetails;catalog:CateringCatalog;onAdd:(item:EventOrderItem)=>void}) {
  const [choiceId,setChoiceId]=useState(''),[group,setGroup]=useState('All items'),[search,setSearch]=useState(''),[unit,setUnit]=useState<MenuBillingUnit>('guest'),[quantity,setQuantity]=useState(''),[price,setPrice]=useState(''),[notes,setNotes]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
  const choices=eventMenuChoices(catalog),groups=[...new Set(choices.map(item=>item.group))],choice=choices.find(item=>item.id===choiceId);
  const visible=choices.filter(item=>(group==='All items'||item.group===group)&&`${item.name} ${item.group}`.toLowerCase().includes(search.trim().toLowerCase()));
  const amount=quantity===''?(unit==='guest'?Math.max(1,details.guestCount):1):Number(quantity),priceCents=price.trim()===''?null:Math.round(Number(price)*100);
  function reset(){setChoiceId('');setPrice('');setNotes('');setMessage('');setError('');}
  function add(){try {
    if(priceCents===null)throw new Error('Enter the agreed à la carte unit price.');
    const item=eventMenuOrderItem({id:crypto.randomUUID(),choiceId,unit,quantity:amount,unitPriceCents:priceCents,notes},catalog);
    onAdd(item);setError('');setMessage(`Added ${choice!.name}: ${amount} × ${money(priceCents)} = ${money(amount*priceCents)}. Save changes to keep this item.`);
  }catch(e){setMessage('');setError(e instanceof Error?e.message:'Check the menu item.');}}
  return <section className="event-a-la-carte-builder" aria-label="À la carte menu builder">
    <h3>Build an à la carte menu</h3>
    <p>Choose from the full event menu, including premium and manager-only selections. Set each item's quantity, billing unit and agreed price.{details.flightPlan?.packageId?' These items are extra charges alongside the selected buffet package.':' No buffet package or package minimum is required.'}</p>
    <div className="event-fields">
      <label>Menu category<select value={group} onChange={e=>{setGroup(e.target.value);reset();}}><option>All items</option>{groups.map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Search menu items<input type="search" value={search} onChange={e=>{setSearch(e.target.value);reset();}} placeholder="Appetizer, steak, pizza, salad…"/></label>
      <label className="event-field-span2">Menu item<select aria-label="À la carte menu item" value={choiceId} onChange={e=>{reset();setChoiceId(e.target.value);}}><option value="">Choose a menu item…</option>{groups.map(name=>{const items=visible.filter(item=>item.group===name);return items.length?<optgroup label={name} key={name}>{items.map(item=><option key={item.id} value={item.id} disabled={item.unavailable}>{item.name}{item.managerOnly?' (manager only)':''}{item.unavailable?' (unavailable)':''}</option>)}</optgroup>:null;})}</select></label>
      <label>Billing unit<select aria-label="À la carte billing unit" value={unit} onChange={e=>{setUnit(e.target.value as MenuBillingUnit);setQuantity('');setPrice('');setMessage('');}}>{Object.entries(menuBillingUnits).map(([value,label])=><option key={value} value={value}>{value==='guest'?`Guest serving — guest count ${details.guestCount>0?details.guestCount:'not set'}`:label}</option>)}</select></label>
      <label>Quantity<input aria-label="À la carte quantity" type="number" min={1} max={10000} step={1} value={quantity===''?amount:quantity} onChange={e=>{setQuantity(e.target.value);setMessage('');}}/></label>
      <label>Agreed unit price ($)<input type="number" min={0} max={100000} step="0.01" placeholder="Enter agreed price" value={price} onChange={e=>{setPrice(e.target.value);setMessage('');}}/></label>
      <label className="event-field-wide">Preparation / portion notes<textarea aria-label="À la carte preparation notes" rows={2} maxLength={900} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Sauces, pizza size, tray portions, dietary requests or service instructions"/></label>
    </div>
    {unit==='guest'?<p className="event-package-hint">One serving per guest, priced per person. {details.guestCount>0?`Quantity starts at your event guest count (${details.guestCount}). Change it if fewer guests want this item.`:'Guest count is not set. Enter the number of guests receiving this item.'} Added quantities stay fixed if the event guest count changes later.</p>:null}
    {!visible.length?<p>No matching menu items. Change the category or search.</p>:null}
    {choice?.referenceCents!==null&&choice?.referenceCents!==undefined?<p className="event-package-hint">Configured buffet add-on rate: {money(choice.referenceCents)} per guest. Enter the agreed à la carte price for the selected billing unit.</p>:null}
    <div className="event-editor-actions"><button type="button" className="button button-outline" disabled={!choice||choice.unavailable||priceCents===null||details.items.length>=100} onClick={add}>+ Add menu item</button><strong aria-live="polite">Item total: {priceCents===null?'Set price':money(amount*priceCents)}</strong></div>
    {message?<p role="status">{message}</p>:null}{error?<p role="alert" className="event-plan-error">{error}</p>:null}
    <p className="event-package-hint">Items appear in Order summary & custom charges below. Quantities and prices stay as entered when guest count changes. Use + Add order item below for an off-menu dish or other custom charge.</p>
  </section>;
}

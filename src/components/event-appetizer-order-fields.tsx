'use client';
import {useState} from 'react';
import {appetizerBillingUnits,appetizerGuestPrice,appetizerOrderItem,type AppetizerBillingUnit} from '@/lib/event-appetizer-order';
import {money,type CateringCatalog,type EventPlanDetails,type EventOrderItem} from '@/lib/event-plan';

export function EventAppetizerOrderFields({details,catalog,onAdd}:{details:EventPlanDetails;catalog:CateringCatalog;onAdd:(item:EventOrderItem)=>void}) {
  const [name,setName]=useState(''),[unit,setUnit]=useState<AppetizerBillingUnit>('guest'),[quantity,setQuantity]=useState(''),[price,setPrice]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
  const count=details.items.filter(i=>i.category==='Food'&&i.name.startsWith('Appetizer: ')).length;
  const amount=quantity===''?(unit==='guest'?Math.max(1,details.guestCount):1):Number(quantity);
  const priceCents=price===''?(unit==='guest'&&name?appetizerGuestPrice(name,catalog):null):Math.round(Number(price)*100);
  function add(){try {
    if(priceCents===null)throw new Error('Enter the agreed price for each tray or piece.');
    const item=appetizerOrderItem({id:crypto.randomUUID(),name,unit,quantity:amount,unitPriceCents:priceCents},catalog);
    onAdd(item);setError('');setMessage(`Added ${name}: ${amount} × ${money(priceCents)} = ${money(amount*priceCents)}. Save the event before creating its proposal.`);
  }catch(e){setMessage('');setError(e instanceof Error?e.message:'Check the appetizer selection.');}}
  function options(names:string[]){return names.map(n=><option key={n} value={n} disabled={catalog.disabledItems.includes(n)}>{n}{catalog.managerOnlyItems?.includes(n)?' (manager only)':''}{catalog.disabledItems.includes(n)?' (unavailable)':''}</option>);}
  return <div className="event-appetizer-builder">
    <h3>Add appetizers <small>({count} line item{count===1?'':'s'} in order)</small></h3>
    <p>Build an appetizer event without a buffet package. Add each choice with its quantity and agreed price. Guest prices start with the current additional-appetizer rate, including the premium upgrade when applicable. Enter tray or piece prices manually.</p>
    <div className="event-fields">
      <label className="event-field-span2">Appetizer<select value={name} onChange={e=>{setName(e.target.value);setPrice('');setMessage('');setError('');}}><option value="">Choose appetizer…</option><optgroup label="Appetizers">{options(catalog.menu.appetizers)}</optgroup><optgroup label="Premium appetizers">{options(catalog.menu.premiumAppetizers)}</optgroup></select></label>
      <label>Appetizer billing unit<select value={unit} onChange={e=>{setUnit(e.target.value as AppetizerBillingUnit);setQuantity('');setPrice('');setMessage('');}}>{Object.entries(appetizerBillingUnits).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Appetizer quantity<input type="number" min={1} max={10000} step={1} value={quantity===''?amount:quantity} onChange={e=>{setQuantity(e.target.value);setMessage('');}}/></label>
      <label>Appetizer unit price ($)<input type="number" min={0} max={100000} step="0.01" placeholder="Enter agreed price" value={price===''?(priceCents===null?'':priceCents/100):price} onChange={e=>{setPrice(e.target.value);setMessage('');}}/></label>
    </div>
    <div className="event-editor-actions"><button type="button" className="button button-outline" disabled={!name||priceCents===null||details.items.length>=100} onClick={add}>+ Add appetizer</button><strong aria-live="polite">Appetizer charge: {priceCents===null?'Set price':money(amount*priceCents)}</strong></div>
    {message?<p role="status">{message}</p>:null}{error?<p role="alert" className="event-plan-error">{error}</p>:null}
    <p className="event-package-hint">Each added appetizer appears under Order summary & custom charges below, where you can edit or remove it. Quantities stay as entered; review them if the guest count changes. Save the event, then use Create proposal draft to review and approve the customer email.</p>
  </div>;
}

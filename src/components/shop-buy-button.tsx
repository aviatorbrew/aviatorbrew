"use client";
import {useEffect,useState} from 'react';
import {useShopCart} from '@/components/shop-cart';
import type {ShopProduct} from '@/lib/shop';
import {ticketCutoff,ticketDateTime,ticketSalesStatus} from '@/lib/shop-tickets';
function availableVariant(v:ShopProduct['variants'][number]){return v.published&&v.availableForSale&&(!v.trackInventory||v.availableInventoryCount>0);}
function money(cents:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);}
function optionLabel(v:string){return v==='Default Title'||v==='Default'?'Standard':v;}
export function ShopBuyBox({product}:{product:ShopProduct}){
 const [current,setCurrent]=useState(product),[now,setNow]=useState(Date.now()),[variantId,setVariantId]=useState(0),[quantity,setQuantity]=useState(1),[added,setAdded]=useState(false),{addItem}=useShopCart();
 useEffect(()=>setCurrent(product),[product]);
 useEffect(()=>{if(product.productType!=='ticket')return;const controller=new AbortController();async function refresh(){try{const r=await fetch('/api/shop/ticket-availability?productId='+product.id,{cache:'no-store',signal:controller.signal});if(r.status===404)setCurrent(p=>({...p,published:false}));else if(r.ok){const {product:latest}=await r.json();setCurrent(p=>({...p,...latest,variants:latest.variants.map((v:Partial<ShopProduct['variants'][number]>)=>({...p.variants.find(old=>old.id===v.id),...v}))}));}setNow(Date.now());}catch{/* Checkout always rechecks inventory on the server. */}}refresh();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};},[product.id,product.productType]);
 useEffect(()=>{if(current.productType!=='ticket')return;const end=ticketCutoff(current),timer=setTimeout(()=>setNow(Date.now()),Math.min(30000,Math.max(1,(end&&end>now?end-now:30000))));return()=>clearTimeout(timer);},[current,now]);
 const status=current.productType==='ticket'?ticketSalesStatus(current,now):null,available=(!status||status.open)?current.variants.filter(availableVariant):[],selected=available.find(v=>v.id===variantId)||available[0];
 const limit=current.productType==='ticket'?Math.min(current.ticketMaxPerOrder,current.ticketAvailableCount):25,max=selected?(selected.trackInventory?Math.min(limit,selected.availableInventoryCount):limit):0;
 useEffect(()=>{if(max>0)setQuantity(q=>Math.max(1,Math.min(max,q)));},[max]);
 function add(){if(!selected||max<1||(status&&!ticketSalesStatus(current).open))return;addItem({variantId:selected.id,quantity:Math.min(quantity,max),productName:current.name,variantLabel:optionLabel(selected.label),imageUrl:current.imageUrl,unitPriceCents:selected.priceCents,maxQuantity:max});setAdded(true);setTimeout(()=>setAdded(false),1800);}
 const ticketStatus=status?<div className="shop-ticket-status" data-status={status.kind} role="status"><strong>{status.open&&!available.length?'Tickets are not currently available online.':status.message}</strong>{status.open&&current.ticketSalesEndAt?<p>Online sales end {ticketDateTime(current.ticketSalesEndAt)}. Ticket required for entry.</p>:null}</div>:null;
 if(!selected)return <>{ticketStatus}{!status?<p className="shop-new-unavailable">Sold out</p>:null}</>;
 return <div className="shop-new-buy-box">{ticketStatus}<label>Option<select value={selected.id} onChange={e=>setVariantId(Number(e.target.value))}>{available.map(v=><option value={v.id} key={v.id}>{optionLabel(v.label)} - {money(v.priceCents)}</option>)}</select></label><div className="shop-new-add-row"><label>{current.productType==='ticket'?'Tickets':'Quantity'}<input type="number" min="1" max={max} value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(max,Number(e.target.value)||1)))}/></label><button className="button" type="button" onClick={add}>{added?'Added':'Add to cart'}</button></div></div>;
}

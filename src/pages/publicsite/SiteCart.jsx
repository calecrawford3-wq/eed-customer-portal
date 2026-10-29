import React,{useEffect,useState} from 'react';
import {base44,base44Public} from '@/api/base44Client';
import {Link} from 'react-router-dom';
import {ShoppingCart,Trash2,Plus,Minus,ShieldCheck} from 'lucide-react';
import {useCart} from './CartContext';
const usd=n=>Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
const err=e=>e?.response?.data?.error||e?.message||'Something went wrong. Please try again.';
export default function SiteCart(){
 const {items,count,setQuantity,remove,clear}=useCart();
 const [buyer,setBuyer]=useState({name:'',email:'',phone:''});
 const [shopper,setShopper]=useState(null),[checkoutMode,setCheckoutMode]=useState('guest');
 const [shippingAddress,setShippingAddress]=useState({line1:'',line2:'',city:'',state:'',postal_code:''});
 const [addressSuggestions,setAddressSuggestions]=useState([]),[addressLoading,setAddressLoading]=useState(false),[addressConfigured,setAddressConfigured]=useState(null),[addressChosen,setAddressChosen]=useState(false);
 const [quote,setQuote]=useState(null),[quoteError,setQuoteError]=useState(''),[verifying,setVerifying]=useState(false),[delivery,setDelivery]=useState('ship');
 const [submitting,setSubmitting]=useState(false),[submitError,setSubmitError]=useState('');
 const cartPayload=()=>items.map(i=>i.type==='part'?{type:'part',id:i.id,parentId:i.parentId||undefined,personalization:i.personalization||'',quantity:i.quantity}:{type:'engine',platform:i.platform,stage:i.stage,core:i.core,addonIds:i.addonIds||[],quantity:1});
 useEffect(()=>{if(!items.length){setQuote(null);return}let active=true;setQuote(null);setQuoteError('');setVerifying(true);const timer=setTimeout(()=>{base44Public.functions.invoke('quoteWebsiteCart',{items:items.map(i=>i.type==='part'?{type:'part',id:i.id,parentId:i.parentId||undefined,personalization:i.personalization||'',quantity:i.quantity}:{type:'engine',platform:i.platform,stage:i.stage,core:i.core,addonIds:i.addonIds||[],quantity:1})}).then(r=>{if(active)setQuote(r?.data||r)}).catch(e=>{if(active)setQuoteError(err(e))}).finally(()=>{if(active)setVerifying(false)})},350);return()=>{active=false;clearTimeout(timer)}},[items]);
 useEffect(()=>{const q=shippingAddress.line1.trim();if(delivery!=='ship'||addressChosen||q.length<4){setAddressSuggestions([]);return}let active=true;const timer=setTimeout(async()=>{setAddressLoading(true);try{const r=await base44Public.functions.invoke('suggestCheckoutAddress',{text:q}),d=r.data||r;if(active){setAddressSuggestions(d.suggestions||[]);setAddressConfigured(d.configured===true)}}catch{if(active)setAddressSuggestions([])}finally{if(active)setAddressLoading(false)}},350);return()=>{active=false;clearTimeout(timer)}},[shippingAddress.line1,addressChosen,delivery]);
 useEffect(()=>{let active=true;(async()=>{try{const u=await base44.auth.me();if(!active||!u)return;setShopper(u);setCheckoutMode('account');const r=await base44.functions.invoke('manageWebsiteShopperAccount',{action:'get'}),d=r.data||r;if(!active)return;setBuyer(v=>({name:d.profile?.name||u.full_name||v.name,email:u.email||v.email,phone:d.profile?.phone||v.phone}));if(d.profile?.address?.line1){setShippingAddress(v=>({...v,...d.profile.address}));setAddressChosen(true)}}catch{}})();return()=>{active=false}},[]);
 const subtotal=items.reduce((n,x)=>n+(Number(x.price)||0)*x.quantity,0);
 const deposit=items.reduce((n,x)=>n+(x.type==='engine'?(Number(x.deposit)||0):(Number(x.price)||0))*x.quantity,0);
 const checkoutEnabled=quote?.checkoutEnabled===true;
 const shippingEstimate=delivery==='pickup'?0:(quote?.flatShippingCents||0);
 const taxRate=Number(quote?.taxRatePercent||0);
 const submit=async event=>{
  event.preventDefault();setSubmitError('');
  if(!buyer.name.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email)||buyer.phone.trim().length<7){setSubmitError('Enter your full name, a valid email, and a phone number.');return}
  if(delivery==='ship'&&(!shippingAddress.line1.trim()||!shippingAddress.city.trim()||!shippingAddress.state.trim()||!/^\d{5}(-\d{4})?$/.test(shippingAddress.postal_code.trim()))){setSubmitError('Enter a complete US shipping address with a valid ZIP code.');return}
  setSubmitting(true);
  try{
   const prepared=await (checkoutMode==='account'&&shopper?base44:base44Public).functions.invoke('prepareWebsiteCartOrder',{items:cartPayload(),buyer,checkoutMode,shipping:{method:delivery,address:delivery==='ship'?{...shippingAddress,country:'US'}:{}}});
   const order=prepared?.data||prepared;
   if(!order?.orderReference)throw new Error(order?.error||'Unable to prepare your order');
   const started=await base44Public.functions.invoke('startWebsiteCartCheckout',{orderReference:order.orderReference,checkoutToken:order.checkoutToken});
   const payment=started?.data||started;
   if(!payment?.checkoutUrl)throw new Error(payment?.error||'Unable to start secure payment');
   window.location.href=payment.checkoutUrl;
  }catch(e){setSubmitError(err(e));setSubmitting(false)}
 };
 return <main className="max-w-6xl mx-auto px-6 lg:px-10 py-20 min-h-[70vh]">
  <p className="text-xs text-red-500 tracking-[.3em] uppercase font-bold">Elite online store</p>
  <h1 className="text-5xl md:text-7xl font-black tracking-tight mt-4 uppercase">Your cart.</h1>
  <p className="text-zinc-400 mt-5">Review your items and pay securely. Parts are charged in full today; configured engines are charged at their build deposit.</p>
  {!items.length?<div className="mt-14 border border-white/15 p-12 text-center"><ShoppingCart className="mx-auto text-zinc-500" size={48}/><p className="mt-5 text-xl font-bold">Your cart is empty</p><Link className="inline-block mt-6 bg-white text-black px-6 py-3 text-sm font-bold" to="/site/store">Browse parts</Link></div>:<form onSubmit={submit} className="grid lg:grid-cols-[1fr_360px] gap-10 mt-12">
   <div className="space-y-4">
    {items.map(item=><article key={item.key} className="bg-[#191b1e] border border-white/10 p-6 flex flex-col sm:flex-row gap-5 justify-between">
     <div><p className="text-red-500 text-xs uppercase tracking-widest">{item.type==='engine'?'Configured engine':'Inventory part'}</p><h2 className="font-bold text-xl mt-2">{item.name}</h2><p className="text-zinc-400 text-sm mt-1">{item.type==='engine'?`${item.platform} · ${item.core} · ${item.addonIds?.length||0} upgrades`:item.sku}{item.personalization&&<span className="block text-amber-200 mt-1">Customization: {item.personalization}</span>}</p><p className="text-zinc-300 font-semibold mt-3">{usd(item.price)}{item.type==='engine'&&<span className="block text-xs font-normal text-zinc-500 mt-1">Estimated deposit {usd(item.deposit)}</span>}</p></div>
     <div className="flex items-center gap-3 self-start sm:self-center"><button type="button" aria-label={'Decrease '+item.name} className="border border-white/20 p-2 disabled:opacity-30" disabled={item.type==='engine'||item.quantity<=1} onClick={()=>setQuantity(item.key,item.quantity-1)}><Minus size={15}/></button><span className="min-w-6 text-center">{item.quantity}</span><button type="button" aria-label={'Increase '+item.name} className="border border-white/20 p-2 disabled:opacity-30" disabled={item.type==='engine'||item.quantity>=99} onClick={()=>setQuantity(item.key,item.quantity+1)}><Plus size={15}/></button><button type="button" aria-label={'Remove '+item.name} className="text-zinc-400 hover:text-red-400 p-2" onClick={()=>remove(item.key)}><Trash2 size={18}/></button></div>
    </article>)}
    <button type="button" onClick={clear} className="text-zinc-400 underline text-sm">Clear cart</button>
   </div>
   <aside className="bg-[#191b1e] border border-white/10 p-7 h-fit">
    <h2 className="font-black text-2xl uppercase">Order summary</h2>
    <p className="flex justify-between mt-8 text-zinc-400"><span>Items</span><span>{count}</span></p>
    <p className="flex justify-between mt-4 font-semibold"><span>Catalog subtotal</span><span>{usd(subtotal)}</span></p>
    <p className="flex justify-between mt-4 text-zinc-300"><span>Due with engine deposits</span><span>{usd(deposit)}</span></p>
    <div className="border-t border-white/15 mt-5 pt-5 text-sm">
     {verifying?<p className="text-zinc-400">Verifying current catalog prices…</p>:quoteError?<p className="text-red-400" role="alert">{quoteError}</p>:quote?<>
      <p className="flex justify-between"><span>Verified subtotal</span><strong>{usd(quote.subtotalCents/100)}</strong></p>
      <p className="flex justify-between mt-3"><span>Due with engine deposits</span><strong>{usd(quote.dueTodayCents/100)}</strong></p>
      <p className="flex justify-between mt-3 text-zinc-400"><span>Remaining engine balances</span><span>{usd(quote.remainingEngineCents/100)}</span></p>
      {quote.missingShippingItems?.length>0&&<p className="mt-3 text-amber-300 text-xs" role="status">Freight quote required for: {quote.missingShippingItems.join(', ')}. Order those parts by phone or email.</p>}
      {delivery==='ship'&&shippingEstimate>0&&<p className="mt-3 text-zinc-400 text-xs">Shipping {usd(shippingEstimate/100)}{quote.freeShippingThresholdCents>0?`, free over ${(quote.freeShippingThresholdCents/100).toFixed(2)}`:' '}</p>}
      {delivery==='pickup'&&<p className="mt-3 text-zinc-400 text-xs">Local pickup — no shipping charge.</p>}
      {taxRate>0&&<p className="mt-3 text-zinc-400 text-xs">Oklahoma sales tax ({taxRate}%) is calculated on parts and shipping at checkout. Taxes are confirmed by the server before payment.</p>}
     </>:null}
    </div>
    <fieldset className="mt-6 border-t border-white/15 pt-5"><legend className="font-semibold text-sm">Fulfillment method</legend>
     <label className="flex items-center gap-3 mt-3 text-sm"><input type="radio" name="delivery" value="ship" checked={delivery==='ship'} onChange={()=>setDelivery('ship')}/> Shipping</label>
     <label className="flex items-center gap-3 mt-3 text-sm"><input type="radio" name="delivery" value="pickup" checked={delivery==='pickup'} onChange={()=>setDelivery('pickup')}/> Free local pickup</label>
     <p className="text-xs text-zinc-500 mt-3">{delivery==='pickup'?'Pickup is free. We will email you when your order is ready to collect. Oklahoma sales tax still applies.':'Shipping is charged at the store flat rate. Engine freight is billed separately when the build is complete.'}</p>
    </fieldset>
    <section className="mt-6 border-t border-white/15 pt-5">
     <h3 className="font-semibold text-sm">Checkout options</h3>
     {shopper?<div className="mt-3 space-y-2 text-sm"><p className="text-green-300">Signed in as {shopper.email}</p><label className="flex gap-2 items-center"><input type="radio" checked={checkoutMode==='account'} onChange={()=>setCheckoutMode('account')}/> Checkout with my account</label><label className="flex gap-2 items-center"><input type="radio" checked={checkoutMode==='guest'} onChange={()=>setCheckoutMode('guest')}/> Checkout as guest</label><Link className="block underline text-zinc-300 mt-2" to="/site/account">My account, saved address & orders</Link></div>:<div className="mt-3 text-sm"><p className="text-zinc-400">You can pay without creating an account.</p><button type="button" className="mt-3 bg-white text-black font-bold px-4 py-3" onClick={()=>base44.auth.redirectToLogin(window.location.href)}>Sign in / Create account</button><p className="text-zinc-400 mt-3">Or continue as guest below.</p></div>}
     <h3 className="font-semibold text-sm mt-6">Customer details</h3>
     <p className="text-zinc-400 text-xs mt-1">For your receipt and order updates. No account required.</p>
     <div className="mt-4 space-y-3">{[['name','Full name','name'],['email','Email address','email'],['phone','Phone number','tel']].map(([key,label,type])=><label key={key} className="block text-xs text-zinc-300">{label}<input type={type} autoComplete={type} value={buyer[key]} onChange={e=>setBuyer(v=>({...v,[key]:e.target.value}))} className="block w-full mt-1.5 bg-[#111315] border border-white/20 p-3 text-white text-sm focus:border-red-500 outline-none"/></label>)}</div>
     {delivery==='ship'&&<>
      <h3 className="font-semibold text-sm mt-6">Shipping address</h3>
      <div className="mt-3 space-y-3">{[['line1','Street address','address-line1'],['line2','Apartment / suite (optional)','address-line2'],['city','City','address-level2'],['state','State','address-level1'],['postal_code','ZIP code','postal-code']].map(([key,label,autocomplete])=><div key={key}><label className="block text-xs text-zinc-300">{label}<input autoComplete={autocomplete} value={shippingAddress[key]} onChange={e=>{setShippingAddress(v=>({...v,[key]:e.target.value}));if(key==='line1')setAddressChosen(false)}} className="block w-full mt-1.5 bg-[#111315] border border-white/20 p-3 text-white text-sm focus:border-red-500 outline-none"/></label>{key==='line1'&&<div role="status" className="text-xs text-zinc-400 mt-1">{addressLoading?'Searching addresses…':addressConfigured===false?'Enter address manually. Suggestions are not configured.':addressChosen?'Address selected — verify details below.':'Start typing to see address suggestions.'}</div>}{key==='line1'&&addressSuggestions.length>0&&<div role="listbox" aria-label="Suggested shipping addresses" className="border border-white/20 bg-[#24272b] mt-1 max-h-52 overflow-y-auto">{addressSuggestions.map((s,i)=><button type="button" role="option" aria-selected={false} key={i} className="block w-full text-left px-3 py-3 text-sm border-b border-white/10 hover:bg-zinc-700" onClick={()=>{setShippingAddress(v=>({...v,line1:s.line1,city:s.city,state:s.state,postal_code:s.postal_code}));setAddressChosen(true);setAddressSuggestions([])}}>{s.label}</button>)}</div>}</div>)}</div>
     </>}
    </section>
    {items.some(i=>i.type==='engine')&&<p className="text-xs text-amber-200 mt-5"><strong>Engine shipping billed separately.</strong> Freight, packaging, and insurance are calculated when your engine is completed. Engine freight is not included in today's payment.</p>}
    {submitError&&<p role="alert" className="mt-5 text-sm text-red-400">{submitError}</p>}
    <button type="submit" disabled={!checkoutEnabled||submitting||verifying||!quote||!!quoteError} className="mt-6 w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white p-4 text-xs font-bold tracking-widest uppercase flex items-center justify-center gap-2">{submitting?'Redirecting to secure payment…':<><ShieldCheck size={16}/>Checkout securely</>}</button>
    <p className="text-xs text-zinc-500 mt-3 text-center">{checkoutEnabled?'Payment is handled by Stripe. Elite never sees your card details.':'Online checkout opens soon — contact Elite to place this order.'}</p>
    <Link to="/site/store" className="block text-center mt-5 text-sm underline">Continue shopping</Link>
   </aside>
  </form>}
 </main>;
}
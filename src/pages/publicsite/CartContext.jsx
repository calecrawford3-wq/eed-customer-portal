import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
const CartContext=createContext(null);const KEY='eed-public-cart-v1';
const read=()=>{try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(data)?data.filter(x=>x&&['part','engine'].includes(x.type)&&typeof x.key==='string').slice(0,60):[]}catch{return []}};
export function CartProvider({children}){const [items,setItems]=useState(read);useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(items))}catch{}},[items]);
 const addPart=(product)=>setItems(old=>{const key='part:'+product.id+':'+(product.parentId||'')+':'+(product.personalization||''),existing=old.find(x=>x.key===key);if(existing)return old.map(x=>x.key===key?{...x,quantity:Math.min(99,x.quantity+1)}:x);return [...old,{type:'part',key,id:product.id,name:product.name,sku:product.sku,price:product.price,parentId:product.parentId||undefined,personalization:product.personalization||'',quantity:1}].slice(-60)});
 const addEngine=(engine)=>setItems(old=>[...old,{type:'engine',key:'engine:'+crypto.randomUUID(),...engine,quantity:1}].slice(-60));
 const setQuantity=(key,quantity)=>setItems(old=>old.map(x=>x.key===key?{...x,quantity:Math.max(1,Math.min(99,Math.trunc(Number(quantity)||1)))}:x));
 const remove=(key)=>setItems(old=>old.filter(x=>x.key!==key));const clear=()=>setItems([]);
 const count=items.reduce((n,x)=>n+x.quantity,0);
 const value=useMemo(()=>({items,count,addPart,addEngine,setQuantity,remove,clear}),[items,count]);return <CartContext.Provider value={value}>{children}</CartContext.Provider>}
export function useCart(){const c=useContext(CartContext);if(!c)throw Error('CartProvider missing');return c}

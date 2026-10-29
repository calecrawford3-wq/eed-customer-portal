import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {base44} from '@/api/base44Client';
import CustomerPortal from '../CustomerPortal';
import WebsitePortalLogin from './WebsitePortalLogin';
export default function SiteFullPortal(){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;base44.auth.me().then(u=>{if(live)setUser(u||null)}).catch(()=>{}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 if(loading)return <main className="p-10 min-h-screen bg-slate-50 text-slate-900">Opening My Elite…</main>;
 if(!user)return <main className="max-w-lg mx-auto p-6 min-h-[65vh]"><h1 className="text-2xl font-bold">My Elite customer portal</h1><p className="text-zinc-400 mt-3">Sign in using the same Elite portal email and password. You can return to shopping at any time.</p><WebsitePortalLogin onSuccess={()=>window.location.reload()}/></main>;
 return <div className="bg-slate-50 text-slate-900 min-h-screen"><div className="bg-slate-900 text-white px-5 py-3 flex justify-between items-center gap-3"><span className="font-semibold">My Elite Customer Portal</span><Link className="underline text-sm" to="/site/store">Back to Elite Store</Link></div><CustomerPortal/></div>;
}

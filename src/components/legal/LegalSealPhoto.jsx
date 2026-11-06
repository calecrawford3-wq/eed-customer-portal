import React,{useEffect,useState} from 'react';
import {ensureDisplayableUrl,isHeicUrl} from '@/lib/heicUtils';
export default function LegalSealPhoto({src,alt,className=''}){
 const [state,setState]=useState({loading:true,url:null,error:''});
 useEffect(()=>{let active=true;setState({loading:true,url:null,error:''});
  Promise.resolve(isHeicUrl(src)?ensureDisplayableUrl(src):src).then(url=>{if(active)setState({loading:false,url,error:''})}).catch(e=>{if(active)setState({loading:false,url:null,error:e.message||'Unable to convert image'})});
  return()=>{active=false};
 },[src]);
 if(state.loading)return <div className="rounded border bg-slate-100 p-3 text-xs text-slate-500">Converting seal photograph…</div>;
 if(state.error)return <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">Photo could not be displayed: {state.error}. Original image remains attached.</div>;
 return <img src={state.url} alt={alt} className={className} onError={()=>setState(v=>({...v,error:'Browser could not decode the image',url:null}))}/>;
}

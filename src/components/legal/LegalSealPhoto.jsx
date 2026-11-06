import React from 'react';
import {useDisplayImage} from '@/hooks/useDisplayImage';
export default function LegalSealPhoto({src,alt,className='',onError}){
 const {url,loading}=useDisplayImage(src);
 if(loading)return <div className="rounded border bg-slate-100 p-3 text-xs text-slate-500">Loading seal photo…</div>;
 return url?<img src={url} alt={alt} className={className} onError={onError}/>:<span className="text-xs text-red-600">Photo unavailable</span>;
}

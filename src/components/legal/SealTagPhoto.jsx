import React from 'react';
import {useDisplayImage} from '@/hooks/useDisplayImage';
export default function SealTagPhoto({src,alt,className=''}){
 const {url,loading}=useDisplayImage(src);
 return loading?<div className="rounded bg-slate-100 p-4 text-xs text-slate-500">Loading seal photograph…</div>:<img src={url||src} alt={alt} className={className}/>;
}

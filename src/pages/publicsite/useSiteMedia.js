import {useEffect,useState} from 'react';
import {base44Public} from '@/api/base44Client';
export function useSiteMedia(){const [media,setMedia]=useState({});useEffect(()=>{let active=true;base44Public.functions.invoke('getPublicSiteMedia',{}).then(r=>{if(active)setMedia(r?.data?.media||r?.media||{})}).catch(()=>{});return()=>{active=false}},[]);return media}

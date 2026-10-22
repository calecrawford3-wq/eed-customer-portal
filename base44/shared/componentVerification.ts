export const normalizeComponentScan=(value:any)=>String(value||'').trim().toLowerCase();
export function matchesCaseScan(engine:any,code:any){const n=normalizeComponentScan(code);return !!n&&[engine?.tag_code,engine?.eed_id,engine?.engine_serial_number].some(v=>normalizeComponentScan(v)===n);}
export function matchesHeadScan(expected:any,scanned:any){return !!expected?.id&&!!scanned?.id&&expected.id===scanned.id;}

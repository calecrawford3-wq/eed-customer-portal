import {ensureDisplayableUrl} from "@/lib/heicUtils";

// Opens a complete, standalone print layout. The browser's print dialog can save it as PDF.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeImage = value => {
  const url=String(value||'');
  return /^(https:\/\/|blob:|data:image\/(png|jpeg|webp);base64,)/i.test(url) ? escapeHtml(url) : '';
};
export async function printLegalDocument(doc){
  if(!doc)return;
  const win=window.open('','_blank');
  if(!win){window.alert('Allow popups to print this agreement.');return;}
  const displayPhotos=await Promise.all((Array.isArray(doc.seal_tag_photos)?doc.seal_tag_photos:[]).map(async url=>{try{return await ensureDisplayableUrl(url)}catch{return url}}));
  const photos=displayPhotos.map((url,i)=>safeImage(url)?`<figure><img src="${safeImage(url)}" alt="Seal or serial photograph ${i+1}"/><figcaption>Seal / serial tag photograph ${i+1}${doc.seal_tag_numbers?' — seal tags: '+escapeHtml(doc.seal_tag_numbers):''}</figcaption></figure>`:'').join('');
  const signature=(title,url,at)=>`<div class="signature"><strong>${escapeHtml(title)}</strong>${safeImage(url)?`<img src="${safeImage(url)}" alt="${escapeHtml(title)} signature"/>`:'<p>Not signed</p>'}<small>${at?'Signed '+escapeHtml(new Date(at).toLocaleString()):''}</small></div>`;
  win.document.open();win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(doc.title||'Customer Agreement')}</title><style>
    @page{size:letter;margin:.65in}body{font:12px/1.5 Arial,sans-serif;color:#171717;margin:28px auto;max-width:850px}header{border-bottom:3px solid #b91c1c;padding-bottom:15px;margin-bottom:24px}h1{font-size:23px;margin:8px 0}h2{font-size:15px;margin-top:26px}p{margin:7px 0}.body{white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:#555;font-size:11px}.photos{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0;break-inside:avoid}figure img{max-width:100%;max-height:340px;object-fit:contain}figcaption{font-size:10px;color:#555}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}.signature{border-top:1px solid #888;padding-top:10px;break-inside:avoid}.signature img{display:block;max-width:100%;height:90px;object-fit:contain;margin:10px 0}.signature small{display:block;color:#555}.printbar{margin-bottom:20px}@media print{body{margin:0;max-width:none}.printbar{display:none}h2{break-after:avoid}}
  </style></head><body><div class="printbar"><button onclick="window.print()">Print / Save as PDF</button></div><header><strong>ELITE ENGINE DEVELOPMENT</strong><h1>${escapeHtml(doc.title||'Customer Agreement')}</h1><div class="meta">Status: ${escapeHtml((doc.status||'').replaceAll('_',' '))} · Document ID: ${escapeHtml(doc.id||'')}</div></header><section class="body">${escapeHtml(doc.body||'')}</section>${doc.seal_tag_numbers?`<h2>Seal / Serial Tag Numbers</h2><p>${escapeHtml(doc.seal_tag_numbers)}</p>`:''}${photos?`<h2>Exhibit A — Seal Tag & Engine Identification Photographs</h2><p class="meta">These photographs form part of this agreement and identify the seals installed on the contract engine.</p><div class="photos">${photos}</div>`:''}<h2>Electronic Signatures</h2><div class="signatures" style="${doc.document_type==='illegal_parts'?'display:block;max-width:380px':''}">${doc.document_type==='illegal_parts'?'':signature('Elite Engine Development representative',doc.admin_signature,doc.admin_signed_at)}${signature('Customer',doc.customer_signature,doc.customer_signed_at)}</div></body></html>`);win.document.close();win.focus();
}

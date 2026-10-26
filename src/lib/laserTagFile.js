import { generateBarcodeSVG } from '@/components/inventory/BarcodeLabel';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
function barcodeGroup(value,x,y,maxWidth,maxHeight){if(!value)return '';const temp=document.createElement('div');temp.innerHTML=generateBarcodeSVG(value,{width:1,height:40,displayValue:false,margin:0});const svg=temp.querySelector('svg');if(!svg)return '';const w=Number(svg.getAttribute('width'))||400,h=Number(svg.getAttribute('height'))||40,scale=Math.min(maxWidth/w,maxHeight/h);return `<g transform="translate(${x+(maxWidth-w*scale)/2} ${y}) scale(${scale})">${svg.innerHTML}</g>`;}
export function buildLaserTagSvg({kind='case',displayId,componentId='',serial='',platform='',tagCode,widthMm=51,heightMm=19}){
 const W=510,H=190,isHead=kind==='head';
 const type=isHead?'HEAD':kind==='component'?'COMP':'CASE';
 // Exact StayMax blank: 51 x 19 mm; 3 mm holes centered 4 mm from either end.
 // 15 SVG units = 1.5 mm radius. 5 mm clear zone around holes.
 const barcode=barcodeGroup(tagCode,83,93,344,48);
 const id=String(displayId||'');
 const secondary=!isHead&&serial?`SN ${serial}`:'';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${Number(widthMm)}mm" height="${Number(heightMm)}mm" viewBox="0 0 ${W} ${H}">
 <title>Elite Engine Development ${esc(type)} ${esc(id)} laser engraving</title>
 <desc>51 by 19 mm tag. Mounting holes at x=40 and x=470, y=95, diameter 3 mm. White shapes are alignment guides and should not be engraved.</desc>
 <g id="blank-guide" fill="none" stroke="#bbbbbb" stroke-width=".6"><rect x=".3" y=".3" width="509.4" height="189.4" rx="82"/><circle cx="40" cy="95" r="15"/><circle cx="470" cy="95" r="15"/></g>
 <g id="engrave" fill="#000000" font-family="Arial,Helvetica,sans-serif">
 <text x="255" y="49" text-anchor="middle" font-size="45" font-weight="900" font-style="italic" letter-spacing="1">ELITE</text>
 <text x="255" y="65" text-anchor="middle" font-size="14.5" font-weight="800" letter-spacing="1.6">ENGINE DEVELOPMENT</text>
 <path d="M143 71 H367" stroke="#000" stroke-width="2.5"/>
 <text x="89" y="116" font-size="15" font-weight="800">${type}</text>
 ${barcode}
 <text x="255" y="164" text-anchor="middle" font-size="23" font-weight="700" font-family="monospace">${esc(id)}</text>
 ${secondary?`<text x="255" y="181" text-anchor="middle" font-size="11" font-family="monospace">${esc(secondary)}</text>`:''}
 </g></svg>`;
}
export function downloadLaserTagSvgContent(svg,args={}){const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${String(args.displayId||'elite-tag').replace(/[^A-Za-z0-9_-]+/g,'_')}-${args.kind||'tag'}.svg`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function downloadLaserTagSvg(args){const svg=buildLaserTagSvg(args);downloadLaserTagSvgContent(svg,args);return svg;}
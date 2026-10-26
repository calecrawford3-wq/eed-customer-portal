import JsBarcode from 'jsbarcode';
import { eliteLogoPath, eliteLogoTransform } from './eliteLogoPath';

// Simple, font-independent 5x7 vector lettering. LaserGRBL does not reliably import SVG <text>.
const FONT = {
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
 C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
 G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],
 I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],
 K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],
 M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],
 O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],
 Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],
 S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],
 U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],
 W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],
 Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10011','10101','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],
 '6':['01111','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','11110'],
 '-':['00000','00000','00000','11111','00000','00000','00000'],'.':['00000','00000','00000','00000','00000','01100','01100'],
 '/':['00001','00001','00010','00100','01000','10000','10000'],':':['00000','01100','01100','00000','01100','01100','00000'],
 ' ':['00000','00000','00000','00000','00000','00000','00000']
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
function lettering(value, centerX, y, height, maxWidth) {
 const chars = String(value ?? '').toUpperCase().split('');
 const unit = Math.min(height / 7, maxWidth / Math.max(1, chars.length * 6 - 1));
 const startX = centerX - (chars.length * 6 - 1) * unit / 2;
 const segments = [];
 chars.forEach((char, index) => {
  (FONT[char] || FONT[' ']).forEach((row, iy) => {
   for (let ix = 0; ix < 5; ix++) if (row[ix] === '1') {
    const x = startX + (index * 6 + ix) * unit;
    const yy = y + iy * unit;
    segments.push(`M${x.toFixed(3)} ${yy.toFixed(3)}h${unit.toFixed(3)}v${unit.toFixed(3)}h-${unit.toFixed(3)}z`);
   }
  });
 });
 return segments.length ? `<path d="${segments.join('')}" fill="#000"/>` : '';
}
function barcodeGeometry(value, x, y, maxWidth, height) {
 if (!value) return '';
 const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
 try { JsBarcode(svg, String(value), { format:'CODE128', width:1, height:40, displayValue:false, margin:0 }); }
 catch (error) { console.warn('Invalid laser tag barcode', error); return ''; }
 const bars = [...svg.querySelectorAll('g rect')].filter(el => Number(el.getAttribute('width')) > 0);
 const totalWidth = Number(svg.getAttribute('width')) || bars.reduce((m, b) => Math.max(m, Number(b.getAttribute('x') || 0) + Number(b.getAttribute('width'))), 0);
 if (!totalWidth) return '';
 const scale = Math.min(1, maxWidth / totalWidth);
 const offset = x + (maxWidth - totalWidth * scale) / 2;
 return bars.map(b => {
  const bx = offset + Number(b.getAttribute('x') || 0) * scale;
  const bw = Number(b.getAttribute('width')) * scale;
  return `<rect x="${bx.toFixed(3)}" y="${y}" width="${bw.toFixed(3)}" height="${height}" fill="#000"/>`;
 }).join('');
}
export function buildLaserTagSvg({kind='case',displayId,componentId='',serial='',platform='',tagCode,widthMm=51,heightMm=19}) {
 const type = kind === 'head' ? 'HEAD' : kind === 'component' ? 'COMP' : 'CASE';
 const secondary = kind !== 'head' && serial ? `SN ${serial}` : '';
 const barcode = barcodeGeometry(tagCode, 90, 96, 330, 34);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${Number(widthMm)}mm" height="${Number(heightMm)}mm" viewBox="0 0 510 190">
 <title>Elite Engine Development ${esc(type)} ${esc(displayId)} engraving only</title>
 <desc>Engraving geometry only. No blank outline, hole guides, text objects or travel lines.</desc>
 <path d="${eliteLogoPath}" transform="${eliteLogoTransform}" fill="#000"/>
 ${lettering('ENGINE DEVELOPMENT',255,63,12,220)}
 <rect x="147" y="82" width="216" height="2" fill="#000"/>
 ${lettering(type,255,88,9,75)}
 ${barcode}
 ${lettering(displayId,255,139,24,330)}
 ${secondary ? lettering(secondary,255,170,11,330) : ''}
 </svg>`;
}
export function downloadLaserTagSvgContent(svg,args={}) {
 const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`${String(args.displayId||'elite-tag').replace(/[^A-Za-z0-9_-]+/g,'_')}-${args.kind||'tag'}.svg`;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function downloadLaserTagSvg(args){const svg=buildLaserTagSvg(args);downloadLaserTagSvgContent(svg,args);return svg;}

import eliteLogoVector from './eliteLogoVector.txt?raw';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
const FULL_ELITE_LOGO = 'https://media.base44.com/images/public/6a8dd6d29eea1fd6752efdfe/687f4dd96_Elite_Logo_LaserGRBL_Black_White1.png';
const eliteTagLogoPath = 'M1983,218 1729,218 1639,306 1537,589 1860,590 1887,515 1752,515 1751,512 1781,434 1894,434 1899,429 1921,362 1807,361 1830,295 1955,293ZM1188,590 1375,589 1481,296 1484,293 1612,293 1684,218 1196,218 1170,293 1295,294ZM1164,218 922,219 960,237 967,245 873,501 910,590 1029,589ZM579,218 624,242 529,499 532,511 569,590 875,589 845,514 712,514 819,218ZM190,219 242,245 115,589 535,590 502,514 331,515 330,512 360,434 475,434 500,362 385,362 410,294 535,293 561,218Z';
import { tagGlyphs } from './tagFontPaths';

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
function boldLettering(value, centerX, top, height, maxWidth) {
 const chars = String(value ?? '').toUpperCase().split('');
 const glyphs = chars.map(c => tagGlyphs[c] || tagGlyphs[' ']);
 const total = glyphs.reduce((sum,g) => sum + g.advance,0) + Math.max(0,glyphs.length-1)*50;
 const scale = Math.min(height/760, maxWidth/Math.max(total,1));
 const startX = centerX-total*scale/2;
 let offset = 0;
 const paths = glyphs.map(g => {
  const path = g.path ? `<path d="${g.path}" transform="translate(${(startX+offset*scale).toFixed(3)} ${(top+height).toFixed(3)}) scale(${scale.toFixed(6)})" fill="#000"/>` : '';
  offset += g.advance+50;
  return path;
 });
 return paths.join('');
}
function barcodeGeometry(value, x, y, maxWidth, height, inverted = false) {
 if (!value) return '';
 const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
 try { JsBarcode(svg, String(value), { format:'CODE128', width:1, height:40, displayValue:false, margin:0 }); }
 catch (error) { console.warn('Invalid laser tag barcode', error); return ''; }
 const bars = [...svg.querySelectorAll('g rect')].filter(el => Number(el.getAttribute('width')) > 0);
 const totalWidth = Number(svg.getAttribute('width')) || bars.reduce((m, b) => Math.max(m, Number(b.getAttribute('x') || 0) + Number(b.getAttribute('width'))), 0);
 if (!totalWidth) return '';
 // Invert ONLY the barcode: black PNG pixels engrave silver background,
 // leaving the actual barcode bars untouched (red/dark).
 // Explicit rectangles are more reliable than even-odd SVG paths in rasterizers.
 const quiet = 20; // 2 mm per side on the 10 SVG-units/mm coordinate system
 const innerWidth = maxWidth - 2 * quiet;
 const scale = innerWidth / totalWidth;
 const segments = bars.map(b => ({
  start: x + quiet + Number(b.getAttribute('x') || 0) * scale,
  end: x + quiet + (Number(b.getAttribute('x') || 0) + Number(b.getAttribute('width'))) * scale
 })).sort((a, b) => a.start - b.start);
 const rect = (left, right) => right - left > 0.001
  ? `<rect x="${left.toFixed(3)}" y="${y}" width="${(right-left).toFixed(3)}" height="${height}" fill="#000"/>`
  : '';
 if (!inverted) return segments.map(bar => rect(bar.start, bar.end)).join('');
 let cursor = x;
 let engraved = '';
 for (const bar of segments) {
  engraved += rect(cursor, bar.start);
  cursor = Math.max(cursor, bar.end);
 }
 engraved += rect(cursor, x + maxWidth);
 return engraved;
}
function qrGeometry(value, x, y, size, inverted = true) {
 if (!/^\d{8}$/.test(String(value))) throw new Error('Tag needs an eight-digit short scan code');
 // Eight numeric digits fit a 21x21 Version 1 QR at Level M.
 const qr = QRCode.create(String(value), { version: 1, errorCorrectionLevel: 'M' });
 const n = qr.modules.size, quiet = 4, engravedQuiet = 2, unit = size / (n + quiet * 2);
 const cells = [];
 // On red anodized aluminum, engrave all light cells INCLUDING the quiet zone
 // to silver, leaving dark red data modules unengraved. The engraved border is
 // two modules wide; the other two modules remain clear of other artwork.
 for (let row = -engravedQuiet; row < n + engravedQuiet; row++) for (let col = -engravedQuiet; col < n + engravedQuiet; col++) {
  const dark = row >= 0 && row < n && col >= 0 && col < n && Boolean(qr.modules.get(row,col));
  if (dark !== inverted) cells.push(`<rect x="${(x+(col+quiet)*unit).toFixed(3)}" y="${(y+(row+quiet)*unit).toFixed(3)}" width="${(unit+0.001).toFixed(3)}" height="${(unit+0.001).toFixed(3)}"/>`);
 }
 return `<g fill="#000">${cells.join('')}</g>`;
}
export function buildLaserTagSvg({kind='case',displayId,componentId='',serial='',platform='',tagCode,widthMm=51,heightMm=19,barcodeInverted=true}) {
 const type = kind === 'head' ? 'CYLINDER HEAD' : kind === 'component' ? 'COMPONENT' : 'ENGINE CASE';
 const w = Number(widthMm), h = Number(heightMm);
 if (!Number.isFinite(w) || !Number.isFinite(h) || w < 51 || h < 19) {
  throw new Error('Horizontal QR template requires at least 51 mm wide × 19 mm tall');
 }
 // Native 51 × 19 mm aluminum tags, mounted landscape. The existing 3 mm
 // holes sit at the centers of the two short ends. Keep the artwork between
 // them; no cut or hole geometry is ever included in the engraving file.
 // Preserve design proportions when larger tags are selected.
 const qr=qrGeometry(tagCode,314,8,150,barcodeInverted);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 510 190">
 <title>Elite Engine Development ${esc(type)} ${esc(displayId)} horizontal identification tag</title>
 <desc>Landscape 51 × 19 mm artwork; real QR with 4-module quiet zone, inverted for red anodized aluminum, original vector logo, clear of mounting holes. No hole outlines.</desc>
 <g transform="translate(54 15) scale(0.130)">${eliteLogoVector}</g>
 <path d="M57 117 H308 L300 147 H49 Z" fill="#000"/>
 ${boldLettering(type,176,124,17,240).replaceAll('fill="#000"','fill="#fff"')}
 ${boldLettering('TULSA OK USA',174,158,10,225)}
 <rect x="316" y="12" width="2" height="166" fill="#000"/>
 ${qr}
 ${boldLettering(displayId,389,161,14,147)}
 
 ${lettering('INTERNAL USE',389,181,6,145)}
 </svg>`;
}
export function downloadLaserTagSvgContent(svg,args={}) {
 const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`${String(args.displayId||'elite-tag').replace(/[^A-Za-z0-9_-]+/g,'_')}-${args.kind||'tag'}.svg`;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function downloadLaserTagSvg(args){const svg=buildLaserTagSvg(args);downloadLaserTagSvgContent(svg,args);return svg;}

// Raster artwork for LaserGRBL's line-to-line engraving mode.
// 20 pixels/mm keeps small barcode modules and lettering crisp at 51 x 19 mm.
export async function downloadLaserTagPngContent(svg, args = {}) {
 const widthMm = Number(args.widthMm) || 51;
 const heightMm = Number(args.heightMm) || 19;
 const pixelsPerMm = 20;
 const width = Math.round(widthMm * pixelsPerMm);
 const height = Math.round(heightMm * pixelsPerMm);
 const canvas = document.createElement('canvas');
 canvas.width = width;
 canvas.height = height;
 const context = canvas.getContext('2d');
 if (!context) throw new Error('Cannot initialize tag image canvas');
 context.fillStyle = '#ffffff';
 context.fillRect(0, 0, width, height);
 const image = new Image();
 const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
 const url = URL.createObjectURL(blob);
 try {
  await new Promise((resolve, reject) => {
   image.onload = resolve;
   image.onerror = () => reject(new Error('Could not render tag SVG as PNG'));
   image.src = url;
  });
  context.drawImage(image, 0, 0, width, height);
 } finally {
  URL.revokeObjectURL(url);
 }
 const pngBlob = await new Promise((resolve, reject) =>
  canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG export failed')), 'image/png'));
 const pngUrl = URL.createObjectURL(pngBlob);
 const anchor = document.createElement('a');
 anchor.href = pngUrl;
 anchor.download = `${String(args.displayId || 'elite-tag').replace(/[^A-Za-z0-9_-]+/g, '_')}-${args.kind || 'tag'}-LaserGRBL.png`;
 document.body.appendChild(anchor);
 anchor.click();
 anchor.remove();
 setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
}

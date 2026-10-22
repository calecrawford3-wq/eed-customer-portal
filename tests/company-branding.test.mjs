import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
function loadJs(path){const source=ts.transpile(read(path),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});const exports={};new Function('exports','module','require',source)(exports,{exports},()=>{throw Error('unexpected require')});return exports;}
function files(root){const out=[];for(const name of readdirSync(root)){const p=join(root,name),st=statSync(p);if(st.isDirectory())out.push(...files(p));else if(/\.(js|jsx|ts|tsx)$/.test(name))out.push(p);}return out;}

test('settings exposes separate uploaded logos for light and dark backgrounds',()=>{
 const schema=JSON.parse(read('base44/entities/AppSettings.jsonc'));
 assert.ok(schema.properties.company_logo_light_url);
 assert.ok(schema.properties.company_logo_dark_url);
 const page=read('src/pages/Settings.jsx');
 assert.match(page,/Logo for Light Backgrounds/);
 assert.match(page,/Logo for Dark Backgrounds/);
 assert.match(page,/company_logo_light_url/);
 assert.match(page,/company_logo_dark_url/);
});

test('logo resolver selects the correct variant and falls back to the other uploaded variant before legacy',()=>{
 const {resolveCompanyLogo}=loadJs('src/lib/companyLogo.js');
 const settings={company_logo_light_url:'light.png',company_logo_dark_url:'dark.png',company_logo_url:'legacy.png'};
 assert.equal(resolveCompanyLogo(settings,'light'),'light.png');
 assert.equal(resolveCompanyLogo(settings,'dark'),'dark.png');
 assert.equal(resolveCompanyLogo({company_logo_light_url:'light.png',company_logo_url:'legacy.png'},'dark'),'light.png');
 assert.equal(resolveCompanyLogo({company_logo_dark_url:'dark.png',company_logo_url:'legacy.png'},'light'),'dark.png');
 assert.equal(resolveCompanyLogo({company_logo_url:'legacy.png'},'dark'),'legacy.png');
});

test('known dark surfaces explicitly request the dark logo',()=>{
 assert.match(read('src/Layout.jsx'),/usePublicCompanyLogo\('dark'\)/);
 assert.match(read('src/components/SplashScreen.jsx'),/usePublicCompanyLogo\("dark"\)/);
 assert.match(read('src/lib/comparisonEmail.js'),/resolveCompanyLogo\(settings,"dark"\)/);
 assert.match(read('src/pages/EstimateDetail.jsx'),/resolveCompanyLogo\(settings,'dark'\)/);
 assert.match(read('src/pages/InvoiceDetail.jsx'),/resolveCompanyLogo\(settings,'dark'\)/);
 const guestMail=read('base44/functions/sendPublicGuestPaymentEmail/entry.ts');
 assert.match(guestMail,/company_logo_dark_url\|\|settings\.company_logo_light_url/);
});

test('known light surfaces use the light logo path',()=>{
 assert.match(read('src/pages/CheckPrinting.jsx'),/resolveCompanyLogo\(settings,'light'\)/);
 assert.match(read('src/pages/InvoiceViewer.jsx'),/resolveCompanyLogo\(settings,"light"\)/);
 assert.match(read('src/pages/EstimateViewer.jsx'),/resolveCompanyLogo\(data\.settings,"light"\)/);
 assert.match(read('src/pages/PurchaseOrderDetail.jsx'),/resolveCompanyLogo\(settingsData,"light"\)/);
 assert.match(read('src/pages/PortalAccess.jsx'),/usePublicCompanyLogo\('light'\)/);
 assert.match(read('src/pages/GuestPayment.jsx'),/usePublicCompanyLogo\('light'\)/);
});

test('public branding endpoints expose both safe logo variants',()=>{
 const capability=read('base44/shared/publicCapability.ts');
 const publicSettings=read('base44/functions/getPublicSettings/entry.ts');
 for(const src of [capability,publicSettings]){assert.match(src,/company_logo_light_url/);assert.match(src,/company_logo_dark_url/);}
});

test('legacy company logo asset is only retained as a fallback, not hardcoded into UI surfaces',()=>{
 const needle='a0d24b852_EliteEDNoBG1.png';
 const hits=[...files('src'),...files('base44')].filter(p=>read(p).includes(needle));
 assert.deepEqual(hits.sort(),['base44/functions/sendPublicGuestPaymentEmail/entry.ts','src/lib/companyLogo.js'].sort());
});

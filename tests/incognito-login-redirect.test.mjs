import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync('src/App.jsx','utf8');
test('Unauthenticated incognito visitors redirect to sign in instead of waiting for staff access',()=>{
 const redirect=app.indexOf('if(!user?.email) return <Navigate to="/PortalAccess?mode=signin" replace />;');
 const wait=app.indexOf("if(staffAccess==='checking') return <SplashScreen ready={false} />;");
 assert.ok(redirect>=0&&wait>redirect);
});
test('Signed-in users still go through the staff access gate',()=>{
 assert.match(app,/base44\.functions\.invoke\('staffAccessGate',\{\}\)/);
 assert.match(app,/staffAccess==='blocked'/);
 assert.match(app,/staffAccess==='tax_only'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');

test('serialized heads and cases have permanent spec sheets',()=>{
 const spec=JSON.parse(read('base44/entities/EngineComponentSpecSheet.jsonc'));
 const p=spec.properties;
 for(const key of ['component_id','component_code','component_type','head_current_height_in','valve_job_type','valve_seats_replaced','valve_guides_replaced','last_valve_lash_intake','last_valve_lash_exhaust','case_current_deck_measurement_in','last_build_internal_measurements']) assert.ok(p[key],key);
 assert.deepEqual(p.valve_job_type.enum,['unknown','none','radius','5_angle','other']);
});

test('machining completion writes permanent component service history and current specs',()=>{
 const complete=read('base44/functions/completeMachiningTask/entry.ts');
 assert.match(complete,/syncSpecFromMachining/);
 assert.match(complete,/current_head_component_id/);
 assert.match(complete,/current_case_component_id/);
 assert.match(complete,/component_id: task\.component_id/);
 const fields=read('src/components/machining/MachiningTaskFields.jsx');
 assert.match(fields,/Valve job type/);assert.match(fields,/Radius/);assert.match(fields,/5-Angle/);assert.match(fields,/Valve seats replaced/);assert.match(fields,/Valve guides replaced/);
});

test('build save snapshots lash to the current physical head and internal measurements to the case',()=>{
 const helper=read('base44/shared/componentSpec.ts');
 assert.match(helper,/last_valve_lash_intake/);assert.match(helper,/last_valve_lash_exhaust/);assert.match(helper,/current_head_component_id/);assert.match(helper,/current_case_component_id/);assert.match(helper,/last_build_internal_measurements/);
 const jobBuild=read('src/components/jobs/JobBuildTab.jsx');
 assert.match(jobBuild,/syncBuildComponentSpecs/);assert.match(jobBuild,/build-current-head-spec/);assert.match(jobBuild,/priorLashSource/);
 const legacy=read('src/pages/BuildDetail.jsx');assert.match(legacy,/syncBuildComponentSpecs/);assert.match(legacy,/priorLashSource/);
});

test('component spec sheet exposes cross-job history and follows loose core inventory units',()=>{
 const ui=read('src/components/engines/ComponentSpecSheetDialog.jsx');
 assert.match(ui,/ServiceHistoryEntry\.filter\(\{component_id:/);assert.match(ui,/TeardownFinding\.filter\(\{component_id:/);assert.match(ui,/EngineComponentPairing\.filter\(\{component_id:/);assert.match(ui,/Permanent Work & Pairing History/);
 assert.match(read('src/components/engines/EngineIdentityPanel.jsx'),/ComponentSpecSheetDialog/);
 assert.match(read('src/components/inventory/SerializedCoreUnitsDialog.jsx'),/ComponentSpecSheetDialog/);
 assert.match(read('src/pages/BarcodeScan.jsx'),/ComponentSpecSheetDialog/);
});

export function suggestPackages(lines, parts, boxes) {
  const issues = [];
  const packages = [];
  const inventory = new Map(parts.map(p => [String(p.id), p]));
  const skuIndex = new Map(parts.filter(p => p.part_number).map(p => [String(p.part_number).toLowerCase(), p]));
  const units = [];
  for (const line of lines || []) {
    const part = inventory.get(String(line.part_id)) || skuIndex.get(String(line.sku || '').toLowerCase());
    const count = Number(line.quantity);
    if (!part || !Number.isInteger(count) || count < 1 || count > 200) { issues.push('Unknown item or invalid quantity: ' + (line.name || line.sku)); continue; }
    const dims = ['length','width','height'].map(k => Number(part['website_shipping_' + k + '_in']));
    const weight = Number(part.website_shipping_weight_oz);
    if (part.website_shipping_requires_quote || dims.some(v => !Number.isFinite(v) || v <= 0) || !Number.isFinite(weight) || weight <= 0) { issues.push('Shipping measurements or manual quote required: ' + part.name); continue; }
    for (let i = 0; i < count; i++) units.push({name: part.name, sku: part.part_number, dims, weight});
  }
  if (issues.length) return {packages, issues};
  const available = (boxes || []).filter(b => b.active && Number(b.quantity_on_hand) > 0 && ['length','width','height'].every(k => Number(b['inside_' + k + '_in']) > 0));
  const stock = new Map(available.map(b => [b.id, Number(b.quantity_on_hand)]));
  const rotations = d => [[d[0],d[1],d[2]],[d[1],d[0],d[2]],[d[0],d[2],d[1]],[d[2],d[0],d[1]],[d[1],d[2],d[0]],[d[2],d[1],d[0]]];
  const fit = (u,b,height,weight) => rotations(u.dims).find(d => d[0] <= Number(b.inside_length_in) && d[1] <= Number(b.inside_width_in) && height + d[2] <= Number(b.inside_height_in) && (!Number(b.max_weight_lb) || weight + u.weight + Number(b.empty_weight_oz) <= Number(b.max_weight_lb)*16));
  units.sort((a,b) => b.dims.reduce((x,y)=>x*y,1) - a.dims.reduce((x,y)=>x*y,1));
  for (const u of units) {
    let found = packages.map(pkg => ({pkg, orientation: fit(u,pkg.box,pkg.height,pkg.itemWeight)})).find(x => x.orientation);
    if (!found) {
      const choices = available.filter(b => stock.get(b.id) > 0).map(box => ({box,orientation:fit(u,box,0,0)})).filter(x => x.orientation).sort((a,b) => (Number(a.box.inside_length_in)*Number(a.box.inside_width_in)*Number(a.box.inside_height_in))-(Number(b.box.inside_length_in)*Number(b.box.inside_width_in)*Number(b.box.inside_height_in)));
      if (!choices.length) {issues.push('No stocked box fits: '+u.name);continue;}
      const choice = choices[0]; stock.set(choice.box.id,stock.get(choice.box.id)-1);
      const pkg = {box:choice.box,items:[],height:0,itemWeight:0}; packages.push(pkg); found = {pkg,orientation:choice.orientation};
    }
    found.pkg.items.push({name:u.name,sku:u.sku});found.pkg.height+=found.orientation[2];found.pkg.itemWeight+=u.weight;
  }
  return {packages:packages.map(p=>({boxId:p.box.id,boxName:p.box.name,items:p.items,weightOz:p.itemWeight+Number(p.box.empty_weight_oz),dimensions:[p.box.inside_length_in,p.box.inside_width_in,p.box.inside_height_in]})),issues};
}

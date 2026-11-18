// Manufacturer-direct is an eligibility path, not a guarantee of supplier acceptance.
export function turn14Availability(part:any,quantity:number){
 const qty=Number(quantity),warehouse=Number(part?.turn14_available_quantity||0);
 const direct=!!String(part?.turn14_dropship_controller_id||'').trim();
 if(!part?.turn14_item_id||part?.turn14_dropship_enabled!==true)return {eligible:false,reason:'Turn 14 dropship is not enabled'};
 if(!Number.isInteger(qty)||qty<1)return {eligible:false,reason:'Invalid quantity'};
 if(part?.turn14_can_purchase===false)return {eligible:false,reason:'Supplier item is not purchasable'};
 if(part?.turn14_purchase_cost==null||!Number.isFinite(Number(part?.turn14_purchase_cost))||Number(part.turn14_purchase_cost)<0)return {eligible:false,reason:'Supplier cost is unavailable'};
 if(warehouse>=qty)return {eligible:true,method:'warehouse',requires_quote:true};
 if(direct)return {eligible:true,method:'manufacturer_direct',requires_quote:true};
 return {eligible:false,reason:'Insufficient Turn 14 warehouse stock and no manufacturer-direct option'};
}

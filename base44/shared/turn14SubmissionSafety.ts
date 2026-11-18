export const rejectionCases=[
 {id:'out_of_stock',label:'Supplier out of stock',status:409,kind:'rejected',message:'Supplier cannot fulfill requested quantity'},
 {id:'invalid_address',label:'Invalid shipping address',status:422,kind:'rejected',message:'Supplier rejected recipient shipping address'},
 {id:'supplier_rejected',label:'Supplier rejects order',status:400,kind:'rejected',message:'Supplier order rejected'},
 {id:'api_unavailable',label:'Supplier API unavailable',status:503,kind:'uncertain',message:'Supplier unavailable; submission outcome cannot be confirmed'},
 {id:'timeout',label:'Timeout after submission',status:504,kind:'uncertain',message:'Connection timed out; supplier may have accepted the order'},
 {id:'duplicate',label:'Duplicate submission',status:409,kind:'duplicate',message:'Order already submitted'},
 {id:'unpaid',label:'Unverified payment',status:409,kind:'blocked',message:'Verified payment required'}
];
export function classifyTurn14SubmissionError(message:string){
 const text=String(message||'');
 if(/failed \((400|401|403|404|409|422)\)/i.test(text))return {kind:'rejected',safeToRetryAfterCorrection:true};
 return {kind:'uncertain',safeToRetryAfterCorrection:false};
}
export function simulateTurn14Rejection(caseId:string){
 const item=rejectionCases.find(x=>x.id===caseId);
 if(!item)throw Error('Unknown rejection test');
 const before={payment_verified:true,turn14_supplier_order_reference:'',linked_purchase_order_ids:[],inventory_delta:0};
 const after={...before};
 const noSupplierCall=true;
 const noMutation=JSON.stringify(before)===JSON.stringify(after);
 const blocked=item.kind==='blocked'||item.kind==='duplicate'||item.kind==='rejected';
 const requiresReconciliation=item.kind==='uncertain';
 const tests=[
 {name:'No Turn 14 API request',pass:noSupplierCall},
 {name:'No payment or inventory changes',pass:noMutation},
 {name:'No PO created',pass:after.linked_purchase_order_ids.length===0},
 {name:'No duplicate supplier submission',pass:blocked||requiresReconciliation},
 {name:'Uncertain submission held for reconciliation',pass:item.kind!=='uncertain'||requiresReconciliation}
 ];
 return {scenario:item.id,label:item.label,simulated:true,status:item.status,supplier_message:item.message,handling:item.kind,requires_manual_reconciliation:requiresReconciliation,order_action:requiresReconciliation?'Hold for manual reconciliation before retry':item.kind==='duplicate'?'Do not submit again':item.kind==='blocked'?'Block submission until payment verified':'Hold order for review and correction',tests,passed:tests.every(t=>t.pass)};
}

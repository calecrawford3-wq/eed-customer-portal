import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { receivePOItems } from "../../shared/poReceiving.ts";

// Receive items on a purchase order. Delegates the core receiving logic
// (inventory increment, PO update, shortage allocation) to the shared
// poReceiving module so packing-slip receiving uses the exact same path.
//
// POST { po_id, received_items: [{ line_idx, qty, unit_cost }] }
// Returns { success, po_status, inventory_updates, shortage_allocations, jobs_updated }

export default async function(req) {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin required" }, { status: 403 });
    }

    const body = await req.json();
    const poId = body.po_id;
    const receivedItems = body.received_items || [];
    // Stable receipt ID for idempotent receiving — the UI should pass the same
    // receipt_id on retry so a repeated submission doesn't double-increment stock.
    const receiptId = body.receipt_id;
    const supplierInvoiceNumber = typeof body.supplier_invoice_number === 'string' ? body.supplier_invoice_number.trim() : '';
    if (supplierInvoiceNumber.length > 100) return Response.json({error:'Supplier invoice number is too long'},{status:400});
    if (typeof receiptId !== "string" || !receiptId || receiptId.length > 200) {
      return Response.json({ error: "Stable receipt_id required for safe receiving" }, { status: 400 });
    }

    if (!poId) return Response.json({ error: "po_id required" }, { status: 400 });
    if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
      return Response.json({ error: "received_items required" }, { status: 400 });
    }

    const operationId = `receive-po:${poId}:${receiptId}`;
    const result = await receivePOItems(base44.asServiceRole, poId, receivedItems, operationId, receiptId, supplierInvoiceNumber);

    // Bank purchases are audit evidence, not additional expenses. When fully
    // received, reconcile only exact single-payment matches and reuse any PO expense.
    let bank_reconciliation = 'not_applicable';
    if(result.po_status==='received'){
      try{
        const svc=base44.asServiceRole.entities;
        const list=(v)=>Array.isArray(v)?v:v?.items||[];
        const txs=list(await svc.BankTransaction.filter({po_id:poId})).filter(t=>t.status==='pending_po');
        if(txs.length===1){
          const tx=txs[0],po=list(await svc.PurchaseOrder.filter({id:poId}))[0];
          const expenses=list(await svc.Expense.filter({po_id:poId}));
          const total=Math.round(Number(po?.total||Number(po?.subtotal||0)+Number(po?.shipping_cost||0)+Number(po?.tax_amount||0))*100);
          if(Math.abs(total-Math.round(Number(tx.amount)*100))>1){
            bank_reconciliation='amount_mismatch';
            await svc.BankTransaction.update(tx.id,{review_note:'PO received but bank amount differs; manual review required'});
          }else if(expenses.length>1){
            bank_reconciliation='multiple_expenses_review';
          }else{
            let expense=expenses[0];
            if(!expense){
              expense=await svc.Expense.create({expense_number:'PO-BANK-'+tx.id.slice(-10),po_id:poId,description:'Supplier PO '+(po.po_number||''),vendor:tx.merchant||'Supplier',amount:Number(tx.amount),date:tx.date,category:'parts_cogs',payment_method:'card',is_deductible:true,source:'purchase_order',tax_included_in_amount:true,notes:'Auto-matched on PO receipt to bank transaction '+tx.plaid_transaction_id});
            }
            const amount=Math.round((Number(expense.amount||0)+(expense.tax_included_in_amount===false?Number(expense.tax_amount||0):0))*100);
            if(Math.abs(amount-Math.round(Number(tx.amount)*100))>1){
              bank_reconciliation='expense_amount_mismatch';
            }else{
              await svc.BankTransaction.update(tx.id,{status:'matched',expense_id:expense.id,reviewed_at:new Date().toISOString(),review_note:'Automatically reconciled when PO received'});
              bank_reconciliation='matched';
            }
          }
        }else if(txs.length>1)bank_reconciliation='multiple_payments_review';
      }catch(error){
        console.error('[receivePurchaseOrder] Bank reconciliation deferred:',error.message);
        bank_reconciliation='retry_required';
      }
    }
    return Response.json({ success: true, po_id: poId, bank_reconciliation, ...result });
  } catch (error) {
    console.error("[receivePurchaseOrder] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
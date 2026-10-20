// Page-level UI permissions for active non-owner staff.
// These controls do NOT grant backend entity access. Sensitive data remains
// governed by entity RLS and authenticated functions.
export const STAFF_PAGE_GROUPS = [
  {label:'Employee tools',pages:[['EmployeePortal','My Time Clock & HR'],['StaffWorkspace','Restricted Shop Job Queue']]},
  {label:'Daily operations',pages:[['Dashboard','Today / Work Queue'],['Jobs','Jobs'],['JobCard','Job Cards'],['BuildWorkflow','Build Workflow'],['MachiningStation','Machining Station'],['ShopDisplay','Shop Display'],['BarcodeScan','Barcode Scanner'],['ExceptionDashboard','Exceptions'],['Calendar','Calendar']]},
  {label:'Customers & communication',pages:[['Customers','Customers'],['CustomerDetail','Customer Details'],['CustomerSuccess','Customer Success'],['RefreshRequests','Refresh Requests'],['Communications','Inbox'],['Messaging','Messages'],['Emails','Emails']]},
  {label:'Inventory & purchasing',pages:[['Inventory','Inventory'],['PurchaseOrders','Purchase Orders'],['PurchaseOrderDetail','Purchase Order Details'],['Suppliers','Suppliers']]},
  {label:'Sales & billing',pages:[['Estimates','Estimates'],['EstimateDetail','Estimate Details'],['Invoices','Invoices'],['InvoiceDetail','Invoice Details'],['Approvals','Approvals'],['Payments','Payments'],['Credits','Credits'],['Expenses','Expenses'],['Reports','Reports']]},
  {label:'Reference & technical',pages:[['Platforms','Platforms'],['SpecSheets','Spec Sheets'],['SpecView','Spec Viewer'],['SpecCompare','Spec Compare'],['Documents','Documents'],['Builds','Builds'],['BuildDetail','Build Details'],['DevelopmentData','Development Data'],['RnDEngineDeveloper','R&D Developer']]},
];
export const STAFF_PAGE_KEYS = [...new Set(STAFF_PAGE_GROUPS.flatMap(g=>g.pages.map(p=>p[0])))];
export const STAFF_ALWAYS_ALLOWED = ['EmployeePortal'];
export const STAFF_OWNER_ONLY = ['HRAdmin','OwnerEarnings','Settings','PaymentMigration','VoipPhonebookSettings','VoipPhonebookSyncHistory'];
export const STAFF_SAFE_WORKSPACE_PAGES = ['EmployeePortal','StaffWorkspace'];
export function canStaffVisit(page,permissions){
 return STAFF_ALWAYS_ALLOWED.includes(page)||Array.isArray(permissions)&&permissions.includes(page)&&STAFF_PAGE_KEYS.includes(page);
}

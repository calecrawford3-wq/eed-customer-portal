import DemoStepPlan from "./DemoStepPlan";
import DemoStepIdentity from "./DemoStepIdentity";
import DemoStepFinancing from "./DemoStepFinancing";
import DemoStepApproval from "./DemoStepApproval";
import DemoStepAgreement from "./DemoStepAgreement";
import DemoStepAutopay from "./DemoStepAutopay";
import DemoStepDeposit from "./DemoStepDeposit";
import DemoLoanDashboard from "./DemoLoanDashboard";

// One step → component map shared by the isolated /demo page and the inline
// journey on the normal offer page, so both render the same screens.
export const STEP_COMPONENTS = {
  plan: DemoStepPlan,
  identity: DemoStepIdentity,
  financing: DemoStepFinancing,
  approval: DemoStepApproval,
  agreement: DemoStepAgreement,
  autopay: DemoStepAutopay,
  deposit: DemoStepDeposit,
  dashboard: DemoLoanDashboard,
};
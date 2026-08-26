import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { MessagingProvider } from "@/contexts/MessagingContext";
import CustomerPortal from './pages/CustomerPortal';
import RefreshRequests from './pages/RefreshRequests';
import Credits from './pages/Credits';
import DebugServiceWorker from './pages/DebugServiceWorker';
import CustomerSuccess from './pages/CustomerSuccess';
import CalendarPage from './pages/CalendarPage';
import BarcodeScan from './pages/BarcodeScan';
import Messaging from './pages/Messaging';
import Emails from './pages/Emails';
import Approvals from './pages/Approvals';
import Simulator from './pages/Simulator';
import DynoImport from './pages/DynoImport';
import DevelopmentData from './pages/DevelopmentData';
import ModelAccuracy from './pages/ModelAccuracy';
import DynoComparison from './pages/DynoComparison';
import PredictionRules from './pages/PredictionRules';
import SimilarBuilds from './pages/SimilarBuilds';
import ControlledChanges from './pages/ControlledChanges';
import RnDEngineDeveloper from './pages/RnDEngineDeveloper';
import VoipPhonebookSettings from './pages/VoipPhonebookSettings';
import VoipPhonebookSyncHistory from './pages/VoipPhonebookSyncHistory';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  // Role-based routing: non-admin users only see the customer portal
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <Routes>
        <Route path="*" element={<CustomerPortal />} />
      </Routes>
    );
  }

  // Admin users see the full app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/Credits" element={<LayoutWrapper currentPageName="Credits"><Credits /></LayoutWrapper>} />
      <Route path="/CustomerPortal" element={<CustomerPortal />} />
      <Route path="/RefreshRequests" element={<LayoutWrapper currentPageName="RefreshRequests"><RefreshRequests /></LayoutWrapper>} />
      <Route path="/CustomerSuccess" element={<LayoutWrapper currentPageName="CustomerSuccess"><CustomerSuccess /></LayoutWrapper>} />
      <Route path="/Calendar" element={<LayoutWrapper currentPageName="Calendar"><CalendarPage /></LayoutWrapper>} />
      <Route path="/BarcodeScan" element={<LayoutWrapper currentPageName="BarcodeScan"><BarcodeScan /></LayoutWrapper>} />
      <Route path="/Messaging" element={<LayoutWrapper currentPageName="Messaging"><Messaging /></LayoutWrapper>} />
      <Route path="/Emails" element={<LayoutWrapper currentPageName="Emails"><Emails /></LayoutWrapper>} />
      <Route path="/Approvals" element={<LayoutWrapper currentPageName="Approvals"><Approvals /></LayoutWrapper>} />
      <Route path="/Simulator" element={<LayoutWrapper currentPageName="Simulator"><Simulator /></LayoutWrapper>} />
      <Route path="/DynoImport" element={<LayoutWrapper currentPageName="DynoImport"><DynoImport /></LayoutWrapper>} />
      <Route path="/DevelopmentData" element={<LayoutWrapper currentPageName="DevelopmentData"><DevelopmentData /></LayoutWrapper>} />
      <Route path="/ModelAccuracy" element={<LayoutWrapper currentPageName="ModelAccuracy"><ModelAccuracy /></LayoutWrapper>} />
      <Route path="/DynoComparison" element={<LayoutWrapper currentPageName="DynoComparison"><DynoComparison /></LayoutWrapper>} />
      <Route path="/PredictionRules" element={<LayoutWrapper currentPageName="PredictionRules"><PredictionRules /></LayoutWrapper>} />
      <Route path="/SimilarBuilds" element={<LayoutWrapper currentPageName="SimilarBuilds"><SimilarBuilds /></LayoutWrapper>} />
      <Route path="/ControlledChanges" element={<LayoutWrapper currentPageName="ControlledChanges"><ControlledChanges /></LayoutWrapper>} />
      <Route path="/RnDEngineDeveloper" element={<LayoutWrapper currentPageName="RnDEngineDeveloper"><RnDEngineDeveloper /></LayoutWrapper>} />
      <Route path="/VoipPhonebookSettings" element={<LayoutWrapper currentPageName="VoipPhonebookSettings"><VoipPhonebookSettings /></LayoutWrapper>} />
      <Route path="/VoipPhonebookSyncHistory" element={<LayoutWrapper currentPageName="VoipPhonebookSyncHistory"><VoipPhonebookSyncHistory /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  // All protected routes go through auth
  return (
    <QueryClientProvider client={queryClientInstance}>
      <MessagingProvider>
      <Router>
        <AuthProvider>
          <NavigationTracker />
          <Routes>
            <Route path="/debug-sw" element={<DebugServiceWorker />} />
            <Route path="*" element={<AuthenticatedApp />} />
          </Routes>
        </AuthProvider>
      </Router>
      </MessagingProvider>
      <Toaster />
      <SonnerToaster position="bottom-right" richColors />
    </QueryClientProvider>
  )
}

export default App
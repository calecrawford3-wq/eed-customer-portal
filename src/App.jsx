import React, { useState, useEffect } from 'react'
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
import Communications from './pages/Communications';
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
import BuildWorkflow from './pages/BuildWorkflow';
import CannedJobs from './pages/CannedJobs';
import Addons from './pages/Addons';
import VoipPhonebookSettings from './pages/VoipPhonebookSettings';
import VoipPhonebookSyncHistory from './pages/VoipPhonebookSyncHistory';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import OAuthConsent from './pages/OAuthConsent';
import Jobs from './pages/Jobs';
import JobCard from './pages/JobCard';
import ReplacementRules from './pages/ReplacementRules';
import ExceptionDashboard from './pages/ExceptionDashboard';
import MachiningStation from './pages/MachiningStation';
import AdditionalWorkViewer from './pages/AdditionalWorkViewer';
import JobCardErrorBoundary from '@/components/jobs/JobCardErrorBoundary';
import SplashScreen from '@/components/SplashScreen';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user } = useAuth();
  const [splashGone, setSplashGone] = useState(false);
  const loading = isLoadingPublicSettings || isLoadingAuth;

  // Keep splash mounted briefly after loading clears so the fade-out plays
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setSplashGone(true), 700);
      return () => clearTimeout(t);
    }
  }, [loading]);

  // Show branded splash screen while checking app public settings or auth
  if (loading) {
    return <SplashScreen ready={false} />;
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

  // Splash overlay during fade-out transition (after loading clears)
  const splashOverlay = !splashGone ? <SplashScreen ready={true} /> : null;

  if (!isAdmin) {
    return (
      <>
        {splashOverlay}
        <Routes>
          <Route path="*" element={<CustomerPortal />} />
        </Routes>
      </>
    );
  }

  // Admin users see the full app
  return (
    <>
    {splashOverlay}
    <Routes>
...
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </>
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
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route path="/AdditionalWorkViewer/:token" element={<AdditionalWorkViewer />} />
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
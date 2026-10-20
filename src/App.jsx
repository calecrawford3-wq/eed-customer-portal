import React, { useState, useEffect } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { MessagingProvider } from "@/contexts/MessagingContext";
import CustomerPortal from './pages/CustomerPortal';
import PortalAccess from './pages/PortalAccess';
import PortalResetPassword from './pages/PortalResetPassword';
import GuestPayment from './pages/GuestPayment';
import PaymentMigration from './pages/PaymentMigration';
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
import Layout from './Layout.jsx';

const { Pages, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

const EXPLICIT_PAGE_NAMES = [
  "Credits", "RefreshRequests", "CustomerSuccess", "Calendar", "BarcodeScan",
  "Messaging", "Emails", "Communications", "Approvals", "Simulator", "DynoImport",
  "DevelopmentData", "ModelAccuracy", "DynoComparison", "PredictionRules",
  "SimilarBuilds", "ControlledChanges", "RnDEngineDeveloper", "BuildWorkflow",
  "CannedJobs", "Addons", "VoipPhonebookSettings", "VoipPhonebookSyncHistory",
  "Jobs", "JobCard", "ReplacementRules", "ExceptionDashboard", "MachiningStation",
];
const ALL_PAGE_NAMES = [...new Set([...Object.keys(Pages), ...EXPLICIT_PAGE_NAMES])];

/**
 * Auth-gated layout route. Checks auth, shows splash/errors, renders
 * CustomerPortal (non-admin) or admin Layout + <Outlet/> (admin).
 */
function AdminLayout() {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user } = useAuth();
  const location = useLocation();
  const [splashGone, setSplashGone] = useState(false);
  const loading = isLoadingPublicSettings || isLoadingAuth;

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setSplashGone(true), 700);
      return () => clearTimeout(t);
    }
  }, [loading]);

  if (loading) return <SplashScreen ready={false} />;

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') {
      // Customer portal uses Elite's own email/password form, not Base44's hosted login.
      if (location.pathname.toLowerCase().startsWith('/customerportal')) {
        return <Navigate to="/PortalAccess?mode=signin" replace />;
      }
      navigateToLogin(); return null;
    }
    return <UserNotRegisteredError />;
  }

  const isAdmin = user?.role === 'admin';
  const splashOverlay = !splashGone ? <SplashScreen ready={true} /> : null;

  if (!isAdmin) {
    return (<>{splashOverlay}<NavigationTracker /><CustomerPortal /></>);
  }

  const pathSegment = location.pathname.replace(/^\//, '').split('/')[0];
  const currentPageName = !pathSegment
    ? mainPageKey
    : ALL_PAGE_NAMES.find(k => k.toLowerCase() === pathSegment.toLowerCase()) || pathSegment;

  // CustomerPortal: render without admin sidebar (preserves prior behavior)
  if (location.pathname === '/CustomerPortal') {
    return (<>{splashOverlay}<NavigationTracker /><Outlet /></>);
  }

  return (
    <>
      {splashOverlay}
      <NavigationTracker />
      <Layout currentPageName={currentPageName}>
        <Outlet />
      </Layout>
    </>
  );
}

// Build <Route> elements for pagesConfig pages
const configPageRoutes = Object.entries(Pages).map(([path, Page]) =>
  <Route key={path} path={path} element={<Page />} />
);

const routes = createRoutesFromElements(
  <>
    <Route path="/debug-sw" element={<DebugServiceWorker />} />
    <Route path="/PortalAccess" element={<PortalAccess />} />
    <Route path="/guest/:type/:token" element={<GuestPayment />} />
    <Route path="/forgot-password" element={<PortalAccess initialMode="forgot" />} />
    <Route path="/reset-password" element={<PortalResetPassword />} />
    <Route path="/oauth/consent" element={<OAuthConsent />} />
    <Route path="/AdditionalWorkViewer/:token" element={<AdditionalWorkViewer />} />
    <Route path="/" element={<AdminLayout />}>
      {mainPageKey && MainPage && <Route index element={<MainPage />} />}
      {configPageRoutes}
      <Route path="Credits" element={<Credits />} />
      <Route path="PaymentMigration" element={<PaymentMigration />} />
      <Route path="CustomerPortal" element={<CustomerPortal />} />
      <Route path="RefreshRequests" element={<RefreshRequests />} />
      <Route path="CustomerSuccess" element={<CustomerSuccess />} />
      <Route path="Calendar" element={<CalendarPage />} />
      <Route path="BarcodeScan" element={<BarcodeScan />} />
      <Route path="Messaging" element={<Messaging />} />
      <Route path="Emails" element={<Emails />} />
      <Route path="Communications" element={<Communications />} />
      <Route path="Approvals" element={<Approvals />} />
      <Route path="Simulator" element={<Simulator />} />
      <Route path="DynoImport" element={<DynoImport />} />
      <Route path="DevelopmentData" element={<DevelopmentData />} />
      <Route path="ModelAccuracy" element={<ModelAccuracy />} />
      <Route path="DynoComparison" element={<DynoComparison />} />
      <Route path="PredictionRules" element={<PredictionRules />} />
      <Route path="SimilarBuilds" element={<SimilarBuilds />} />
      <Route path="ControlledChanges" element={<ControlledChanges />} />
      <Route path="RnDEngineDeveloper" element={<RnDEngineDeveloper />} />
      <Route path="BuildWorkflow" element={<BuildWorkflow />} />
      <Route path="CannedJobs" element={<CannedJobs />} />
      <Route path="Addons" element={<Addons />} />
      <Route path="VoipPhonebookSettings" element={<VoipPhonebookSettings />} />
      <Route path="VoipPhonebookSyncHistory" element={<VoipPhonebookSyncHistory />} />
      <Route path="Jobs" element={<Jobs />} />
      <Route path="JobCard" element={<JobCardErrorBoundary><JobCard /></JobCardErrorBoundary>} />
      <Route path="ReplacementRules" element={<ReplacementRules />} />
      <Route path="ExceptionDashboard" element={<ExceptionDashboard />} />
      <Route path="MachiningStation" element={<MachiningStation />} />
      <Route path="*" element={<PageNotFound />} />
    </Route>
  </>
);

const router = createBrowserRouter(routes);


function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <MessagingProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </MessagingProvider>
      <Toaster />
      <SonnerToaster position="bottom-right" richColors />
    </QueryClientProvider>
  )
}

export default App

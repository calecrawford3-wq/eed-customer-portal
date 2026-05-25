import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import CustomerPortal from './pages/CustomerPortal';
import RefreshRequests from './pages/RefreshRequests';
import EstimateViewer from './pages/EstimateViewer';
import InvoiceViewer from './pages/InvoiceViewer';
import DebugServiceWorker from './pages/DebugServiceWorker';
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
      <Route path="/CustomerPortal" element={<CustomerPortal />} />
      <Route path="/RefreshRequests" element={<LayoutWrapper currentPageName="RefreshRequests"><RefreshRequests /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


const BUILD_VERSION = "v3-deployment-" + new Date().toISOString().split('T')[0];

function App() {
  console.log("=== APP LOADED ===");
  console.log("BUILD_VERSION:", BUILD_VERSION);
  console.log("PATHNAME:", window.location.pathname);
  console.log("SEARCH:", window.location.search);
  console.log("HASH:", window.location.hash);
  console.log("TIMESTAMP:", new Date().toISOString());
  
  // Check public route FIRST, before any auth infrastructure
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isPublicRoute = pathname.startsWith('/public/') || pathname === '/public-test';

  console.log("IS_PUBLIC_ROUTE:", isPublicRoute);
  console.log("PATHNAME CHECK:", { pathname, startsWithPublic: pathname.startsWith('/public/'), equalsPublicTest: pathname === '/public-test' });

  // Render public routes in complete isolation—no auth
  if (isPublicRoute) {
    console.log("✓ ✓ ✓ ENTERING PUBLIC ROUTE HANDLER - NO AUTH INFRASTRUCTURE");
    console.log("Rendering public route for pathname:", pathname);
    console.log("EstimateViewer imported:", typeof EstimateViewer);
    console.log("InvoiceViewer imported:", typeof InvoiceViewer);
    return (
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/public/estimate/:token" element={<EstimateViewer buildVersion={BUILD_VERSION} />} />
            <Route path="/public/invoice/:token" element={<InvoiceViewer buildVersion={BUILD_VERSION} />} />
            <Route path="/public-test" element={<div style={{padding: "20px"}}><strong>PUBLIC TEST - NO AUTH</strong><br/>BUILD: {BUILD_VERSION}</div>} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    );
  }
  
  console.log("NOT a public route - proceeding to protected app with auth provider");

  // All protected routes go through auth
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <AuthProvider>
          <NavigationTracker />
          <Routes>
            <Route path="/debug-sw" element={<DebugServiceWorker />} />
            <Route path="*" element={<AuthenticatedApp />} />
          </Routes>
        </AuthProvider>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
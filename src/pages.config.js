/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import BuildDetail from './pages/BuildDetail';
import Builds from './pages/Builds';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Platforms from './pages/Platforms';
import SpecCompare from './pages/SpecCompare';
import SpecEditor from './pages/SpecEditor';
import SpecSheets from './pages/SpecSheets';
import SpecView from './pages/SpecView';
import ShopDisplay from './pages/ShopDisplay';
import __Layout from './Layout.jsx';


export const PAGES = {
    "BuildDetail": BuildDetail,
    "Builds": Builds,
    "Dashboard": Dashboard,
    "Documents": Documents,
    "Platforms": Platforms,
    "SpecCompare": SpecCompare,
    "SpecEditor": SpecEditor,
    "SpecSheets": SpecSheets,
    "SpecView": SpecView,
    "ShopDisplay": ShopDisplay,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
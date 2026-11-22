import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireStaff } from './auth/RequireStaff';
import { ToastProvider, Spinner } from './components/ui';
import ShowroomLayout from './showroom/ShowroomLayout';
import ShowroomHome from './showroom/ShowroomHome';
import ProductPage from './showroom/ProductPage';

// Admin code is split out so customers never download it.
const Login = lazy(() => import('./admin/Login'));
const ResetPassword = lazy(() => import('./admin/ResetPassword'));
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const Dashboard = lazy(() => import('./admin/Dashboard'));
const Products = lazy(() => import('./admin/Products'));
const ProductEditor = lazy(() => import('./admin/ProductEditor'));
const Collections = lazy(() => import('./admin/Collections'));
const Quotations = lazy(() => import('./admin/Quotations'));
const QuotationEditor = lazy(() => import('./admin/QuotationEditor'));
const Sales = lazy(() => import('./admin/Sales'));
const Expenses = lazy(() => import('./admin/Expenses'));
const Inventory = lazy(() => import('./admin/Inventory'));
const ToOrder = lazy(() => import('./admin/ToOrder'));
const Customers = lazy(() => import('./admin/Customers'));
const Settings = lazy(() => import('./admin/Settings'));

/** Admin pages use the "VANGELUX Admin" install manifest (opens straight into /#/admin). */
function ManifestSwitcher() {
  const loc = useLocation();
  useEffect(() => {
    const link = document.getElementById('app-manifest') as HTMLLinkElement | null;
    if (!link) return;
    const want = loc.pathname.startsWith('/admin') ? './manifest-admin.webmanifest' : './manifest.webmanifest';
    if (!link.getAttribute('href')?.endsWith(want.slice(2))) link.setAttribute('href', want);
    document.title = loc.pathname.startsWith('/admin') ? 'VANGELUX Admin' : 'VANGELUX — More than clothing. A message.';
  }, [loc.pathname]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <ManifestSwitcher />
          <Suspense fallback={<div className="min-h-screen"><Spinner /></div>}>
            <Routes>
              <Route element={<ShowroomLayout />}>
                <Route index element={<ShowroomHome />} />
                <Route path="product/:id" element={<ProductPage />} />
              </Route>

              <Route path="admin/login" element={<Login />} />
              <Route path="admin/reset-password" element={<ResetPassword />} />
              <Route path="admin" element={<RequireStaff><AdminLayout /></RequireStaff>}>
                <Route index element={<Dashboard />} />
                <Route path="products" element={<Products />} />
                <Route path="products/new" element={<ProductEditor />} />
                <Route path="products/:id" element={<ProductEditor />} />
                <Route path="collections" element={<Collections />} />
                <Route path="quotations" element={<Quotations />} />
                <Route path="quotations/new" element={<QuotationEditor />} />
                <Route path="quotations/:id" element={<QuotationEditor />} />
                <Route path="sales" element={<Sales />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="to-order" element={<ToOrder />} />
                <Route path="customers" element={<Customers />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}

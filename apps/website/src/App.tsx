import { ArrowRight, CarFront, CircleHelp, LayoutDashboard, Shield, UserRound } from 'lucide-react';
import { Link, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const publicRoutes = [
  { path: '/', label: 'Home' },
  { path: '/about', label: 'About' },
  { path: '/services', label: 'Services' },
  { path: '/customers', label: 'Customers' },
  { path: '/drivers', label: 'Drivers' },
  { path: '/contact', label: 'Contact' },
];

const portalRoutes = [
  { path: '/driver/register', label: 'Driver registration', role: 'Driver' },
  { path: '/driver/login', label: 'Driver login', role: 'Driver' },
  { path: '/driver/dashboard', label: 'Driver dashboard', role: 'Driver' },
  { path: '/driver/documents', label: 'Driver documents', role: 'Driver' },
  { path: '/customer/login', label: 'Customer login', role: 'Customer' },
  { path: '/customer/profile', label: 'Customer profile', role: 'Customer' },
  { path: '/customer/bookings', label: 'Customer bookings', role: 'Customer' },
  { path: '/admin/login', label: 'Admin login', role: 'Admin' },
  { path: '/admin/dashboard', label: 'Admin dashboard', role: 'Admin' },
  { path: '/admin/drivers', label: 'Manage drivers', role: 'Admin' },
  { path: '/admin/customers', label: 'Manage customers', role: 'Admin' },
  { path: '/admin/bookings', label: 'Manage bookings', role: 'Admin' },
  { path: '/admin/rewards', label: 'Rewards', role: 'Admin' },
  { path: '/admin/restaurants', label: 'Restaurants', role: 'Admin' },
  { path: '/admin/settings', label: 'Settings', role: 'Admin' },
];

function SiteLayout() {
  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b border-[#E5E5E5]">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link className="text-xl font-bold tracking-[0.24em]" to="/">
            RAVERO
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            {publicRoutes.slice(1).map((route) => (
              <NavLink
                className="text-sm text-[#666666] transition hover:text-black"
                key={route.path}
                to={route.path}
              >
                {route.label}
              </NavLink>
            ))}
          </div>
          <Link
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
            to="/customer/login"
          >
            Get started
          </Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="border-t border-[#E5E5E5] px-6 py-8 text-center text-sm text-[#666666]">
        RAVERO · Website scaffold
      </footer>
    </div>
  );
}

function PortalLayout() {
  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b border-[#E5E5E5]">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link className="text-xl font-bold tracking-[0.24em]" to="/">
            RAVERO
          </Link>
          <Link className="text-sm text-[#666666] underline underline-offset-4" to="/">
            Back to website
          </Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="border-t border-[#E5E5E5] px-6 py-8 text-center text-sm text-[#666666]">
        Portal scaffold · Authentication and role checks are not yet connected
      </footer>
    </div>
  );
}

function Page() {
  const { pathname } = useLocation();
  const currentPage = [...publicRoutes, ...portalRoutes].find((route) => route.path === pathname);
  const isHome = pathname === '/';
  const portal = portalRoutes.find((route) => route.path === pathname);

  if (portal) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-20">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-[#666666]">
          {portal.role} portal · Scaffold
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">{portal.label}</h1>
        <p className="mt-4 max-w-xl leading-7 text-[#666666]">
          This route is reserved for the {portal.role.toLowerCase()} portal. Authentication,
          role-based access control, and page functionality will be connected when the backend is
          implemented.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <p className="mb-5 text-sm font-medium uppercase tracking-[0.2em] text-[#666666]">
        Mobility, made simple
      </p>
      <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-7xl">
        {isHome ? 'Your city. Your ride.' : currentPage?.label ?? 'RAVERO'}
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-[#666666]">
        {isHome
          ? 'A unified mobility platform for Hyderabad and Rangareddy. This website is a starter scaffold.'
          : `${currentPage?.label ?? 'This page'} is part of the unified RAVERO website scaffold.`}
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Link
          className="inline-flex items-center gap-2 rounded-md bg-black px-5 py-3 text-sm font-medium text-white"
          to="/customer/login"
        >
          Customer portal <ArrowRight size={16} />
        </Link>
        <Link
          className="rounded-md border border-black px-5 py-3 text-sm font-medium text-black"
          to="/driver/register"
        >
          Become a driver
        </Link>
      </div>
      <div className="mt-16 grid gap-4 sm:grid-cols-3">
        <Feature icon={<CarFront />} title="Rides" description="Customer travel portal scaffold" />
        <Feature icon={<UserRound />} title="Driver portal" description="Driver onboarding scaffold" />
        <Feature icon={<Shield />} title="Admin portal" description="Operations portal scaffold" />
      </div>
      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
        <Link className="inline-flex items-center gap-2 text-sm text-[#666666]" to="/contact">
          <CircleHelp size={16} /> Contact and support
        </Link>
        <Link className="inline-flex items-center gap-2 text-sm text-[#666666]" to="/admin/login">
          <LayoutDashboard size={16} /> Admin sign in
        </Link>
      </div>
    </section>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-[#E5E5E5] p-5">
      <div className="mb-5 text-black">{icon}</div>
      <h2 className="font-medium">{title}</h2>
      <p className="mt-2 text-sm text-[#666666]">{description}</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        {publicRoutes.map((route) => (
          <Route element={<Page />} key={route.path} path={route.path} />
        ))}
        <Route element={<Page />} path="*" />
      </Route>
      <Route element={<PortalLayout />}>
        {portalRoutes.map((route) => (
          <Route element={<Page />} key={route.path} path={route.path} />
        ))}
      </Route>
    </Routes>
  );
}

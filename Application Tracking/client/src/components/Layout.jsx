import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useScrapeTrigger } from '../hooks/useScrapeTrigger';

// ── Inline SVG icons ──────────────────────────────────────────────
const Icon = {
  Dashboard: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2.75" y="2.75" width="6" height="6" rx="1.4"/>
      <rect x="11.25" y="2.75" width="6" height="6" rx="1.4"/>
      <rect x="2.75" y="11.25" width="6" height="6" rx="1.4"/>
      <rect x="11.25" y="11.25" width="6" height="6" rx="1.4"/>
    </svg>
  ),
  Briefcase: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2.75" y="6.25" width="14.5" height="10.25" rx="2"/>
      <path d="M7 6.25V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 13 5v1.25"/>
      <path d="M2.75 11h14.5"/>
    </svg>
  ),
  Users: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="8" cy="7.5" r="2.75"/>
      <path d="M2.75 16.25c.5-2.5 2.7-4 5.25-4s4.75 1.5 5.25 4"/>
      <circle cx="14.5" cy="6.5" r="2"/>
      <path d="M13.5 12.4c2 .3 3.5 1.6 3.75 3.85"/>
    </svg>
  ),
  ClipboardCheck: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="4.75" y="3.5" width="10.5" height="13.5" rx="1.6"/>
      <path d="M7.5 3.5V2.5h5v1"/>
      <path d="M7.5 10.5l1.75 1.75 3.25-3.5"/>
    </svg>
  ),
  Chart: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 16.5h14"/>
      <rect x="4.5" y="10.5" width="2.5" height="5" rx="0.5"/>
      <rect x="9" y="6.5" width="2.5" height="9" rx="0.5"/>
      <rect x="13.5" y="3" width="2.5" height="12.5" rx="0.5"/>
    </svg>
  ),
  Settings: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="10" cy="10" r="2.25"/>
      <path d="M16.25 10c0-.36-.03-.71-.08-1.05l1.42-1.1-1.5-2.6-1.71.55a6.3 6.3 0 0 0-1.81-1.05l-.32-1.78h-3l-.32 1.78a6.3 6.3 0 0 0-1.81 1.05l-1.71-.55-1.5 2.6 1.42 1.1c-.05.34-.08.69-.08 1.05s.03.71.08 1.05l-1.42 1.1 1.5 2.6 1.71-.55a6.3 6.3 0 0 0 1.81 1.05l.32 1.78h3l.32-1.78a6.3 6.3 0 0 0 1.81-1.05l1.71.55 1.5-2.6-1.42-1.1c.05-.34.08-.69.08-1.05Z"/>
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="9" r="5.25"/>
      <path d="M13.5 13.5l3.5 3.5"/>
    </svg>
  ),
  Sun: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="10" cy="10" r="3.25"/>
      <path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.6 4.6l1.05 1.05M14.35 14.35l1.05 1.05M4.6 15.4l1.05-1.05M14.35 5.65l1.05-1.05"/>
    </svg>
  ),
  Moon: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M16.5 12.5A6.5 6.5 0 0 1 7.5 3.5a6.5 6.5 0 1 0 9 9Z"/>
    </svg>
  ),
  Menu: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <path d="M3 6h14M3 10h14M3 14h14"/>
    </svg>
  ),
  Loader: (p) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.05 5.05l1.42 1.42M13.54 13.54l1.41 1.41M5.05 14.95l1.42-1.42M13.54 6.46l1.41-1.41"/>
    </svg>
  ),
};

// ── Nav items ─────────────────────────────────────────────────────
const NAV = [
  { to: '/',             label: 'Dashboard',    icon: Icon.Dashboard,      exact: true },
  { to: '/jobs',         label: 'Job Listings', icon: Icon.Briefcase },
  { to: '/applications', label: 'Applications', icon: Icon.ClipboardCheck },
  { to: '/referrals',    label: 'Referrals',    icon: Icon.Users },
  { to: '/analytics',    label: 'Analytics',    icon: Icon.Chart },
  { to: '/settings',     label: 'Settings',     icon: Icon.Settings },
];

// ── Tooltip ───────────────────────────────────────────────────────
// Appears to the right of the rail on hover, vertically centered.
function Tooltip({ label }) {
  return (
    <span
      className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg
                 bg-ink text-surface text-xs font-medium whitespace-nowrap
                 pointer-events-none z-50
                 opacity-0 group-hover:opacity-100
                 translate-x-1 group-hover:translate-x-0
                 transition-all duration-150"
      style={{ top: '50%', transform: 'translateY(-50%)' }}
      /* override Tailwind's translate-x transform so translateY still applies */
    >
      {label}
      {/* Arrow */}
      <span className="absolute right-full top-1/2 -translate-y-1/2
                       border-4 border-transparent border-r-ink" />
    </span>
  );
}

// ── NavRailItem ───────────────────────────────────────────────────
function NavRailItem({ to, label, icon: IconComp, exact }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `relative flex items-center justify-center w-full h-12 group
         transition-colors duration-150 select-none
         ${isActive ? 'text-ink' : 'text-ink-faint hover:text-ink'}`
      }
    >
      {({ isActive }) => (
        <>
          {/* Active: 3px left-rule */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2
                             w-[3px] h-5 rounded-r-full bg-accent-600" />
          )}

          {/* Icon container */}
          <span className={`flex items-center justify-center w-9 h-9 rounded-xl
                            transition-colors duration-150
                            ${isActive
                              ? 'bg-surface-sunken'
                              : 'group-hover:bg-surface-sunken'}`}>
            <IconComp className="w-5 h-5" />
          </span>

          {/* Tooltip */}
          <Tooltip label={label} />
        </>
      )}
    </NavLink>
  );
}

// ── RailButton (utility — scrape, dark mode) ──────────────────────
function RailButton({ onClick, label, icon: IconComp, disabled, accent }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex items-center justify-center w-full h-11 group
                  transition-colors duration-150 select-none
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${accent
                    ? 'text-accent-600 dark:text-accent-400 hover:text-accent-700'
                    : 'text-ink-faint hover:text-ink'}`}
    >
      <span className={`flex items-center justify-center w-9 h-9 rounded-xl
                        transition-colors duration-150 group-hover:bg-surface-sunken`}>
        <IconComp className="w-[18px] h-[18px]" />
      </span>
      <Tooltip label={label} />
    </button>
  );
}

// ── Layout ────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { darkMode, toggleDarkMode } = useApp();
  const { scraping, elapsedSec, trigger: handleScrape } = useScrapeTrigger();

  // Human-readable elapsed: "2m 14s" or "47s"
  const elapsedLabel = elapsedSec >= 60
    ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
    : `${elapsedSec}s`;

  return (
    <div className="h-screen overflow-hidden flex bg-surface-sunken text-ink">

      {/* ══════════════════════════════════════════════════════════
          64px ICON RAIL — desktop
          ══════════════════════════════════════════════════════════ */}
      <aside className="hidden lg:flex w-16 flex-shrink-0 flex-col
                        bg-surface border-r border-line z-40 overflow-visible">

        {/* Logo */}
        <div className="flex items-center justify-center h-14 border-b border-line flex-shrink-0">
          <Link
            to="/"
            className="relative flex items-center justify-center
                       w-9 h-9 rounded-xl
                       bg-gradient-to-br from-accent-500 to-accent-700
                       shadow-sm hover:shadow-md transition-shadow"
            title="Dashboard"
          >
            <span className="text-white text-sm font-bold tracking-tight select-none">S</span>
            {/* Online indicator */}
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full
                             bg-emerald-500 ring-2 ring-surface" />
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col items-stretch py-2 overflow-y-auto overflow-x-visible">
          {NAV.map(item => (
            <NavRailItem key={item.to} {...item} />
          ))}
        </nav>

        {/* Utility buttons */}
        <div className="flex flex-col items-stretch border-t border-line py-2 flex-shrink-0 overflow-visible">
          <RailButton
            onClick={handleScrape}
            disabled={scraping}
            label={scraping ? `Scraping… ${elapsedLabel}` : 'Scrape Now'}
            icon={scraping ? Icon.Loader : Icon.Search}
            accent
          />
          <RailButton
            onClick={toggleDarkMode}
            label={darkMode ? 'Light Mode' : 'Dark Mode'}
            icon={darkMode ? Icon.Sun : Icon.Moon}
          />
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════
          MOBILE — slide-in drawer + topbar
          ══════════════════════════════════════════════════════════ */}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-surface border-r border-line
                         flex flex-col transform transition-transform duration-200 lg:hidden
                         ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Drawer header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-line">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-500 to-accent-700
                          flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-ink">Job Tracker</p>
            <p className="text-2xs text-ink-faint">Siddharth · IIM Lucknow</p>
          </div>
        </div>

        {/* Drawer nav */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: IconComp, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
            >
              <IconComp className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Drawer utilities */}
        <div className="p-3 border-t border-line space-y-1">
          <button
            onClick={() => { handleScrape(); setMobileOpen(false); }}
            disabled={scraping}
            className="btn-accent w-full text-sm"
          >
            <Icon.Search className="w-3.5 h-3.5" />
            {scraping ? `Scraping… ${elapsedLabel}` : 'Scrape Now'}
          </button>
          <button onClick={toggleDarkMode} className="btn-ghost w-full text-sm justify-center">
            {darkMode ? <><Icon.Sun className="w-3.5 h-3.5" /> Light Mode</> : <><Icon.Moon className="w-3.5 h-3.5" /> Dark Mode</>}
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════
          MAIN content area
          ══════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3
                           bg-surface border-b border-line flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="btn-ghost p-1.5"
            aria-label="Open menu"
          >
            <Icon.Menu className="w-5 h-5" />
          </button>
          <span className="text-[13px] font-semibold tracking-tight text-ink">Job Tracker</span>
          <button onClick={toggleDarkMode} className="btn-ghost p-1.5" aria-label="Toggle theme">
            {darkMode ? <Icon.Sun className="w-4 h-4" /> : <Icon.Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

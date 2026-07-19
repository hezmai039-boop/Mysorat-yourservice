import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useDarkMode } from "../hooks/useDarkMode";

export function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const { t, i18n } = useTranslation();

  function toggleLanguage() {
    i18n.changeLanguage(i18n.resolvedLanguage === "ar" ? "en" : "ar");
  }

  const links = user
    ? [
        { to: "/dashboard", label: t("nav.dashboard") },
        ...(user.role === "INDIVIDUAL" || user.role === "BUSINESS" ? [{ to: "/chat", label: t("nav.assistant") }] : []),
        ...(user.role === "OWNER" || user.role === "EXPERT"
          ? [{ to: "/admin", label: user.role === "OWNER" ? t("nav.admin") : t("nav.myCustomers") }]
          : []),
        { to: "/settings", label: t("nav.settings") },
      ]
    : [
        { to: "/login", label: t("nav.login") },
        { to: "/register", label: t("nav.getStarted") },
      ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-xl font-extrabold text-brand">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-l from-brand-light to-brand text-white">م</span>
          {t("brand")}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-3 text-sm">
          <button onClick={toggleLanguage} className="btn-secondary !px-3 !py-2 text-xs font-bold">
            {t("nav.language")}
          </button>
          <button onClick={toggle} aria-label={t("nav.toggleDarkMode")} className="btn-secondary !px-3 !py-2">
            {isDark ? "☀️" : "🌙"}
          </button>
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="btn-secondary !px-4 !py-2">{l.label}</Link>
          ))}
          {user && (
            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="btn-primary !px-4 !py-2"
            >
              {t("nav.logout")}
            </button>
          )}
        </nav>

        {/* Mobile toggle */}
        <div className="flex md:hidden items-center gap-2">
          <button onClick={toggleLanguage} className="btn-secondary !px-3 !py-2 text-xs font-bold">
            {t("nav.language")}
          </button>
          <button onClick={toggle} aria-label={t("nav.toggleDarkMode")} className="btn-secondary !px-3 !py-2">
            {isDark ? "☀️" : "🌙"}
          </button>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t("nav.menu")}
            aria-expanded={menuOpen}
            className="btn-secondary !px-3 !py-2"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="md:hidden flex flex-col gap-1 border-t border-slate-200 dark:border-slate-800 px-4 py-3">
          {links.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)} className="btn-secondary !justify-start">
              {l.label}
            </Link>
          ))}
          {user && (
            <button
              onClick={() => {
                logout();
                setMenuOpen(false);
                navigate("/");
              }}
              className="btn-primary !justify-start mt-1"
            >
              {t("nav.logout")}
            </button>
          )}
        </nav>
      )}
    </header>
  );
}

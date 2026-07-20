import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";

function Item({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          isActive
            ? "bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light"
            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`
      }
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </NavLink>
  );
}

function GroupLabel({ children }: { children: string }) {
  return <p className="px-3 mb-1 mt-5 text-xs font-bold text-slate-400 first:mt-0">{children}</p>;
}

export function Sidebar() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  if (!user) return null;

  const isOwner = user.role === "OWNER";
  const isExpert = user.role === "EXPERT";
  const isCustomer = user.role === "INDIVIDUAL" || user.role === "BUSINESS";

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col">
      <div className="card p-4 sticky top-20">
        <GroupLabel>{t("sidebar.main")}</GroupLabel>
        <nav className="flex flex-col gap-1">
          {isCustomer && <Item to="/dashboard" label={t("sidebar.dashboard")} icon="🏠" />}
          {isCustomer && <Item to="/chat" label={t("sidebar.chats")} icon="💬" />}
          {(isOwner || isExpert) && (
            <Item to="/admin" label={isOwner ? t("sidebar.dashboard") : t("sidebar.myRequests")} icon="🏠" />
          )}
        </nav>

        <GroupLabel>{t("sidebar.support")}</GroupLabel>
        <nav className="flex flex-col gap-1">
          <Item to="/settings" label={t("sidebar.settings")} icon="⚙️" />
          <Item to="/support" label={t("sidebar.contactSupport")} icon="🎧" />
          <Item to="/trust" label={t("sidebar.helpCenter")} icon="❓" />
        </nav>

        {isCustomer && (
          <div className="mt-6 rounded-xl bg-gradient-to-l from-brand-light to-brand p-4 text-white">
            <p className="text-sm font-bold flex items-center gap-1">{t("sidebar.upgradeTitle")}</p>
            <p className="text-xs opacity-90 mt-1 mb-3">{t("sidebar.upgradeDesc")}</p>
            <Link
              to="/support?topic=plus"
              className="block w-full rounded-lg bg-white/20 py-2 text-xs font-semibold text-center hover:bg-white/30 transition"
            >
              {t("sidebar.upgradeButton")}
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

import { NavLink } from "react-router-dom";
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
  if (!user) return null;

  const isOwner = user.role === "OWNER";
  const isExpert = user.role === "EXPERT";
  const isCustomer = user.role === "INDIVIDUAL" || user.role === "BUSINESS";

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col">
      <div className="card p-4 sticky top-20">
        <GroupLabel>الرئيسية</GroupLabel>
        <nav className="flex flex-col gap-1">
          {isCustomer && <Item to="/dashboard" label="لوحة التحكم" icon="🏠" />}
          {isCustomer && <Item to="/chat" label="المحادثات" icon="💬" />}
          {(isOwner || isExpert) && <Item to="/admin" label={isOwner ? "لوحة التحكم" : "طلباتي"} icon="🏠" />}
        </nav>

        <GroupLabel>الدعم</GroupLabel>
        <nav className="flex flex-col gap-1">
          <Item to="/settings" label="الإعدادات" icon="⚙️" />
          <Item to="/support" label="تواصل مع الدعم" icon="🎧" />
          <Item to="/trust" label="مركز المساعدة" icon="❓" />
        </nav>

        {isCustomer && (
          <div className="mt-6 rounded-xl bg-gradient-to-l from-brand-light to-brand p-4 text-white">
            <p className="text-sm font-bold flex items-center gap-1">⭐ ترقية الحساب</p>
            <p className="text-xs opacity-90 mt-1 mb-3">احصل على معالجة أولوية لطلباتك</p>
            <button className="w-full rounded-lg bg-white/20 py-2 text-xs font-semibold hover:bg-white/30 transition">
              اكتشف ميسوور بلس
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

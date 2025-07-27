import { NavLink } from "react-router-dom";

const navItems = [
  { label: "Analytics", path: "/" },
  { label: "Data Upload", path: "/upload" },
  { label: "Strategies", path: "/strategies" },
  { label: "Screeners", path: "/screeners" },
  { label: "Backtest Engine", path: "/backtest" },
  { label: "Results", path: "/results" },
  { label: "Settings", path: "/settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-60 bg-gray-900 text-white h-screen flex flex-col p-4">
      <h2 className="text-2xl font-bold mb-8">COOK</h2>
      <nav className="flex flex-col gap-3">
        {navItems.map(({ label, path }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              isActive
                ? "bg-gray-700 px-3 py-2 rounded text-sm font-medium"
                : "text-gray-300 hover:bg-gray-800 px-3 py-2 rounded text-sm"
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
} 
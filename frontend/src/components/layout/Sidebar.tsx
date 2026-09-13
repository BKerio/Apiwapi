import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  IconDashboard,
  IconUsers,
  IconLayers,
  IconSend,
  IconUserCog,
  IconScrollText,
  IconBarChart,
  IconSettings,
  IconChevronLeft,
  IconChevronRight,
  IconLogOut,
} from '@/components/icons/SolidIcons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { confirmAndSignOut } from '@/lib/session';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type NavItem = { label: string; path: string; Icon: any; roles: string[] };

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];
const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const SUPER_ADMIN_ONLY = ['SUPER_ADMIN'];

const menuSections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Dashboard', path: '/dashboard', Icon: IconDashboard, roles: ALL_ROLES },
      { label: 'Members', path: '/members', Icon: IconUsers, roles: ALL_ROLES },
      { label: 'Groups', path: '/groups', Icon: IconLayers, roles: ALL_ROLES },
      { label: 'Campaigns', path: '/campaigns', Icon: IconSend, roles: ALL_ROLES },
      { label: 'Reports', path: '/reports', Icon: IconBarChart, roles: ALL_ROLES },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Operators', path: '/admin/users', Icon: IconUserCog, roles: MANAGER_ROLES },
      { label: 'Audit Logs', path: '/admin/audit-logs', Icon: IconScrollText, roles: MANAGER_ROLES },
      { label: 'Settings', path: '/settings', Icon: IconSettings, roles: SUPER_ADMIN_ONLY },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'My Profile', path: '/profile', Icon: IconUserCog, roles: ALL_ROLES },
    ],
  },
];

function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();
  const navigate = useNavigate();
  // When collapsed, hovering the rail temporarily expands it as an overlay.
  const [peek, setPeek] = useState(false);

  const visibleSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => user && item.roles.includes(user.role)),
    }))
    .filter((section) => section.items.length > 0);
  const visibleItems = visibleSections.flatMap((section) => section.items);

  const activePath = visibleItems
    .map((item) => item.path)
    .filter((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.role?.charAt(0) ?? 'U';

  const handleLogout = () => confirmAndSignOut(logout, navigate);

  return (
    <>
      <aside
        className={`sidebar${collapsed ? ' collapsed' : ''}${collapsed && peek ? ' peek' : ''}`}
        onMouseEnter={() => collapsed && setPeek(true)}
        onMouseLeave={() => setPeek(false)}
      >
       <div className="sidebar-inner">
        {/* Brand header */}
        <div className="sidebar-head">
          <button
            onClick={onToggleCollapse}
            className="sidebar-collapse-btn"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
          </button>
          <div className="brand-logo">
            <span className="brand-mark" aria-hidden="true">&#128276;</span>
          </div>
          <div className="brand-text">
            <b>APIWAPI</b>
            <span className="brand-tag">Push Notification Platform</span>
          </div>
        </div>

        {/* Nav scroll */}
        <nav className="nav-scroll">
          {visibleSections.map((section, idx) => (
            <div className="nav-group" key={section.title ?? `section-${idx}`}>
              {section.title && <div className="nav-group-label">{section.title}</div>}
              {section.items.map((item) => {
                const isActive = item.path === activePath;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`nav-item${isActive ? ' active' : ''}`}
                  >
                    <item.Icon size={20} />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="av av-sm" style={{ background: 'var(--green)' }}>{initials}</div>
            <div className="sidebar-user-meta">
              <b>{user?.name ?? 'User'}</b>
              <span>{user?.role?.replace('_', ' ')}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-logout-btn"
            title="Sign Out"
          >
            <IconLogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
       </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="bottomnav">
        {visibleItems.slice(0, 5).map((item) => {
          const isActive = item.path === activePath;
          return (
            <Link key={item.path} to={item.path} className={`bn-item${isActive ? ' on' : ''}`}>
              <item.Icon size={22} />
              <span>{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default Sidebar;

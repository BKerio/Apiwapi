import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import RoleGuard from '@/components/shared/RoleGuard';
import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/pages/auth/LoginPage';
import type { Role } from '@/types/api';

// Heavy authenticated pages are code-split so they load on demand (keeps the
// initial bundle small). The Suspense boundary lives in AppShell.
const OverviewDashboard = lazy(() => import('@/pages/dashboards/OverviewDashboard'));
const MembersPage = lazy(() => import('@/pages/members/MembersPage'));
const GroupsPage = lazy(() => import('@/pages/groups/GroupsPage'));
const CampaignsPage = lazy(() => import('@/pages/campaigns/CampaignsPage'));
const NewCampaignPage = lazy(() => import('@/pages/campaigns/NewCampaignPage'));
const CampaignDetailPage = lazy(() => import('@/pages/campaigns/CampaignDetailPage'));
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'));
const UserManagementPage = lazy(() => import('@/pages/admin/UserManagementPage'));
const AuditLogsPage = lazy(() => import('@/pages/admin/AuditLogsPage'));
const ProfilePage = lazy(() => import('@/pages/shared/ProfilePage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));

const Unauthorized = () => <div className="p-10 font-sans font-bold text-status-danger text-center">Unauthorized Access</div>;

const MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN'];
const SUPER_ADMIN_ONLY: Role[] = ['SUPER_ADMIN'];

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/unauthorized',
    element: <Unauthorized />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <OverviewDashboard />,
      },
      {
        path: 'members',
        element: <MembersPage />,
      },
      {
        path: 'groups',
        element: <GroupsPage />,
      },
      {
        path: 'campaigns',
        element: <CampaignsPage />,
      },
      {
        path: 'campaigns/new',
        element: <NewCampaignPage />,
      },
      {
        path: 'campaigns/:id',
        element: <CampaignDetailPage />,
      },
      {
        path: 'reports',
        element: <ReportsPage />,
      },
      {
        path: 'admin/users',
        element: (
          <RoleGuard allowed={MANAGER_ROLES}>
            <UserManagementPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/audit-logs',
        element: (
          <RoleGuard allowed={MANAGER_ROLES}>
            <AuditLogsPage />
          </RoleGuard>
        ),
      },
      {
        // Self-service account page - available to every signed-in role.
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: 'settings',
        element: (
          <RoleGuard allowed={SUPER_ADMIN_ONLY}>
            <SettingsPage />
          </RoleGuard>
        ),
      },
      {
        path: '*',
        element: <div className="p-10 font-sans font-bold text-slate-text text-center">Page Not Found</div>,
      },
    ],
  },
]);

export default router;

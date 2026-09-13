export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: { membersOnboarded: number; campaignsCreated: number };
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

// ── Members & Groups ──────────────────────────────────────────────────────────

export type GroupPosition = 'MODERATOR' | 'VICE_MODERATOR' | 'SECRETARY' | 'VICE_SECRETARY' | 'TREASURER';

export const GROUP_POSITION_OPTIONS: { value: GroupPosition; label: string }[] = [
  { value: 'MODERATOR', label: 'Moderator' },
  { value: 'VICE_MODERATOR', label: 'Vice Moderator' },
  { value: 'SECRETARY', label: 'Secretary' },
  { value: 'VICE_SECRETARY', label: 'Vice Secretary' },
  { value: 'TREASURER', label: 'Treasurer' },
];

export const GROUP_POSITION_LABELS: Record<GroupPosition, string> = Object.fromEntries(
  GROUP_POSITION_OPTIONS.map((o) => [o.value, o.label])
) as Record<GroupPosition, string>;

export interface GroupRef {
  id: string;
  name: string;
}

// A group a member belongs to, plus the leadership position (if any) they
// hold within that specific group.
export interface MemberGroupRef extends GroupRef {
  position: GroupPosition | null;
}

export interface Member {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  isSubscribed: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  groups: MemberGroupRef[];
}

export interface Group {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { members: number };
}

export interface GroupDetail extends Group {
  members: PaginatedResponse<Pick<Member, 'id' | 'name' | 'phone' | 'email' | 'isSubscribed'> & { position: GroupPosition | null }>;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export type CampaignAudience = 'ALL_MEMBERS' | 'GROUP' | 'SELECTED';
export type CampaignStatus = 'SENDING' | 'COMPLETED' | 'FAILED';
export type RecipientStatus = 'PENDING' | 'SENT' | 'FAILED';

export const AUDIENCE_OPTIONS: { value: CampaignAudience; label: string }[] = [
  { value: 'ALL_MEMBERS', label: 'All members' },
  { value: 'GROUP', label: 'A group' },
  { value: 'SELECTED', label: 'Selected members' },
];

export interface Campaign {
  id: string;
  name: string;
  /** The notification title. */
  title: string;
  /** The notification body. */
  message: string;
  audience: CampaignAudience;
  groupId?: string | null;
  groupNameSnapshot?: string | null;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  createdById: string;
  createdBy: { id: string; name: string };
}

export interface CampaignRecipient {
  id: string;
  status: RecipientStatus;
  error?: string | null;
  sentAt?: string | null;
  phoneSnapshot: string;
  nameSnapshot: string;
  memberId?: string | null;
}

export interface CampaignPreview {
  /** Members actually reachable (have ≥1 registered device) that match this audience. */
  recipientCount: number;
  /** The raw device fan-out count, which can run ahead of recipientCount for multi-device members. */
  deviceCount: number;
  sample: string;
}

export interface CampaignProgressEvent {
  campaignId: string;
  status: CampaignStatus;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
}

// ── Audit Logs (admin activity trail) ────────────────────────────────────────

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGIN_FAILED';
export type AuditSubjectType = 'USER' | 'MEMBER' | 'GROUP' | 'CAMPAIGN' | 'PUSH_GATEWAY';

export const AUDIT_ACTION_OPTIONS: { value: AuditAction; label: string }[] = [
  { value: 'CREATE', label: 'Create' },
  { value: 'UPDATE', label: 'Update' },
  { value: 'DELETE', label: 'Delete' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGIN_FAILED', label: 'Login failed' },
];

export const AUDIT_SUBJECT_OPTIONS: { value: AuditSubjectType; label: string }[] = [
  { value: 'USER', label: 'User' },
  { value: 'MEMBER', label: 'Member' },
  { value: 'GROUP', label: 'Group' },
  { value: 'CAMPAIGN', label: 'Campaign' },
  { value: 'PUSH_GATEWAY', label: 'Push gateway' },
];

export interface AuditLog {
  id: string;
  action: AuditAction;
  subjectType: AuditSubjectType;
  subjectId: string;
  summary?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  createdAt: string;
  userId: string;
  user: { id: string; name: string; email: string; role: Role };
}

// ── Settings: push gateway ───────────────────────────────────────────────────

export interface PushGatewaySummary {
  configured: boolean;
  isActive: boolean;
  projectId: string | null;
  updatedAt: string | null;
}

export interface PushTestResult {
  ok: boolean;
  message: string;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface ReportsOverview {
  range: { from: string; to: string };
  totals: {
    members: number;
    subscribedMembers: number;
    groups: number;
    campaigns: number;
    messagesSent: number;
    messagesFailed: number;
  };
  campaignsOverTime: { date: string; sent: number; failed: number; campaigns: number }[];
  audienceBreakdown: { audience: string; count: number }[];
  deliveryBreakdown: { status: string; count: number }[];
  membersByGroup: { group: string; count: number }[];
  recentCampaigns: {
    id: string;
    name: string;
    status: CampaignStatus;
    audience: CampaignAudience;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    createdAt: string;
  }[];
}

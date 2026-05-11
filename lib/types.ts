export type Role = "admin" | "employee";

export type Profile = {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  assigned_to: string | null;
  created_by: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  done: boolean;
  created_at: string;
};

export type Shift = {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_at: string;
};

export type TimeOffRequest = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "denied";
  reviewed_by: string | null;
  created_at: string;
};

export type Horse = {
  id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_at: string;
};

export type FeedingChart = {
  id: string;
  horse_id: string;
  am_feed: string | null;
  pm_feed: string | null;
  supplements: string | null;
  special_notes: string | null;
  responsible_employee: string | null;
  created_at: string;
};

export type FeedingLog = {
  id: string;
  chart_id: string | null;
  horse_id: string | null;
  employee_id: string | null;
  feeding_type: "AM" | "PM";
  done: boolean;
  date: string;
  created_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string | null;
  created_by: string | null;
  created_at: string;
};

export type ClockLog = {
  id: string;
  user_id: string;
  user_name: string;
  action: "in" | "out";
  created_at: string;
};

export type AdminNote = {
  id: string;
  title: string;
  body: string | null;
  created_by: string | null;
  created_at: string;
};

export type Availability = {
  id: string;
  employee_id: string;
  week_start: string;
  available_days: Record<string, { start?: string; end?: string }>;
  notes: string | null;
  created_at: string;
};

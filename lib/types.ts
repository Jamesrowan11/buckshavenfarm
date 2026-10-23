export type Role = "admin" | "employee";

// All timestamps (created_at) are ISO-8601 strings in UTC. Calendar fields
// (date, due_date, week_start, …) are 'YYYY-MM-DD'; times are 'HH:MM:SS'.

export type Barn = "log-barn" | "arena-barn";

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
};

export type ProfileListItem = Profile & { has_password: boolean };

export type UserOption = { id: string; name: string };

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
  barn: Barn | null;
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
  barn: Barn | null;
  created_at: string;
};

export type FeedingChartWithResponsible = FeedingChart & { responsible_name: string | null };

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

// Rows joined with the related user's display name.
export type TaskWithAssignee = Task & { assignee_name: string | null };
export type ShiftWithEmployee = Shift & { employee_name: string | null };
export type TimeOffWithEmployee = TimeOffRequest & { employee_name: string | null };
export type AvailabilityWithEmployee = Availability & { employee_name: string | null };
export type AnnouncementWithAuthor = Announcement & { author_name: string | null };
export type AdminNoteWithAuthor = AdminNote & { author_name: string | null };

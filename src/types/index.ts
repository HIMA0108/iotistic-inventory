export type AppRole = "admin" | "manager" | "staff";

export interface Component {
  id: string;
  company_id: string;
  name: string;
  sku: string;
  image_url: string | null;
  stock_count: number;
  defective_count: number;
  minimum_threshold: number;
  unit_cost: number;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  company_id: string;
  name: string;
  sku: string;
  image_url: string | null;
  assembled_stock: number;
  minimum_threshold: number;
  unit_price: number;
  created_at: string;
  updated_at: string;
}

export interface DeviceRecipe {
  id: string;
  device_id: string;
  component_id: string;
  quantity: number;
}

export interface DeviceDependency {
  id: string;
  device_id: string;
  depends_on_device_id: string;
  quantity: number;
}

export type LogAction = "in" | "out" | "assemble" | "deliver" | "adjust" | "defective";
export type LogItemType = "component" | "device";

export interface InventoryLog {
  id: string;
  company_id: string;
  user_id: string | null;
  item_type: LogItemType;
  item_id: string;
  item_name: string;
  action: LogAction;
  quantity: number;
  note: string | null;
  created_at: string;
}

// ===== Daily reports & leave =====

export type LeaveType = "annual" | "off_day" | "sick";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface TaskTemplate {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface DailyReport {
  id: string;
  company_id: string;
  user_id: string;
  report_date: string;
  notes: string | null;
  submitted_at: string;
  edited_by: string | null;
  edited_at: string | null;
}

export interface ReportTask {
  id: string;
  report_id: string;
  template_id: string | null;
  task_name: string;
  quantity: number | null;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  company_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  leave_type: LeaveType;
  status: LeaveStatus;
  reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export type SystemReportType = "monthly" | "quarterly" | "biannual" | "annual";
export type SystemReportStatus = "pending" | "ready" | "failed";

export interface SystemReport {
  id: string;
  company_id: string;
  report_type: SystemReportType;
  period_start: string;
  period_end: string;
  status: SystemReportStatus;
  file_url: string | null;
  title: string | null;
  metadata: Record<string, unknown> | null;
  generated_at: string | null;
  created_at: string;
}

export interface SystemNotification {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  company_id: string;
  full_name: string | null;
  email: string | null;
  display_title: string | null;
  created_at: string;
}

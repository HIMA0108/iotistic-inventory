import { supabase } from "@/integrations/supabase/client";

export async function rpcAdjustComponent(componentId: string, delta: number, note?: string) {
  const { error } = await supabase.rpc("adjust_component", {
    _component_id: componentId,
    _delta: delta,
    _note: note ?? null,
  });
  if (error) throw error;
}

export async function rpcMarkComponentDefective(componentId: string, qty: number, note?: string) {
  const { error } = await supabase.rpc("mark_component_defective", {
    _component_id: componentId,
    _qty: qty,
    _note: note ?? null,
  });
  if (error) throw error;
}

export async function rpcSetUserRole(userId: string, role: "admin" | "manager" | "staff") {
  // set_user_role replaces all roles with the single given one.
  const { error } = await supabase.rpc("set_user_role", { _user_id: userId, _role: role });
  if (error) throw error;
}

export async function rpcRemoveUserRole(userId: string) {
  const { error } = await supabase.rpc("remove_user_role", { _user_id: userId });
  if (error) throw error;
}

/**
 * Multi-role aware: writes the exact desired set of roles for a user by
 * removing them all then re-inserting one by one via set_user_role / direct
 * insert. Because the RPC only stores one role, we use the table directly
 * for additional roles after the first.
 */
export async function setUserRoles(userId: string, roles: ("admin" | "manager" | "staff")[]) {
  if (roles.length === 0) {
    await rpcRemoveUserRole(userId);
    return;
  }
  // First role through RPC (also clears + sets company correctly)
  await rpcSetUserRole(userId, roles[0]);
  if (roles.length === 1) return;

  // Look up company through profiles
  const { data: prof } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (!prof?.company_id) throw new Error("Target user not found");

  const extra = roles.slice(1).map((r) => ({
    user_id: userId,
    company_id: prof.company_id,
    role: r,
  }));
  const { error } = await supabase.from("user_roles").insert(extra);
  if (error) throw error;
}

export async function rpcAssembleDevice(deviceId: string, qty: number, note?: string) {
  const { error } = await supabase.rpc("assemble_device", {
    _device_id: deviceId,
    _qty: qty,
    _note: note ?? null,
  });
  if (error) throw error;
}

export async function rpcDeliverDevice(deviceId: string, qty: number, note?: string) {
  const { error } = await supabase.rpc("deliver_device", {
    _device_id: deviceId,
    _qty: qty,
    _note: note ?? null,
  });
  if (error) throw error;
}

export async function rpcBuildCapacity(deviceId: string): Promise<number> {
  const { data, error } = await supabase.rpc("build_capacity", { _device_id: deviceId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function uploadComponentImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("component-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("component-images").getPublicUrl(path);
  return data.publicUrl;
}

// ====== Daily reports ======

export interface SubmitTask {
  template_id?: string | null;
  task_name: string;
  quantity: number | null;
}

export async function rpcSubmitDailyReport(reportDate: string, notes: string | null, tasks: SubmitTask[]) {
  const { data, error } = await supabase.rpc("submit_daily_report", {
    _report_date: reportDate,
    _notes: notes,
    _tasks: tasks as any,
  });
  if (error) throw error;
  return data as string;
}

export async function rpcDecideLeaveRequest(requestId: string, approve: boolean) {
  const { error } = await supabase.rpc("decide_leave_request", {
    _request_id: requestId,
    _approve: approve,
  });
  if (error) throw error;
}

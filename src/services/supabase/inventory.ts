import { supabase } from "@/integrations/supabase/client";

export async function rpcAdjustComponent(componentId: string, delta: number, note?: string) {
  const { error } = await supabase.rpc("adjust_component", {
    _component_id: componentId,
    _delta: delta,
    _note: note ?? null,
  });
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

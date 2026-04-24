export type AppRole = "admin" | "staff";

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

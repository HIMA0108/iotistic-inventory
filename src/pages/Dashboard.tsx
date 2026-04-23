import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Component, Device } from "@/types";
import { rpcBuildCapacity } from "@/services/supabase/inventory";
import { readCache, writeCache } from "@/hooks/useInventoryCache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Cpu, AlertTriangle, TrendingUp, Hammer } from "lucide-react";
import { cn } from "@/lib/utils";

interface CapacityRow {
  device: Device;
  capacity: number;
}

export default function Dashboard() {
  const [components, setComponents] = useState<Component[]>(() => readCache<Component[]>("components") ?? []);
  const [devices, setDevices] = useState<Device[]>(() => readCache<Device[]>("devices") ?? []);
  const [capacities, setCapacities] = useState<CapacityRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [c, d] = await Promise.all([
        supabase.from("components").select("*").order("name"),
        supabase.from("devices").select("*").order("name"),
      ]);
      if (!mounted) return;
      const comps = (c.data as Component[]) ?? [];
      const devs = (d.data as Device[]) ?? [];
      setComponents(comps);
      setDevices(devs);
      writeCache("components", comps);
      writeCache("devices", devs);

      const caps = await Promise.all(
        devs.map(async (dev) => ({ device: dev, capacity: await rpcBuildCapacity(dev.id).catch(() => 0) }))
      );
      if (!mounted) return;
      setCapacities(caps);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const inventoryValue = components.reduce((sum, c) => sum + c.stock_count * Number(c.unit_cost ?? 0), 0)
    + devices.reduce((sum, d) => sum + d.assembled_stock * Number(d.unit_price ?? 0), 0);
  const lowStock = components.filter((c) => c.stock_count <= c.minimum_threshold).length
    + devices.filter((d) => d.assembled_stock <= d.minimum_threshold).length;
  const totalUnits = components.reduce((s, c) => s + c.stock_count, 0)
    + devices.reduce((s, d) => s + d.assembled_stock, 0);
  const buildable = capacities.reduce((s, r) => s + r.capacity, 0);

  const stats = [
    { label: "Inventory value", value: `$${inventoryValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: TrendingUp, accent: "primary" as const },
    { label: "Total units", value: totalUnits.toLocaleString(), icon: Package, accent: "secondary" as const },
    { label: "Low‑stock alerts", value: lowStock.toString(), icon: AlertTriangle, accent: "warning" as const },
    { label: "Buildable now", value: buildable.toLocaleString(), icon: Hammer, accent: "accent" as const },
  ];

  return (
    <div className="space-y-8 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Operations dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live snapshot of stock, alerts and assembly capacity.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {stats.map((s) => (
          <StatTile key={s.label} {...s} />
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">Build capacity</h2>
            <p className="text-xs text-muted-foreground">Maximum units assemblable from current component stock.</p>
          </div>
        </div>
        {loading && capacities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">
            Calculating capacity…
          </div>
        ) : capacities.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="No devices yet"
            description="Create a device and define its component recipe to see build capacity."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {capacities.map(({ device, capacity }) => (
              <CapacityCard key={device.id} device={device} capacity={capacity} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Low‑stock components</h2>
        {components.filter((c) => c.stock_count <= c.minimum_threshold).length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface-elevated p-6 text-sm text-muted-foreground">
            All components above threshold ✅
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-elevated">
            {components
              .filter((c) => c.stock_count <= c.minimum_threshold)
              .map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">SKU {c.sku}</div>
                  </div>
                  <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning-foreground">
                    {c.stock_count} / min {c.minimum_threshold}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "secondary" | "warning" | "accent";
}) {
  const accentClass = {
    primary: "bg-primary-container text-primary-container-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    warning: "bg-warning/15 text-warning-foreground",
    accent: "bg-accent/15 text-accent",
  }[accent];

  return (
    <Card className="border-border shadow-elevation-1">
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", accentClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CapacityCard({ device, capacity }: { device: Device; capacity: number }) {
  const tone =
    capacity === 0
      ? "border-destructive/30 bg-destructive/5"
      : capacity < 5
      ? "border-warning/40 bg-warning/5"
      : "border-success/30 bg-success/5";

  return (
    <Card className={cn("border shadow-elevation-1", tone)}>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 p-4 pb-2">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-secondary">
          {device.image_url ? (
            <img src={device.image_url} alt={device.name} className="h-full w-full object-cover" />
          ) : (
            <Cpu className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base">{device.name}</CardTitle>
          <div className="text-xs text-muted-foreground">In stock: {device.assembled_stock}</div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">{capacity}</span>
          <span className="text-xs text-muted-foreground">buildable</span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface-elevated p-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

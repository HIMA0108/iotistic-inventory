import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Component, Device, DeviceRecipe, DeviceDependency } from "@/types";
import { readCache, writeCache } from "@/hooks/useInventoryCache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Cpu, AlertTriangle, Hammer, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const LOW_STOCK_THRESHOLD = 10;

interface MissingPart {
  name: string;
  sku: string;
  have: number;
  needPerUnit: number;
  shortBy: number; // shortage to build 1 unit
}

interface DeviceBuildInfo {
  device: Device;
  capacity: number;
  limitingFactor: string | null; // name of limiting component/device
  missingForOne: MissingPart[];
}

export default function Dashboard() {
  const [components, setComponents] = useState<Component[]>(() => readCache<Component[]>("components") ?? []);
  const [devices, setDevices] = useState<Device[]>(() => readCache<Device[]>("devices") ?? []);
  const [recipes, setRecipes] = useState<DeviceRecipe[]>([]);
  const [deps, setDeps] = useState<DeviceDependency[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [c, d, r, dd] = await Promise.all([
        supabase.from("components").select("*").order("name"),
        supabase.from("devices").select("*").order("name"),
        supabase.from("device_recipes").select("*"),
        supabase.from("device_dependencies").select("*"),
      ]);
      if (!mounted) return;
      const comps = (c.data as Component[]) ?? [];
      const devs = (d.data as Device[]) ?? [];
      setComponents(comps);
      setDevices(devs);
      setRecipes((r.data as DeviceRecipe[]) ?? []);
      setDeps((dd.data as DeviceDependency[]) ?? []);
      writeCache("components", comps);
      writeCache("devices", devs);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const buildInfo: DeviceBuildInfo[] = useMemo(() => {
    const compMap = new Map(components.map((c) => [c.id, c]));
    const devMap = new Map(devices.map((d) => [d.id, d]));

    return devices.map((device) => {
      const deviceRecipe = recipes.filter((r) => r.device_id === device.id);
      const deviceDeps = deps.filter((dp) => dp.device_id === device.id);

      let capacity = Number.POSITIVE_INFINITY;
      let limitingFactor: string | null = null;
      const missingForOne: MissingPart[] = [];

      for (const r of deviceRecipe) {
        const comp = compMap.get(r.component_id);
        if (!comp) continue;
        const possible = Math.floor(comp.stock_count / r.quantity);
        if (possible < capacity) {
          capacity = possible;
          limitingFactor = comp.name;
        }
        if (comp.stock_count < r.quantity) {
          missingForOne.push({
            name: comp.name,
            sku: comp.sku,
            have: comp.stock_count,
            needPerUnit: r.quantity,
            shortBy: r.quantity - comp.stock_count,
          });
        }
      }

      for (const dp of deviceDeps) {
        const dep = devMap.get(dp.depends_on_device_id);
        if (!dep) continue;
        const possible = Math.floor(dep.assembled_stock / dp.quantity);
        if (possible < capacity) {
          capacity = possible;
          limitingFactor = `${dep.name} (assembled)`;
        }
        if (dep.assembled_stock < dp.quantity) {
          missingForOne.push({
            name: `${dep.name} (assembled device)`,
            sku: dep.sku,
            have: dep.assembled_stock,
            needPerUnit: dp.quantity,
            shortBy: dp.quantity - dep.assembled_stock,
          });
        }
      }

      if (!Number.isFinite(capacity)) capacity = 0;
      return { device, capacity: Math.max(capacity, 0), limitingFactor, missingForOne };
    });
  }, [components, devices, recipes, deps]);

  const lowStockComponents = useMemo(
    () => components.filter((c) => c.stock_count <= LOW_STOCK_THRESHOLD),
    [components]
  );

  const totalAssembledDevices = devices.reduce((s, d) => s + d.assembled_stock, 0);
  const totalBuildable = buildInfo.reduce((s, b) => s + b.capacity, 0);
  const distinctComponents = components.length;

  return (
    <div className="space-y-8 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Production dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live view of devices, components, build capacity and missing parts.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatTile label="Device types" value={devices.length.toString()} icon={Cpu} accent="primary" />
        <StatTile label="Assembled units" value={totalAssembledDevices.toLocaleString()} icon={Hammer} accent="accent" />
        <StatTile label="Component types" value={distinctComponents.toString()} icon={Package} accent="secondary" />
        <StatTile
          label="Low‑stock alerts"
          value={lowStockComponents.length.toString()}
          icon={AlertTriangle}
          accent="warning"
        />
      </section>

      {/* Devices: per-type stock & buildable */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Devices — stock & buildable</h2>
          <p className="text-xs text-muted-foreground">
            For each device: how many are assembled and how many more we can build right now.
          </p>
        </div>
        {loading && buildInfo.length === 0 ? (
          <SkeletonBlock label="Calculating capacity…" />
        ) : buildInfo.length === 0 ? (
          <EmptyState icon={Cpu} title="No devices yet" description="Create a device and define its recipe." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {buildInfo.map((info) => (
              <DeviceCard key={info.device.id} info={info} />
            ))}
          </div>
        )}
      </section>

      {/* Components: per-type stock */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Components — stock by type</h2>
          <p className="text-xs text-muted-foreground">Quantity available for each component.</p>
        </div>
        {components.length === 0 ? (
          <EmptyState icon={Package} title="No components yet" description="Add components to track stock." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-elevated">
            {components.map((c) => {
              const low = c.stock_count <= LOW_STOCK_THRESHOLD;
              return (
                <li key={c.id} className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">SKU {c.sku}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-lg font-bold tabular-nums", low && "text-warning-foreground")}>
                      {c.stock_count}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">in stock</div>
                  </div>
                  {low && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning-foreground">
                      <AlertTriangle className="h-3 w-3" /> Low
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Low stock alerts */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Low‑stock alerts <span className="text-xs font-normal text-muted-foreground">(≤ {LOW_STOCK_THRESHOLD})</span>
        </h2>
        {lowStockComponents.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/5 p-4 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> All components are above the low‑stock threshold.
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-warning/30 bg-warning/5">
            {lowStockComponents.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-4">
                <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">SKU {c.sku}</div>
                </div>
                <span className="rounded-full bg-warning/20 px-2.5 py-1 text-xs font-semibold text-warning-foreground">
                  {c.stock_count} left
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

function DeviceCard({ info }: { info: DeviceBuildInfo }) {
  const { device, capacity, limitingFactor, missingForOne } = info;
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
          <div className="text-xs text-muted-foreground">SKU {device.sku}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-elevated p-2.5 text-center">
            <div className="text-2xl font-bold tabular-nums">{device.assembled_stock}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Assembled</div>
          </div>
          <div className="rounded-xl bg-primary-container p-2.5 text-center text-primary-container-foreground">
            <div className="text-2xl font-bold tabular-nums">{capacity}</div>
            <div className="text-[10px] uppercase tracking-wide opacity-80">Buildable now</div>
          </div>
        </div>

        {capacity > 0 && limitingFactor && (
          <div className="text-[11px] text-muted-foreground">
            Limited by <span className="font-medium text-foreground">{limitingFactor}</span>
          </div>
        )}

        {missingForOne.length > 0 ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Missing to build 1 unit
            </div>
            <ul className="space-y-1">
              {missingForOne.map((m) => (
                <li key={m.sku + m.name} className="flex items-center justify-between text-xs">
                  <span className="truncate pr-2">{m.name}</span>
                  <span className="shrink-0 font-medium">
                    need <span className="text-destructive">+{m.shortBy}</span>{" "}
                    <span className="text-muted-foreground">
                      ({m.have}/{m.needPerUnit})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : capacity === 0 ? (
          <div className="text-xs text-muted-foreground">No recipe defined.</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SkeletonBlock({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
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

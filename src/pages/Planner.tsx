import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Component, Device, DeviceRecipe, DeviceDependency } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calculator, AlertTriangle, CheckCircle2, Package, Cpu, Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

interface ComponentNeed {
  component: Component;
  needed: number;
  available: number;
  shortage: number;
}

interface DeviceNeed {
  device: Device;
  needed: number;
  available: number;
  shortage: number;
}

export default function PlannerPage() {
  const { role, roleLoaded } = useAuth();
  const [components, setComponents] = useState<Component[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [recipes, setRecipes] = useState<DeviceRecipe[]>([]);
  const [deps, setDeps] = useState<DeviceDependency[]>([]);
  const [loading, setLoading] = useState(true);

  const [deviceId, setDeviceId] = useState<string>("");
  const [qty, setQty] = useState<number>(1);

  useEffect(() => {
    (async () => {
      const [c, d, r, dd] = await Promise.all([
        supabase.from("components").select("*").order("name"),
        supabase.from("devices").select("*").order("name"),
        supabase.from("device_recipes").select("*"),
        supabase.from("device_dependencies").select("*"),
      ]);
      setComponents((c.data as Component[]) ?? []);
      setDevices((d.data as Device[]) ?? []);
      setRecipes((r.data as DeviceRecipe[]) ?? []);
      setDeps((dd.data as DeviceDependency[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const plan = useMemo(() => {
    if (!deviceId || qty < 1) return null;

    // Aggregate raw component needs by recursively walking dependencies.
    const componentTotals = new Map<string, number>(); // component_id -> qty needed
    const deviceUsage = new Map<string, number>(); // device_id -> qty consumed (for bundled deps)
    const visited = new Set<string>();

    const walk = (devId: string, multiplier: number, isRoot: boolean) => {
      if (visited.has(devId + ":" + multiplier)) {
        // allow re-entry with different multipliers; key uniqueness only for cycle stop
      }
      // Cycle guard
      const key = devId;
      if (visited.has(key) && !isRoot) return;
      visited.add(key);

      // direct components for this device
      recipes
        .filter((r) => r.device_id === devId)
        .forEach((r) => {
          componentTotals.set(
            r.component_id,
            (componentTotals.get(r.component_id) ?? 0) + r.quantity * multiplier,
          );
        });

      // bundled dependent devices
      deps
        .filter((dp) => dp.device_id === devId)
        .forEach((dp) => {
          const childQty = dp.quantity * multiplier;
          deviceUsage.set(
            dp.depends_on_device_id,
            (deviceUsage.get(dp.depends_on_device_id) ?? 0) + childQty,
          );
          // Recurse so deeper components also count
          walk(dp.depends_on_device_id, childQty, false);
        });
    };

    walk(deviceId, qty, true);

    const componentNeeds: ComponentNeed[] = [...componentTotals.entries()]
      .map(([id, needed]) => {
        const c = components.find((x) => x.id === id);
        if (!c) return null;
        const shortage = Math.max(0, needed - c.stock_count);
        return {
          component: c,
          needed,
          available: c.stock_count,
          shortage,
        };
      })
      .filter(Boolean) as ComponentNeed[];

    componentNeeds.sort((a, b) => b.shortage - a.shortage || a.component.name.localeCompare(b.component.name));

    const deviceNeeds: DeviceNeed[] = [...deviceUsage.entries()]
      .map(([id, needed]) => {
        const d = devices.find((x) => x.id === id);
        if (!d) return null;
        const shortage = Math.max(0, needed - d.assembled_stock);
        return { device: d, needed, available: d.assembled_stock, shortage };
      })
      .filter(Boolean) as DeviceNeed[];

    const canBuild = componentNeeds.every((n) => n.shortage === 0) && deviceNeeds.every((n) => n.shortage === 0);

    return { componentNeeds, deviceNeeds, canBuild };
  }, [deviceId, qty, components, devices, recipes, deps]);

  const selectedDevice = devices.find((d) => d.id === deviceId);

  if (roleLoaded && role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Production Planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See exactly which components you need to produce a target quantity of any device.
        </p>
      </header>

      <Card className="shadow-elevation-1">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-[1fr_140px_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Device</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading…" : "Select a device"} />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} <span className="text-muted-foreground">— {d.sku}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <Button size="lg" disabled className="gap-2 sm:w-auto">
            <Calculator className="h-4 w-4" /> Auto‑calculated
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-surface-elevated p-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading data…
        </div>
      ) : !plan ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-10 text-center">
          <Calculator className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">Pick a device above</p>
          <p className="text-xs text-muted-foreground">We'll break down the full bill of materials and shortages.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="shadow-elevation-1">
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Target</div>
                <div className="mt-1 text-2xl font-bold">
                  {qty} × <span className="text-primary">{selectedDevice?.name}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-elevation-1">
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
                <div className="mt-1 flex items-center gap-2">
                  {plan.canBuild ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-success" />
                      <span className="text-lg font-semibold text-success">Ready to build</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      <span className="text-lg font-semibold text-warning-foreground">Shortages</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-elevation-1">
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Est. cost to cover shortage</div>
                <div className="mt-1 text-2xl font-bold">
                  {plan.totalShortageCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Components needed */}
          <Card className="shadow-elevation-1">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                <Package className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">Components needed</h2>
                <Badge variant="secondary" className="ml-auto">
                  {plan.componentNeeds.length} item{plan.componentNeeds.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              {plan.componentNeeds.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No components linked to this device's recipe.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Component</TableHead>
                      <TableHead className="text-right">Needed</TableHead>
                      <TableHead className="text-right">In stock</TableHead>
                      <TableHead className="text-right">Shortage</TableHead>
                      <TableHead className="text-right">Est. cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.componentNeeds.map((n) => (
                      <TableRow key={n.component.id}>
                        <TableCell>
                          <div className="font-medium">{n.component.name}</div>
                          <div className="text-xs text-muted-foreground">{n.component.sku}</div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{n.needed}</TableCell>
                        <TableCell className="text-right">{n.available}</TableCell>
                        <TableCell className="text-right">
                          {n.shortage > 0 ? (
                            <Badge variant="destructive">−{n.shortage}</Badge>
                          ) : (
                            <Badge className="bg-success/15 text-success hover:bg-success/20">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {n.estCost > 0 ? n.estCost.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Bundled devices */}
          {plan.deviceNeeds.length > 0 && (
            <Card className="shadow-elevation-1">
              <CardContent className="p-0">
                <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                  <Cpu className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold">Bundled devices required</h2>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead className="text-right">Needed</TableHead>
                      <TableHead className="text-right">Assembled</TableHead>
                      <TableHead className="text-right">Shortage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.deviceNeeds.map((n) => (
                      <TableRow key={n.device.id}>
                        <TableCell>
                          <div className="font-medium">{n.device.name}</div>
                          <div className="text-xs text-muted-foreground">{n.device.sku}</div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{n.needed}</TableCell>
                        <TableCell className="text-right">{n.available}</TableCell>
                        <TableCell className="text-right">
                          {n.shortage > 0 ? (
                            <Badge variant="destructive">−{n.shortage}</Badge>
                          ) : (
                            <Badge className="bg-success/15 text-success hover:bg-success/20">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Shopping list */}
          {!plan.canBuild && plan.componentNeeds.some((n) => n.shortage > 0) && (
            <Card className="border-warning/40 bg-warning/5 shadow-elevation-1">
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <h2 className="text-base font-semibold">Shopping list</h2>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {plan.componentNeeds
                    .filter((n) => n.shortage > 0)
                    .map((n) => (
                      <li key={n.component.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated px-3 py-2">
                        <span className="font-medium">{n.component.name}</span>
                        <span className="text-muted-foreground">
                          buy <span className="font-semibold text-foreground">{n.shortage}</span> more ({n.component.sku})
                        </span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

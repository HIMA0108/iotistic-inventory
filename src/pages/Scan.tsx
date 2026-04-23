import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Component, Device } from "@/types";
import { rpcAdjustComponent, rpcAssembleDevice, rpcDeliverDevice } from "@/services/supabase/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import QRScanner from "@/components/scanner/QRScanner";
import { ScanLine, Package, Cpu, Hammer, Truck, Plus, Minus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Match =
  | { type: "component"; item: Component }
  | { type: "device"; item: Device }
  | null;

export default function ScanPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState<Match>(null);
  const [qty, setQty] = useState<number>(1);

  const refresh = async () => {
    const [c, d] = await Promise.all([
      supabase.from("components").select("*").order("name"),
      supabase.from("devices").select("*").order("name"),
    ]);
    setComponents((c.data as Component[]) ?? []);
    setDevices((d.data as Device[]) ?? []);
  };

  useEffect(() => { refresh(); }, []);

  const findBySku = (sku: string): Match => {
    const s = sku.trim().toLowerCase();
    if (!s) return null;
    const c = components.find((x) => x.sku.toLowerCase() === s);
    if (c) return { type: "component", item: c };
    const d = devices.find((x) => x.sku.toLowerCase() === s);
    if (d) return { type: "device", item: d };
    return null;
  };

  const handleResult = (text: string) => {
    setScanning(false);
    setQuery(text);
    const m = findBySku(text);
    if (!m) toast.error(`No item with SKU "${text}"`);
    setMatch(m);
  };

  const handleManualLookup = () => {
    const m = findBySku(query);
    if (!m) toast.error("No matching SKU");
    setMatch(m);
  };

  const action = async (kind: "in" | "out" | "assemble" | "deliver") => {
    if (!match) return;
    try {
      if (match.type === "component") {
        await rpcAdjustComponent(match.item.id, kind === "in" ? qty : -qty, kind === "in" ? "Stock in" : "Stock out");
      } else if (kind === "assemble") {
        await rpcAssembleDevice(match.item.id, qty);
      } else if (kind === "deliver") {
        await rpcDeliverDevice(match.item.id, qty);
      } else {
        // device in/out treated as assembly add or deliver
        if (kind === "in") await rpcAssembleDevice(match.item.id, qty);
        else await rpcDeliverDevice(match.item.id, qty);
      }
      toast.success("Updated");
      await refresh();
      const refreshed = findBySku(match.item.sku);
      setMatch(refreshed);
    } catch (e: any) {
      toast.error(e.message ?? "Operation failed");
    }
  };

  return (
    <div className="space-y-6 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Scan & move stock</h1>
        <p className="mt-1 text-sm text-muted-foreground">Scan a barcode/QR or type a SKU, then take action.</p>
      </header>

      <Card className="shadow-elevation-1">
        <CardContent className="space-y-3 p-4 sm:p-6">
          {scanning ? (
            <QRScanner onResult={handleResult} onClose={() => setScanning(false)} />
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Type or paste SKU"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                  className="text-base"
                />
                <Button variant="secondary" size="lg" onClick={handleManualLookup}>Look up</Button>
                <Button size="lg" className="gap-2" onClick={() => setScanning(true)}>
                  <ScanLine className="h-5 w-5" /> Scan
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {match && (
        <Card className="overflow-hidden shadow-elevation-2">
          <div className="relative aspect-[16/7] bg-secondary">
            {match.item.image_url ? (
              <img src={match.item.image_url} alt={match.item.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {match.type === "component" ? <Package className="h-10 w-10 text-muted-foreground" /> : <Cpu className="h-10 w-10 text-muted-foreground" />}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMatch(null)}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
            <span className={cn(
              "absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
              match.type === "component" ? "bg-primary-container text-primary-container-foreground" : "bg-accent text-accent-foreground"
            )}>
              {match.type}
            </span>
          </div>

          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <div className="text-xl font-semibold">{match.item.name}</div>
              <div className="text-sm text-muted-foreground">SKU {match.item.sku}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">
                  {match.type === "component" ? match.item.stock_count : match.item.assembled_stock}
                </span>
                <span className="text-sm text-muted-foreground">in stock</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => setQty(Math.max(1, qty - 1))}>
                <Minus className="h-5 w-5" />
              </Button>
              <div className="min-w-20 rounded-2xl border border-border bg-secondary px-6 py-3 text-center text-3xl font-bold tabular-nums">
                {qty}
              </div>
              <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => setQty(qty + 1)}>
                <Plus className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {match.type === "component" ? (
                <>
                  <Button size="lg" variant="secondary" className="h-16 text-base font-bold gap-2" onClick={() => action("in")}>
                    <Plus className="h-5 w-5" /> Stock IN
                  </Button>
                  <Button size="lg" className="h-16 text-base font-bold gap-2" onClick={() => action("out")}>
                    <Minus className="h-5 w-5" /> Stock OUT
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" variant="secondary" className="h-16 text-base font-bold gap-2" onClick={() => action("assemble")}>
                    <Hammer className="h-5 w-5" /> Assemble
                  </Button>
                  <Button size="lg" className="h-16 text-base font-bold gap-2" onClick={() => action("deliver")}>
                    <Truck className="h-5 w-5" /> Deliver
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

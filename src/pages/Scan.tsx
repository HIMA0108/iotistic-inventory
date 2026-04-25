import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Component as InvComponent, Device } from "@/types";
import { rpcAdjustComponent, rpcAssembleDevice, rpcDeliverDevice } from "@/services/supabase/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import QRScanner from "@/components/scanner/QRScanner";
import {
  ScanLine,
  Package,
  Cpu,
  Hammer,
  Truck,
  Plus,
  Minus,
  X,
  Search,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Match =
  | { type: "component"; item: InvComponent }
  | { type: "device"; item: Device }
  | null;

type ActionKind = "in" | "out" | "assemble" | "deliver";

const ACTION_META: Record<
  ActionKind,
  { label: string; verb: string; tone: "positive" | "negative"; needsReason: boolean }
> = {
  in: { label: "Stock IN", verb: "add to stock", tone: "positive", needsReason: false },
  out: { label: "Stock OUT", verb: "remove from stock", tone: "negative", needsReason: true },
  assemble: { label: "Assemble", verb: "assemble", tone: "positive", needsReason: false },
  deliver: { label: "Deliver", verb: "deliver", tone: "negative", needsReason: true },
};

export default function ScanPage() {
  const [components, setComponents] = useState<InvComponent[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState<Match>(null);
  const [qty, setQty] = useState<number>(1);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Confirmation dialog state
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    const [c, d] = await Promise.all([
      supabase.from("components").select("*").order("name"),
      supabase.from("devices").select("*").order("name"),
    ]);
    setComponents((c.data as InvComponent[]) ?? []);
    setDevices((d.data as Device[]) ?? []);
  };

  useEffect(() => {
    refresh();
  }, []);

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

  const pickerItems = useMemo(
    () => [
      ...components.map((c) => ({ type: "component" as const, item: c })),
      ...devices.map((d) => ({ type: "device" as const, item: d })),
    ],
    [components, devices],
  );

  const openConfirm = (kind: ActionKind) => {
    if (!match) return;
    setReason("");
    setPendingAction(kind);
  };

  const confirmAction = async () => {
    if (!match || !pendingAction) return;
    const meta = ACTION_META[pendingAction];
    if (meta.needsReason && reason.trim().length === 0) {
      toast.error("Reason is required");
      return;
    }
    setSubmitting(true);
    try {
      const note = reason.trim() || undefined;
      if (match.type === "component") {
        await rpcAdjustComponent(
          match.item.id,
          pendingAction === "in" ? qty : -qty,
          note ?? (pendingAction === "in" ? "Stock in" : "Stock out"),
        );
      } else if (pendingAction === "assemble") {
        await rpcAssembleDevice(match.item.id, qty, note);
      } else if (pendingAction === "deliver") {
        await rpcDeliverDevice(match.item.id, qty, note);
      } else if (pendingAction === "in") {
        await rpcAssembleDevice(match.item.id, qty, note);
      } else {
        await rpcDeliverDevice(match.item.id, qty, note);
      }
      toast.success(`${meta.label} · ${qty} × ${match.item.name}`);
      await refresh();
      const refreshed = findBySku(match.item.sku);
      setMatch(refreshed);
      setPendingAction(null);
      setReason("");
    } catch (e: any) {
      toast.error(e.message ?? "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Scan & move stock</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scan, search, or pick from the list — then confirm before updating.
        </p>
      </header>

      <Card className="shadow-elevation-1">
        <CardContent className="space-y-3 p-4 sm:p-6">
          {scanning ? (
            <QRScanner onResult={handleResult} onClose={() => setScanning(false)} />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Type or paste SKU"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                  className="text-base"
                />
                <Button variant="secondary" size="lg" onClick={handleManualLookup}>
                  Look up
                </Button>
                <Button size="lg" className="gap-2" onClick={() => setScanning(true)}>
                  <ScanLine className="h-5 w-5" /> Scan
                </Button>
              </div>

              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full justify-start gap-2 font-normal text-muted-foreground"
                  >
                    <Search className="h-4 w-4" />
                    Search and select an item from the list…
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command
                    filter={(value, search) =>
                      value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                    }
                  >
                    <CommandInput placeholder="Search by name or SKU…" />
                    <CommandList>
                      <CommandEmpty>No items found.</CommandEmpty>
                      <CommandGroup heading="Components">
                        {pickerItems
                          .filter((p) => p.type === "component")
                          .map((p) => (
                            <CommandItem
                              key={`c-${p.item.id}`}
                              value={`${p.item.name} ${p.item.sku}`}
                              onSelect={() => {
                                setMatch(p);
                                setQuery(p.item.sku);
                                setPickerOpen(false);
                              }}
                            >
                              <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                              <div className="flex-1">
                                <div className="text-sm font-medium">{p.item.name}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  SKU {p.item.sku} · {(p.item as InvComponent).stock_count} in stock
                                </div>
                              </div>
                              {match?.item.id === p.item.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                      <CommandGroup heading="Devices">
                        {pickerItems
                          .filter((p) => p.type === "device")
                          .map((p) => (
                            <CommandItem
                              key={`d-${p.item.id}`}
                              value={`${p.item.name} ${p.item.sku}`}
                              onSelect={() => {
                                setMatch(p);
                                setQuery(p.item.sku);
                                setPickerOpen(false);
                              }}
                            >
                              <Cpu className="mr-2 h-4 w-4 text-muted-foreground" />
                              <div className="flex-1">
                                <div className="text-sm font-medium">{p.item.name}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  SKU {p.item.sku} · {(p.item as Device).assembled_stock} assembled
                                </div>
                              </div>
                              {match?.item.id === p.item.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
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
                {match.type === "component" ? (
                  <Package className="h-10 w-10 text-muted-foreground" />
                ) : (
                  <Cpu className="h-10 w-10 text-muted-foreground" />
                )}
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
            <span
              className={cn(
                "absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                match.type === "component"
                  ? "bg-primary-container text-primary-container-foreground"
                  : "bg-accent text-accent-foreground",
              )}
            >
              {match.type}
            </span>
          </div>

          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <div className="text-xl font-semibold">{match.item.name}</div>
              <div className="text-sm text-muted-foreground">SKU {match.item.sku}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">
                  {match.type === "component"
                    ? match.item.stock_count
                    : match.item.assembled_stock}
                </span>
                <span className="text-sm text-muted-foreground">in stock</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12"
                onClick={() => setQty(Math.max(1, qty - 1))}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-14 w-28 rounded-2xl border-border bg-secondary text-center text-3xl font-bold tabular-nums"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12"
                onClick={() => setQty(qty + 1)}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {match.type === "component" ? (
                <>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-16 gap-2 text-base font-bold"
                    onClick={() => openConfirm("in")}
                  >
                    <Plus className="h-5 w-5" /> Stock IN
                  </Button>
                  <Button
                    size="lg"
                    className="h-16 gap-2 text-base font-bold"
                    onClick={() => openConfirm("out")}
                  >
                    <Minus className="h-5 w-5" /> Stock OUT
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-16 gap-2 text-base font-bold"
                    onClick={() => openConfirm("assemble")}
                  >
                    <Hammer className="h-5 w-5" /> Assemble
                  </Button>
                  <Button
                    size="lg"
                    className="h-16 gap-2 text-base font-bold"
                    onClick={() => openConfirm("deliver")}
                  >
                    <Truck className="h-5 w-5" /> Deliver
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation dialog */}
      <Dialog
        open={!!pendingAction}
        onOpenChange={(v) => {
          if (!v && !submitting) {
            setPendingAction(null);
            setReason("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          {pendingAction && match && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Confirm {ACTION_META[pendingAction].label}
                </DialogTitle>
                <DialogDescription>
                  You are about to {ACTION_META[pendingAction].verb}{" "}
                  <span className="font-semibold text-foreground">
                    {qty} × {match.item.name}
                  </span>
                  .
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
                  Current stock:{" "}
                  <span className="font-semibold text-foreground">
                    {match.type === "component"
                      ? match.item.stock_count
                      : match.item.assembled_stock}
                  </span>
                  {ACTION_META[pendingAction].tone === "negative" && (
                    <>
                      {" "}· After: {" "}
                      <span className="font-semibold text-foreground">
                        {(match.type === "component"
                          ? match.item.stock_count
                          : match.item.assembled_stock) - qty}
                      </span>
                    </>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reason">
                    Reason{" "}
                    {ACTION_META[pendingAction].needsReason ? (
                      <span className="text-destructive">*</span>
                    ) : (
                      <span className="text-muted-foreground">(optional)</span>
                    )}
                  </Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      ACTION_META[pendingAction].needsReason
                        ? "Why is this stock leaving? (required)"
                        : "Add a note (optional)"
                    }
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingAction(null);
                    setReason("");
                  }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button onClick={confirmAction} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

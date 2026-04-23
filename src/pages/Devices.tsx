import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Component, Device, DeviceRecipe, DeviceDependency } from "@/types";
import { uploadComponentImage, rpcAssembleDevice, rpcDeliverDevice, rpcBuildCapacity } from "@/services/supabase/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Cpu, Pencil, Trash2, ImagePlus, Loader2, Hammer, Truck, X, Link2 } from "lucide-react";

interface DeviceWithCapacity extends Device {
  capacity: number;
}

export default function DevicesPage() {
  const { role, companyId } = useAuth();
  const [items, setItems] = useState<DeviceWithCapacity[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Device | null>(null);
  const [open, setOpen] = useState(false);

  const isAdmin = role === "admin";

  const refresh = async () => {
    const [d, c] = await Promise.all([
      supabase.from("devices").select("*").order("name"),
      supabase.from("components").select("*").order("name"),
    ]);
    const devs = (d.data as Device[]) ?? [];
    const comps = (c.data as Component[]) ?? [];
    setComponents(comps);
    const withCap = await Promise.all(
      devs.map(async (dev) => ({ ...dev, capacity: await rpcBuildCapacity(dev.id).catch(() => 0) }))
    );
    setItems(withCap);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAssemble = async (d: Device) => {
    const qtyStr = prompt(`Assemble how many "${d.name}"?`, "1");
    if (!qtyStr) return;
    const qty = parseInt(qtyStr);
    if (!qty || qty < 1) return;
    try {
      await rpcAssembleDevice(d.id, qty);
      toast.success(`Assembled ${qty} × ${d.name}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Assembly failed");
    }
  };

  const handleDeliver = async (d: Device) => {
    const qtyStr = prompt(`Deliver how many "${d.name}"?`, "1");
    if (!qtyStr) return;
    const qty = parseInt(qtyStr);
    if (!qty || qty < 1) return;
    try {
      await rpcDeliverDevice(d.id, qty);
      toast.success(`Delivered ${qty} × ${d.name}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Delivery failed");
    }
  };

  const handleDelete = async (d: Device) => {
    if (!confirm(`Delete device "${d.name}" and its recipe?`)) return;
    const { error } = await supabase.from("devices").delete().eq("id", d.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); refresh(); }
  };

  return (
    <div className="space-y-6 sm:pl-64">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Devices</h1>
          <p className="mt-1 text-sm text-muted-foreground">Assembled products with bills of materials.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2"><Plus className="h-4 w-4" /> New device</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit device" : "New device"}</DialogTitle>
              </DialogHeader>
              <DeviceForm
                key={editing?.id ?? "new"}
                initial={editing}
                companyId={companyId}
                allComponents={components}
                allDevices={items}
                onSaved={() => { setOpen(false); setEditing(null); refresh(); }}
              />
            </DialogContent>
          </Dialog>
        )}
      </header>

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-10 text-center">
          <Cpu className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No devices yet</p>
          <p className="text-xs text-muted-foreground">{isAdmin ? "Create one and define its recipe." : "Ask an admin to add devices."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => (
            <Card key={d.id} className="overflow-hidden shadow-elevation-1">
              <div className="relative aspect-[16/9] bg-secondary">
                {d.image_url ? (
                  <img src={d.image_url} alt={d.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center"><Cpu className="h-8 w-8 text-muted-foreground" /></div>
                )}
              </div>
              <CardContent className="space-y-3 p-4">
                <div>
                  <div className="font-semibold leading-tight">{d.name}</div>
                  <div className="text-xs text-muted-foreground">SKU {d.sku} · ${Number(d.unit_price).toFixed(2)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-secondary p-2">
                    <div className="text-lg font-bold">{d.assembled_stock}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">In stock</div>
                  </div>
                  <div className="rounded-xl bg-primary-container p-2 text-primary-container-foreground">
                    <div className="text-lg font-bold">{d.capacity}</div>
                    <div className="text-[10px] uppercase tracking-wide opacity-80">Buildable</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" className="flex-1 gap-1" onClick={() => handleAssemble(d)}>
                    <Hammer className="h-4 w-4" /> Assemble
                  </Button>
                  <Button size="sm" className="flex-1 gap-1" onClick={() => handleDeliver(d)}>
                    <Truck className="h-4 w-4" /> Deliver
                  </Button>
                  {isAdmin && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(d); setOpen(true); }} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(d)} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceForm({
  initial, companyId, allComponents, allDevices, onSaved,
}: {
  initial: Device | null;
  companyId: string | null;
  allComponents: Component[];
  allDevices: Device[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [stock, setStock] = useState(initial?.assembled_stock ?? 0);
  const [minThreshold, setMinThreshold] = useState(initial?.minimum_threshold ?? 0);
  const [price, setPrice] = useState<number>(Number(initial?.unit_price ?? 0));
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<{ component_id: string; quantity: number }[]>([]);
  const [deps, setDeps] = useState<{ depends_on_device_id: string; quantity: number }[]>([]);

  useEffect(() => {
    if (!initial) return;
    (async () => {
      const [r, d] = await Promise.all([
        supabase.from("device_recipes").select("*").eq("device_id", initial.id),
        supabase.from("device_dependencies").select("*").eq("device_id", initial.id),
      ]);
      setRecipe(((r.data as DeviceRecipe[]) ?? []).map((x) => ({ component_id: x.component_id, quantity: x.quantity })));
      setDeps(((d.data as DeviceDependency[]) ?? []).map((x) => ({ depends_on_device_id: x.depends_on_device_id, quantity: x.quantity })));
    })();
  }, [initial]);

  const handleFile = async (file: File) => {
    setUploading(true);
    try { setImageUrl(await uploadComponentImage(file)); }
    catch (e: any) { toast.error(e.message ?? "Upload failed"); }
    finally { setUploading(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    const payload = {
      company_id: companyId, name, sku,
      assembled_stock: stock, minimum_threshold: minThreshold,
      unit_price: price, image_url: imageUrl,
    };

    let deviceId = initial?.id;
    if (initial) {
      const { error } = await supabase.from("devices").update(payload).eq("id", initial.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("devices").insert(payload).select("id").single();
      if (error || !data) { toast.error(error?.message ?? "Create failed"); setSaving(false); return; }
      deviceId = data.id;
    }

    if (deviceId) {
      // Replace recipe + deps
      await supabase.from("device_recipes").delete().eq("device_id", deviceId);
      await supabase.from("device_dependencies").delete().eq("device_id", deviceId);

      const filteredRecipe = recipe.filter((r) => r.component_id && r.quantity > 0);
      if (filteredRecipe.length > 0) {
        const { error: re } = await supabase.from("device_recipes")
          .insert(filteredRecipe.map((r) => ({ ...r, device_id: deviceId! })));
        if (re) toast.error("Recipe error: " + re.message);
      }
      const filteredDeps = deps.filter((d) => d.depends_on_device_id && d.quantity > 0 && d.depends_on_device_id !== deviceId);
      if (filteredDeps.length > 0) {
        const { error: de } = await supabase.from("device_dependencies")
          .insert(filteredDeps.map((d) => ({ ...d, device_id: deviceId! })));
        if (de) toast.error("Dependency error: " + de.message);
      }
    }

    setSaving(false);
    toast.success(initial ? "Updated" : "Created");
    onSaved();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary">
          {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
        </div>
        <label className="flex-1">
          <span className="text-xs font-medium text-muted-foreground">Photo</span>
          <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} disabled={uploading} className="mt-1" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2"><Label>Name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5 col-span-2"><Label>SKU</Label><Input required value={sku} onChange={(e) => setSku(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Pre‑assembled stock</Label><Input type="number" min={0} value={stock} onChange={(e) => setStock(parseInt(e.target.value) || 0)} /></div>
        <div className="space-y-1.5"><Label>Min threshold</Label><Input type="number" min={0} value={minThreshold} onChange={(e) => setMinThreshold(parseInt(e.target.value) || 0)} /></div>
        <div className="space-y-1.5 col-span-2"><Label>Unit price ($)</Label><Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(parseFloat(e.target.value) || 0)} /></div>
      </div>

      {/* Recipe */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Recipe (BOM)</div>
            <div className="text-xs text-muted-foreground">Components consumed when this device is assembled.</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setRecipe([...recipe, { component_id: "", quantity: 1 }])}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        <div className="space-y-2">
          {recipe.length === 0 && <div className="text-xs text-muted-foreground">No components added.</div>}
          {recipe.map((r, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select value={r.component_id} onValueChange={(v) => setRecipe(recipe.map((x, i) => i === idx ? { ...x, component_id: v } : x))}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select component" /></SelectTrigger>
                <SelectContent>
                  {allComponents.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.sku})</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" min={1} value={r.quantity} className="w-20"
                onChange={(e) => setRecipe(recipe.map((x, i) => i === idx ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setRecipe(recipe.filter((_, i) => i !== idx))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Dependencies */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="h-4 w-4" /> Bundled devices</div>
            <div className="text-xs text-muted-foreground">Other devices automatically delivered when this one ships.</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setDeps([...deps, { depends_on_device_id: "", quantity: 1 }])}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        <div className="space-y-2">
          {deps.length === 0 && <div className="text-xs text-muted-foreground">No bundled devices.</div>}
          {deps.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select value={d.depends_on_device_id} onValueChange={(v) => setDeps(deps.map((x, i) => i === idx ? { ...x, depends_on_device_id: v } : x))}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select device" /></SelectTrigger>
                <SelectContent>
                  {allDevices.filter((dev) => dev.id !== initial?.id).map((dev) => <SelectItem key={dev.id} value={dev.id}>{dev.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" min={1} value={d.quantity} className="w-20"
                onChange={(e) => setDeps(deps.map((x, i) => i === idx ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setDeps(deps.filter((_, i) => i !== idx))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Button type="submit" className="w-full" size="lg" disabled={saving || uploading}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : initial ? "Save changes" : "Create device"}
      </Button>
    </form>
  );
}

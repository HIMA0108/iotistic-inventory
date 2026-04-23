import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Component } from "@/types";
import { uploadComponentImage, rpcAdjustComponent } from "@/services/supabase/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Package, Pencil, Trash2, Minus, Plus as PlusIcon, ImagePlus, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ComponentsPage() {
  const { role, companyId } = useAuth();
  const [items, setItems] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Component | null>(null);
  const [open, setOpen] = useState(false);

  const isAdmin = role === "admin";

  const refresh = async () => {
    const { data } = await supabase.from("components").select("*").order("name");
    setItems((data as Component[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAdjust = async (c: Component, delta: number) => {
    try {
      await rpcAdjustComponent(c.id, delta, delta > 0 ? "Stock in" : "Stock out");
      toast.success(`${c.name}: ${delta > 0 ? "+" : ""}${delta}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to adjust");
    }
  };

  const handleDelete = async (c: Component) => {
    if (!confirm(`Delete component "${c.name}"?`)) return;
    const { error } = await supabase.from("components").delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Component deleted");
      refresh();
    }
  };

  return (
    <div className="space-y-6 sm:pl-64">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Components</h1>
          <p className="mt-1 text-sm text-muted-foreground">Raw parts that make up your devices.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2">
                <Plus className="h-4 w-4" /> New component
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit component" : "New component"}</DialogTitle>
              </DialogHeader>
              <ComponentForm
                key={editing?.id ?? "new"}
                initial={editing}
                companyId={companyId}
                onSaved={() => {
                  setOpen(false);
                  setEditing(null);
                  refresh();
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </header>

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">
          Loading components…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-10 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No components yet</p>
          <p className="text-xs text-muted-foreground">{isAdmin ? "Create your first component to get started." : "Ask an admin to add components."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => {
            const low = c.stock_count <= c.minimum_threshold;
            return (
              <Card key={c.id} className="overflow-hidden shadow-elevation-1">
                <div className="relative aspect-[16/9] bg-secondary">
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  {low && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-warning/95 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-warning-foreground">
                      <AlertTriangle className="h-3 w-3" /> Low
                    </span>
                  )}
                </div>
                <CardContent className="space-y-3 p-4">
                  <div>
                    <div className="font-semibold leading-tight">{c.name}</div>
                    <div className="text-xs text-muted-foreground">SKU {c.sku}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className={cn("text-2xl font-bold tracking-tight", low && "text-warning-foreground")}>{c.stock_count}</div>
                      <div className="text-[11px] text-muted-foreground">min {c.minimum_threshold}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="icon" variant="outline" onClick={() => handleAdjust(c, -1)} aria-label="Decrease">
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="default" onClick={() => handleAdjust(c, 1)} aria-label="Increase">
                        <PlusIcon className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(c)} aria-label="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComponentForm({
  initial,
  companyId,
  onSaved,
}: {
  initial: Component | null;
  companyId: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [stock, setStock] = useState(initial?.stock_count ?? 0);
  const [minThreshold, setMinThreshold] = useState(initial?.minimum_threshold ?? 10);
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadComponentImage(file);
      setImageUrl(url);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    const payload = {
      company_id: companyId,
      name,
      sku,
      stock_count: stock,
      minimum_threshold: minThreshold,
      image_url: imageUrl,
    };
    const { error } = initial
      ? await supabase.from("components").update(payload).eq("id", initial.id)
      : await supabase.from("components").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(initial ? "Updated" : "Created");
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary">
          {imageUrl ? (
            <img src={imageUrl} alt="preview" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <label className="flex-1">
          <span className="text-xs font-medium text-muted-foreground">Photo</span>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            disabled={uploading}
            className="mt-1"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="cf-name">Name</Label>
          <Input id="cf-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="cf-sku">SKU</Label>
          <Input id="cf-sku" required value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-stock">Stock</Label>
          <Input id="cf-stock" type="number" min={0} value={stock} onChange={(e) => setStock(parseInt(e.target.value) || 0)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-min">Low‑stock threshold</Label>
          <Input id="cf-min" type="number" min={0} value={minThreshold} onChange={(e) => setMinThreshold(parseInt(e.target.value) || 0)} />
        </div>
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={saving || uploading}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : initial ? "Save changes" : "Create component"}
      </Button>
    </form>
  );
}

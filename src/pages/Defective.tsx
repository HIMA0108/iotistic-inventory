import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Component as InvComponent, InventoryLog } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ShieldAlert, Package, User as UserIcon, Search } from "lucide-react";

interface DefectiveEntry {
  log: InventoryLog;
  who: string;
}

export default function DefectivePage() {
  const [components, setComponents] = useState<InvComponent[]>([]);
  const [entriesByItem, setEntriesByItem] = useState<Record<string, DefectiveEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: comps }, { data: logs }] = await Promise.all([
        supabase
          .from("components")
          .select("*")
          .gt("defective_count", 0)
          .order("defective_count", { ascending: false }),
        supabase
          .from("inventory_logs")
          .select("*")
          .eq("action", "defective")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const list = (comps as InvComponent[]) ?? [];
      setComponents(list);

      const logList = (logs as InventoryLog[]) ?? [];
      const userIds = Array.from(
        new Set(logList.map((l) => l.user_id).filter(Boolean) as string[]),
      );
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        (profs ?? []).forEach((p) => {
          profileMap[p.id] = p.full_name?.trim() || p.email || "Unknown";
        });
      }

      const grouped: Record<string, DefectiveEntry[]> = {};
      logList.forEach((l) => {
        const arr = grouped[l.item_id] ?? (grouped[l.item_id] = []);
        arr.push({ log: l, who: l.user_id ? profileMap[l.user_id] ?? "Unknown" : "System" });
      });
      setEntriesByItem(grouped);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return components;
    return components.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.sku.toLowerCase().includes(q),
    );
  }, [components, search]);

  const totalDefective = components.reduce((acc, c) => acc + c.defective_count, 0);

  return (
    <div className="space-y-6 sm:pl-64">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Defective parts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Components flagged as defective, with notes from the team.
          </p>
        </div>
        <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm">
          <span className="text-xs text-muted-foreground">Total defective units</span>
          <div className="text-2xl font-bold text-destructive">{totalDefective}</div>
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search component by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-10 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">
            {components.length === 0 ? "No defective parts" : "No matches"}
          </p>
          <p className="text-xs text-muted-foreground">
            {components.length === 0
              ? "Nothing has been marked as defective yet."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden shadow-elevation-1">
          <CardContent className="p-0">
            <Accordion type="multiple" className="w-full">
              {filtered.map((c) => {
                const entries = entriesByItem[c.id] ?? [];
                return (
                  <AccordionItem key={c.id} value={c.id} className="border-b border-border last:border-0">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex w-full items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary">
                          {c.image_url ? (
                            <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <div className="truncate font-semibold">{c.name}</div>
                          <div className="text-xs text-muted-foreground">SKU {c.sku}</div>
                        </div>
                        <div className="flex flex-col items-end pr-2">
                          <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-bold text-destructive">
                            {c.defective_count} defective
                          </span>
                          <span className="mt-1 text-[11px] text-muted-foreground">
                            {entries.length} {entries.length === 1 ? "report" : "reports"}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      {entries.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No detailed reports for this item.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {entries.map((e) => (
                            <li
                              key={e.log.id}
                              className="rounded-lg border border-border bg-surface-elevated p-3"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <UserIcon className="h-3 w-3" />
                                  {e.who}
                                </span>
                                <span>{new Date(e.log.created_at).toLocaleString()}</span>
                              </div>
                              <div className="mt-1 flex items-baseline gap-2">
                                <span className="text-lg font-bold text-destructive">
                                  −{e.log.quantity}
                                </span>
                                <span className="text-xs text-muted-foreground">marked defective</span>
                              </div>
                              {e.log.note && (
                                <p className="mt-1 text-sm">{e.log.note}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

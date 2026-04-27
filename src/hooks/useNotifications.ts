import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { SystemNotification } from "@/types";

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("system_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data as SystemNotification[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    refresh();
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_notifications", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unreadCount = items.filter((n) => !n.is_read).length;

  const markRead = async (id: string) => {
    await supabase.from("system_notifications").update({ is_read: true }).eq("id", id);
    refresh();
  };
  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("system_notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    refresh();
  };

  return { items, loading, unreadCount, markRead, markAllRead, refresh };
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ComplianceState {
  loading: boolean;
  /** Date (YYYY-MM-DD) the user must submit a report for, or null if compliant. */
  blockingDate: string | null;
  refresh: () => Promise<void>;
}

/**
 * Compliance check: staff users must submit a daily report for their previous
 * working day before they can use the rest of the app. Admins/Managers are
 * never blocked.
 */
export function useReportCompliance(): ComplianceState {
  const { user, isStaff, isAdmin, isManager, roleLoaded } = useAuth();
  const [loading, setLoading] = useState(true);
  const [blockingDate, setBlockingDate] = useState<string | null>(null);

  const check = async () => {
    if (!user || !roleLoaded) return;
    // Only Staff are blocked; Admin/Manager bypass entirely
    if (!isStaff || isAdmin || isManager) {
      setBlockingDate(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: prev } = await supabase.rpc("previous_working_day", {
        _user_id: user.id,
      });
      const prevDate = prev as string | null;
      if (!prevDate) {
        setBlockingDate(null);
        setLoading(false);
        return;
      }
      const { data: existing } = await supabase
        .from("daily_reports")
        .select("id")
        .eq("user_id", user.id)
        .eq("report_date", prevDate)
        .maybeSingle();
      setBlockingDate(existing ? null : prevDate);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    check();
    // re-check when user/role context changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, roleLoaded, isStaff, isAdmin, isManager]);

  return { loading, blockingDate, refresh: check };
}

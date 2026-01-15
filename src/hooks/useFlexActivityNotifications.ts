import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";
import { 
  Eye, 
  Download, 
  HelpCircle, 
  Bookmark, 
  FileSignature, 
  FileText,
  Bell
} from "lucide-react";

interface FlexActivityMetadata {
  source?: string;
  flex_deal_id?: string;
  lender_name?: string;
  lender_email?: string;
  file_name?: string;
  file_category?: string;
  message?: string;
  original_timestamp?: string;
  [key: string]: unknown;
}

interface ActivityLogPayload {
  id: string;
  deal_id: string;
  activity_type: string;
  description: string;
  user_id: string | null;
  metadata: Json | null;
  created_at: string;
}

// Priority levels for different event types
const eventPriority: Record<string, "high" | "medium" | "low"> = {
  flex_term_sheet_requested: "high",
  flex_nda_requested: "high",
  flex_info_requested: "high",
  flex_file_downloaded: "medium",
  flex_deal_saved: "medium",
  flex_deal_shared: "medium",
  flex_deal_viewed: "low",
};

// Get icon for activity type
const getActivityIcon = (type: string) => {
  switch (type) {
    case "flex_deal_viewed":
      return Eye;
    case "flex_file_downloaded":
      return Download;
    case "flex_info_requested":
      return HelpCircle;
    case "flex_deal_saved":
      return Bookmark;
    case "flex_nda_requested":
    case "flex_term_sheet_requested":
      return FileSignature;
    default:
      return Bell;
  }
};

// Get toast variant based on priority
const getToastVariant = (priority: "high" | "medium" | "low"): "default" | "destructive" => {
  return priority === "high" ? "destructive" : "default";
};

// Get human-readable title for activity type
const getActivityTitle = (type: string): string => {
  switch (type) {
    case "flex_deal_viewed":
      return "Deal Viewed on FLEx";
    case "flex_file_downloaded":
      return "File Downloaded from FLEx";
    case "flex_info_requested":
      return "🔔 Information Requested!";
    case "flex_deal_saved":
      return "Deal Saved on FLEx";
    case "flex_deal_shared":
      return "Deal Shared on FLEx";
    case "flex_nda_requested":
      return "🔔 NDA Requested!";
    case "flex_term_sheet_requested":
      return "🎉 Term Sheet Requested!";
    default:
      return "FLEx Activity";
  }
};

export function useFlexActivityNotifications(dealId: string | undefined) {
  const showNotification = useCallback((payload: ActivityLogPayload) => {
    const metadata = (payload.metadata || {}) as FlexActivityMetadata;
    
    // Only process FLEx activities
    if (metadata.source !== "flex" && !payload.activity_type.startsWith("flex_")) {
      return;
    }

    const priority = eventPriority[payload.activity_type] || "low";
    const Icon = getActivityIcon(payload.activity_type);
    const title = getActivityTitle(payload.activity_type);
    const variant = getToastVariant(priority);

    // For high priority, use a more prominent notification
    if (priority === "high") {
      toast({
        title,
        description: payload.description,
        variant,
        duration: 10000, // Show longer for high priority
      });
    } else if (priority === "medium") {
      toast({
        title,
        description: payload.description,
        duration: 5000,
      });
    } else {
      // Low priority - still show but shorter duration
      toast({
        title,
        description: payload.description,
        duration: 3000,
      });
    }

    // Play notification sound for high priority events
    if (priority === "high") {
      try {
        // Use browser's notification API if available
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(title, {
            body: payload.description,
            icon: "/favicon.png",
            tag: payload.id, // Prevent duplicate notifications
          });
        }
      } catch (e) {
        // Ignore notification errors
        console.log("Browser notification not available");
      }
    }
  }, []);

  useEffect(() => {
    if (!dealId) return;

    console.log(`Setting up FLEx activity notifications for deal: ${dealId}`);

    const channel = supabase
      .channel(`flex-activity-${dealId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
          filter: `deal_id=eq.${dealId}`,
        },
        (payload) => {
          console.log("Activity log received:", payload);
          const activityPayload = payload.new as ActivityLogPayload;
          
          // Only notify for FLEx activities
          if (activityPayload.activity_type.startsWith("flex_")) {
            showNotification(activityPayload);
          }
        }
      )
      .subscribe((status) => {
        console.log(`FLEx activity subscription status: ${status}`);
      });

    return () => {
      console.log("Cleaning up FLEx activity subscription");
      supabase.removeChannel(channel);
    };
  }, [dealId, showNotification]);

  // Request browser notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      // We'll request permission when user takes an action, not on load
      // This is better UX
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }
    return false;
  }, []);

  return { requestNotificationPermission };
}

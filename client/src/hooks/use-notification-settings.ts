import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { NotificationSettings } from "@/lib/types";

export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>({
    email: "",
    emailPriceDrops: true,
    emailWeeklySummary: false,
    checkFrequency: 24,
    priceThreshold: 1.00,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: userSettings } = useQuery({
    queryKey: ["/api/settings", "latest"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/settings/latest");
      return response.json();
    },
    enabled: true,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: NotificationSettings) => {
      const response = await apiRequest("PUT", `/api/settings/${settings.email}`, {
        userEmail: newSettings.email,
        emailPriceDrops: newSettings.emailPriceDrops,
        emailWeeklySummary: newSettings.emailWeeklySummary,
        checkFrequency: newSettings.checkFrequency,
        priceThreshold: newSettings.priceThreshold.toString(),
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.refetchQueries({ queryKey: ["/api/settings", data.userEmail] });
      toast({
        title: "Settings Saved",
        description: "Your notification preferences have been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings.",
        variant: "destructive",
      });
    },
  });


  useEffect(() => {
    if (userSettings) {
      setSettings({
        email: userSettings.userEmail,
        emailPriceDrops: userSettings.emailPriceDrops,
        emailWeeklySummary: userSettings.emailWeeklySummary,
        checkFrequency: userSettings.checkFrequency,
        priceThreshold: parseFloat(userSettings.priceThreshold),
      });
    }
  }, [userSettings]);


  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
  }, [queryClient]);

  const handleSettingChange = (key: keyof NotificationSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    if (key === 'email') {
      return;
    }
    
    setTimeout(() => {
      updateSettingsMutation.mutate(newSettings);
    }, 500);
  };

  const saveEmailSettings = () => {
    updateSettingsMutation.mutate(settings);
  };

  const getCheckFrequencyText = () => {
    switch (settings.checkFrequency) {
      case 12:
        return "every 12 hours";
      case 24:
        return "every 24 hours";
      case 48:
        return "every 48 hours";
      default:
        return "every 24 hours";
    }
  };

  return {
    settings,
    handleSettingChange,
    getCheckFrequencyText,
    saveEmailSettings,
    isLoading: updateSettingsMutation.isPending,
  };
}
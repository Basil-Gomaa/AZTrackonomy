import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export function useNotificationChecker() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check for pending notifications every 30 seconds
  const { data: pendingNotifications } = useQuery({
    queryKey: ['/api/notifications/pending'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/notifications/pending');
      return response.json();
    },
    refetchInterval: 30000, // Check every 30 seconds instead of 5
    refetchOnWindowFocus: false, // Disable refetch on window focus
    staleTime: 20000, // Consider data fresh for 20 seconds
  });

  const markNotificationSentMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const response = await apiRequest('POST', `/api/notifications/${notificationId}/sent`);
      return response.json();
    },
  });

  const sendEmailNotification = async (notification: any) => {
    try {
      const { product, oldPrice, newPrice } = notification;
      const oldPriceNum = parseFloat(oldPrice);
      const newPriceNum = parseFloat(newPrice);
      const savings = oldPriceNum - newPriceNum;
      const savingsPercent = Math.round((savings / oldPriceNum) * 100);

      // Send email via server API
      const emailResponse = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to_email: product.userEmail,
          product_title: product.title,
          product_asin: product.asin,
          old_price: `$${oldPriceNum.toFixed(2)}`,
          new_price: `$${newPriceNum.toFixed(2)}`,
          target_price: `$${product.targetPrice}`,
          savings_amount: `$${savings.toFixed(2)}`,
          savings_percent: savingsPercent,
          product_url: product.productUrl,
          subject: `Price Drop Alert: ${product.title} - Save ${savingsPercent}%!`
        })
      });

      if (!emailResponse.ok) {
        throw new Error(`Server email API error: ${emailResponse.status} ${emailResponse.statusText}`);
      }
      
      // Mark notification as sent
      await markNotificationSentMutation.mutateAsync(notification.id);
      
      toast({
        title: "Price Drop Alert Sent",
        description: `Email sent for ${product.title} - Save ${savingsPercent}%!`,
      });

      // Refresh products and stats
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });

      return true;
    } catch (error) {
      toast({
        title: "Notification Failed",
        description: `Failed to send price drop alert for ${notification.product.title}`,
        variant: "destructive",
      });
      return false;
    }
  };

  // Process pending notifications
  useEffect(() => {
    if (pendingNotifications && pendingNotifications.length > 0) {
      pendingNotifications.forEach((notification: any) => {
        if (notification.type === 'price_drop') {
          sendEmailNotification(notification);
        }
      });
    }
  }, [pendingNotifications]);

  return {
    pendingCount: pendingNotifications?.length || 0,
    sendEmailNotification
  };
}
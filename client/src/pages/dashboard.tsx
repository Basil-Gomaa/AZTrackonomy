import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNotificationChecker } from "@/hooks/use-notification-checker";
import { useNotificationSettings } from "@/hooks/use-notification-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest } from "@/lib/queryClient";
import { AddProductForm } from "@/components/add-product-form";
import { StatsOverview } from "@/components/stats-overview";
import { ProductList } from "@/components/product-list";
import { NotificationSettings } from "@/components/notification-settings";

import { ChartLine, Settings, RefreshCw } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE;

export default function Dashboard() {
  const { settings } = useNotificationSettings();
  const userEmail = settings.email; // Use dynamic email from notification settings
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Initialize notification checker for automatic email alerts
  useNotificationChecker();


  const manualCheckMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/price-check");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Price Check Initiated",
        description: "Manual price check has been started. This may take a few minutes.",
      });
      // Refresh data after a delay to allow price check to complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      }, 5000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate price check.",
        variant: "destructive",
      });
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/notifications/test", {
        userEmail
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test Email Sent",
        description: `Email sent to: ${data.email}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Email Test Failed",
        description: error.message || "Failed to send test email.",
        variant: "destructive",
      });
    },
  });

  const testNotificationMutation = useMutation({
    mutationFn: async () => {
      // Get tracked products first
      const productsResponse = await apiRequest("GET", "/api/products");
      const products = await productsResponse.json();
      const userProducts = products.filter((p: any) => p.userEmail === userEmail);
      
      if (userProducts.length === 0) {
        throw new Error("No tracked products found for testing");
      }

      const testProduct = userProducts[0];
      const oldPrice = parseFloat(testProduct.currentPrice);
      const newPrice = oldPrice * 0.8; // 20% price drop
      const savings = oldPrice - newPrice;
      const savingsPercent = Math.round((savings / oldPrice) * 100);



      const response = await fetch(`${API_BASE}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to_email: settings.email,
          product_title: testProduct.title,
          product_asin: testProduct.asin,
          old_price: `$${oldPrice.toFixed(2)}`,
          new_price: `$${newPrice.toFixed(2)}`,
          target_price: `$${testProduct.targetPrice}`,
          savings_amount: `$${savings.toFixed(2)}`,
          savings_percent: savingsPercent,
          product_url: testProduct.productUrl,
          subject: `Test Price Drop Alert: ${testProduct.title} - Save ${savingsPercent}%!`
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server email API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      return {
        product: testProduct.title,
        oldPrice: oldPrice.toFixed(2),
        newPrice: newPrice.toFixed(2),
        email: settings.email
      };
    },
    onSuccess: (data) => {
      toast({
        title: "Test Notification Sent",
        description: `Email sent to ${settings.email} for ${data.product} (${data.oldPrice} → ${data.newPrice})`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Notification Test Failed",
        description: error.message || "Failed to send test notification.",
        variant: "destructive",
      });
    },
  });

  const addDemoProductsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/demo/add-products", { userEmail });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Demo Products Added",
        description: `Added ${data.products?.length || 0} demo products for tracking.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add demo products.",
        variant: "destructive",
      });
    },
  });

  const simulatePriceChangeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/demo/simulate-price-change");
      return response.json();
    },
    onSuccess: (data) => {
      const priceDrops = data.products?.filter((p: any) => p.priceDropped) || [];
      toast({
        title: "Price Changes Simulated",
        description: `${data.products?.length || 0} products updated. ${priceDrops.length} price drops detected!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to simulate price changes.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <ChartLine className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg md:text-xl font-semibold text-foreground">AZTrackonomy</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Price Drop Notifications</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-3">
              <ThemeToggle />
              
              <div className="hidden sm:flex items-center space-x-2 px-2 py-1 bg-success/10 rounded-md">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                <span className="text-xs font-medium text-success">Active</span>
              </div>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => testEmailMutation.mutate()}
                disabled={testEmailMutation.isPending}
                className="bg-blue-50 hover:bg-blue-100 border-blue-200 dark:bg-blue-950/50 dark:hover:bg-blue-950/70 dark:border-blue-800"
                aria-label="Test dynamic email configuration"
              >
                <span className="hidden sm:inline">Test Config</span>
                <span className="sm:hidden">Config</span>
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => testNotificationMutation.mutate()}
                disabled={testNotificationMutation.isPending}
                className="bg-orange-50 hover:bg-orange-100 border-orange-200 dark:bg-orange-950/50 dark:hover:bg-orange-950/70 dark:border-orange-800"
                aria-label="Send test email notification"
              >
                <span className="hidden sm:inline">Test Alert</span>
                <span className="sm:hidden" role="img" aria-label="Alert">🛎️</span>
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => manualCheckMutation.mutate()}
                disabled={manualCheckMutation.isPending}
                aria-label="Manually check prices now"
              >
                <RefreshCw className={`h-4 w-4 ${manualCheckMutation.isPending ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline ml-2">Check</span>
              </Button>
            </div>
          </div>
        </div>
      </header>
      {/* Demo Controls */}
      <div className="bg-blue-50/50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Test before using on real products</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => addDemoProductsMutation.mutate()}
                disabled={addDemoProductsMutation.isPending}
                className="text-xs"
              >
                Add Demo Products
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => simulatePriceChangeMutation.mutate()}
                disabled={simulatePriceChangeMutation.isPending}
                className="text-xs"
              >
                Simulate Price Drop
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AddProductForm userEmail={userEmail} />
        <ProductList userEmail={userEmail} />
        <StatsOverview />
        <NotificationSettings />

      </main>
      {/* Footer */}
      <footer className="bg-card border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <ChartLine className="h-4 w-4 text-primary-foreground" />
                </div>
                <h3 className="font-semibold text-foreground">Amazon Price Tracker</h3>
              </div>
              
            </div>
            
            <div>
              <h4 className="font-medium text-foreground mb-3">Features</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-success rounded-full" />
                  <span>Real-time price monitoring</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-success rounded-full" />
                  <span>Email notifications</span>
                </li>
                
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-success rounded-full" />
                  <span>Automated background checks</span>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-foreground mb-3">Tech Stack</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Frontend:</span>
                  <span className="font-medium">React + Vite</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>API:</span>
                  <span className="font-medium">RapidAPI (Free Tier)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Notifications:</span>
                  <span className="font-medium">ResendAPI</span>
                </div>
                
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

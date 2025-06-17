import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useNotificationSettings } from "@/hooks/use-notification-settings";
import { Plus, Search } from "lucide-react";
import type { ProductLookupResult } from "@/lib/types";

interface AddProductFormProps {
  userEmail: string;
}

export function AddProductForm({ userEmail }: AddProductFormProps) {
  const [productInput, setProductInput] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [lookupResult, setLookupResult] = useState<ProductLookupResult | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualData, setManualData] = useState({
    title: "",
    currentPrice: "",
    imageUrl: ""
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings, getCheckFrequencyText } = useNotificationSettings();

  const lookupMutation = useMutation({
    mutationFn: async (input: string) => {
      const response = await apiRequest("POST", "/api/products/lookup", { input });
      return response.json();
    },
    onSuccess: (data: ProductLookupResult) => {
      setLookupResult(data);
      if (data.needsManualEntry) {
        setShowManualEntry(true);
        setManualData({
          title: "",
          currentPrice: "",
          imageUrl: data.imageUrl || ""
        });
        toast({
          title: "Product Found",
          description: "Please enter the current price and product title to start tracking.",
        });
      } else {
        toast({
          title: "Product Found",
          description: `Found: ${data.title}`,
        });
      }
    },
    onError: (error: any) => {
      setShowManualEntry(true);
      toast({
        title: "Manual Entry Required",
        description: "API subscription needed. Please enter product details manually.",
        variant: "destructive",
      });
    },
  });

  const addProductMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/products", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setProductInput("");
      setTargetPrice("");
      setLookupResult(null);
      toast({
        title: "Product Added",
        description: "Product has been added to your tracking list.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add product to tracking.",
        variant: "destructive",
      });
    },
  });

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productInput.trim()) return;
    
    lookupMutation.mutate(productInput.trim());
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!lookupResult || !targetPrice) {
      toast({
        title: "Missing Information",
        description: "Please lookup a product and set a target price.",
        variant: "destructive",
      });
      return;
    }

    const title = showManualEntry && manualData.title ? manualData.title : lookupResult.title;
    const currentPrice = showManualEntry && manualData.currentPrice ? manualData.currentPrice : lookupResult.price.toString();
    const imageUrl = showManualEntry && manualData.imageUrl ? manualData.imageUrl : lookupResult.imageUrl;

    if (showManualEntry && (!manualData.title || !manualData.currentPrice)) {
      toast({
        title: "Missing Information",
        description: "Please enter product title and current price.",
        variant: "destructive",
      });
      return;
    }

    const productData = {
      asin: lookupResult.asin,
      title: title,
      imageUrl: imageUrl,
      currentPrice: currentPrice,
      targetPrice: targetPrice,
      originalPrice: currentPrice,
      productUrl: lookupResult.url,
      userEmail: settings.email,
    };

    addProductMutation.mutate(productData);
  };

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Plus className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Track New Product</h2>
        </div>

        <form onSubmit={handleLookup} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7">
              <Label htmlFor="productInput" className="text-sm font-medium text-muted-foreground">
                Amazon Product URL or ASIN
              </Label>
              <Input
                id="productInput"
                type="text"
                value={productInput}
                onChange={(e) => setProductInput(e.target.value)}
                placeholder="https://amazon.com/dp/B08N5WRWNW or B08N5WRWNW"
                className="mt-2"
              />
            </div>
            
            <div className="lg:col-span-3">
              <Label htmlFor="targetPrice" className="text-sm font-medium text-muted-foreground">
                Target Price ($)
              </Label>
              <Input
                id="targetPrice"
                type="number"
                step="0.01"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="29.99"
                className="mt-2"
              />
            </div>
            
            <div className="lg:col-span-2">
              <Label className="text-sm text-transparent">Search</Label>
              <Button 
                type="submit"
                disabled={lookupMutation.isPending || !productInput.trim()}
                className="w-full mt-2"
                aria-label="Search for product"
              >
                {lookupMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Lookup
                  </>
                )}
              </Button>
            </div>
          </div>
          
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span>Supports Amazon.com links and ASIN codes</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>Price checks {getCheckFrequencyText()}</span>
            </div>
          </div>
        </form>

        {lookupResult && (
          <div className="mt-6 p-4 border border-border rounded-lg bg-card">
            <div className="flex items-start space-x-4">
              {lookupResult.imageUrl && (
                <img 
                  src={lookupResult.imageUrl} 
                  alt={lookupResult.title}
                  className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                  loading="lazy"
                  width="80"
                  height="80"
                  decoding="async"
                />
              )}
              <div className="flex-1">
                <h3 className="font-medium text-foreground mb-1">{lookupResult.title}</h3>
                <p className="text-sm text-muted-foreground mb-2">ASIN: {lookupResult.asin}</p>
                
                <div className="mb-4 space-y-3">
                  {showManualEntry && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                        Please enter the current product details manually:
                      </p>
                      
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="manualTitle" className="text-sm font-medium">Product Title</Label>
                          <Input
                            id="manualTitle"
                            value={manualData.title}
                            onChange={(e) => setManualData({...manualData, title: e.target.value})}
                            placeholder="Enter product title from Amazon"
                            className="mt-1"
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="manualPrice" className="text-sm font-medium">Current Price ($)</Label>
                          <Input
                            id="manualPrice"
                            type="number"
                            step="0.01"
                            value={manualData.currentPrice}
                            onChange={(e) => setManualData({...manualData, currentPrice: e.target.value})}
                            placeholder="Enter current price from Amazon"
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <Label htmlFor="targetPrice" className="text-sm font-medium">Target Price ($)</Label>
                    <Input
                      id="targetPrice"
                      type="number"
                      step="0.01"
                      value={targetPrice}
                      onChange={(e) => setTargetPrice(e.target.value)}
                      placeholder="Price to alert you when reached"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      You'll receive an email when the price drops to or below this amount
                    </p>
                  </div>
                </div>
                
                <p className="text-lg font-semibold text-foreground">
                  Current Price: ${showManualEntry ? (manualData.currentPrice || '0.00') : lookupResult.price.toFixed(2)}
                </p>
                
                
                <div className="mt-2 text-xs text-muted-foreground">
                  Debug: targetPrice="{targetPrice}", lookupResult={lookupResult ? 'exists' : 'null'}, 
                  showManualEntry={showManualEntry ? 'true' : 'false'}
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end">
              <Button 
                onClick={handleAddProduct}
                disabled={addProductMutation.isPending || !targetPrice || !lookupResult}
                className="bg-primary hover:bg-primary/90"
                aria-label="Add product to tracking list"
                title={!targetPrice ? "Please set a target price" : !lookupResult ? "Please lookup a product first" : ""}
              >
                {addProductMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add to Tracking
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

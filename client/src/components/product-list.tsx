import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Edit, Trash2, ExternalLink, TrendingDown, TrendingUp, Eye } from "lucide-react";
import type { TrackedProduct } from "@shared/schema";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function ProductList({ userEmail }: { userEmail: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{ id: number; title: string } | null>(null);

  const { data: products, isLoading } = useQuery<TrackedProduct[]>({
    queryKey: ["/api/products", userEmail],
    queryFn: () => apiRequest("GET", `/api/products?userEmail=${userEmail}`).then(res => res.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Product Removed",
        description: "Product has been removed from tracking.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove product.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number, title: string) => {
    setProductToDelete({ id, title });
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (productToDelete) {
      deleteMutation.mutate(productToDelete.id);
      setDeleteModalOpen(false);
      setProductToDelete(null);
    }
  };

  const getProductStatus = (product: TrackedProduct) => {
    const currentPrice = parseFloat(product.currentPrice);
    const targetPrice = parseFloat(product.targetPrice);
    const originalPrice = parseFloat(product.originalPrice || product.currentPrice);
    
    if (currentPrice <= targetPrice) {
      const savings = targetPrice - currentPrice;
      return {
        type: 'price_drop',
        label: 'Price Drop Alert!',
        icon: TrendingDown,
        className: 'border-success/20 bg-success/5',
        badgeClassName: 'bg-success text-success-foreground',
        savings: savings,
        change: originalPrice - currentPrice
      };
    } else if (currentPrice > originalPrice) {
      return {
        type: 'price_increase',
        label: 'Price Increased',
        icon: TrendingUp,
        className: 'border-warning/20 bg-warning/5',
        badgeClassName: 'bg-warning text-warning-foreground',
        change: currentPrice - originalPrice
      };
    } else {
      return {
        type: 'monitoring',
        label: 'Monitoring',
        icon: Eye,
        className: 'border-border',
        badgeClassName: 'bg-muted text-muted-foreground',
        difference: currentPrice - targetPrice
      };
    }
  };

  const formatLastChecked = (date: Date | string) => {
    const checkDate = new Date(date);
    const now = new Date();
    const diff = now.getTime() - checkDate.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `Checked ${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `Checked ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just checked';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse border border-border rounded-lg p-4">
                <div className="flex items-start space-x-4">
                  <div className="w-20 h-20 bg-muted rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                    <div className="h-6 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!products || products.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Eye className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No Products Tracked Yet</h3>
          <p className="text-muted-foreground mb-6">
            Add Amazon products above to start tracking prices and get notified of drops.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
              <Eye className="h-4 w-4 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Tracked Products</h2>
          </div>
        </div>

        <div className="space-y-4">
          {products.map((product) => {
            const status = getProductStatus(product);
            const StatusIcon = status.icon;

            return (
              <div key={product.id} className={`border rounded-lg p-3 sm:p-4 ${status.className}`}>
                <div className="flex flex-col sm:flex-row sm:items-start space-y-3 sm:space-y-0 sm:space-x-4">
                  {product.imageUrl && (
                    <img 
                      src={product.imageUrl} 
                      alt={product.title}
                      className="w-full h-32 sm:w-20 sm:h-20 object-cover rounded-lg flex-shrink-0"
                      loading="lazy"
                      width="80"
                      height="80"
                      decoding="async"
                    />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between space-y-3 sm:space-y-0">
                      <div className="flex-1">
                        <h3 className="font-medium text-foreground mb-2 text-sm sm:text-base line-clamp-2">
                          {product.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                          ASIN: {product.asin}
                        </p>
                        
                        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:space-x-4 mb-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                            <span className="text-xs sm:text-sm text-muted-foreground">Current:</span>
                            <div className={`inline-flex items-center px-2 py-1 rounded-md ${
                              parseFloat(product.currentPrice) <= parseFloat(product.targetPrice)
                                ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                                : 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200'
                            }`}>
                              <span className="text-base sm:text-lg font-semibold">
                                ${parseFloat(product.currentPrice).toFixed(2)}
                              </span>
                              {parseFloat(product.currentPrice) <= parseFloat(product.targetPrice) && (
                                <span className="ml-1 text-xs">✓</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                            <span className="text-xs sm:text-sm text-muted-foreground">Target:</span>
                            <span className="text-base sm:text-lg font-semibold text-muted-foreground">
                              ${parseFloat(product.targetPrice).toFixed(2)}
                            </span>
                          </div>
                          
                          {status.type === 'price_drop' && status.savings && (
                            <div className="flex items-center space-x-2">
                              <TrendingDown className="h-4 w-4 text-success" />
                              <span className="text-sm font-medium text-success">
                                Save ${status.savings.toFixed(2)}
                              </span>
                            </div>
                          )}
                          
                          {status.type === 'price_increase' && status.change && (
                            <div className="flex items-center space-x-2">
                              <TrendingUp className="h-4 w-4 text-warning" />
                              <span className="text-sm font-medium text-warning">
                                +${status.change.toFixed(2)} from last check
                              </span>
                            </div>
                          )}
                          
                          {status.type === 'monitoring' && status.difference && (
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-muted-foreground">
                                ${status.difference.toFixed(2)} to target
                              </span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Badge className={status.badgeClassName}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {product.lastChecked ? formatLastChecked(product.lastChecked) : 'Never checked'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-row sm:flex-col lg:flex-row items-center justify-center sm:justify-start gap-1 sm:space-x-0 lg:space-x-2 w-full sm:w-auto">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-muted-foreground hover:text-destructive flex-1 sm:flex-none"
                          onClick={() => handleDelete(product.id, product.title)}
                          disabled={deleteMutation.isPending}
                          aria-label={`Remove ${product.title} from tracking`}
                        >
                          <Trash2 className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline text-xs">Remove</span>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-muted-foreground hover:text-primary flex-1 sm:flex-none"
                          asChild
                        >
                          <a href={product.productUrl} target="_blank" rel="noopener noreferrer" aria-label={`View ${product.title} on Amazon`}>
                            <ExternalLink className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline text-xs">View</span>
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop tracking "{productToDelete?.title}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

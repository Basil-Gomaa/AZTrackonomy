import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, TrendingDown, PiggyBank, Clock } from "lucide-react";
import type { DashboardStats } from "@/lib/types";

export function StatsOverview() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
  });

  const formatLastCheck = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  };

  if (isLoading) {
    return (
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-muted rounded w-24 mb-2" />
                <div className="h-8 bg-muted rounded w-16 mb-4" />
                <div className="w-12 h-12 bg-muted rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-[18px] mb-[18px]">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tracked Products</p>
              <p className="text-2xl font-bold text-foreground">
                {stats?.trackedCount || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Eye className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Price Drops</p>
              <p className="text-2xl font-bold text-success">
                {stats?.priceDrops || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
              <TrendingDown className="h-6 w-6 text-success" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Last Check</p>
              <p className="text-2xl font-bold text-foreground">
                {stats?.lastCheck ? formatLastCheck(stats.lastCheck) : 'Never'}
              </p>
            </div>
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Savings</p>
              <p className="text-2xl font-bold text-success">
                ${stats?.totalSavings ? stats.totalSavings.toFixed(2) : '0.00'}
              </p>
            </div>
            <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
              <PiggyBank className="h-6 w-6 text-success" />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

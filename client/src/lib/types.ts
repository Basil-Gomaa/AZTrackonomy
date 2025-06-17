export interface ProductLookupResult {
  asin: string;
  title: string;
  price: number;
  imageUrl?: string;
  availability: boolean;
  url: string;
  needsManualEntry?: boolean;
}

export interface DashboardStats {
  trackedCount: number;
  priceDrops: number;
  totalSavings: number;
  lastCheck: number;
}

export interface NotificationSettings {
  email: string;
  emailPriceDrops: boolean;
  emailWeeklySummary: boolean;
  checkFrequency: number;
  priceThreshold: number;
}

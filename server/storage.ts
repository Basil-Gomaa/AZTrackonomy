import { 
  TrackedProduct, 
  InsertTrackedProduct, 
  PriceHistory,
  InsertPriceHistory,
  Notification,
  InsertNotification,
  UserSettings,
  InsertUserSettings
} from "@shared/schema";

export interface IStorage {
  // Tracked Products
  getTrackedProducts(userEmail?: string): Promise<TrackedProduct[]>;
  getTrackedProduct(id: number): Promise<TrackedProduct | undefined>;
  getTrackedProductByAsin(asin: string, userEmail: string): Promise<TrackedProduct | undefined>;
  createTrackedProduct(product: InsertTrackedProduct): Promise<TrackedProduct>;
  updateTrackedProduct(id: number, updates: Partial<TrackedProduct>): Promise<TrackedProduct>;
  deleteTrackedProduct(id: number): Promise<void>;
  
  // Price History
  createPriceHistory(history: InsertPriceHistory): Promise<PriceHistory>;
  getPriceHistory(productId: number): Promise<PriceHistory[]>;
  
  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUnsentNotifications(): Promise<Notification[]>;
  markNotificationSent(id: number): Promise<void>;
  
  // User Settings
  getUserSettings(userEmail: string): Promise<UserSettings | undefined>;
  getAllUserSettings(): Promise<UserSettings[]>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(userEmail: string, updates: Partial<UserSettings>): Promise<UserSettings>;
}

export class MemStorage implements IStorage {
  private trackedProducts: Map<number, TrackedProduct>;
  private priceHistory: Map<number, PriceHistory>;
  private notifications: Map<number, Notification>;
  private userSettings: Map<string, UserSettings>;
  private currentId: number;
  private historyId: number;
  private notificationId: number;
  private settingsId: number;

  constructor() {
    this.trackedProducts = new Map();
    this.priceHistory = new Map();
    this.notifications = new Map();
    this.userSettings = new Map();
    this.currentId = 1;
    this.historyId = 1;
    this.notificationId = 1;
    this.settingsId = 1;
  }

  async getTrackedProducts(userEmail?: string): Promise<TrackedProduct[]> {
    return Array.from(this.trackedProducts.values()).filter(p => p.isActive && (!userEmail || p.userEmail === userEmail));
  }

  async getTrackedProduct(id: number): Promise<TrackedProduct | undefined> {
    return this.trackedProducts.get(id);
  }

  async getTrackedProductByAsin(asin: string, userEmail: string): Promise<TrackedProduct | undefined> {
    return Array.from(this.trackedProducts.values()).find(
      product => product.asin === asin && product.userEmail === userEmail && product.isActive
    );
  }

  async createTrackedProduct(insertProduct: InsertTrackedProduct): Promise<TrackedProduct> {
    const id = this.currentId++;
    const now = new Date();
    const product: TrackedProduct = {
      ...insertProduct,
      id,
      imageUrl: insertProduct.imageUrl || null,
      originalPrice: insertProduct.originalPrice || null,
      isActive: true,
      lastChecked: now,
      createdAt: now,
      updatedAt: now,
    };
    this.trackedProducts.set(id, product);
    return product;
  }

  async updateTrackedProduct(id: number, updates: Partial<TrackedProduct>): Promise<TrackedProduct> {
    const existing = this.trackedProducts.get(id);
    if (!existing) {
      throw new Error(`Product with id ${id} not found`);
    }
    
    const updated: TrackedProduct = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.trackedProducts.set(id, updated);
    return updated;
  }

  async deleteTrackedProduct(id: number): Promise<void> {
    const existing = this.trackedProducts.get(id);
    if (existing) {
      await this.updateTrackedProduct(id, { isActive: false });
    }
  }

  async createPriceHistory(insertHistory: InsertPriceHistory): Promise<PriceHistory> {
    const id = this.historyId++;
    const history: PriceHistory = {
      id,
      productId: insertHistory.productId!,
      price: insertHistory.price,
      recordedAt: new Date(),
    };
    this.priceHistory.set(id, history);
    return history;
  }

  async getPriceHistory(productId: number): Promise<PriceHistory[]> {
    return Array.from(this.priceHistory.values())
      .filter(h => h.productId === productId)
      .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = this.notificationId++;
    const notification: Notification = {
      id,
      type: insertNotification.type,
      productId: insertNotification.productId!,
      oldPrice: insertNotification.oldPrice,
      newPrice: insertNotification.newPrice,
      emailSent: false,
      createdAt: new Date(),
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async getUnsentNotifications(): Promise<Notification[]> {
    return Array.from(this.notifications.values()).filter(n => !n.emailSent);
  }

  async markNotificationSent(id: number): Promise<void> {
    const notification = this.notifications.get(id);
    if (notification) {
      this.notifications.set(id, { ...notification, emailSent: true });
    }
  }

  async getUserSettings(userEmail: string): Promise<UserSettings | undefined> {
    return this.userSettings.get(userEmail);
  }

  async getAllUserSettings(): Promise<UserSettings[]> {
    return Array.from(this.userSettings.values());
  }

  async createUserSettings(insertSettings: InsertUserSettings): Promise<UserSettings> {
    const settings: UserSettings = {
      id: this.settingsId++,
      userEmail: insertSettings.userEmail,
      emailPriceDrops: insertSettings.emailPriceDrops ?? true,
      emailWeeklySummary: insertSettings.emailWeeklySummary ?? false,
      checkFrequency: insertSettings.checkFrequency ?? 24,
      priceThreshold: insertSettings.priceThreshold ?? "1.00",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.userSettings.set(insertSettings.userEmail, settings);
    return settings;
  }

  async updateUserSettings(userEmail: string, updates: Partial<UserSettings>): Promise<UserSettings> {
    const existing = this.userSettings.get(userEmail);
    if (!existing) {
      throw new Error(`User settings not found for email: ${userEmail}`);
    }

    const updated: UserSettings = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.userSettings.set(userEmail, updated);
    return updated;
  }
}

export const storage = new MemStorage();

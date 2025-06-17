import { pgTable, text, serial, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const trackedProducts = pgTable("tracked_products", {
  id: serial("id").primaryKey(),
  asin: text("asin").notNull(),
  title: text("title").notNull(),
  imageUrl: text("image_url"),
  currentPrice: decimal("current_price", { precision: 10, scale: 2 }).notNull(),
  targetPrice: decimal("target_price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  productUrl: text("product_url").notNull(),
  userEmail: text("user_email").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastChecked: timestamp("last_checked").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  productId: serial("product_id").references(() => trackedProducts.id),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  productId: serial("product_id").references(() => trackedProducts.id),
  type: text("type").notNull(), // 'price_drop', 'price_increase'
  oldPrice: decimal("old_price", { precision: 10, scale: 2 }).notNull(),
  newPrice: decimal("new_price", { precision: 10, scale: 2 }).notNull(),
  emailSent: boolean("email_sent").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTrackedProductSchema = createInsertSchema(trackedProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastChecked: true,
});

export const insertPriceHistorySchema = createInsertSchema(priceHistory).omit({
  id: true,
  recordedAt: true,
});

// User settings table for notification preferences
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull().unique(),
  emailPriceDrops: boolean("email_price_drops").default(true).notNull(),
  emailWeeklySummary: boolean("email_weekly_summary").default(false).notNull(),
  checkFrequency: serial("check_frequency").default(24).notNull(), // hours
  priceThreshold: decimal("price_threshold", { precision: 10, scale: 2 }).default("1.00").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TrackedProduct = typeof trackedProducts.$inferSelect;
export type InsertTrackedProduct = z.infer<typeof insertTrackedProductSchema>;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;

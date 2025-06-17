import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { amazonApi } from "./services/amazon-api";
import { priceChecker } from "./services/price-checker";
import { emailService } from "./services/email-service";
import { insertTrackedProductSchema, insertUserSettingsSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/products", async (req, res) => {
    try {
      const userEmail = req.query.userEmail as string;
      const products = await storage.getTrackedProducts(userEmail);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const validatedData = insertTrackedProductSchema.parse(req.body);
      
      const existingProduct = await storage.getTrackedProductByAsin(
        validatedData.asin, 
        validatedData.userEmail
      );
      
      if (existingProduct) {
        return res.status(409).json({ error: "Product is already being tracked" });
      }

      const product = await storage.createTrackedProduct(validatedData);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid product data", details: error.errors });
      }
      console.error("Error adding product:", error);
      res.status(500).json({ error: "Failed to add product" });
    }
  });

  app.post("/api/products/lookup", async (req, res) => {
    try {
      const { input } = req.body;
      
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ error: "Product URL or ASIN is required" });
      }

      // Extract ASIN from URL or use input as ASIN
      let asin;
      if (/^[A-Z0-9]{10}$/i.test(input.trim())) {
        asin = input.trim();
      } else {
        // Extract ASIN from Amazon URL
        const asinMatch = input.match(/\/dp\/([A-Z0-9]{10})/i) || 
                         input.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
                         input.match(/asin=([A-Z0-9]{10})/i);
        if (asinMatch) {
          asin = asinMatch[1];
        } else {
          return res.status(400).json({ error: "Invalid Amazon URL - could not extract ASIN" });
        }
      }

      // Try to fetch product data using RapidAPI
      try {
        const product = await amazonApi.getProductByAsin(asin);
        
        if (product && product.title && product.title.length > 5) {
          res.json(product);
        } else {
          const productTemplate = {
            asin: asin,
            title: `Amazon Product ${asin} - Please update title manually`,
            price: 0,
            imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
            availability: true,
            url: `https://amazon.com/dp/${asin}`,
            needsManualEntry: true
          };
          res.json(productTemplate);
        }
      } catch (error) {
        console.error("Amazon API lookup failed:", error);
        const productTemplate = {
          asin: asin,
          title: `Amazon Product ${asin} - Please update title manually`,
          price: 0,
          imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
          availability: true,
          url: `https://amazon.com/dp/${asin}`,
          needsManualEntry: true
        };
        res.json(productTemplate);
      }
    } catch (error) {
      console.error("Error looking up product:", error);
      res.status(500).json({ error: "API subscription required for automatic product lookup. Please enter product details manually." });
    }
  });


  app.post("/api/products/manual", async (req, res) => {
    try {
      const productData = insertTrackedProductSchema.parse(req.body);
      
      // Check if product is already being tracked by this user
      const existingProduct = await storage.getTrackedProductByAsin(
        productData.asin, 
        productData.userEmail
      );
      
      if (existingProduct) {
        return res.status(409).json({ error: "Product is already being tracked" });
      }

      const product = await storage.createTrackedProduct(productData);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid product data", details: error.errors });
      }
      console.error("Error adding manual product:", error);
      res.status(500).json({ error: "Failed to add product" });
    }
  });

  // Update tracked product
  app.patch("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const product = await storage.updateTrackedProduct(id, updates);
      res.json(product);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTrackedProduct(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  app.get("/api/products/:id/history", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const history = await storage.getPriceHistory(id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching price history:", error);
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  });

  app.post("/api/price-check", async (req, res) => {
    try {
      priceChecker.manualPriceCheck().catch(error => {
        console.error("Manual price check failed:", error);
      });
      
      res.json({ message: "Price check initiated" });
    } catch (error) {
      console.error("Error initiating price check:", error);
      res.status(500).json({ error: "Failed to initiate price check" });
    }
  });

  app.get("/api/notifications/pending", async (req, res) => {
    try {
      const notifications = await storage.getUnsentNotifications();
      const enrichedNotifications = [];
      
      const allSettings = await storage.getAllUserSettings();
      let currentUserEmail = null;
      
      if (allSettings.length > 0) {
        const sortedSettings = allSettings.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        currentUserEmail = sortedSettings[0].userEmail;
      }
      
      for (const notification of notifications) {
        const product = await storage.getTrackedProduct(notification.productId);
        if (product) {
          const updatedProduct = {
            ...product,
            userEmail: currentUserEmail || product.userEmail
          };
          
          enrichedNotifications.push({
            id: notification.id,
            product: updatedProduct,
            oldPrice: notification.oldPrice,
            newPrice: notification.newPrice,
            type: notification.type
          });
        }
      }
      
      res.json(enrichedNotifications);
    } catch (error) {
      console.error("Error fetching pending notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark notifications as sent
  app.post("/api/notifications/:id/sent", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.markNotificationSent(id);
      res.json({ message: "Notification marked as sent" });
    } catch (error) {
      console.error("Error marking notification as sent:", error);
      res.status(500).json({ error: "Failed to mark notification" });
    }
  });

  // Send email notification via SendGrid
  app.post("/api/notifications/send", async (req, res) => {
    try {
      const emailData = req.body;
      
      // Validate required fields
      if (!emailData.to_email || !emailData.product_title || !emailData.old_price || !emailData.new_price) {
        return res.status(400).json({ error: "Missing required email data" });
      }

      // Create a mock tracked product for the email service
      const mockProduct = {
        id: 0,
        asin: emailData.product_asin || 'test',
        title: emailData.product_title,
        imageUrl: null as string | null,
        currentPrice: emailData.new_price.replace('$', ''),
        targetPrice: emailData.target_price?.replace('$', '') || '0',
        originalPrice: null as string | null,
        productUrl: emailData.product_url || '#',
        userEmail: emailData.to_email,
        isActive: true,
        lastChecked: new Date() as Date | null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const oldPrice = parseFloat(emailData.old_price.replace('$', ''));
      const newPrice = parseFloat(emailData.new_price.replace('$', ''));

      const success = await emailService.sendPriceDropAlert(mockProduct, oldPrice, newPrice);
      
      if (success) {
        res.json({ message: "Email sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send email" });
      }
    } catch (error) {
      console.error("Error sending email notification:", error);
      res.status(500).json({ error: "Failed to send email notification" });
    }
  });

  // Test dynamic email configuration
  app.post("/api/notifications/test", async (req, res) => {
    try {
      const { userEmail } = req.body;
      if (!userEmail) {
        return res.status(400).json({ error: "User email is required" });
      }

      // Get all settings to find the most recent email configuration for this user context
      const allSettings = await storage.getAllUserSettings();
      let configuredEmail = userEmail; // fallback to provided email
      
      if (allSettings.length > 0) {
        // Sort by update time to get the most recently configured email
        const sortedSettings = allSettings.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        configuredEmail = sortedSettings[0].userEmail;
      }

      const targetEmail = configuredEmail;
      
      // Send a simple test email using Resend
      const testEmail = {
        to: targetEmail,
        subject: "Email Configuration Test - Amazon Price Tracker",
        html: `
          <h2>✅ Email Configuration Test</h2>
          <p>This is a test email to verify your dynamic email configuration is working properly.</p>
          <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3>Configuration Details:</h3>
            <p><strong>Your Configured Email:</strong> ${configuredEmail}</p>
            <p><strong>Delivery Address:</strong> ${targetEmail}</p>
            <p><strong>Test Initiated By:</strong> ${userEmail}</p>
            <p><strong>Domain:</strong> amzpricetracker.xyz (verified)</p>
            <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p><strong>Success:</strong> Using verified domain amzpricetracker.xyz - emails can now be sent to any recipient address!</p>
          </div>
          <p>The dynamic email configuration system is working correctly and detecting your preferences!</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">Amazon Price Tracker - Dynamic Email System</p>
        `
      };

      try {
        const success = await emailService.sendEmail(testEmail);
        
        if (success) {
          res.json({ 
            message: "Test email sent successfully",
            email: targetEmail,
            configuredBy: userEmail
          });
        } else {
          res.status(500).json({ error: "Failed to send test email" });
        }
      } catch (emailError: any) {
        // Handle specific email validation errors
        if (emailError.message?.includes('Invalid email address')) {
          res.status(400).json({ 
            error: "Invalid email address",
            message: emailError.message,
            suggestion: "Please use a valid email address (Gmail, Outlook, etc.) instead of testing domains."
          });
        } else {
          res.status(500).json({ error: "Failed to send test email", details: emailError.message });
        }
      }
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ error: "Failed to send test email" });
    }
  });

  // Test email notification system
  app.post("/api/test/notification", async (req, res) => {
    try {
      const { userEmail } = req.body;
      if (!userEmail) {
        return res.status(400).json({ error: "User email is required" });
      }

      // Get first tracked product for testing
      const products = await storage.getTrackedProducts();
      const testProduct = products.find(p => p.userEmail === userEmail);
      
      if (!testProduct) {
        return res.status(404).json({ error: "No tracked products found for testing" });
      }

      const oldPrice = parseFloat(testProduct.currentPrice);
      const newPrice = oldPrice * 0.8;
      
      // Send test notification
      const success = await emailService.sendPriceDropAlert(testProduct, oldPrice, newPrice);
      
      if (success) {
        res.json({ 
          message: "Test notification sent successfully",
          product: testProduct.title,
          oldPrice: oldPrice.toFixed(2),
          newPrice: newPrice.toFixed(2),
          email: userEmail
        });
      } else {
        res.status(500).json({ error: "Failed to send test notification" });
      }
    } catch (error) {
      console.error("Error sending test notification:", error);
      res.status(500).json({ error: "Failed to send test notification" });
    }
  });

  // User Settings API Routes
  app.get("/api/settings/latest", async (req, res) => {
    try {
      const allSettings = await storage.getAllUserSettings();
      
      if (allSettings.length === 0) {
        // Create default settings with empty email if none exist
        const defaultSettings = await storage.createUserSettings({
          userEmail: "",
          emailPriceDrops: true,
          emailWeeklySummary: false,
          checkFrequency: 24,
          priceThreshold: "1.00"
        });
        res.json(defaultSettings);
        return;
      }
      
      // Return the most recently updated settings
      const latestSettings = allSettings.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      
      res.json(latestSettings);
    } catch (error) {
      console.error("Error fetching latest user settings:", error);
      res.status(500).json({ error: "Failed to fetch latest user settings" });
    }
  });

  app.get("/api/settings/:userEmail", async (req, res) => {
    try {
      const userEmail = req.params.userEmail;
      let settings = await storage.getUserSettings(userEmail);
      
      if (!settings) {
        // Create default settings if none exist
        settings = await storage.createUserSettings({
          userEmail,
          emailPriceDrops: true,
          emailWeeklySummary: false,
          checkFrequency: 24,
          priceThreshold: "1.00"
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching user settings:", error);
      res.status(500).json({ error: "Failed to fetch user settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const validatedData = insertUserSettingsSchema.parse(req.body);
      
      const existingSettings = await storage.getUserSettings(validatedData.userEmail);
      
      if (existingSettings) {
        const updated = await storage.updateUserSettings(validatedData.userEmail, validatedData);
        res.json(updated);
      } else {
        const created = await storage.createUserSettings(validatedData);
        res.status(201).json(created);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid settings data", details: error.errors });
      }
      console.error("Error saving user settings:", error);
      res.status(500).json({ error: "Failed to save user settings" });
    }
  });

  app.put("/api/settings/:userEmail", async (req, res) => {
    try {
      const currentEmail = req.params.userEmail;
      const updates = req.body;
      const newEmail = updates.userEmail;
      
      // If the email is changing, create new settings for the new email
      if (newEmail && newEmail !== currentEmail) {
        // Check if settings already exist for the new email
        const existingNewSettings = await storage.getUserSettings(newEmail);
        if (existingNewSettings) {
          // Update existing settings for the new email
          const updated = await storage.updateUserSettings(newEmail, updates);
          res.json(updated);
        } else {
          // Create new settings for the new email
          const newSettings = {
            userEmail: newEmail,
            emailPriceDrops: updates.emailPriceDrops ?? true,
            emailWeeklySummary: updates.emailWeeklySummary ?? false,
            checkFrequency: updates.checkFrequency ?? 24,
            priceThreshold: updates.priceThreshold?.toString() ?? "1.00"
          };
          
          const created = await storage.createUserSettings(newSettings);
          res.json(created);
        }
      } else {
        // Email is not changing, update existing settings
        let existingSettings = await storage.getUserSettings(currentEmail);
        
        if (!existingSettings) {
          // Create new settings if they don't exist
          const newSettings = {
            userEmail: currentEmail,
            emailPriceDrops: updates.emailPriceDrops ?? true,
            emailWeeklySummary: updates.emailWeeklySummary ?? false,
            checkFrequency: updates.checkFrequency ?? 24,
            priceThreshold: updates.priceThreshold?.toString() ?? "1.00"
          };
          
          const created = await storage.createUserSettings(newSettings);
          res.json(created);
        } else {
          const updated = await storage.updateUserSettings(currentEmail, updates);
          res.json(updated);
        }
      }
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ error: "Failed to update user settings" });
    }
  });

  // Add demo products for testing
  app.post("/api/demo/add-products", async (req, res) => {
    try {
      const { userEmail } = req.body;
      if (!userEmail) {
        return res.status(400).json({ error: "User email is required" });
      }

      // Add demo products with realistic data
      const demoProducts = [
        {
          title: "Echo Dot (5th Gen, 2022 release) | Smart speaker with Alexa",
          asin: "B09B8V1LZ3",
          currentPrice: "49.99",
          targetPrice: "39.99",
          originalPrice: "49.99",
          productUrl: "https://amazon.com/dp/B09B8V1LZ3",
          userEmail: userEmail,
          imageUrl: "https://m.media-amazon.com/images/I/714Rq4k05UL._AC_SL1500_.jpg"
        },
        {
          title: "Fire TV Stick 4K Max streaming device",
          asin: "B08MQZXN1X",
          currentPrice: "54.99",
          targetPrice: "44.99",
          originalPrice: "54.99",
          productUrl: "https://amazon.com/dp/B08MQZXN1X",
          userEmail: userEmail,
          imageUrl: "https://m.media-amazon.com/images/I/51TjJOTfslL._AC_SL1000_.jpg"
        }
      ];

      const createdProducts = [];
      for (const productData of demoProducts) {
        const existing = await storage.getTrackedProductByAsin(productData.asin, userEmail);
        if (!existing) {
          const product = await storage.createTrackedProduct(productData);
          createdProducts.push(product);
        }
      }

      res.json({ message: `Added ${createdProducts.length} demo products`, products: createdProducts });
    } catch (error) {
      console.error("Error adding demo products:", error);
      res.status(500).json({ error: "Failed to add demo products" });
    }
  });

  // Simulate price changes for demo
  app.post("/api/demo/simulate-price-change", async (req, res) => {
    try {
      const products = await storage.getTrackedProducts();
      if (products.length === 0) {
        return res.status(400).json({ error: "No products to simulate price changes for" });
      }

      const updatedProducts = [];
      for (const product of products) {
        const currentPrice = parseFloat(product.currentPrice);
        // Create a significant price drop (15-25%) to trigger notifications
        const dropPercent = 0.15 + (Math.random() * 0.10); // 15-25% drop
        const newPrice = Math.max(currentPrice * (1 - dropPercent), 1);

        await storage.updateTrackedProduct(product.id, {
          currentPrice: newPrice.toFixed(2),
          lastChecked: new Date()
        });

        // Record price history
        await storage.createPriceHistory({
          productId: product.id,
          price: newPrice.toFixed(2)
        });

        // Check if price dropped below target or significant drop occurred
        const targetPrice = parseFloat(product.targetPrice);
        const priceDifference = currentPrice - newPrice;
        
        if ((newPrice <= targetPrice && newPrice < currentPrice) || (newPrice < currentPrice && priceDifference >= 5.00)) {
          await storage.createNotification({
            productId: product.id,
            type: 'price_drop',
            oldPrice: currentPrice.toFixed(2),
            newPrice: newPrice.toFixed(2),
            emailSent: false
          });
          

        }

        updatedProducts.push({
          id: product.id,
          title: product.title,
          oldPrice: currentPrice,
          newPrice: newPrice,
          targetPrice: targetPrice,
          priceDropped: newPrice <= targetPrice && newPrice < currentPrice
        });
      }

      res.json({ message: "Price changes simulated", products: updatedProducts });
    } catch (error) {
      console.error("Error simulating price changes:", error);
      res.status(500).json({ error: "Failed to simulate price changes" });
    }
  });

  // Get dashboard stats
  app.get("/api/stats", async (req, res) => {
    try {
      const products = await storage.getTrackedProducts();
      const priceDrops = products.filter(p => 
        parseFloat(p.currentPrice) < parseFloat(p.targetPrice)
      );
      
      const totalSavings = priceDrops.reduce((sum, p) => 
        sum + (parseFloat(p.targetPrice) - parseFloat(p.currentPrice)), 0
      );

      const stats = {
        trackedCount: products.length,
        priceDrops: priceDrops.length,
        totalSavings: totalSavings,
        lastCheck: products.length > 0 ? 
          Math.max(...products.map(p => p.lastChecked?.getTime() || 0)) : 
          Date.now()
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

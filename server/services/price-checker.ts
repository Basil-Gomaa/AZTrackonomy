import * as cron from 'node-cron';
import { storage } from '../storage';
import { amazonApi } from './amazon-api';
import { emailService } from './email-service';

export class PriceChecker {
  private isRunning: boolean = false;

  constructor() {
    cron.schedule('*/5 * * * *', () => {
      this.checkAllPrices();
    });

    cron.schedule('0 */2 * * *', () => {
      this.checkAllPrices();
    });

    cron.schedule('0 9 * * 0', () => {
      this.sendWeeklySummaries();
    });


  }

  async checkAllPrices(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const products = await storage.getTrackedProducts();

      for (const product of products) {
        try {
          await this.checkProductPrice(product.id);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error checking price for product ${product.id}:`, error);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  async checkProductPrice(productId: number): Promise<void> {
    const product = await storage.getTrackedProduct(productId);
    if (!product) {
      return;
    }

    try {
      const currentData = await amazonApi.getProductByAsin(product.asin);
      if (!currentData) {
        console.log(`Could not fetch current data for product ${product.id}`);
        return;
      }

      const oldPrice = parseFloat(product.currentPrice);
      const newPrice = currentData.price;

      // Update product with new price and last checked time
      await storage.updateTrackedProduct(productId, {
        currentPrice: newPrice.toString(),
        lastChecked: new Date(),
        title: currentData.title, // Update title in case it changed
        imageUrl: currentData.imageUrl || product.imageUrl,
      });

      // Record price history
      await storage.createPriceHistory({
        productId: productId,
        price: newPrice.toString(),
      });

      // Check for significant price changes
      const priceChangeThreshold = 1.00; // $1 minimum change
      const priceDifference = Math.abs(newPrice - oldPrice);
      const targetPrice = parseFloat(product.targetPrice);

      console.log(`Product ${product.id}: Old price: $${oldPrice}, New price: $${newPrice}, Target: $${targetPrice}`);

      if (priceDifference >= priceChangeThreshold) {
        // Create notification for significant price changes
        const notificationType = newPrice < oldPrice ? 'price_drop' : 'price_increase';
        const notification = await storage.createNotification({
          productId: productId,
          type: notificationType,
          oldPrice: oldPrice.toString(),
          newPrice: newPrice.toString(),
        });

        console.log(`Price change detected for product ${product.id}: ${notificationType} of $${priceDifference.toFixed(2)}`);

        // Send email if price dropped below target or significant drop occurred
        if ((newPrice <= targetPrice && newPrice < oldPrice) || (newPrice < oldPrice && priceDifference >= 5.00)) {
          try {
            // Create notification for client-side email processing
            await storage.createNotification({
              productId: product.id,
              type: 'price_drop',
              oldPrice: oldPrice.toString(),
              newPrice: newPrice.toString(),
              emailSent: false
            });
            

          } catch (error) {
            console.error(`Error creating price drop notification for product ${product.id}:`, error);
          }
        }
      } else if (Math.abs(newPrice - oldPrice) > 0) {
      }
    } catch (error) {
      console.error(`Error checking price for product ${productId}:`, error);
    }
  }

  async sendWeeklySummaries(): Promise<void> {
    try {
      const products = await storage.getTrackedProducts();
      const emailMap = new Map<string, any[]>();
      
      // Group products by user email
      products.forEach(product => {
        if (!emailMap.has(product.userEmail)) {
          emailMap.set(product.userEmail, []);
        }
        emailMap.get(product.userEmail)!.push(product);
      });

      // Send summary to each user
      emailMap.forEach(async (userProducts, email) => {
        try {
          await emailService.sendWeeklySummary(email, userProducts);
          console.log(`Weekly summary sent to ${email}`);
        } catch (error) {
          console.error(`Error sending weekly summary to ${email}:`, error);
        }
      });
    } catch (error) {
      console.error('Error sending weekly summaries:', error);
    }
  }

  async manualPriceCheck(): Promise<void> {
    await this.checkAllPrices();
  }
}

export const priceChecker = new PriceChecker();

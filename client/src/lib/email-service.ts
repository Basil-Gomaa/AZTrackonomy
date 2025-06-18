export interface EmailNotificationData {
  to_email: string;
  product_title: string;
  product_asin: string;
  old_price: string;
  new_price: string;
  target_price: string;
  savings_amount: string;
  savings_percent: number;
  product_url: string;
  subject: string;
}

const API_BASE = import.meta.env.VITE_API_BASE;

export class ClientEmailService {
  async sendPriceDropAlert(data: EmailNotificationData): Promise<boolean> {
    try {
      // Use the server-side API endpoint to send emails via SendGrid
      const response = await fetch(`${API_BASE}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to_email: data.to_email,
          product_title: data.product_title,
          product_asin: data.product_asin,
          old_price: data.old_price,
          new_price: data.new_price,
          target_price: data.target_price,
          savings_amount: data.savings_amount,
          savings_percent: data.savings_percent,
          product_url: data.product_url,
          subject: data.subject
        })
      });

      if (response.ok) {
        return true;
      } else {
        console.error('Server email API error:', response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.error('Error sending email notification via server:', error);
      return false;
    }
  }
}

export const clientEmailService = new ClientEmailService();
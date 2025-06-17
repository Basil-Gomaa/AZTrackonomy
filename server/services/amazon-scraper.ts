import { AmazonProduct } from './amazon-api.js';

export class AmazonScraper {
  async getProductData(asin: string): Promise<AmazonProduct | null> {


    // Try Amazon's product information through various endpoints
    const methods = [
      () => this.tryAmazonOpenGraph(asin),
      () => this.tryAmazonMetadata(asin),
      () => this.tryAmazonShare(asin),
      () => this.tryAmazonWishlist(asin),
      () => this.tryAmazonMobile(asin)
    ];

    for (const method of methods) {
      try {
        const result = await method();
        if (result && this.isValidProduct(result)) {

          return result;
        }
      } catch (error) {

        continue;
      }
    }

    return null;
  }

  private async tryAmazonOpenGraph(asin: string): Promise<AmazonProduct | null> {
    const shareUrl = `https://www.amazon.com/share/dp/${asin}`;
    
    try {
      const response = await fetch(shareUrl, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (response.ok) {
        const html = await response.text();
        return this.parseOpenGraphData(html, asin);
      }
    } catch (error) {

    }

    return null;
  }

  private async tryAmazonMetadata(asin: string): Promise<AmazonProduct | null> {
    // Try Amazon's metadata endpoints
    const metadataUrls = [
      `https://www.amazon.com/gp/aw/d/${asin}/ref=ox_sc_mini_detail?ie=UTF8&psc=1`,
      `https://www.amazon.com/dp/${asin}?th=1&psc=1`,
      `https://www.amazon.com/gp/product/${asin}/ref=ppx_yo_dt_b_asin_title_o00_s00`
    ];

    for (const url of metadataUrls) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
          }
        });

        if (response.ok) {
          const html = await response.text();
          const result = this.parseAmazonHTML(html, asin);
          if (result) return result;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  private async tryAmazonShare(asin: string): Promise<AmazonProduct | null> {
    const shareEndpoints = [
      `https://www.amazon.com/share?url=https://www.amazon.com/dp/${asin}`,
      `https://www.amazon.com/gp/share.html?ie=UTF8&ref=amb_link_2&tag=&linkCode=btm&camp=&creative=&asin=${asin}`,
      `https://www.amazon.com/exec/obidos/ASIN/${asin}/ref=nosim`
    ];

    for (const endpoint of shareEndpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'User-Agent': 'WhatsApp/2.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (response.ok) {
          const html = await response.text();
          const result = this.parseShareData(html, asin);
          if (result) return result;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  private async tryAmazonWishlist(asin: string): Promise<AmazonProduct | null> {
    const wishlistUrl = `https://www.amazon.com/hz/wishlist/ls/preview?asin=${asin}`;
    
    try {
      const response = await fetch(wishlistUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
          'Accept': 'application/json, text/html, */*',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (response.ok) {
        const content = await response.text();
        
        try {
          const json = JSON.parse(content);
          return this.parseWishlistData(json, asin);
        } catch {
          return this.parseAmazonHTML(content, asin);
        }
      }
    } catch (error) {

    }

    return null;
  }

  private async tryAmazonMobile(asin: string): Promise<AmazonProduct | null> {
    const mobileUrl = `https://www.amazon.com/gp/aw/d/${asin}`;
    
    try {
      const response = await fetch(mobileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (response.ok) {
        const html = await response.text();
        return this.parseMobileHTML(html, asin);
      }
    } catch (error) {

    }

    return null;
  }

  private parseOpenGraphData(html: string, asin: string): AmazonProduct | null {
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    const imageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    const priceMatch = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i);
    const urlMatch = html.match(/<meta[^>]*property="og:url"[^>]*content="([^"]+)"/i);

    if (titleMatch) {
      const title = this.cleanTitle(titleMatch[1]);
      if (title && title.length > 5) {
        return {
          asin,
          title,
          price: priceMatch ? this.parsePrice(priceMatch[1]) : 0,
          imageUrl: imageMatch ? imageMatch[1] : `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
          availability: true,
          url: urlMatch ? urlMatch[1] : `https://amazon.com/dp/${asin}`
        };
      }
    }

    return null;
  }

  private parseShareData(html: string, asin: string): AmazonProduct | null {
    const patterns = [
      /<title>([^<]+)<\/title>/i,
      /<h1[^>]*>([^<]+)<\/h1>/i,
      /data-title="([^"]+)"/i,
      /share-title[^>]*>([^<]+)</i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const title = this.cleanTitle(match[1]);
        if (title && title.length > 5 && !title.includes('Error') && !title.includes('404')) {
          return {
            asin,
            title,
            price: 0,
            imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
            availability: true,
            url: `https://amazon.com/dp/${asin}`
          };
        }
      }
    }

    return null;
  }

  private parseWishlistData(json: any, asin: string): AmazonProduct | null {
    const item = json.item || json.product || json.data;
    
    if (item) {
      const title = item.title || item.name || item.productTitle;
      const price = item.price || item.listPrice || item.currentPrice;
      
      if (title && typeof title === 'string' && title.length > 5) {
        return {
          asin,
          title: this.cleanTitle(title),
          price: price ? this.parsePrice(price) : 0,
          imageUrl: item.imageUrl || item.image || `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
          availability: item.availability !== false,
          url: `https://amazon.com/dp/${asin}`
        };
      }
    }

    return null;
  }

  private parseAmazonHTML(html: string, asin: string): AmazonProduct | null {
    const titlePatterns = [
      /<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i,
      /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i,
      /<title>([^<|]+?)(?:\s*[\|\-]\s*Amazon)?<\/title>/i,
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i
    ];

    const pricePatterns = [
      /<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<span[^>]*class="[^"]*price[^"]*"[^>]*>[\s$]*([0-9,]+\.?[0-9]*)/i,
      /"price":"?\$?([0-9,]+\.?[0-9]*)"/i
    ];

    let title = '';
    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim()) {
        title = this.cleanTitle(match[1].trim());
        if (title.length > 5 && !title.includes('Service Unavailable') && !title.includes('404')) {
          break;
        }
      }
    }

    let price = 0;
    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match) {
        price = this.parsePrice(match[1]);
        if (price > 0) break;
      }
    }

    if (title && title.length > 5) {
      return {
        asin,
        title,
        price,
        imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
        availability: !html.includes('Currently unavailable'),
        url: `https://amazon.com/dp/${asin}`
      };
    }

    return null;
  }

  private parseMobileHTML(html: string, asin: string): AmazonProduct | null {
    const titleMatch = html.match(/<h1[^>]*id="title"[^>]*>([^<]+)<\/h1>/i) ||
                      html.match(/<title>([^<|]+?)(?:\s*[\|\-]\s*Amazon)?<\/title>/i);
    
    if (titleMatch) {
      const title = this.cleanTitle(titleMatch[1]);
      if (title && title.length > 5) {
        return {
          asin,
          title,
          price: 0,
          imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
          availability: true,
          url: `https://amazon.com/dp/${asin}`
        };
      }
    }

    return null;
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/&[^;]+;/g, '')
      .replace(/\s+/g, ' ')
      .replace(/Amazon\.com\s*:?\s*/i, '')
      .replace(/\s*[\|\-]\s*Amazon.*$/i, '')
      .trim();
  }

  private parsePrice(priceStr: string): number {
    if (typeof priceStr === 'number') return priceStr;
    const cleaned = priceStr.toString().replace(/[^0-9.]/g, '');
    const price = parseFloat(cleaned);
    return isNaN(price) ? 0 : price;
  }

  private isValidProduct(product: AmazonProduct): boolean {
    return !!(
      product.title &&
      product.title.length > 5 &&
      !product.title.includes('Service Unavailable') &&
      !product.title.includes('404') &&
      !product.title.includes('Error') &&
      !product.title.includes('Amazon Product')
    );
  }
}

export const amazonScraper = new AmazonScraper();
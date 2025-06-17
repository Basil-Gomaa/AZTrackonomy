import { AmazonProduct } from './amazon-api.js';

export class ProductExtractor {
  private userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  async extractProductData(asin: string): Promise<AmazonProduct | null> {


    // Try Amazon's product information API endpoints
    const result = await this.tryAmazonProductAPIs(asin);
    if (result) return result;

    // Try Amazon's image service to verify product exists
    const imageResult = await this.tryAmazonImageService(asin);
    if (imageResult) return imageResult;

    // Try Amazon's review system
    const reviewResult = await this.tryAmazonReviews(asin);
    if (reviewResult) return reviewResult;

    return null;
  }

  private async tryAmazonProductAPIs(asin: string): Promise<AmazonProduct | null> {
    const endpoints = [
      // Amazon's product detail endpoint
      `https://www.amazon.com/gp/product/ajax/ref=dp_aod_NEW_mbc?asin=${asin}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp&experienceId=aodAjaxMain`,
      // Amazon's product availability endpoint  
      `https://www.amazon.com/gp/product/product-availability/${asin}`,
      // Amazon's wishlist endpoint (sometimes contains product info)
      `https://www.amazon.com/hz/wishlist/genericItemsPage/search?filter=unpurchased&sort=date-added&viewType=list&ref=lv_ov_lig_dt_it&itemExternalId=${asin}`,
      // Amazon's mobile product endpoint
      `https://www.amazon.com/gp/aw/d/${asin}?ref_=aw_sitb_digital-text`,
      // Amazon's product comparison endpoint
      `https://www.amazon.com/gp/product/compare-products/${asin}`
    ];

    for (const endpoint of endpoints) {
      try {

        
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/json, text/html, */*',
            'User-Agent': this.getRandomUserAgent(),
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (response.ok) {
          const content = await response.text();
          
          try {
            const json = JSON.parse(content);
            const result = this.parseAmazonJSON(json, asin);
            if (result) return result;
          } catch {
            const result = this.parseAmazonHTML(content, asin);
            if (result) return result;
          }
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  private async tryAmazonImageService(asin: string): Promise<AmazonProduct | null> {
    // Amazon's image service often indicates if a product exists
    const imageEndpoints = [
      `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.MAIN._SCRMZZZZZZ_.jpg`,
      `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
      `https://m.media-amazon.com/images/I/${asin}.jpg`,
      `https://images-na.ssl-images-amazon.com/images/I/${asin}._AC_SL1500_.jpg`
    ];

    for (const imageUrl of imageEndpoints) {
      try {
        const response = await fetch(imageUrl, { method: 'HEAD' });
        if (response.ok && response.headers.get('content-type')?.includes('image')) {

          
          // If image exists, try to get product info from the image metadata or related endpoints
          const productUrl = `https://www.amazon.com/dp/${asin}`;
          const metaResult = await this.extractFromProductPage(productUrl, asin);
          if (metaResult) return metaResult;
          
          // Return basic product info with confirmed image
          return {
            asin,
            title: `Amazon Product ${asin}`,
            price: 0,
            imageUrl,
            availability: true,
            url: productUrl
          };
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  private async tryAmazonReviews(asin: string): Promise<AmazonProduct | null> {
    const reviewEndpoints = [
      `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_dp_see_all_btm?ie=UTF8&showViewpoints=1&sortBy=recent`,
      `https://www.amazon.com/gp/customer-reviews/widgets/average-customer-review/popover/ref=dpx_acr_pop_?contextId=dpx&asin=${asin}`,
      `https://www.amazon.com/hz/reviews-render/ajax/reviews-filter?asin=${asin}&filterBy=recent&pageNumber=1`
    ];

    for (const endpoint of reviewEndpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': this.getRandomUserAgent()
          }
        });

        if (response.ok) {
          const content = await response.text();
          const result = this.parseReviewContent(content, asin);
          if (result) return result;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  private async extractFromProductPage(url: string, asin: string): Promise<AmazonProduct | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        const html = await response.text();
        return this.parseAmazonHTML(html, asin);
      }
    } catch (error) {
      // Silent fail
    }

    return null;
  }

  private parseAmazonJSON(json: any, asin: string): AmazonProduct | null {
    // Look for product data in various JSON structures
    const possiblePaths = [
      json.data?.product,
      json.product,
      json.item,
      json.productDetails,
      json.main?.product,
      json.asin?.[asin]
    ];

    for (const product of possiblePaths) {
      if (product && typeof product === 'object') {
        const title = product.title || product.name || product.productTitle || product.displayName;
        const price = product.price || product.listPrice || product.currentPrice;
        
        if (title && typeof title === 'string' && title.length > 5) {
          return {
            asin,
            title: this.cleanTitle(title),
            price: price ? this.parsePrice(price) : 0,
            imageUrl: product.imageUrl || product.image || `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
            availability: product.availability !== false && product.inStock !== false,
            url: `https://amazon.com/dp/${asin}`
          };
        }
      }
    }

    return null;
  }

  private parseAmazonHTML(html: string, asin: string): AmazonProduct | null {
    // Enhanced HTML parsing with multiple patterns
    const titlePatterns = [
      /<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i,
      /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i,
      /<title>([^<|]+)(?:\s*\|\s*Amazon)/i,
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
      /<h1[^>]*id="title"[^>]*>([^<]+)<\/h1>/i
    ];

    const pricePatterns = [
      /<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<span[^>]*class="[^"]*price[^"]*"[^>]*>[\s$]*([0-9,]+\.?[0-9]*)/i,
      /"price":"?\$?([0-9,]+\.?[0-9]*)"/i,
      /<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i
    ];

    let title = '';
    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim()) {
        title = this.cleanTitle(match[1].trim());
        if (title.length > 5 && !title.toLowerCase().includes('page not found')) {
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

    if (title && title.length > 5 && !title.includes('Amazon Product')) {
      return {
        asin,
        title,
        price,
        imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
        availability: !html.includes('Currently unavailable') && !html.includes('Out of Stock'),
        url: `https://amazon.com/dp/${asin}`
      };
    }

    return null;
  }

  private parseReviewContent(content: string, asin: string): AmazonProduct | null {
    const titleMatch = content.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                      content.match(/data-hook="product-link"[^>]*>([^<]+)</i);
    
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
      .replace(/&[^;]+;/g, '') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/Amazon\.com\s*:\s*/i, '') // Remove Amazon.com prefix
      .trim();
  }

  private parsePrice(priceStr: string): number {
    if (typeof priceStr === 'number') return priceStr;
    const cleaned = priceStr.toString().replace(/[^0-9.]/g, '');
    const price = parseFloat(cleaned);
    return isNaN(price) ? 0 : price;
  }

  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }
}

export const productExtractor = new ProductExtractor();
import { productExtractor } from './product-extractor.js';
import { amazonScraper } from './amazon-scraper.js';

export interface AmazonProduct {
  asin: string;
  title: string;
  price: number;
  imageUrl?: string;
  availability: boolean;
  url: string;
}

export class AmazonApiService {
  private apiKey: string;
  private baseUrl: string;
  private rapidApiHost: string;

  constructor() {
    // Hardcoded RapidAPI key and host from user
    this.apiKey = '4ea96351efmshb53eaf4b64475dfp16bac8jsnbd5cb8ca8421';
    this.baseUrl = "https://realtime-amazon-data.p.rapidapi.com";
    this.rapidApiHost = 'realtime-amazon-data.p.rapidapi.com';
  }

  async getProductByAsin(asin: string): Promise<AmazonProduct | null> {
    try {
      const result = await this.fetchFromRapidAPI(asin);
      if (result && result.title && result.title.length > 5) {
        return result;
      }
    } catch (error) {
      // Continue to backup methods
    }

    try {
      const result = await amazonScraper.getProductData(asin);
      if (result && result.title && result.title.length > 5) {
        return result;
      }
    } catch (error) {
      // Continue to final backup
    }

    try {
      const result = await productExtractor.extractProductData(asin);
      if (result && result.title && result.title.length > 5) {
        return result;
      }
    } catch (error) {
      // All methods failed
    }

    throw new Error("Unable to fetch product data automatically. Please enter product details manually.");
  }

  private async fetchFromRapidAPI(asin: string): Promise<AmazonProduct | null> {
    // Try product details endpoint
    try {
      const productEndpoint = `/product-details?asin=${asin}&country=US`;
      
      const response = await fetch(`${this.baseUrl}${productEndpoint}`, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.rapidApiHost,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const result = this.parseProductDetailsResponse(data, asin);
        if (result && result.price > 0) return result;
      }
    } catch (error) {
      // Continue to search endpoint
    }

    // Try search endpoint
    try {
      const searchEndpoint = `/search?query=${asin}&country=US&category_id=aps`;
      
      const response = await fetch(`${this.baseUrl}${searchEndpoint}`, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.rapidApiHost,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const result = this.parseRapidAPIResponse(data, asin);
        if (result) return result;
      }
    } catch (error) {
      // Continue to other methods
    }

    throw new Error("RapidAPI endpoints failed");
  }

  private parseProductDetailsResponse(data: any, asin: string): AmazonProduct | null {
    try {
      if (data && data.status === 'success') {
        const price = this.parsePrice(data.price || '0');
        
        return {
          asin: asin,
          title: data.title || 'Unknown Product',
          price: price,
          imageUrl: data.images && data.images.length > 0 ? data.images[0] : null,
          availability: data.availability === 'In Stock',
          url: `https://www.amazon.com/dp/${asin}`
        };
      }
    } catch (error) {
      // Silent parsing error
    }
    return null;
  }

  private parseRapidAPIResponse(data: any, asin: string): AmazonProduct | null {
    // Handle search results response from Real-time Amazon Data API
    if (data.status === 'OK' && data.data && data.data.products && data.data.products.length > 0) {
      const product = data.data.products[0];
      
      // Get the best available price
      const price = product.product_minimum_offer_price || product.product_price || '0';
      
      return {
        asin: product.asin || asin,
        title: product.product_title,
        price: this.parsePrice(price),
        imageUrl: product.product_photo,
        availability: product.product_num_offers > 0,
        url: product.product_url || `https://amazon.com/dp/${asin}`
      };
    }

    // Handle product details response for Real-time Amazon Data API
    if (data.status === 'OK' && data.data && !Array.isArray(data.data)) {
      const product = data.data;
      
      return {
        asin: product.asin || asin,
        title: product.product_title || product.title || product.name,
        price: this.parsePrice(product.product_price || product.price || product.list_price),
        imageUrl: product.product_main_image_url || product.product_photo || product.image,
        availability: product.product_availability === 'In Stock' || product.availability !== false,
        url: product.product_url || `https://amazon.com/dp/${asin}`
      };
    }

    return null;
  }

  private async tryAmazonAdvertisingAPI(asin: string): Promise<AmazonProduct | null> {
    // Try Amazon's RSS and XML feeds which often contain product data
    const feeds = [
      `https://www.amazon.com/gp/rss/bestsellers/books/ref=zg_bs_books_rsslink`,
      `https://www.amazon.com/rss/tag/${asin}/recent`,
      `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_dp_see_all_btm?ie=UTF8&showViewpoints=1&sortBy=recent&reviewerType=all_reviews&pageNumber=1&filterByStar=all_stars&rss=1`
    ];

    // Try Amazon's internal product APIs
    const apiEndpoints = [
      `https://www.amazon.com/gp/product/ajax/ref=dp_aod_NEW_mbc?asin=${asin}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp&experienceId=aodAjaxMain`,
      `https://www.amazon.com/hz/wishlist/ls/${asin}`,
      `https://www.amazon.com/gp/product/product-availability/${asin}`
    ];

    for (const endpoint of [...feeds, ...apiEndpoints]) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/xml, application/rss+xml, application/json, text/html, */*',
            'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (response.ok) {
          const content = await response.text();
          
          const result = this.parseXMLContent(content, asin);
          if (result) return result;
          
          try {
            const json = JSON.parse(content);
            const result = this.parseJSONContent(json, asin);
            if (result) return result;
          } catch {
            // Continue if not JSON
          }
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("Amazon endpoints failed");
  }

  private parseXMLContent(content: string, asin: string): AmazonProduct | null {
    // Extract from RSS/XML feeds
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = content.match(/<description[^>]*>([^<]+)<\/description>/i);
    const linkMatch = content.match(new RegExp(`<link[^>]*>([^<]*${asin}[^<]*)</link>`, 'i'));
    
    if (titleMatch || descMatch) {
      let title = '';
      if (titleMatch) title = titleMatch[1].trim();
      if (descMatch && (!title || title.length < 20)) {
        title = descMatch[1].trim();
      }
      
      // Clean up title
      title = title.replace(/&[^;]+;/g, '').replace(/\s+/g, ' ').trim();
      
      if (title && title.length > 10 && !title.toLowerCase().includes('amazon')) {
        return {
          asin: asin,
          title: title,
          price: 0,
          imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
          availability: true,
          url: linkMatch ? linkMatch[1] : `https://amazon.com/dp/${asin}`
        };
      }
    }
    
    return null;
  }

  private parseJSONContent(json: any, asin: string): AmazonProduct | null {
    // Look for product data in various JSON structures
    const searchPaths = [
      json.data,
      json.product,
      json.item,
      json.result,
      json.products?.[0],
      json.items?.[0]
    ];
    
    for (const item of searchPaths) {
      if (item && typeof item === 'object') {
        const title = item.title || item.name || item.productTitle;
        const price = item.price || item.cost || item.amount;
        
        if (title && typeof title === 'string' && title.length > 10) {
          return {
            asin: asin,
            title: title,
            price: price ? this.parsePrice(price.toString()) : 0,
            imageUrl: item.image || item.imageUrl || `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
            availability: item.availability !== false,
            url: item.url || `https://amazon.com/dp/${asin}`
          };
        }
      }
    }
    
    return null;
  }

  private async trySearchSuggestionAPI(asin: string): Promise<AmazonProduct | null> {
    try {
      const searchUrl = `https://completion.amazon.com/api/2017/suggestions?limit=1&prefix=${asin}&suggestion-type=KEYWORD&mid=ATVPDKIKX0DER&alias=aps`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; AmazonBot/1.0)'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.suggestions?.length > 0) {
          const suggestion = data.suggestions[0];
          return {
            asin: asin,
            title: suggestion.value || `Product ${asin}`,
            price: 0,
            imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
            availability: true,
            url: `https://amazon.com/dp/${asin}`
          };
        }
      }
    } catch (error) {
      console.log(`Search suggestion error: ${error}`);
    }

    throw new Error("Search suggestion API failed");
  }

  private async tryMobileAPI(asin: string): Promise<AmazonProduct | null> {
    const mobileEndpoints = [
      `https://www.amazon.com/gp/aw/d/${asin}?ref_=aw_sitb_digital-text`,
      `https://www.amazon.com/gp/aw/s/?k=${asin}&ref=nb_sb_noss`,
      `https://m.media-amazon.com/images/P/${asin}.01.L.jpg` // Try to verify image exists
    ];

    for (const endpoint of mobileEndpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (response.ok) {
          const content = await response.text();
          
          // Parse mobile response for basic product info
          const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch) {
            let title = titleMatch[1].replace(' - Amazon.com', '').trim();
            if (title && title.length > 10) {
              return {
                asin: asin,
                title: title,
                price: 0,
                imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
                availability: true,
                url: `https://amazon.com/dp/${asin}`
              };
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("Mobile API failed");
  }

  private async extractWithBrowser(asin: string): Promise<AmazonProduct | null> {
    // Try multiple scraping approaches
    const scrapingMethods = [
      () => this.directScrape(asin),
      () => this.proxyScrape(asin),
      () => this.mobileScrape(asin),
      () => this.apiScrape(asin)
    ];

    for (const method of scrapingMethods) {
      try {
        const result = await method();
        if (result && result.title && !result.title.includes('Amazon Product') && result.price > 0) {
          console.log(`Successfully extracted: ${result.title} - $${result.price}`);
          return result;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("All scraping methods failed");
  }

  private async directScrape(asin: string): Promise<AmazonProduct | null> {
    // Try multiple Amazon endpoints and formats
    const endpoints = [
      `https://www.amazon.com/dp/${asin}`,
      `https://www.amazon.com/gp/product/${asin}`,
      `https://www.amazon.com/exec/obidos/ASIN/${asin}`,
      `https://smile.amazon.com/dp/${asin}`,
      `https://www.amazon.com/dp/${asin}/ref=sr_1_1`
    ];

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
    ];

    for (const url of endpoints) {
      for (const userAgent of userAgents) {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            },
            redirect: 'follow'
          });

          if (response.ok) {
            const html = await response.text();
            console.log(`Received HTML length: ${html.length}`);
            
            const result = this.parseAmazonHTML(html, asin);
            if (result && result.title && result.price > 0 && !result.title.includes('Amazon Product')) {
              console.log(`Successfully extracted: ${result.title} - $${result.price}`);
              return result;
            }
          } else {
            console.log(`HTTP ${response.status} for ${url}`);
          }
          
          // Add delay between requests
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.log(`Direct scrape error for ${url}: ${error}`);
          continue;
        }
      }
    }

    throw new Error("Direct scraping failed");
  }

  private async proxyScrape(asin: string): Promise<AmazonProduct | null> {
    const proxyServices = [
      {
        url: `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.amazon.com/dp/${asin}`)}`,
        parser: (data: any) => data.contents
      },
      {
        url: `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(`https://www.amazon.com/dp/${asin}`)}`,
        parser: (data: any) => typeof data === 'string' ? data : data.contents
      },
      {
        url: `https://cors-anywhere.herokuapp.com/https://www.amazon.com/dp/${asin}`,
        parser: (data: any) => data
      }
    ];

    for (const service of proxyServices) {
      try {
        const response = await fetch(service.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (response.ok) {
          const data = await response.json();
          const html = service.parser(data);
          if (typeof html === 'string') {
            const result = this.parseAmazonHTML(html, asin);
            if (result && result.price > 0) return result;
          }
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("Proxy scraping failed");
  }

  private async mobileScrape(asin: string): Promise<AmazonProduct | null> {
    // Try mobile version which often has less protection
    const mobileUrl = `https://www.amazon.com/gp/aw/d/${asin}`;
    
    try {
      const response = await fetch(mobileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });

      if (response.ok) {
        const html = await response.text();
        const result = this.parseMobileHTML(html, asin);
        if (result && result.price > 0) return result;
      }
    } catch (error) {
      // Continue to next method
    }

    throw new Error("Mobile scraping failed");
  }

  private async apiScrape(asin: string): Promise<AmazonProduct | null> {
    // Try Amazon's internal APIs
    const apiEndpoints = [
      `https://www.amazon.com/api/detail/${asin}`,
      `https://www.amazon.com/gp/product/ajax/${asin}`,
      `https://completion.amazon.com/api/2017/suggestions?limit=1&prefix=${asin}&suggestion-type=KEYWORD&mid=ATVPDKIKX0DER&alias=aps`
    ];

    for (const endpoint of apiEndpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': `https://www.amazon.com/dp/${asin}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const result = this.parseAPIResponse(data, asin);
          if (result) return result;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("API scraping failed");
  }

  private async tryAmazonPublicAPIs(asin: string): Promise<AmazonProduct | null> {
    // Try Amazon's advertising API endpoints that are sometimes publicly accessible
    const endpoints = [
      `https://completion.amazon.com/api/2017/suggestions?limit=1&prefix=${asin}&suggestion-type=KEYWORD&mid=ATVPDKIKX0DER&alias=aps`,
      `https://www.amazon.com/api/search/${asin}`,
      `https://www.amazon.com/gp/product/product-details-ajax/${asin}`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'AmazonPriceTracker/1.0'
          }
        });

        if (response.ok) {
          const data = await response.json();
          const result = this.parseAPIResponse(data, asin);
          if (result) return result;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("Amazon public APIs failed");
  }

  private async tryProxyServices(asin: string): Promise<AmazonProduct | null> {
    // Try web scraping services that can handle JavaScript
    const services = [
      {
        url: `https://api.scraperapi.com?api_key=demo&url=${encodeURIComponent(`https://www.amazon.com/dp/${asin}`)}`,
        headers: {}
      },
      {
        url: `https://api.scrapfly.io/scrape?key=demo&url=${encodeURIComponent(`https://www.amazon.com/dp/${asin}`)}&render_js=true`,
        headers: {}
      }
    ];

    for (const service of services) {
      try {
        const response = await fetch(service.url, { headers: service.headers });
        if (response.ok) {
          const html = await response.text();
          const result = this.parseAmazonHTML(html, asin);
          if (result && result.price > 0) return result;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("Proxy services failed");
  }

  private parseAPIResponse(data: any, asin: string): AmazonProduct | null {
    // Parse different API response formats
    if (data.suggestions && data.suggestions.length > 0) {
      const suggestion = data.suggestions[0];
      if (suggestion.value && suggestion.value.includes(asin)) {
        return {
          asin: asin,
          title: suggestion.value,
          price: 0, // Price not available in suggestions
          imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
          availability: true,
          url: `https://amazon.com/dp/${asin}`
        };
      }
    }

    if (data.title || data.name) {
      return {
        asin: asin,
        title: data.title || data.name,
        price: this.parsePrice(data.price || data.cost || data.amount || '0'),
        imageUrl: data.image || data.imageUrl || `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
        availability: data.availability !== false,
        url: `https://amazon.com/dp/${asin}`
      };
    }

    return null;
  }

  private async tryAmazonEndpoints(asin: string): Promise<AmazonProduct | null> {
    const endpoints = [
      `https://www.amazon.com/gp/product/ajax/ref=dp_aod_unknown_mbc?asin=${asin}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp&experienceId=aodAjaxMain`,
      `https://www.amazon.com/dp/product-availability/${asin}`,
      `https://completion.amazon.com/api/2017/suggestions?limit=11&prefix=${asin}&suggestion-type=KEYWORD&suggestion-type=WIDGET&mid=ATVPDKIKX0DER&alias=aps&site-variant=desktop&version=3&event=onKeyPress&wc=`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': `https://www.amazon.com/dp/${asin}`
          }
        });

        if (response.ok) {
          const data = await response.text();
          const parsed = this.parseAmazonResponse(data, asin);
          if (parsed && parsed.price > 0) return parsed;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("Amazon endpoints failed");
  }

  private async tryProductDatabases(asin: string): Promise<AmazonProduct | null> {
    // Try open product databases
    const sources = [
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${asin}`,
      `https://world.openfoodfacts.org/api/v0/product/${asin}.json`,
      `https://api.barcodelookup.com/v3/products?barcode=${asin}&formatted=y&key=trial`,
    ];

    for (const source of sources) {
      try {
        const response = await fetch(source);
        if (response.ok) {
          const data = await response.json();
          const parsed = this.parseProductDatabase(data, asin);
          if (parsed) return parsed;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("Product databases failed");
  }

  private async tryRSSFeeds(asin: string): Promise<AmazonProduct | null> {
    // Try Amazon RSS feeds and search APIs
    const feeds = [
      `https://www.amazon.com/s?k=${asin}&ref=sr_pg_1&output=json`,
      `https://www.amazon.com/gp/search/ref=sr_adv_b/?search-alias=stripbooks&unfiltered=1&field-isbn=${asin}&sort=relevanceexprank`,
    ];

    for (const feed of feeds) {
      try {
        const response = await fetch(feed, {
          headers: {
            'Accept': 'application/json, application/xml, text/xml, */*'
          }
        });

        if (response.ok) {
          const data = await response.text();
          const parsed = this.parseSearchResults(data, asin);
          if (parsed) return parsed;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("RSS feeds failed");
  }

  private parseAmazonResponse(data: string, asin: string): AmazonProduct | null {
    try {
      // Try parsing as JSON first
      const json = JSON.parse(data);
      if (json.title && json.price) {
        return {
          asin: asin,
          title: json.title,
          price: parseFloat(json.price.toString().replace(/[^0-9.]/g, '')),
          imageUrl: json.image || `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
          availability: json.availability !== false,
          url: `https://amazon.com/dp/${asin}`
        };
      }
    } catch (error) {
      // Try parsing as HTML/text
      const titleMatch = data.match(/"title":"([^"]+)"/);
      const priceMatch = data.match(/"price":[\s]*"?([0-9.]+)"?/);
      
      if (titleMatch && priceMatch) {
        return {
          asin: asin,
          title: titleMatch[1],
          price: parseFloat(priceMatch[1]),
          imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
          availability: true,
          url: `https://amazon.com/dp/${asin}`
        };
      }
    }

    return null;
  }

  private parseProductDatabase(data: any, asin: string): AmazonProduct | null {
    const item = data.items?.[0] || data.product || data;
    if (item && (item.title || item.name)) {
      return {
        asin: asin,
        title: item.title || item.name || item.product_name,
        price: parseFloat(item.price?.toString().replace(/[^0-9.]/g, '') || '0'),
        imageUrl: item.image || item.images?.[0] || `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
        availability: true,
        url: `https://amazon.com/dp/${asin}`
      };
    }
    return null;
  }

  private parseSearchResults(data: string, asin: string): AmazonProduct | null {
    // Parse search results or feeds
    const titleMatch = data.match(/<title>([^<]+)<\/title>/i);
    const priceMatch = data.match(/\$([0-9.]+)/);
    
    if (titleMatch) {
      return {
        asin: asin,
        title: titleMatch[1].replace(' - Amazon.com', '').trim(),
        price: priceMatch ? parseFloat(priceMatch[1]) : 0,
        imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
        availability: true,
        url: `https://amazon.com/dp/${asin}`
      };
    }
    
    return null;
  }

  private async scrapeAmazonPage(asin: string): Promise<AmazonProduct | null> {
    try {
      const url = `https://www.amazon.com/dp/${asin}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      return this.parseAmazonHTML(html, asin);
    } catch (error) {
      throw new Error(`Scraping failed: ${error.message}`);
    }
  }

  private parseAmazonHTML(html: string, asin: string): AmazonProduct | null {
    // Extract title using comprehensive patterns
    const titlePatterns = [
      /<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i,
      /<h1[^>]*id="title"[^>]*>([^<]+)<\/h1>/i,
      /<h1[^>]*class="[^"]*product[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i,
      /<title>([^|<]+)(?:\s*\|\s*Amazon)/i,
      /"title":"([^"]+)"/i,
      /productTitle[^>]*>([^<]+)</i,
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i
    ];

    let title = '';
    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim()) {
        title = match[1].trim().replace(/\s+/g, ' ');
        if (!title.includes('Amazon') || title.length > 20) {
          break;
        }
      }
    }

    // Extract price using enhanced patterns
    const pricePatterns = [
      // JSON-LD structured data
      /"price":"?(\d+\.?\d*)"?/i,
      /"priceAmount":"?(\d+\.?\d*)"?/i,
      /"value":"?(\d+\.?\d*)"?/i,
      // HTML price elements
      /<span[^>]*class="[^"]*price[^"]*"[^>]*>[\s$]*(\d+\.?\d*)/i,
      /<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>(\d+)/i,
      /<span[^>]*id="[^"]*price[^"]*"[^>]*>[\s$]*(\d+\.?\d*)/i,
      // Meta tags
      /<meta[^>]*property="product:price:amount"[^>]*content="(\d+\.?\d*)"/i,
      /<meta[^>]*name="price"[^>]*content="[\s$]*(\d+\.?\d*)"/i,
      // CSS selectors common patterns
      /a-price-whole[^>]*>(\d+)/i,
      /pricePerUnit[^>]*>[\s$]*(\d+\.?\d*)/i,
      // General dollar patterns (more restrictive)
      /\$(\d{1,4}\.?\d{0,2})(?!\d)/g
    ];

    let price = 0;
    for (const pattern of pricePatterns) {
      if (pattern.global) {
        const matches = Array.from(html.matchAll(pattern));
        for (const match of matches) {
          const foundPrice = parseFloat(match[1]);
          if (foundPrice > 0 && foundPrice < 10000) {
            price = foundPrice;
            break;
          }
        }
      } else {
        const match = html.match(pattern);
        if (match) {
          const foundPrice = parseFloat(match[1]);
          if (foundPrice > 0 && foundPrice < 10000) {
            price = foundPrice;
            break;
          }
        }
      }
      if (price > 0) break;
    }

    // Extract image URL
    const imagePatterns = [
      /"hiRes":"([^"]+)"/i,
      /"large":"([^"]+\.jpg[^"]*)"/i,
      /data-old-hires="([^"]+)"/i,
      /src="([^"]+)" [^>]*id="landingImage"/i,
      /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
      /"imageUrl":"([^"]+)"/i,
      /data-src="([^"]+\.jpg[^"]*)"/i
    ];

    let imageUrl = `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`;
    for (const pattern of imagePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let url = match[1];
        // Clean up the URL
        if (url.startsWith('//')) url = 'https:' + url;
        if (url.includes('amazon') && url.includes('.jpg')) {
          imageUrl = url;
          break;
        }
      }
    }

    // Check availability
    const unavailableIndicators = [
      /currently unavailable/i,
      /out of stock/i,
      /temporarily out of stock/i,
      /"availability":"OutOfStock"/i,
      /class="[^"]*unavailable[^"]*"/i
    ];

    let availability = true;
    for (const indicator of unavailableIndicators) {
      if (html.match(indicator)) {
        availability = false;
        break;
      }
    }

    // Only return if we found meaningful data
    if (title && title !== `Amazon Product ${asin}` && price > 0) {
      return {
        asin: asin,
        title: title,
        price: price,
        imageUrl: imageUrl,
        availability: availability,
        url: `https://amazon.com/dp/${asin}`
      };
    }

    return null;
  }

  private parseMobileHTML(html: string, asin: string): AmazonProduct | null {
    // Mobile-specific parsing patterns
    const titlePatterns = [
      /<h1[^>]*id="title"[^>]*>([^<]+)<\/h1>/i,
      /<div[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]+)<\/div>/i,
      /<title>([^|<]+)(?:\s*\|\s*Amazon)/i
    ];

    const pricePatterns = [
      /<span[^>]*class="[^"]*price[^"]*"[^>]*>[\s$]*(\d+\.?\d*)/i,
      /\$(\d{1,4}\.?\d{0,2})(?!\d)/g
    ];

    let title = '';
    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1].trim()) {
        title = match[1].trim();
        break;
      }
    }

    let price = 0;
    for (const pattern of pricePatterns) {
      if (pattern.global) {
        const matches = Array.from(html.matchAll(pattern));
        for (const match of matches) {
          const foundPrice = parseFloat(match[1]);
          if (foundPrice > 0 && foundPrice < 10000) {
            price = foundPrice;
            break;
          }
        }
      } else {
        const match = html.match(pattern);
        if (match) {
          price = parseFloat(match[1]);
          break;
        }
      }
      if (price > 0) break;
    }

    if (title && price > 0) {
      return {
        asin: asin,
        title: title,
        price: price,
        imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
        availability: !html.includes('unavailable'),
        url: `https://amazon.com/dp/${asin}`
      };
    }

    return null;
  }

  private async tryAlternativeAPIs(asin: string): Promise<AmazonProduct | null> {
    // Try free APIs or different endpoints
    const freeEndpoints = [
      `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.amazon.com/dp/${asin}`)}`,
      `https://cors-anywhere.herokuapp.com/https://www.amazon.com/dp/${asin}`
    ];

    for (const endpoint of freeEndpoints) {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          const html = data.contents || data;
          if (typeof html === 'string') {
            return this.parseAmazonHTML(html, asin);
          }
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error("No working alternative APIs");
  }

  private async parseOpenGraphData(asin: string): Promise<AmazonProduct | null> {
    // Try to get Open Graph data which is usually accessible
    try {
      const response = await fetch(`https://www.amazon.com/dp/${asin}`, {
        method: 'HEAD'
      });
      
      // This is a fallback - return structured data for the user to fill
      return {
        asin: asin,
        title: `Amazon Product ${asin} - Title needed`,
        price: 0,
        imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
        availability: true,
        url: `https://amazon.com/dp/${asin}`
      };
    } catch (error) {
      throw new Error("OpenGraph parsing failed");
    }
  }

  private parseAmazonPage(html: string, asin: string): AmazonProduct | null {
    // Basic HTML parsing for product data
    const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i);
    const priceMatch = html.match(/\$(\d+\.?\d*)/);
    
    return {
      asin: asin,
      title: titleMatch ? titleMatch[1].trim() : `Amazon Product ${asin}`,
      price: priceMatch ? parseFloat(priceMatch[1]) : 0,
      imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
      availability: true,
      url: `https://amazon.com/dp/${asin}`
    };
  }

  async getProductByUrl(url: string): Promise<AmazonProduct | null> {
    const asin = this.extractAsinFromUrl(url);
    if (!asin) {
      throw new Error("Invalid Amazon URL - could not extract ASIN");
    }
    return this.getProductByAsin(asin);
  }

  private extractAsinFromUrl(url: string): string | null {
    // Extract ASIN from various Amazon URL formats
    const patterns = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/product\/([A-Z0-9]{10})/i,
      /asin=([A-Z0-9]{10})/i,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Check if the input is already an ASIN
    if (/^[A-Z0-9]{10}$/i.test(url.trim())) {
      return url.trim().toUpperCase();
    }

    return null;
  }

  private parsePrice(priceString: string): number {
    if (typeof priceString === 'number') {
      return priceString;
    }
    
    // Remove currency symbols and extract numeric value
    const cleaned = priceString.replace(/[^0-9.,]/g, '');
    const price = parseFloat(cleaned.replace(',', ''));
    return isNaN(price) ? 0 : price;
  }
}

export const amazonApi = new AmazonApiService();

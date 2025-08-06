// packages/backend/src/services/shopify/ShopifyGraphQLService.ts
import { ShopifyService } from './ShopifyService';
import { logger } from '../../utils/logger';

// Error class definition
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Type definitions
interface ShopifyProductSimplified {
  id: string;
  shopifyId?: string;
  title: string;
  handle: string;
  vendor: string;
  productType?: string;
  status: string;
  images: Array<{
    url: string;
    altText?: string;
  }>;
  variants: Array<{
    id: string;
    variantId?: string;
    title: string;
    sku: string;
    price: string;
    inventoryQuantity?: number;
    barcode?: string;
  }>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export class ShopifyGraphQLService extends ShopifyService {
  private defaultLocationId: string | null = null;

  /**
   * Execute GraphQL query with proper error handling
   */
  private async executeQuery<T = any>(query: string, variables: any = {}): Promise<T> {
    try {
      const client = await this.getGraphQLClient();
      
      logger.info('Executing GraphQL query', { 
        query: query.substring(0, 100) + '...', 
        variables 
      });

      const response = await client.request(query, {
        variables
      });

      return response as T;
    } catch (error: any) {
      // Handle error safely without instanceof check
      const errorMessage = error?.message || 'Unknown GraphQL error';
      const errorCode = error?.extensions?.code || 'UNKNOWN_ERROR';
      
      logger.error('GraphQL query failed', {
        error: errorMessage,
        code: errorCode,
        query: query.substring(0, 100) + '...',
        variables
      });

      // Throw AppError
      throw new AppError(`GraphQL Error: ${errorMessage}`, 400);
    }
  }

  /**
   * Get default location ID
   */
  private async getDefaultLocationId(): Promise<string> {
    if (this.defaultLocationId) {
      return this.defaultLocationId;
    }

    const query = `
      query getLocations {
        locations(first: 10) {
          edges {
            node {
              id
              name
              isActive
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<any>(query);
      const locations = response?.locations?.edges || [];
      
      // Find active location
      const activeLocation = locations.find((edge: any) => edge.node.isActive);
      if (activeLocation) {
        this.defaultLocationId = activeLocation.node.id;
        logger.info(`Default location set to: ${activeLocation.node.name} (${activeLocation.node.id})`);
        return this.defaultLocationId;
      }

      // Use first location if no active location
      if (locations.length > 0) {
        this.defaultLocationId = locations[0].node.id;
        logger.info(`Default location set to first location: ${locations[0].node.name}`);
        return this.defaultLocationId;
      }

      // Return a default ID if no locations found
      this.defaultLocationId = 'gid://shopify/Location/1';
      return this.defaultLocationId;
    } catch (error) {
      logger.warn('Failed to get locations, using default', error);
      this.defaultLocationId = 'gid://shopify/Location/1';
      return this.defaultLocationId;
    }
  }

  /**
   * Get products by vendor with 2025-04 API
   */
  async getProductsByVendor(
    vendor: string,
    options: {
      limit?: number;
      includeInactive?: boolean;
    } = {}
  ): Promise<ShopifyProductSimplified[]> {
    const { limit = 100, includeInactive = false } = options;
    const products: ShopifyProductSimplified[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    // Updated query for 2025-04 API
    const query = `
      query GetProductsByVendor($query: String!, $first: Int!, $after: String) {
        products(first: $first, after: $after, query: $query) {
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              status
              createdAt
              updatedAt
              tags
              featuredImage {
                url
                altText
              }
              images(first: 10) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    barcode
                    inventoryQuantity
                    inventoryItem {
                      id
                    }
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    try {
      while (hasNextPage && products.length < limit) {
        const queryString = includeInactive 
          ? `vendor:"${vendor}"`
          : `vendor:"${vendor}" AND status:ACTIVE`;

        const response = await this.executeQuery<any>(query, {
          query: queryString,
          first: Math.min(limit - products.length, 50),
          after: cursor
        });

        const edges = response?.products?.edges || [];
        
        for (const edge of edges) {
          const node = edge.node;
          
          // Transform to simplified format
          const simplifiedProduct: ShopifyProductSimplified = {
            id: node.id,
            shopifyId: node.id.split('/').pop(),
            title: node.title,
            handle: node.handle,
            vendor: node.vendor,
            productType: node.productType,
            status: node.status,
            tags: node.tags || [],
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
            images: [],
            variants: []
          };

          // Add featured image if exists
          if (node.featuredImage) {
            simplifiedProduct.images.push({
              url: node.featuredImage.url,
              altText: node.featuredImage.altText
            });
          }

          // Add other images
          if (node.images?.edges) {
            for (const imgEdge of node.images.edges) {
              if (imgEdge.node.url !== node.featuredImage?.url) {
                simplifiedProduct.images.push({
                  url: imgEdge.node.url,
                  altText: imgEdge.node.altText
                });
              }
            }
          }

          // Add variants
          if (node.variants?.edges) {
            for (const varEdge of node.variants.edges) {
              const variant = varEdge.node;
              simplifiedProduct.variants.push({
                id: variant.id,
                variantId: variant.id.split('/').pop(),
                title: variant.title || 'Default',
                sku: variant.sku || '',
                price: variant.price || '0',
                inventoryQuantity: variant.inventoryQuantity || 0,
                barcode: variant.barcode
              });
            }
          }

          products.push(simplifiedProduct);
        }

        hasNextPage = response?.products?.pageInfo?.hasNextPage || false;
        cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
      }

      logger.info(`Found ${products.length} products for vendor: ${vendor}`);
      return products;

    } catch (error: any) {
      logger.error('Failed to get products by vendor', {
        vendor,
        error: error.message || error
      });
      
      // Return empty array instead of throwing to prevent UI crash
      return [];
    }
  }

  /**
   * Search products with various filters
   */
  async searchProducts(params: {
    search?: string;
    vendor?: string;
    productType?: string;
    limit?: number;
  }): Promise<ShopifyProductSimplified[]> {
    const { search, vendor, productType, limit = 50 } = params;
    
    // Build query string
    const queryParts: string[] = [];
    if (search) queryParts.push(`title:*${search}* OR sku:*${search}*`);
    if (vendor) queryParts.push(`vendor:"${vendor}"`);
    if (productType) queryParts.push(`product_type:"${productType}"`);
    
    const queryString = queryParts.length > 0 
      ? queryParts.join(' AND ')
      : 'status:ACTIVE';

    return this.getProductsByVendor(vendor || '', { 
      limit,
      includeInactive: false 
    });
  }

  /**
   * Get single product by ID
   */
  async getProductById(productId: string): Promise<ShopifyProductSimplified | null> {
    const query = `
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          vendor
          productType
          status
          createdAt
          updatedAt
          tags
          featuredImage {
            url
            altText
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                barcode
                inventoryQuantity
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<any>(query, { id: productId });
      
      if (!response?.product) {
        return null;
      }

      const product = response.product;
      
      return {
        id: product.id,
        shopifyId: product.id.split('/').pop(),
        title: product.title,
        handle: product.handle,
        vendor: product.vendor,
        productType: product.productType,
        status: product.status,
        tags: product.tags || [],
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        images: product.featuredImage ? [{
          url: product.featuredImage.url,
          altText: product.featuredImage.altText
        }] : [],
        variants: product.variants.edges.map((edge: any) => ({
          id: edge.node.id,
          variantId: edge.node.id.split('/').pop(),
          title: edge.node.title || 'Default',
          sku: edge.node.sku || '',
          price: edge.node.price || '0',
          inventoryQuantity: edge.node.inventoryQuantity || 0,
          barcode: edge.node.barcode
        }))
      };
    } catch (error) {
      logger.error('Failed to get product by ID', { productId, error });
      return null;
    }
  }

  /**
   * Update product price
   */
  async updateProductPrice(variantId: string, price: number): Promise<boolean> {
    const mutation = `
      mutation UpdateVariantPrice($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<any>(mutation, {
        input: {
          id: variantId,
          price: price.toString()
        }
      });

      if (response?.productVariantUpdate?.userErrors?.length > 0) {
        const errors = response.productVariantUpdate.userErrors;
        logger.error('Failed to update variant price', { variantId, errors });
        return false;
      }

      logger.info(`Updated price for variant ${variantId} to ${price}`);
      return true;
    } catch (error) {
      logger.error('Failed to update product price', { variantId, price, error });
      return false;
    }
  }

  /**
   * Adjust inventory quantity
   */
  async adjustInventoryQuantity(
    inventoryItemId: string,
    locationId: string,
    quantity: number
  ): Promise<boolean> {
    const mutation = `
      mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup {
            id
            reason
            changes {
              name
              delta
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<any>(mutation, {
        input: {
          reason: "correction",
          name: "available",
          changes: [{
            inventoryItemId,
            locationId: locationId || await this.getDefaultLocationId(),
            delta: quantity
          }]
        }
      });

      if (response?.inventoryAdjustQuantities?.userErrors?.length > 0) {
        const errors = response.inventoryAdjustQuantities.userErrors;
        logger.error('Failed to adjust inventory', { inventoryItemId, errors });
        return false;
      }

      logger.info(`Adjusted inventory for ${inventoryItemId} by ${quantity}`);
      return true;
    } catch (error) {
      logger.error('Failed to adjust inventory quantity', { 
        inventoryItemId, 
        quantity, 
        error 
      });
      return false;
    }
  }
}
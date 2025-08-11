// packages/backend/src/services/shopify/ShopifyGraphQLService.ts

import axios from 'axios';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';

export interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
  featuredImage?: {
    url: string;
  };
  variants: {
    edges: Array<{
      node: ShopifyVariant;
    }>;
  };
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string;
  price: string;
  compareAtPrice?: string;
  inventoryQuantity: number;
  image?: {
    url: string;
  };
  product?: ShopifyProduct;
}

export class ShopifyGraphQLService {
  private shopDomain: string;
  private accessToken: string;
  private apiVersion: string;
  private endpoint: string;

  constructor() {
    this.shopDomain = process.env['SHOPIFY_SHOP_DOMAIN'] || '';
    this.accessToken = process.env['SHOPIFY_ACCESS_TOKEN'] || '';
    this.apiVersion = process.env['SHOPIFY_API_VERSION'] || '2024-01';
    this.endpoint = `https://${this.shopDomain}/admin/api/${this.apiVersion}/graphql.json`;

    if (!this.shopDomain || !this.accessToken) {
      logger.error('Shopify configuration missing');
      throw new AppError('Shopify configuration is incomplete', 500);
    }
  }

  /**
   * GraphQL 요청 헬퍼 메서드
   */
  private async makeGraphQLRequest(
    query: string,
    variables?: any
  ): Promise<any> {
    try {
      const response = await axios.post(
        this.endpoint,
        {
          query,
          variables,
        },
        {
          headers: {
            'X-Shopify-Access-Token': this.accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.data.errors) {
        logger.error('GraphQL errors:', response.data.errors);
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data;
    } catch (error: any) {
      logger.error('GraphQL request failed:', error);

      if (error.response?.status === 401) {
        throw new AppError('Shopify authentication failed', 401);
      }

      throw error;
    }
  }

  /**
   * SKU로 Variant 검색
   */
  async findVariantBySku(sku: string): Promise<ShopifyVariant | null> {
    try {
      const query = `
        query findVariantBySku($sku: String!) {
          productVariants(first: 10, query: $sku) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                image {
                  url
                }
                product {
                  id
                  title
                  vendor
                  productType
                  tags
                  featuredImage {
                    url
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.makeGraphQLRequest(query, {
        sku: `sku:${sku}`,
      });

      if (response.productVariants?.edges?.length > 0) {
        // 정확한 SKU 매치 찾기
        const exactMatch = response.productVariants.edges.find(
          (edge: any) => edge.node.sku === sku
        );

        if (exactMatch) {
          return exactMatch.node;
        }

        // 정확한 매치가 없으면 첫 번째 결과 반환
        return response.productVariants.edges[0].node;
      }

      return null;
    } catch (error) {
      logger.error(`Error finding variant by SKU ${sku}:`, error);
      throw error;
    }
  }

  /**
   * 상품 검색 (쿼리 문자열 사용)
   */
  async searchProducts(searchQuery: string): Promise<any> {
    try {
      const query = `
        query searchProducts($query: String!) {
          products(first: 20, query: $query) {
            edges {
              node {
                id
                title
                vendor
                productType
                tags
                featuredImage {
                  url
                }
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      compareAtPrice
                      inventoryQuantity
                      image {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.makeGraphQLRequest(query, {
        query: searchQuery,
      });
      return response.products;
    } catch (error) {
      logger.error('Error searching products:', error);
      throw error;
    }
  }

  /**
   * 상품 목록 조회
   */
  async listProducts(
    options: {
      limit?: number;
      status?: string;
      vendor?: string;
    } = {}
  ): Promise<any> {
    try {
      let queryString = '';

      if (options.status) {
        queryString += `status:${options.status} `;
      }

      if (options.vendor) {
        queryString += `vendor:"${options.vendor}" `;
      }

      const query = `
        query listProducts($first: Int!, $query: String) {
          products(first: $first, query: $query) {
            edges {
              node {
                id
                title
                vendor
                productType
                tags
                variants(first: 10) {
                  edges {
                    node {
                      id
                      sku
                      price
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables: any = {
        first: options.limit || 100,
      };

      if (queryString) {
        variables.query = queryString.trim();
      }

      const response = await this.makeGraphQLRequest(query, variables);

      return {
        products: response.products?.edges?.map((edge: any) => edge.node) || [],
      };
    } catch (error) {
      logger.error('Error listing products:', error);
      throw error;
    }
  }

  /**
   * 벤더별 상품 조회
   */
  async getProductsByVendor(vendor: string): Promise<ShopifyProduct[]> {
    try {
      const query = `
        query getProductsByVendor($vendor: String!) {
          products(first: 100, query: $vendor) {
            edges {
              node {
                id
                title
                vendor
                productType
                tags
                featuredImage {
                  url
                }
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.makeGraphQLRequest(query, {
        vendor: `vendor:"${vendor}"`,
      });
      return response.products?.edges?.map((edge: any) => edge.node) || [];
    } catch (error) {
      logger.error(`Error getting products by vendor ${vendor}:`, error);
      throw error;
    }
  }

  /**
   * 재고 수량 조정
   */
  async adjustInventoryQuantity(
    inventoryItemId: string,
    locationId: string,
    delta: number,
    reason?: string
  ): Promise<boolean> {
    try {
      const mutation = `
        mutation inventoryAdjustQuantity($input: InventoryAdjustQuantityInput!) {
          inventoryAdjustQuantity(input: $input) {
            inventoryLevel {
              id
              available
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        input: {
          inventoryItemId,
          locationId,
          delta,
          reason: reason || 'Manual adjustment',
        },
      };

      const response = await this.makeGraphQLRequest(mutation, variables);

      if (response.inventoryAdjustQuantity?.userErrors?.length > 0) {
        const errors = response.inventoryAdjustQuantity.userErrors;
        throw new Error(
          `Inventory adjustment failed: ${JSON.stringify(errors)}`
        );
      }

      return true;
    } catch (error) {
      logger.error('Error adjusting inventory:', error);
      throw error;
    }
  }

  /**
   * 상품 가격 업데이트
   */
  async updateProductPrice(variantId: string, price: string): Promise<boolean> {
    try {
      const mutation = `
        mutation productVariantUpdate($input: ProductVariantInput!) {
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

      const variables = {
        input: {
          id: variantId,
          price,
        },
      };

      const response = await this.makeGraphQLRequest(mutation, variables);

      if (response.productVariantUpdate?.userErrors?.length > 0) {
        const errors = response.productVariantUpdate.userErrors;
        throw new Error(`Price update failed: ${JSON.stringify(errors)}`);
      }

      return true;
    } catch (error) {
      logger.error('Error updating product price:', error);
      throw error;
    }
  }

  /**
   * 상품 ID로 상세 정보 조회
   */
  async getProductById(productId: string): Promise<ShopifyProduct | null> {
    try {
      const query = `
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            title
            vendor
            productType
            tags
            featuredImage {
              url
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                  image {
                    url
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.makeGraphQLRequest(query, { id: productId });
      return response.product;
    } catch (error) {
      logger.error(`Error getting product ${productId}:`, error);
      return null;
    }
  }

  /**
   * Variant ID로 상세 정보 조회
   */
  async getVariantById(variantId: string): Promise<ShopifyVariant | null> {
    try {
      const query = `
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            id
            title
            sku
            price
            compareAtPrice
            inventoryQuantity
            image {
              url
            }
            product {
              id
              title
              vendor
              productType
              tags
            }
          }
        }
      `;

      const response = await this.makeGraphQLRequest(query, { id: variantId });
      return response.productVariant;
    } catch (error) {
      logger.error(`Error getting variant ${variantId}:`, error);
      return null;
    }
  }

  /**
   * 재고 레벨 조회
   */
  async getInventoryLevel(
    inventoryItemId: string,
    locationId: string
  ): Promise<number> {
    try {
      const query = `
        query getInventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
          inventoryItem(id: $inventoryItemId) {
            inventoryLevel(locationId: $locationId) {
              available
            }
          }
        }
      `;

      const response = await this.makeGraphQLRequest(query, {
        inventoryItemId,
        locationId,
      });

      return response.inventoryItem?.inventoryLevel?.available || 0;
    } catch (error) {
      logger.error('Error getting inventory level:', error);
      throw error;
    }
  }

  /**
   * 대량 작업 생성
   */
  async createBulkOperation(mutation: string): Promise<string> {
    try {
      const bulkMutation = `
        mutation {
          bulkOperationRunMutation(
            mutation: "${mutation.replace(/"/g, '\\"')}"
          ) {
            bulkOperation {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await this.makeGraphQLRequest(bulkMutation);

      if (response.bulkOperationRunMutation?.userErrors?.length > 0) {
        const errors = response.bulkOperationRunMutation.userErrors;
        throw new Error(`Bulk operation failed: ${JSON.stringify(errors)}`);
      }

      return response.bulkOperationRunMutation?.bulkOperation?.id;
    } catch (error) {
      logger.error('Error creating bulk operation:', error);
      throw error;
    }
  }

  /**
   * 대량 작업 상태 확인
   */
  async getBulkOperationStatus(operationId: string): Promise<any> {
    try {
      const query = `
        query getBulkOperation($id: ID!) {
          node(id: $id) {
            ... on BulkOperation {
              id
              status
              errorCode
              createdAt
              completedAt
            }
          }
        }
      `;

      const response = await this.makeGraphQLRequest(query, {
        id: operationId,
      });
      return response.node;
    } catch (error) {
      logger.error('Error getting bulk operation status:', error);
      throw error;
    }
  }
}

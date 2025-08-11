// packages/backend/src/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Hallyu Fomaholic E-Commerce Sync Platform API',
    version: '2.0.0',
    description: `
      ## 🚀 Enterprise E-Commerce Integration Platform
      
      This API provides comprehensive integration between Naver Commerce and Shopify platforms, 
      enabling real-time synchronization of products, inventory, pricing, and orders.
      
      ### Key Features:
      - 🔄 **Real-time Synchronization**: Bi-directional sync between platforms
      - 📦 **Inventory Management**: Automated stock level tracking and updates
      - 💰 **Dynamic Pricing**: Exchange rate-based pricing with configurable margins
      - 📊 **Analytics & Reporting**: Comprehensive metrics and performance tracking
      - 🔐 **Enterprise Security**: JWT authentication with role-based access control
      - ⚡ **High Performance**: Optimized for handling thousands of SKUs
      - 🌐 **Multi-language Support**: Korean and English product information
      
      ### API Sections:
      - **Authentication**: User registration, login, and token management
      - **Products**: Product catalog management and mapping
      - **Inventory**: Stock level monitoring and synchronization
      - **Pricing**: Price calculation and bulk updates
      - **Orders**: Order processing and fulfillment
      - **Sync**: Manual and automated synchronization controls
      - **Analytics**: Performance metrics and business intelligence
      - **Settings**: System configuration and preferences
      - **Webhooks**: Real-time event notifications
      
      ### Rate Limits:
      - Standard: 100 requests per 15 minutes
      - Premium: 1000 requests per 15 minutes
      - Enterprise: Custom limits available
      
      ### Support:
      - Email: api-support@hallyufomaholic.com
      - Documentation: https://docs.hallyufomaholic.com
      - Status Page: https://status.hallyufomaholic.com
    `,
    termsOfService: 'https://hallyufomaholic.com/terms',
    contact: {
      name: 'API Support Team',
      email: 'api-support@hallyufomaholic.com',
      url: 'https://support.hallyufomaholic.com',
    },
    license: {
      name: 'Proprietary',
      url: 'https://hallyufomaholic.com/license',
    },
    'x-logo': {
      url: 'https://hallyufomaholic.com/logo.png',
      altText: 'Hallyu Fomaholic Logo',
    },
  },
  servers: [
    {
      url: `http://localhost:${config.server.port}${config.api.prefix}`,
      description: 'Local Development Server',
      variables: {
        port: {
          default: '3000',
          description: 'Server port',
        },
      },
    },
    {
      url: `https://staging-api.hallyufomaholic.com${config.api.prefix}`,
      description: 'Staging Server',
    },
    {
      url: `https://api.hallyufomaholic.com${config.api.prefix}`,
      description: 'Production Server',
    },
  ],
  externalDocs: {
    description: 'Full API Documentation',
    url: 'https://docs.hallyufomaholic.com/api',
  },
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and authorization endpoints',
      'x-displayName': '🔐 Authentication',
    },
    {
      name: 'Products',
      description: 'Product catalog management',
      'x-displayName': '📦 Products',
    },
    {
      name: 'Inventory',
      description: 'Inventory tracking and synchronization',
      'x-displayName': '📊 Inventory',
    },
    {
      name: 'Pricing',
      description: 'Price management and calculations',
      'x-displayName': '💰 Pricing',
    },
    {
      name: 'Orders',
      description: 'Order processing and management',
      'x-displayName': '🛒 Orders',
    },
    {
      name: 'Sync',
      description: 'Synchronization operations',
      'x-displayName': '🔄 Sync',
    },
    {
      name: 'Analytics',
      description: 'Analytics and reporting',
      'x-displayName': '📈 Analytics',
    },
    {
      name: 'Settings',
      description: 'System configuration',
      'x-displayName': '⚙️ Settings',
    },
    {
      name: 'Webhooks',
      description: 'Webhook management',
      'x-displayName': '🔔 Webhooks',
    },
    {
      name: 'Health',
      description: 'System health and monitoring',
      'x-displayName': '❤️ Health',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from /auth/login endpoint',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for service-to-service communication',
      },
    },
    parameters: {
      pageParam: {
        name: 'page',
        in: 'query',
        description: 'Page number (1-based)',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          default: 1,
        },
      },
      limitParam: {
        name: 'limit',
        in: 'query',
        description: 'Number of items per page',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 10,
        },
      },
      sortParam: {
        name: 'sort',
        in: 'query',
        description:
          'Sort field and direction (e.g., "-createdAt" for descending)',
        required: false,
        schema: {
          type: 'string',
        },
      },
      searchParam: {
        name: 'search',
        in: 'query',
        description: 'Search query',
        required: false,
        schema: {
          type: 'string',
        },
      },
      filterParam: {
        name: 'filter',
        in: 'query',
        description: 'JSON filter object',
        required: false,
        schema: {
          type: 'string',
        },
        example: '{"status":"active","category":"electronics"}',
      },
    },
    schemas: {
      // Base schemas
      Error: {
        type: 'object',
        required: ['success', 'error'],
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                example: 'VALIDATION_ERROR',
                description: 'Error code for programmatic handling',
              },
              message: {
                type: 'string',
                example: 'Validation failed',
                description: 'Human-readable error message',
              },
              details: {
                type: 'object',
                additionalProperties: true,
                description: 'Additional error details',
              },
              stack: {
                type: 'string',
                description: 'Stack trace (development only)',
              },
            },
          },
          meta: {
            type: 'object',
            properties: {
              timestamp: {
                type: 'string',
                format: 'date-time',
              },
              requestId: {
                type: 'string',
              },
              path: {
                type: 'string',
              },
              method: {
                type: 'string',
              },
            },
          },
        },
      },
      Success: {
        type: 'object',
        required: ['success'],
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            description: 'Response data',
          },
          meta: {
            type: 'object',
            description: 'Response metadata',
          },
          message: {
            type: 'string',
            description: 'Success message',
          },
        },
      },
      PaginatedResponse: {
        type: 'object',
        required: ['success', 'data', 'pagination'],
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'array',
            items: {
              type: 'object',
            },
          },
          pagination: {
            $ref: '#/components/schemas/Pagination',
          },
        },
      },
      Pagination: {
        type: 'object',
        required: ['page', 'limit', 'total', 'pages'],
        properties: {
          page: {
            type: 'integer',
            example: 1,
            description: 'Current page number',
          },
          limit: {
            type: 'integer',
            example: 10,
            description: 'Items per page',
          },
          total: {
            type: 'integer',
            example: 100,
            description: 'Total number of items',
          },
          pages: {
            type: 'integer',
            example: 10,
            description: 'Total number of pages',
          },
          hasNext: {
            type: 'boolean',
            example: true,
            description: 'Has next page',
          },
          hasPrev: {
            type: 'boolean',
            example: false,
            description: 'Has previous page',
          },
        },
      },

      // Auth schemas
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'admin@hallyufomaholic.com',
          },
          password: {
            type: 'string',
            format: 'password',
            minLength: 8,
            example: 'SecurePass123!',
          },
          rememberMe: {
            type: 'boolean',
            default: false,
          },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            properties: {
              user: {
                $ref: '#/components/schemas/User',
              },
              tokens: {
                type: 'object',
                properties: {
                  accessToken: {
                    type: 'string',
                    description: 'JWT access token',
                  },
                  refreshToken: {
                    type: 'string',
                    description: 'JWT refresh token',
                  },
                  expiresIn: {
                    type: 'integer',
                    example: 3600,
                    description: 'Token expiry in seconds',
                  },
                },
              },
            },
          },
        },
      },

      // User schemas
      User: {
        type: 'object',
        required: ['id', 'email', 'name', 'role', 'status'],
        properties: {
          id: {
            type: 'string',
            example: '507f1f77bcf86cd799439011',
          },
          email: {
            type: 'string',
            format: 'email',
          },
          name: {
            type: 'string',
          },
          role: {
            type: 'string',
            enum: ['super_admin', 'admin', 'manager', 'user', 'viewer'],
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'pending'],
          },
          emailVerified: {
            type: 'boolean',
          },
          twoFactorEnabled: {
            type: 'boolean',
          },
          lastLogin: {
            type: 'string',
            format: 'date-time',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },

      // Product schemas
      Product: {
        type: 'object',
        required: ['sku', 'naverProductId', 'shopifyProductId'],
        properties: {
          id: {
            type: 'string',
          },
          sku: {
            type: 'string',
            example: 'ALBUM-BTS-001',
          },
          naverProductId: {
            type: 'string',
          },
          shopifyProductId: {
            type: 'string',
          },
          shopifyVariantId: {
            type: 'string',
          },
          productName: {
            type: 'string',
          },
          productNameKo: {
            type: 'string',
          },
          productNameEn: {
            type: 'string',
          },
          category: {
            type: 'string',
          },
          vendor: {
            type: 'string',
          },
          status: {
            type: 'string',
            enum: [
              'active',
              'inactive',
              'discontinued',
              'out_of_stock',
              'pending',
            ],
          },
          syncStatus: {
            type: 'object',
            properties: {
              inventory: {
                type: 'string',
                enum: ['synced', 'pending', 'error', 'skipped'],
              },
              price: {
                type: 'string',
                enum: ['synced', 'pending', 'error', 'skipped'],
              },
              product: {
                type: 'string',
                enum: ['synced', 'pending', 'error', 'skipped'],
              },
              lastSyncAt: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
          inventory: {
            type: 'object',
            properties: {
              naver: {
                type: 'object',
                properties: {
                  available: {
                    type: 'integer',
                  },
                  reserved: {
                    type: 'integer',
                  },
                  safety: {
                    type: 'integer',
                  },
                },
              },
              shopify: {
                type: 'object',
                properties: {
                  available: {
                    type: 'integer',
                  },
                  incoming: {
                    type: 'integer',
                  },
                  committed: {
                    type: 'integer',
                  },
                },
              },
            },
          },
          pricing: {
            type: 'object',
            properties: {
              naver: {
                type: 'object',
                properties: {
                  regular: {
                    type: 'number',
                  },
                  sale: {
                    type: 'number',
                  },
                  currency: {
                    type: 'string',
                    default: 'KRW',
                  },
                },
              },
              shopify: {
                type: 'object',
                properties: {
                  regular: {
                    type: 'number',
                  },
                  sale: {
                    type: 'number',
                  },
                  currency: {
                    type: 'string',
                    default: 'USD',
                  },
                },
              },
            },
          },
        },
      },

      // Sync schemas
      SyncJob: {
        type: 'object',
        properties: {
          syncJobId: {
            type: 'string',
          },
          type: {
            type: 'string',
            enum: ['full', 'inventory', 'price', 'product', 'order'],
          },
          status: {
            type: 'string',
            enum: [
              'pending',
              'queued',
              'processing',
              'completed',
              'failed',
              'cancelled',
            ],
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
          },
          progress: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
          },
          totalItems: {
            type: 'integer',
          },
          processedItems: {
            type: 'integer',
          },
          successItems: {
            type: 'integer',
          },
          failedItems: {
            type: 'integer',
          },
          skippedItems: {
            type: 'integer',
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sku: {
                  type: 'string',
                },
                code: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
          },
          startedAt: {
            type: 'string',
            format: 'date-time',
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
          },
          duration: {
            type: 'integer',
            description: 'Duration in milliseconds',
          },
        },
      },

      // Health schemas
      HealthStatus: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'unhealthy', 'degraded'],
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          uptime: {
            type: 'integer',
            description: 'Uptime in seconds',
          },
          version: {
            type: 'string',
          },
          environment: {
            type: 'string',
          },
          services: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['up', 'down', 'degraded'],
                },
                responseTime: {
                  type: 'number',
                },
              },
            },
          },
          infrastructure: {
            type: 'object',
            properties: {
              database: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['connected', 'disconnected', 'error'],
                  },
                  responseTime: {
                    type: 'number',
                  },
                },
              },
              redis: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['connected', 'disconnected', 'error'],
                  },
                  responseTime: {
                    type: 'number',
                  },
                },
              },
            },
          },
          system: {
            type: 'object',
            properties: {
              cpu: {
                type: 'object',
                properties: {
                  usage: {
                    type: 'number',
                  },
                  cores: {
                    type: 'integer',
                  },
                },
              },
              memory: {
                type: 'object',
                properties: {
                  total: {
                    type: 'integer',
                  },
                  used: {
                    type: 'integer',
                  },
                  percentage: {
                    type: 'number',
                  },
                },
              },
            },
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad Request',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'BAD_REQUEST',
                message: 'Invalid request parameters',
              },
            },
          },
        },
      },
      Unauthorized: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
              },
            },
          },
        },
      },
      Forbidden: {
        description: 'Forbidden',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Insufficient permissions',
              },
            },
          },
        },
      },
      NotFound: {
        description: 'Not Found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Resource not found',
              },
            },
          },
        },
      },
      Conflict: {
        description: 'Conflict',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'CONFLICT',
                message: 'Resource already exists',
              },
            },
          },
        },
      },
      TooManyRequests: {
        description: 'Too Many Requests',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'RATE_LIMIT',
                message: 'Rate limit exceeded',
              },
            },
          },
        },
      },
      InternalServerError: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: 'An unexpected error occurred',
              },
            },
          },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const options: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  apis: [
    path.join(__dirname, '../routes/*.ts'),
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../controllers/*.ts'),
    path.join(__dirname, '../controllers/*.js'),
    path.join(__dirname, '../models/*.ts'),
    path.join(__dirname, '../models/*.js'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

// Custom CSS for Swagger UI
export const swaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { 
      display: none;
    }
    .swagger-ui .info {
      margin-bottom: 40px;
    }
    .swagger-ui .scheme-container {
      background: #f4f4f4;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .swagger-ui .btn.authorize {
      background-color: #4CAF50;
      border-color: #4CAF50;
    }
    .swagger-ui .btn.authorize:hover {
      background-color: #45a049;
      border-color: #45a049;
    }
    .swagger-ui .model-box {
      border-radius: 4px;
    }
    .swagger-ui section.models {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 10px;
    }
  `,
  customSiteTitle: 'Hallyu Fomaholik API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
    displayOperationId: false,
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
  },
};

export default swaggerSpec;

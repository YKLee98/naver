// packages/lambda/price-calculator/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';

const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY!;
const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest/KRW';

interface PriceCalculationRequest {
  naverPrice: number;
  margin: number;
  customShopifyPrice?: number;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body: PriceCalculationRequest = JSON.parse(event.body || '{}');
    
    // Get current exchange rate
    const exchangeRateResponse = await axios.get(EXCHANGE_RATE_API_URL, {
      headers: {
        'Authorization': `Bearer ${EXCHANGE_RATE_API_KEY}`,
      },
    });
    
    const exchangeRate = exchangeRateResponse.data.rates.USD;
    
    // Calculate Shopify price
    let shopifyPrice: number;
    
    if (body.customShopifyPrice) {
      shopifyPrice = body.customShopifyPrice;
    } else {
      const priceInUSD = body.naverPrice * exchangeRate;
      shopifyPrice = priceInUSD * (1 + body.margin);
    }
    
    const response = {
      naverPrice: body.naverPrice,
      exchangeRate: 1 / exchangeRate, // KRW per USD
      margin: body.margin,
      calculatedShopifyPrice: shopifyPrice,
      currency: 'USD',
      calculatedAt: new Date().toISOString(),
    };
    
    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  } catch (error) {
    console.error('Error calculating price:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to calculate price' }),
    };
  }
};


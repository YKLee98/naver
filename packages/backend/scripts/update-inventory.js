// MongoDB 재고 업데이트 스크립트
import { MongoClient } from 'mongodb';

async function updateInventory() {
  const uri = 'mongodb://localhost:27017/ERP_NAVER';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('ERP_NAVER');
    const collection = db.collection('productmappings');

    // SKU별로 다른 재고 설정
    const updates = [
      {
        sku: '2025080501',
        naver: 150,
        shopify: 145
      },
      {
        sku: '2025080502', 
        naver: 80,
        shopify: 75
      }
    ];

    for (const update of updates) {
      const result = await collection.updateOne(
        { sku: update.sku },
        {
          $set: {
            'inventory.naver.available': update.naver,
            'inventory.naver.reserved': 0,
            'inventory.naver.safety': 10,
            'inventory.shopify.available': update.shopify,
            'inventory.shopify.incoming': 0,
            'inventory.shopify.committed': 0,
          }
        }
      );
      console.log(`Updated ${update.sku}: ${result.modifiedCount} document(s)`);
    }


    // 업데이트된 문서 확인
    const mappings = await collection.find({}).toArray();
    console.log('Current mappings:', mappings.map(m => ({
      sku: m.sku,
      naver: m.inventory?.naver?.available,
      shopify: m.inventory?.shopify?.available
    })));

  } catch (error) {
    console.error('Error updating inventory:', error);
  } finally {
    await client.close();
  }
}

updateInventory();
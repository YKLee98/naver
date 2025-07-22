// packages/lambda/dlq-processor/index.ts
import { SQSEvent } from 'aws-lambda';
import { SNS } from 'aws-sdk';
import { MongoClient } from 'mongodb';

const sns = new SNS();
const NOTIFICATION_TOPIC_ARN = process.env.NOTIFICATION_TOPIC_ARN!;
const MONGODB_URI = process.env.MONGODB_URI!;

export const handler = async (event: SQSEvent): Promise<void> => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  
  const db = client.db();
  const errorLogCollection = db.collection('errorlogs');
  
  for (const record of event.Records) {
    try {
      const originalMessage = JSON.parse(record.body);
      const errorDetails = {
        messageId: record.messageId,
        receiptHandle: record.receiptHandle,
        originalMessage,
        attributes: record.attributes,
        messageAttributes: record.messageAttributes,
        processedAt: new Date(),
      };
      
      // Log to database
      await errorLogCollection.insertOne({
        type: 'DLQ_MESSAGE',
        details: errorDetails,
        createdAt: new Date(),
      });
      
      // Send notification
      await sns.publish({
        TopicArn: NOTIFICATION_TOPIC_ARN,
        Subject: 'Dead Letter Queue Alert',
        Message: JSON.stringify({
          alert: 'Message moved to DLQ',
          queue: record.eventSourceARN,
          messageId: record.messageId,
          timestamp: new Date().toISOString(),
          details: originalMessage,
        }, null, 2),
      }).promise();
      
      console.log('DLQ message processed and notification sent');
    } catch (error) {
      console.error('Error processing DLQ message:', error);
    }
  }
  
  await client.close();
};

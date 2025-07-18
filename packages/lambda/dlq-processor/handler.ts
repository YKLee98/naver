import { SQSEvent, Context } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const snsClient = new SNSClient({ region: process.env.AWS_REGION });
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION });

interface DLQMessage {
  originalMessage: any;
  errorMessage: string;
  errorCount: number;
  firstFailureTime: string;
  lastFailureTime: string;
}

/**
 * SNS 알림 전송
 */
async function sendAlert(message: DLQMessage): Promise<void> {
  const alertMessage = `
DLQ Alert: Failed Message Processing

Original Message: ${JSON.stringify(message.originalMessage, null, 2)}
Error: ${message.errorMessage}
Failure Count: ${message.errorCount}
First Failure: ${message.firstFailureTime}
Last Failure: ${message.lastFailureTime}

Please investigate and manually process this message.
  `;

  const command = new PublishCommand({
    TopicArn: process.env.SNS_TOPIC_ARN!,
    Subject: 'DLQ Alert: Failed Message Processing',
    Message: alertMessage,
  });

  await snsClient.send(command);
}

/**
 * CloudWatch 메트릭 전송
 */
async function sendMetrics(messageCount: number): Promise<void> {
  const command = new PutMetricDataCommand({
    Namespace: 'HallyuSync',
    MetricData: [
      {
        MetricName: 'DLQMessages',
        Value: messageCount,
        Unit: 'Count',
        Timestamp: new Date(),
        Dimensions: [
          {
            Name: 'Environment',
            Value: process.env.ENVIRONMENT || 'production',
          },
        ],
      },
    ],
  });

  await cloudwatchClient.send(command);
}

/**
 * Lambda 핸들러
 */
export const handler = async (
  event: SQSEvent,
  context: Context
): Promise<void> => {
  console.log(`Processing ${event.Records.length} DLQ messages`);

  // CloudWatch 메트릭 전송
  await sendMetrics(event.Records.length);

  // 각 메시지 처리
  for (const record of event.Records) {
    try {
      const dlqMessage: DLQMessage = JSON.parse(record.body);
      
      // 알림 전송
      await sendAlert(dlqMessage);
      
      // 로그 기록
      console.error('DLQ Message:', {
        messageId: record.messageId,
        receiptHandle: record.receiptHandle,
        originalMessage: dlqMessage.originalMessage,
        error: dlqMessage.errorMessage,
      });
      
    } catch (error) {
      console.error('Failed to process DLQ message:', error);
    }
  }
};

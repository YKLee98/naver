import { ScheduledEvent, Context } from 'aws-lambda';
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { MongoClient } from 'mongodb';

const ecsClient = new ECSClient({ region: process.env.AWS_REGION });
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

let cachedSecrets: any = null;

/**
 * 시크릿 가져오기
 */
async function getSecrets(): Promise<any> {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const command = new GetSecretValueCommand({
    SecretId: process.env.SECRETS_ARN!,
  });
  
  const response = await secretsClient.send(command);
  cachedSecrets = JSON.parse(response.SecretString!);
  
  return cachedSecrets;
}

/**
 * 동기화 활성화 여부 확인
 */
async function isSyncEnabled(): Promise<boolean> {
  const secrets = await getSecrets();
  
  const client = new MongoClient(secrets.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    const settings = db.collection('sync_settings');
    
    const config = await settings.findOne({ key: 'autoSync' });
    return config?.value === true;
    
  } finally {
    await client.close();
  }
}

/**
 * ECS 태스크 실행
 */
async function runECSTask(): Promise<void> {
  const command = new RunTaskCommand({
    cluster: process.env.ECS_CLUSTER_ARN!,
    taskDefinition: process.env.TASK_DEFINITION_ARN!,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: process.env.SUBNET_IDS!.split(','),
        securityGroups: [process.env.SECURITY_GROUP_ID!],
        assignPublicIp: 'ENABLED',
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: 'sync-container',
          environment: [
            {
              name: 'SYNC_MODE',
              value: 'FULL',
            },
            {
              name: 'TRIGGERED_BY',
              value: 'SCHEDULER',
            },
          ],
        },
      ],
    },
  });

  const response = await ecsClient.send(command);
  
  if (!response.tasks || response.tasks.length === 0) {
    throw new Error('Failed to start ECS task');
  }
  
  console.log('ECS task started:', response.tasks[0].taskArn);
}

/**
 * Lambda 핸들러
 */
export const handler = async (
  event: ScheduledEvent,
  context: Context
): Promise<void> => {
  console.log('Sync scheduler triggered:', {
    time: event.time,
    resources: event.resources,
  });

  try {
    // 동기화 활성화 확인
    const isEnabled = await isSyncEnabled();
    
    if (!isEnabled) {
      console.log('Auto sync is disabled, skipping');
      return;
    }

    // ECS 태스크 실행
    await runECSTask();
    
    console.log('Sync task scheduled successfully');
    
  } catch (error) {
    console.error('Failed to schedule sync task:', error);
    throw error;
  }
};

import AWS from 'aws-sdk';
import env from './env';

const ec2 = new AWS.EC2({
  apiVersion: '2016-11-15',
  credentials: {
    accessKeyId: env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env.get('AWS_ACCESS_KEY_SECRET'),
  },
  region: 'ap-southeast-1',
});

function fail(): never {
  throw Error('Invalid AWS data.');
}

async function getState(): Promise<string> {
  const status = await ec2
    .describeInstances({
      InstanceIds: [env.get('AWS_INSTANCE_ID')],
    })
    .promise();

  if (status === undefined) {
    fail();
  }

  if (status.Reservations === undefined) {
    fail();
  }

  if (status.Reservations[0].Instances === undefined) {
    fail();
  }

  if (status.Reservations[0].Instances[0].State === undefined) {
    fail();
  }

  if (status.Reservations[0].Instances[0].State.Name === undefined) {
    fail();
  }

  return status.Reservations[0].Instances[0].State.Name;
}

async function start(): Promise<void> {
  try {
    await ec2
      .startInstances({
        InstanceIds: [env.get('AWS_INSTANCE_ID')],
      })
      .promise();
  } catch (error) {
    fail();
  }
}

async function stop(): Promise<void> {
  try {
    await ec2
      .stopInstances({
        InstanceIds: [env.get('AWS_INSTANCE_ID')],
      })
      .promise();
  } catch (error) {
    fail();
  }
}

export default {
  getState,
  start,
  stop,
};

import http from 'http';
import env from './env';

function requestAction(action: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: env.get('MC_HOST'),
        port: env.get('MC_PORT'),
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject();
        }

        resolve();
      },
    );

    req.on('error', () => {
      reject();
    });

    req.write(
      JSON.stringify({
        action,
      }),
    );

    req.end();
  });
}

async function start(): Promise<void> {
  await requestAction('start');
}

async function stop(): Promise<void> {
  await requestAction('stop');
}

async function reboot(): Promise<void> {
  await requestAction('reboot');
}

async function getPlayerCount(): Promise<number> {
  const data: Record<string, unknown> = await new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: env.get('MC_HOST'),
        port: env.get('MC_PORT'),
        path: '/players',
      },
      (res) => {
        const { statusCode } = res;

        if (statusCode !== 200) {
          reject();
        }

        let rawData = '';

        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = JSON.parse(rawData);
            resolve(parsedData);
          } catch (error) {
            reject();
          }
        });
      },
    );

    req.on('error', () => {
      reject();
    });
  });

  if (data.players === undefined) {
    throw Error('Invalid data.');
  }

  const { players } = data;

  if (!Array.isArray(players)) {
    throw Error('Invalid data.');
  }

  if (
    !players.every((player) => {
      return typeof player === 'object' && typeof player.name === 'string';
    })
  ) {
    throw Error('Invalid data.');
  }

  return players.length;
}

export default {
  start,
  stop,
  reboot,
  getPlayerCount,
};

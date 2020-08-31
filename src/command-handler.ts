import ec2 from './ec2';
import mc from './mc';
import { sleep } from './utils';

let aborted = false;
let blocked = false;

const COMMANDS = [
  'start',
  'help',
  'status',
  'boot',
  'shutdown',
  'reboot',
  'abort',
] as const;

type Command = typeof COMMANDS[number];

type CommandHandler = (
  bot: { sendMessage: (chatId: number, message: string) => void },
  chatId: number,
) => Promise<void>;

const commandHandlers: Record<Command, CommandHandler> = {
  start: handleStart,
  help: handleHelp,
  status: handleStatus,
  boot: makeAbortable(handleBoot, 10),
  shutdown: makeAbortable(handleShutdown, 30),
  reboot: makeAbortable(handleReboot, 30),
  abort: handleAbort,
};

function isValidCommand(str: string): str is Command {
  return COMMANDS.some(
    (command) => command.toLowerCase() === str.toLowerCase(),
  );
}

export async function handleCommand(
  bot: { sendMessage: (chatId: number, message: string) => void },
  chatId: number,
  command: string,
): Promise<void> {
  if (!isValidCommand(command)) {
    bot.sendMessage(chatId, `${command} is an invalid command.`);
    return;
  }

  await commandHandlers[command](bot, chatId);
}

function makeBlocking(handler: CommandHandler): CommandHandler {
  return async (bot, chatId) => {
    if (blocked) {
      bot.sendMessage(chatId, 'There is another command being executed.');
      return;
    }
    blocked = true;
    await handler(bot, chatId);
    blocked = false;
  };
}

function makeAbortable(
  handler: CommandHandler,
  seconds: number,
): CommandHandler {
  // All abortable handlers must be blocking
  return makeBlocking(async (bot, chatId) => {
    aborted = false;

    bot.sendMessage(
      chatId,
      `You have ${seconds} seconds to abort this command.`,
    );

    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, seconds * 1000);

        const interval = setInterval(() => {
          if (aborted) {
            clearInterval(interval);
            reject();
          }
        }, 1000);
      });
    } catch (error) {
      // abort
      bot.sendMessage(chatId, 'Command aborted.');
      aborted = false; // redundant
      return;
    }

    await handler(bot, chatId);
  });
}

async function handleStart(
  bot: { sendMessage: (chatId: number, message: string) => void },
  chatId: number,
): Promise<void> {
  bot.sendMessage(
    chatId,
    "Hello, I'm ready for your next command. Use /help for a list of commands. If the server is outdated, use /reboot to update it.",
  );
}

async function handleHelp(
  bot: { sendMessage: (chatId: number, message: string) => void },
  chatId: number,
): Promise<void> {
  const message = COMMANDS.map(
    (command, index) => `${index + 1}. /${command}`,
  ).join('\n');

  bot.sendMessage(chatId, message);
}

async function handleStatus(
  bot: { sendMessage: (chatId: number, message: string) => void },
  chatId: number,
): Promise<void> {
  let instanceState;
  try {
    instanceState = await ec2.getState();
  } catch (error) {
    bot.sendMessage(chatId, 'Failed to retrieve server status.');
  }

  let additionalInfo = '';

  if (instanceState === 'running') {
    try {
      const playerCount = await mc.getPlayerCount();
      additionalInfo += `There is/are ${playerCount} player(s) online.`;
    } catch (error) {
      // No additional info
    }
  }

  bot.sendMessage(chatId, `The server is ${instanceState}. ${additionalInfo}`);
}

async function handleBoot(
  bot: { sendMessage: (chatId: number, message: string) => void },
  chatId: number,
): Promise<void> {
  let instanceState;
  try {
    instanceState = await ec2.getState();
  } catch (error) {
    bot.sendMessage(chatId, 'Something went wrong.');
    return;
  }

  if (instanceState !== 'running' && instanceState !== 'stopped') {
    bot.sendMessage(
      chatId,
      'Failed to initialize boot. Use /status to check if the server is stopped.',
    );
    return;
  }

  bot.sendMessage(chatId, 'Server is booting up.');

  if (instanceState === 'stopped') {
    try {
      await ec2.start();
    } catch (error) {
      bot.sendMessage(chatId, 'Something went wrong.');
      return;
    }
  }

  try {
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        clearInterval(interval);
        reject();
      }, 120000);

      const interval = setInterval(async () => {
        const state = await ec2.getState();

        if (state === 'running') {
          clearInterval(interval);
          resolve();
        }
      }, 5000);
    });
  } catch (error) {
    bot.sendMessage(
      chatId,
      'Something went wrong. Wait until /status says the server is running before using /reboot.',
    );
    return;
  }

  // Let mc server OS set up
  await sleep(30);

  try {
    await mc.start();
  } catch (error) {
    bot.sendMessage(chatId, 'Something went wrong. Use /reboot.');
    return;
  }

  bot.sendMessage(chatId, 'Successfully booted up.');
}

async function handleShutdown(
  bot: { sendMessage: (chatId: number, message: string) => void },
  chatId: number,
): Promise<void> {
  let instanceState;
  try {
    instanceState = await ec2.getState();
  } catch (error) {
    bot.sendMessage(chatId, 'Something went wrong.');
    return;
  }

  if (instanceState !== 'running' && instanceState !== 'stopped') {
    bot.sendMessage(
      chatId,
      'Failed to initialize shut down. Use /status to check if the server is running.',
    );
    return;
  }

  if (instanceState === 'stopped') {
    bot.sendMessage(chatId, 'Server is already shut down.');
    return;
  }

  bot.sendMessage(chatId, 'Server is shutting down.');

  try {
    await mc.stop();
  } catch (error) {
    bot.sendMessage(chatId, 'Something went wrong.');
    return;
  }

  try {
    await ec2.stop();
  } catch (error) {
    bot.sendMessage(chatId, 'Something went wrong.');
    return;
  }

  bot.sendMessage(chatId, 'Successfully shut down.');
}

async function handleReboot(
  bot: { sendMessage: (chatId: number, message: string) => void },
  chatId: number,
): Promise<void> {
  let instanceState;
  try {
    instanceState = await ec2.getState();
  } catch (error) {
    bot.sendMessage(chatId, 'Something went wrong.');
    return;
  }

  if (instanceState !== 'running') {
    bot.sendMessage(
      chatId,
      'Failed to reboot the server as it is not running.',
    );
    return;
  }

  bot.sendMessage(chatId, 'Server is rebooting.');

  try {
    mc.reboot();
  } catch (error) {
    bot.sendMessage(chatId, 'Something went wrong.');
    return;
  }

  bot.sendMessage(chatId, 'Successfully rebooted.');
}

async function handleAbort(): Promise<void> {
  aborted = true;
}

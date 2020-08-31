import TelegramBot from 'node-telegram-bot-api';
import { handleCommand } from './command-handler';
import env from './env';

const token = env.get('TELEGRAM_TOKEN');

const bot = new TelegramBot(token, {
  polling: true,
});

// There is no need to handle whitespaces because telegram trims the text
bot.onText(/\/(.+)/, async (msg, match) => {
  // Ignore messages that were missed more than 30 seconds earlier
  if (Date.now() - msg.date * 1000 > 30000) {
    // msg.date is in seconds
    return;
  }

  if (match === null) {
    return;
  }

  const chatId = msg.chat.id;
  const command = match[1];

  await handleCommand(bot, chatId, command);
});

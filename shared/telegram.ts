export async function sendTelegramMessage(
  telegramId: bigint | string | number,
  text: string,
  keyboard?: { text: string; callback_data: string }[][]
) {
  try {
    const body: any = {
      chat_id: telegramId.toString(),
      text,
      parse_mode: "Markdown",
    };

    if (keyboard && keyboard.length > 0) {
      body.reply_markup = { inline_keyboard: keyboard };
    }

    const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn("Telegram API Warning:", await response.text());
    }
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
  }
}
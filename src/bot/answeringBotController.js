const AnsweringBotApiClient = require('../services/answeringBotApiClient');

/**
 * Контроллер для управления answering-bot через команды и меню
 * Только для администраторов
 */
class AnsweringBotController {
    constructor(bot, userManager) {
        this.bot = bot;
        this.userManager = userManager;
        this.apiClient = new AnsweringBotApiClient({
            baseUrl: 'http://localhost:3001',
            timeout: 5000
        });
        this.isInitialized = false;
    }

    /**
     * Инициализация контроллера
     */
    async init() {
        try {
            // Просто создаем контроллер, соединение проверим при использовании
            this.isInitialized = true;
        } catch (error) {
            console.error('⚠️ Ошибка инициализации контроллера answering-bot:', error.message);
        }
    }

    /**
     * Проверка, что пользователь - администратор
     */
    async isAdmin(userId) {
        const userInfo = await this.userManager.getUserInfo(userId);
        return userInfo && userInfo.role === 'admin';
    }

    /**
     * Создание главного меню управления
     */
    async createMainMenu(currentState = null) {
        try {
            // Если состояние не передано, получаем его
            if (currentState === null || currentState === undefined) {
                const state = await this.apiClient.getProcessingState();
                if (!state.success) {
                    // Если не удалось получить состояние, используем неизвестное
                    currentState = false;
                } else {
                    currentState = state.enabled;
                }
            }

            const toggleText = currentState ? '⏸️ Выключить' : '▶️ Включить';

            return {
                inline_keyboard: [
                    [
                        { 
                            text: toggleText, 
                            callback_data: 'answering_toggle' 
                        }
                    ],
                    [
                        { 
                            text: '🔄 Обновить', 
                            callback_data: 'answering_refresh' 
                        },
                        { 
                            text: '❌ Закрыть', 
                            callback_data: 'answering_close' 
                        }
                    ]
                ]
            };
        } catch (error) {
            console.error('❌ Ошибка при создании меню:', error.message);
            // Возвращаем базовое меню
            return {
                inline_keyboard: [
                    [
                        { 
                            text: '❌ Ошибка соединения', 
                            callback_data: 'answering_status' 
                        }
                    ],
                    [
                        { 
                            text: '🔄 Обновить', 
                            callback_data: 'answering_refresh' 
                        }
                    ],
                    [
                        { 
                            text: '❌ Закрыть', 
                            callback_data: 'answering_close' 
                        }
                    ]
                ]
            };
        }
    }

    /**
     * Регистрация команд
     */
    registerCommands() {
        // Команда /answering - открыть меню управления
        this.bot.command('answering', async (ctx) => {
            if (!ctx.userAccess) return;

            const isAdmin = await this.isAdmin(ctx.from.id);
            if (!isAdmin) {
                await ctx.reply('🚫 Эта команда доступна только администраторам');
                return;
            }

            if (!this.isInitialized) {
                await ctx.reply('⚠️ Контроллер answering-bot не инициализирован');
                return;
            }

            await this.showMainMenu(ctx);
        });

        // Обработчик callback кнопок
        this.bot.action(/^answering_/, async (ctx) => {
            const isAdmin = await this.isAdmin(ctx.from.id);
            if (!isAdmin) {
                await ctx.answerCbQuery('🚫 Доступно только администраторам');
                return;
            }

            await this.handleCallback(ctx);
        });
    }

    /**
     * Показать главное меню
     */
    async showMainMenu(ctx, messageId = null) {
        try {
            // Проверяем соединение при каждом открытии меню
            await this.apiClient.checkConnection();
            
            const state = await this.apiClient.getProcessingState();
            
            if (!state.success) {
                const errorMessage = '⚠️ Answering-bot недоступен! Обратитесь к серверному администратору';
                if (messageId) {
                    await ctx.answerCbQuery(errorMessage);
                } else {
                    await ctx.reply(errorMessage);
                }
                return;
            }

            const keyboard = await this.createMainMenu(state.enabled);
            const statusIcon = state.enabled ? '🟢' : '🔴';
            const statusText = state.enabled ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА';

            const messageText = `
🤖 УПРАВЛЕНИЕ ANSWERING-BOT

<b>Текущий статус:</b>
${statusIcon} Обработка сообщений: <b>${statusText}</b>

<b>Последнее изменение:</b>
🕐 ${new Date(state.lastChanged).toLocaleString('ru-RU', { timeZone: 'Europe/Minsk' })}

Используйте кнопки ниже для управления:
            `.trim();

            if (messageId) {
                // Обновляем существующее сообщение (например, после переключения)
                await ctx.editMessageText(messageText, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            } else {
                // Отправляем новое сообщение
                await ctx.reply(messageText, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            }
        } catch (error) {
            console.error('❌ Ошибка при открытии меню answering-bot:', error.message);
            const errorMessage = `⚠️ Сервер answering-bot не отвечает.\n\nВозможные причины:\n• Сервер не запущен\n• Проблемы с сетевым соединением\n• Таймаут ожидания ответа\n\nПроверьте, что answering-bot запущен на localhost:3001`;
            
            if (messageId) {
                try {
                    await ctx.answerCbQuery('Сервер не отвечает');
                    await ctx.editMessageText(errorMessage);
                } catch (e) {
                    // Если не удалось обновить, отправим новое
                    await ctx.reply(errorMessage);
                }
            } else {
                await ctx.reply(errorMessage);
            }
        }
    }

    /**
     * Обработка callback кнопок
     */
    async handleCallback(ctx) {
        const action = ctx.callbackQuery.data;

        try {
            switch (action) {
                case 'answering_toggle':
                    await this.handleToggle(ctx);
                    break;

                case 'answering_refresh':
                    await ctx.answerCbQuery('🔄 Обновление...');
                    // Удаляем старое сообщение
                    await ctx.deleteMessage();
                    // Показываем новое (без messageId, чтобы создалось новое сообщение)
                    await this.showMainMenu(ctx);
                    break;

                case 'answering_close':
                    await ctx.deleteMessage();
                    await ctx.answerCbQuery('👋 Меню закрыто');
                    break;

                default:
                    await ctx.answerCbQuery('❌ Неизвестное действие');
            }
        } catch (error) {
            console.error('Ошибка обработки callback:', error);
            await ctx.answerCbQuery('❌ Произошла ошибка');
        }
    }

    /**
     * Переключение состояния обработки
     */
    async handleToggle(ctx) {
        try {
            const state = await this.apiClient.getProcessingState();
            
            if (!state.success) {
                await ctx.answerCbQuery('⚠️ Answering-bot недоступен. Сервер не отвечает.');
                return;
            }

            const newState = !state.enabled;
            const result = await this.apiClient.setProcessing(newState);

            if (result.success) {
                const message = newState ? '✅ Обработка ВКЛЮЧЕНА' : '⏸️ Обработка ВЫКЛЮЧЕНА';
                await ctx.answerCbQuery(message, { show_alert: true });
                await this.showMainMenu(ctx, ctx.callbackQuery.message.message_id);
            } else {
                await ctx.answerCbQuery('❌ Ошибка: ' + result.error);
            }
        } catch (error) {
            console.error('❌ Ошибка при переключении состояния:', error.message);
            await ctx.answerCbQuery('⚠️ Сервер answering-bot не отвечает');
        }
    }
}

module.exports = AnsweringBotController;


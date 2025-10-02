const { Telegraf, Composer } = require('telegraf');
const UserManager = require('./userManager');

/**
 * Основной класс Telegram бота
 */
class TelegramBot {
    constructor(token, database = null) {
        this.bot = new Telegraf(token);
        this.userManager = new UserManager(database);
        this.isInitialized = false;
    }

    /**
     * Инициализация бота
     */
    async init() {
        try {
            // Инициализируем менеджер пользователей
            await this.userManager.init();
            
            // Настраиваем middleware и обработчики
            this.setupMiddleware();
            this.setupHandlers();
            
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации бота:', error);
            throw error;
        }
    }

    /**
     * Загрузка администраторов из JSON файла
     */
    async loadAdmins(adminsConfig) {
        await this.userManager.loadAdmins(adminsConfig);
    }

    /**
     * Настройка middleware
     */
    setupMiddleware() {
        // Middleware для проверки доступа
        this.bot.use(async (ctx, next) => {
            try {
                const userId = ctx.from.id;
                
                // Проверяем, инициализирован ли бот
                if (!this.isInitialized) {
                    return;
                }

                // Обрабатываем нового пользователя или проверяем доступ
                const hasAccess = await this.userManager.handleNewUser(ctx);
                
                // Если у пользователя нет доступа, игнорируем сообщения
                if (!hasAccess && ctx.message) return

                // Сохраняем информацию о доступе в контексте
                ctx.userAccess = hasAccess;
                
                await next();
            } catch (error) {
                console.error('❌ Ошибка в middleware:', error);
            }
        });
    }

    /**
     * Настройка обработчиков команд и сообщений
     */
    setupHandlers() {
        // Команда /start
        this.bot.start(async (ctx) => {
            const userId = ctx.from.id;
            const hasAccess = ctx.userAccess;
            
            if (hasAccess) {
                await ctx.reply(`
🤖 <b>Добро пожаловать в бота!</b>

Вы имеете доступ к боту. Доступные команды:
/admin - Админ панель
/help - Помощь
                `, { parse_mode: 'HTML' });
            } else {
                await ctx.reply(`
🚫 <b>Доступ ограничен</b>

Вы добавлены в систему, но у вас нет прав доступа к боту.
Обратитесь к администратору для получения доступа.
                `, { parse_mode: 'HTML' });
            }
        });

        // Команда /help
        this.bot.help(async (ctx) => {
            if (!ctx.userAccess) return;
            
            const userInfo = await this.userManager.getUserInfo(ctx.from.id);
            const role = userInfo ? userInfo.role : 'unknown';
            
            let helpText = `
📚 <b>Справка по командам:</b>

/start - Начать работу с ботом
/help - Показать эту справку
            `;

            if (role === 'admin') {
                helpText += `
👑 <b>Админ команды:</b>
/addModer [ID] - Добавить модератора
/removeModer [ID] - Удалить модератора
/users - Список всех пользователей
                `;
            }

            await ctx.reply(helpText, { parse_mode: 'HTML' });
        });


        // Команда /admin (только для админов)
        this.bot.command('admin', async (ctx) => {
            if (!ctx.userAccess) return;
            
            const userInfo = await this.userManager.getUserInfo(ctx.from.id);
            if (userInfo && userInfo.role === 'admin') {
                await ctx.reply(`
👑 <b>Админ панель</b>

Доступные команды:
/addModer [ID] - Добавить модератора
/removeModer [ID] - Удалить модератора
/users - Список всех пользователей
                `, { parse_mode: 'HTML' });
            } else {
                await ctx.reply('🚫 У вас нет прав администратора');
            }
        });

        // Команда /addModer (только для админов)
        this.bot.command('addModer', async (ctx) => {
            if (!ctx.userAccess) return;
            
            const userInfo = await this.userManager.getUserInfo(ctx.from.id);
            if (!userInfo || userInfo.role !== 'admin') {
                await ctx.reply('🚫 У вас нет прав администратора');
                return;
            }

            const messageText = ctx.message.text;
            const parts = messageText.split(' ');
            
            if (parts.length < 2) {
                await ctx.reply(`
❌ <b>Неверный формат команды</b>

Использование: /addModer [ID_пользователя]

Пример: /addModer 123456789
                `, { parse_mode: 'HTML' });
                return;
            }

            const targetUserId = parseInt(parts[1]);
            if (isNaN(targetUserId)) {
                await ctx.reply('❌ ID пользователя должен быть числом');
                return;
            }

            try {
                // Сначала проверяем существование пользователя в Telegram
                let targetUserInfo = null;
                try {
                    const chatMember = await this.bot.telegram.getChatMember(targetUserId, targetUserId);
                    targetUserInfo = chatMember.user;
                } catch (telegramError) {
                    await ctx.reply(`
❌ <b>Пользователь не найден</b>

Пользователь с ID ${targetUserId} не найден в Telegram.
Проверьте правильность ID или убедитесь, что пользователь существует.
                    `, { parse_mode: 'HTML' });
                    return;
                }

                // Добавляем модератора с полученной информацией
                const result = await this.userManager.addModerator(
                    ctx.from.id,
                    targetUserId,
                    targetUserInfo.username,
                    targetUserInfo.first_name,
                    targetUserInfo.last_name
                );

                // Отправляем сообщение администратору
                let adminMessage = `
✅ <b>Модератор добавлен!</b>

Пользователь ${targetUserInfo.first_name} (@${targetUserInfo.username || 'без username'}) успешно добавлен как модератор.
                `;

                if (result.updated) {
                    adminMessage = `
✅ <b>Роль обновлена!</b>

Пользователь ${targetUserInfo.first_name} (@${targetUserInfo.username || 'без username'}) теперь модератор.
                `;
                }

                await ctx.reply(adminMessage, { parse_mode: 'HTML' });

                // Отправляем сообщение новому модератору
                try {
                    await this.bot.telegram.sendMessage(targetUserId, `
🎉 <b>Поздравляем!</b>

Вы были добавлены как модератор в бот.
Теперь у вас есть доступ ко всем функциям бота!

Используйте /start для начала работы.
                    `, { parse_mode: 'HTML' });
                } catch (sendError) {
                    await ctx.reply(`
⚠️ <b>Модератор добавлен, но уведомление не отправлено</b>

Пользователь ${targetUserInfo.first_name} заблокировал бота или имеет ограничения.
                    `, { parse_mode: 'HTML' });
                }

            } catch (error) {
                let errorMessage = '❌ Ошибка при добавлении модератора';
                
                if (error.message.includes('уже является')) {
                    errorMessage = `❌ ${error.message}`;
                } else if (error.message.includes('не является администратором')) {
                    errorMessage = '🚫 У вас нет прав для добавления модераторов';
                }
                
                await ctx.reply(errorMessage);
                console.error('Ошибка добавления модератора:', error);
            }
        });

        // Команда /removeModer (только для админов)
        this.bot.command('removeModer', async (ctx) => {
            if (!ctx.userAccess) return;
            
            const userInfo = await this.userManager.getUserInfo(ctx.from.id);
            if (!userInfo || userInfo.role !== 'admin') {
                await ctx.reply('🚫 У вас нет прав администратора');
                return;
            }

            const messageText = ctx.message.text;
            const parts = messageText.split(' ');
            
            if (parts.length < 2) {
                await ctx.reply(`
❌ <b>Неверный формат команды</b>

Использование: /removeModer [ID_пользователя]

Пример: /removeModer 123456789
                `, { parse_mode: 'HTML' });
                return;
            }

            const targetUserId = parseInt(parts[1]);
            if (isNaN(targetUserId)) {
                await ctx.reply('❌ ID пользователя должен быть числом');
                return;
            }

            try {
                // Получаем информацию о пользователе
                const targetUserInfo = await this.userManager.getUserInfo(targetUserId);
                if (!targetUserInfo) {
                    await ctx.reply('❌ Пользователь не найден в системе');
                    return;
                }

                if (targetUserInfo.role !== 'moderator') {
                    await ctx.reply('❌ Пользователь не является модератором');
                    return;
                }

                // Удаляем модератора (меняем роль на user)
                const result = await this.userManager.removeModerator(ctx.from.id, targetUserId);

                if (result.success) {
                    await ctx.reply(`
✅ <b>Модератор удален!</b>

Пользователь ${targetUserInfo.first_name} больше не является модератором.
                    `, { parse_mode: 'HTML' });

                    // Уведомляем пользователя
                    try {
                        await this.bot.telegram.sendMessage(targetUserId, `
📢 <b>Уведомление</b>

Ваша роль модератора была отозвана.
Теперь у вас обычные права пользователя.
                        `, { parse_mode: 'HTML' });
                    } catch (sendError) {
                        console.log('⚠️ Не удалось отправить уведомление пользователю');
                    }
                } else {
                    await ctx.reply(`❌ ${result.error}`);
                }

            } catch (error) {
                await ctx.reply('❌ Ошибка при удалении модератора');
                console.error('Ошибка удаления модератора:', error);
            }
        });

        // Команда /users (только для админов)
        this.bot.command('users', async (ctx) => {
            if (!ctx.userAccess) return;
            
            const userInfo = await this.userManager.getUserInfo(ctx.from.id);
            if (!userInfo || userInfo.role !== 'admin') {
                await ctx.reply('🚫 У вас нет прав администратора');
                return;
            }

            try {
                const admins = await this.userManager.getUsersByRole('admin');
                const moderators = await this.userManager.getUsersByRole('moderator');
                const users = await this.userManager.getUsersByRole('user');

                let usersText = `👥 <b>Список пользователей:</b>\n\n`;

                // Добавляем администраторов
                if (admins.length > 0) {
                    usersText += `👑 <b>Администраторы (${admins.length}):</b>\n`;
                    usersText += admins.map(u => `• ${u.first_name || 'Неизвестно'} (ID: ${u.user_id})`).join('\n') + '\n\n';
                }

                // Добавляем модераторов только если они есть
                if (moderators.length > 0) {
                    usersText += `🛡️ <b>Модераторы (${moderators.length}):</b>\n`;
                    usersText += moderators.map(u => `• ${u.first_name || 'Неизвестно'} (ID: ${u.user_id})`).join('\n') + '\n\n';
                }

                // Добавляем пользователей только если они есть
                if (users.length > 0) {
                    usersText += `👤 <b>Пользователи (${users.length}):</b>\n`;
                    usersText += users.slice(0, 10).map(u => `• ${u.first_name || 'Неизвестно'} (ID: ${u.user_id})`).join('\n');
                    if (users.length > 10) {
                        usersText += `\n... и еще ${users.length - 10} пользователей`;
                    }
                }

                // Если нет пользователей вообще
                if (admins.length === 0 && moderators.length === 0 && users.length === 0) {
                    usersText = '👥 <b>Список пользователей пуст</b>';
                }

                await ctx.reply(usersText, { parse_mode: 'HTML' });
            } catch (error) {
                await ctx.reply('❌ Ошибка получения списка пользователей');
            }
        });

        // Обработчик текстовых сообщений (только для пользователей с доступом)
        this.bot.on('text', async (ctx) => {
            if (!ctx.userAccess) return;
            
            const userInfo = await this.userManager.getUserInfo(ctx.from.id);
            const role = userInfo ? userInfo.role : 'unknown';
            
            await ctx.reply(`
👋 Привет, ${ctx.from.first_name}!

Ваша роль: ${this.userManager.getRoleEmoji(role)} ${role}
Время: ${new Date().toLocaleString('ru-RU')}

Используйте /help для списка команд.
            `);
        });

        // Обработчик ошибок
        this.bot.catch((err, ctx) => {
            console.error('❌ Ошибка в боте:', err);
            ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
        });
    }

    /**
     * Запуск бота
     */
    async start() {
        try {
            await this.bot.launch();
            
            // Graceful stop для различных сигналов
            process.once('SIGINT', () => this.stop('SIGINT'));
            process.once('SIGTERM', () => this.stop('SIGTERM'));
            process.once('SIGUSR2', () => this.stop('SIGUSR2')); // nodemon restart
            
            // Обработка необработанных ошибок
            process.on('unhandledRejection', (reason, promise) => {
                console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
            });
            
            process.on('uncaughtException', (error) => {
                console.error('❌ Uncaught Exception:', error);
                this.stop('UNCAUGHT_EXCEPTION');
            });
        } catch (error) {
            console.error('❌ Ошибка запуска бота:', error);
            throw error;
        }
    }

    /**
     * Остановка бота
     */
    async stop(signal) {
        try {
            // Останавливаем бота
            this.bot.stop(signal);
            
            // Закрываем соединение с базой данных
            await this.userManager.close();
            
            // Для nodemon не выходим из процесса
            if (signal === 'SIGUSR2') {
                return;
            }
            
            // Для других сигналов завершаем процесс
            process.exit(0);
        } catch (error) {
            console.error('❌ Ошибка при остановке бота:', error);
            process.exit(1);
        }
    }
}

module.exports = TelegramBot;

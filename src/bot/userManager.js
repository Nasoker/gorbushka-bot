const Database = require('../database/database');

/**
 * Класс для управления пользователями и ролями
 */
class UserManager {
    constructor(database = null) {
        this.database = database || new Database('./data/bot.db');
        this.admins = [];
    }

    /**
     * Инициализация менеджера пользователей
     */
    async init() {
        // Инициализируем базу данных только если она не была передана извне
        if (!this.database || !this.database.db) {
            await this.database.init();
        }
    }

    /**
     * Загрузка администраторов из JSON файла
     */
    async loadAdmins(adminsConfig) {
        try {
            this.admins = adminsConfig.admins || [];
            
            // Добавляем админов в базу данных только если их там нет
            for (const admin of this.admins) {
                const existingAdmin = await this.database.getUser(admin.user_id);
                if (!existingAdmin) {
                    await this.database.addUser(
                        admin.user_id,
                        admin.username,
                        admin.first_name,
                        admin.last_name,
                        'admin'
                    );
                } else {
                    // Обновляем информацию об админе, если нужно
                    if (existingAdmin.role !== 'admin') {
                        await this.database.updateUserRole(admin.user_id, 'admin');
                    } 
                }
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки администраторов:', error);
            throw error;
        }
    }

    /**
     * Проверка, является ли пользователь администратором
     */
    isAdmin(userId) {
        return this.admins.some(admin => admin.user_id === userId);
    }

    /**
     * Проверка роли пользователя
     */
    async checkUserRole(userId) {
        const user = await this.database.getUser(userId);
        return user ? user.role : null;
    }

    /**
     * Получение информации о пользователе
     */
    async getUserInfo(userId) {
        const user = await this.database.getUser(userId);
        return user;
    }

    /**
     * Добавление нового пользователя
     */
    async addUser(userId, username, firstName, lastName, role = 'user') {
        try {
            await this.database.addUser(userId, username, firstName, lastName, role);
            return true;
        } catch (error) {
            console.error('❌ Ошибка добавления пользователя:', error);
            return false;
        }
    }

    /**
     * Добавление модератора администратором
     */
    async addModerator(adminUserId, targetUserId, targetUsername, targetFirstName, targetLastName) {
        try {
            // Проверяем, что пользователь, добавляющий модератора, является админом
            if (!this.isAdmin(adminUserId)) {
                throw new Error('Пользователь не является администратором');
            }

            // Проверяем, что целевой пользователь еще не существует
            const existingUser = await this.database.getUser(targetUserId);
            if (existingUser) {
                if (existingUser.role === 'moderator') {
                    throw new Error('Пользователь уже является модератором');
                } else if (existingUser.role === 'admin') {
                    throw new Error('Пользователь уже является администратором');
                } else {
                    // Обновляем роль существующего пользователя на модератора
                    await this.database.updateUserRole(targetUserId, 'moderator');
                    return { updated: true, user: existingUser };
                }
            }

            // Добавляем пользователя как модератора
            await this.database.addUser(
                targetUserId,
                targetUsername,
                targetFirstName,
                targetLastName,
                'moderator'
            );

            return { updated: false, user: null };
        } catch (error) {
            console.error('❌ Ошибка добавления модератора:', error);
            throw error;
        }
    }

    /**
     * Удаление модератора администратором
     */
    async removeModerator(adminUserId, targetUserId) {
        try {
            // Проверяем, что пользователь, удаляющий модератора, является админом
            if (!this.isAdmin(adminUserId)) {
                return { success: false, error: 'Пользователь не является администратором' };
            }

            // Получаем информацию о целевом пользователе
            const targetUser = await this.database.getUser(targetUserId);
            if (!targetUser) {
                return { success: false, error: 'Пользователь не найден в системе' };
            }

            if (targetUser.role !== 'moderator') {
                return { success: false, error: 'Пользователь не является модератором' };
            }

            // Меняем роль модератора на обычного пользователя
            await this.database.updateUserRole(targetUserId, 'user');

            return { success: true, user: targetUser };
        } catch (error) {
            console.error('❌ Ошибка удаления модератора:', error);
            return { success: false, error: 'Ошибка при удалении модератора' };
        }
    }

    /**
     * Проверка прав доступа пользователя
     */
    async hasAccess(userId) {
        const role = await this.checkUserRole(userId);
        return role === 'admin' || role === 'moderator';
    }

    /**
     * Обработка нового пользователя (первый вход)
     */
    async handleNewUser(ctx) {
        const userId = ctx.from.id;
        const username = ctx.from.username;
        const firstName = ctx.from.first_name;
        const lastName = ctx.from.last_name;

        // Проверяем, существует ли пользователь
        const existingUser = await this.database.getUser(userId);

        if (!existingUser) {
            // Новый пользователь - добавляем с ролью 'user'
            await this.addUser(userId, username, firstName, lastName, 'user');
            return false; // Нет доступа
        }

        // Проверяем права доступа
        return await this.hasAccess(userId);
    }

    /**
     * Получение статистики пользователей
     */
    async getStats() {
        return await this.database.getStats();
    }

    /**
     * Получение списка пользователей по роли
     */
    async getUsersByRole(role) {
        return await this.database.getUsersByRole(role);
    }

    /**
     * Обновление роли пользователя
     */
    async updateUserRole(userId, newRole) {
        try {
            await this.database.updateUserRole(userId, newRole);
            return true;
        } catch (error) {
            console.error('❌ Ошибка обновления роли:', error);
            return false;
        }
    }

    /**
     * Форматирование информации о пользователе для сообщения
     */
    formatUserInfo(user) {
        if (!user) return 'Пользователь не найден';

        return `
👤 <b>Информация о пользователе:</b>
🆔 ID: <code>${user.user_id}</code>
👤 Имя: ${user.first_name || 'Не указано'} ${user.last_name || ''}
📝 Username: @${user.username || 'Не указан'}
🔑 Роль: ${this.getRoleEmoji(user.role)} ${user.role}
📅 Создан: ${new Date(user.created_at).toLocaleDateString('ru-RU')}
        `.trim();
    }

    /**
     * Получение эмодзи для роли
     */
    getRoleEmoji(role) {
        const emojis = {
            'admin': '👑',
            'moderator': '🛡️',
            'user': '👤'
        };
        return emojis[role] || '❓';
    }

    /**
     * Закрытие соединения с базой данных
     */
    async close() {
        await this.database.close();
    }
}

module.exports = UserManager;

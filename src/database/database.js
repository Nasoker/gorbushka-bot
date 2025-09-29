const sqlite3 = require('sqlite3').verbose();
const path = require('path');

/**
 * Класс для работы с базой данных SQLite
 */
class Database {
    constructor(dbPath = './bot.db') {
        this.dbPath = dbPath;
        this.db = null;
    }

    /**
     * Инициализация базы данных
     */
    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Ошибка подключения к базе данных:', err.message);
                    reject(err);
                } else {
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    /**
     * Создание таблиц в базе данных
     */
    async createTables() {
        return new Promise((resolve, reject) => {
            const createUsersTable = `
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER UNIQUE NOT NULL,
                    username TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            const createTokensTable = `
                CREATE TABLE IF NOT EXISTS tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    service_name TEXT UNIQUE NOT NULL,
                    token TEXT NOT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            this.db.run(createUsersTable, (err) => {
                if (err) {
                    console.error('❌ Ошибка создания таблицы users:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Таблица users создана/проверена');
                    
                    // Создаем таблицу токенов
                    this.db.run(createTokensTable, (err) => {
                        if (err) {
                            console.error('❌ Ошибка создания таблицы tokens:', err.message);
                            reject(err);
                        } else {
                            console.log('✅ Таблица tokens создана/проверена');
                            resolve();
                        }
                    });
                }
            });
        });
    }

    /**
     * Добавление пользователя в базу данных
     */
    async addUser(userId, username = null, firstName = null, lastName = null, role = 'user') {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO users (user_id, username, first_name, last_name, role, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            
            this.db.run(sql, [userId, username, firstName, lastName, role], function(err) {
                if (err) {
                    console.error('❌ Ошибка добавления пользователя:', err.message);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    /**
     * Получение пользователя по ID
     */
    async getUser(userId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE user_id = ?';
            
            this.db.get(sql, [userId], (err, row) => {
                if (err) {
                    console.error('❌ Ошибка получения пользователя:', err.message);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Обновление роли пользователя
     */
    async updateUserRole(userId, newRole) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE users 
                SET role = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE user_id = ?
            `;
            
            this.db.run(sql, [newRole, userId], function(err) {
                if (err) {
                    console.error('❌ Ошибка обновления роли:', err.message);
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    /**
     * Получение всех пользователей с определенной ролью
     */
    async getUsersByRole(role) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE role = ?';
            
            this.db.all(sql, [role], (err, rows) => {
                if (err) {
                    console.error('❌ Ошибка получения пользователей по роли:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Проверка существования пользователя
     */
    async userExists(userId) {
        const user = await this.getUser(userId);
        return user !== undefined;
    }

    /**
     * Получение статистики пользователей
     */
    async getStats() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    role,
                    COUNT(*) as count
                FROM users 
                GROUP BY role
            `;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('❌ Ошибка получения статистики:', err.message);
                    reject(err);
                } else {
                    const stats = {
                        total: 0,
                        byRole: {}
                    };
                    
                    rows.forEach(row => {
                        stats.byRole[row.role] = row.count;
                        stats.total += row.count;
                    });
                    
                    resolve(stats);
                }
            });
        });
    }


    /**
     * Сохранение токена в базу данных
     */
    async saveToken(serviceName, token, expiresAt) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO tokens (service_name, token, expires_at, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `;
            
            this.db.run(sql, [serviceName, token, expiresAt], function(err) {
                if (err) {
                    console.error('❌ Ошибка сохранения токена:', err.message);
                    reject(err);
                } else {
                    console.log(`✅ Токен для сервиса ${serviceName} сохранен`);
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    /**
     * Получение токена из базы данных
     */
    async getToken(serviceName) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM tokens WHERE service_name = ?';
            
            this.db.get(sql, [serviceName], (err, row) => {
                if (err) {
                    console.error('❌ Ошибка получения токена:', err.message);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Удаление токена из базы данных
     */
    async deleteToken(serviceName) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM tokens WHERE service_name = ?';
            
            this.db.run(sql, [serviceName], function(err) {
                if (err) {
                    console.error('❌ Ошибка удаления токена:', err.message);
                    reject(err);
                } else {
                    console.log(`✅ Токен для сервиса ${serviceName} удален`);
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    /**
     * Очистка просроченных токенов
     */
    async cleanExpiredTokens() {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM tokens WHERE expires_at < CURRENT_TIMESTAMP';
            
            this.db.run(sql, [], function(err) {
                if (err) {
                    console.error('❌ Ошибка очистки просроченных токенов:', err.message);
                    reject(err);
                } else {
                    console.log(`✅ Удалено ${this.changes} просроченных токенов`);
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    /**
     * Закрытие соединения с базой данных
     */
    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Ошибка закрытия базы данных:', err.message);
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = Database;

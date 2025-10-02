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

            const createBrandsTable = `
                CREATE TABLE IF NOT EXISTS brands (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            const createProductsTable = `
                CREATE TABLE IF NOT EXISTS products (
                    id_product INTEGER PRIMARY KEY,
                    id_brand INTEGER NOT NULL,
                    subcategory TEXT,
                    chars_group TEXT,
                    total_qty TEXT,
                    price INTEGER,
                    country_abbr TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (id_brand) REFERENCES brands (id)
                )
            `;

            const createChangesTable = `
                CREATE TABLE IF NOT EXISTS price_changes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_product INTEGER NOT NULL,
                    id_brand INTEGER NOT NULL,
                    change_type TEXT NOT NULL CHECK (change_type IN ('price_increase', 'price_decrease', 'product_removed', 'product_added', 'quantity_changed')),
                    old_value TEXT,
                    new_value TEXT,
                    old_price INTEGER,
                    new_price INTEGER,
                    old_quantity TEXT,
                    new_quantity TEXT,
                    product_name TEXT,
                    brand_name TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (id_product) REFERENCES products (id_product),
                    FOREIGN KEY (id_brand) REFERENCES brands (id)
                )
            `;

            this.db.run(createUsersTable, (err) => {
                if (err) {
                    console.error('❌ Ошибка создания таблицы users:', err.message);
                    reject(err);
                } else {
                    
                    // Создаем таблицу токенов
                    this.db.run(createTokensTable, (err) => {
                        if (err) {
                            console.error('❌ Ошибка создания таблицы tokens:', err.message);
                            reject(err);
                        } else {
                            // Создаем таблицу брендов
                            this.db.run(createBrandsTable, (err) => {
                                if (err) {
                                    console.error('❌ Ошибка создания таблицы brands:', err.message);
                                    reject(err);
                                } else {
                                    // Создаем таблицу товаров
                                    this.db.run(createProductsTable, (err) => {
                                        if (err) {
                                            console.error('❌ Ошибка создания таблицы products:', err.message);
                                            reject(err);
                                        } else {
                                            // Создаем таблицу изменений
                                            this.db.run(createChangesTable, (err) => {
                                                if (err) {
                                                    console.error('❌ Ошибка создания таблицы price_changes:', err.message);
                                                    reject(err);
                                                } else {
                            resolve();
                                                }
                                            });
                                        }
                                    });
                                }
                            });
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
            // Используем timestamp в миллисекундах для сравнения
            const currentTimestamp = Date.now();
            const sql = 'DELETE FROM tokens WHERE expires_at < ?';
            
            this.db.run(sql, [currentTimestamp], function(err) {
                if (err) {
                    console.error('❌ Ошибка очистки просроченных токенов:', err.message);
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    /**
     * Сохранение брендов в базу данных
     */
    async saveBrands(brands) {
        return new Promise((resolve, reject) => {
            // Сначала очищаем старые бренды
            const deleteSql = 'DELETE FROM brands';
            
            this.db.run(deleteSql, [], (err) => {
                if (err) {
                    console.error('❌ Ошибка очистки брендов:', err.message);
                    reject(err);
                } else {
                    // Добавляем новые бренды
                    const insertSql = 'INSERT INTO brands (id, name) VALUES (?, ?)';
                    let completed = 0;
                    let hasError = false;
                    
                    if (brands.length === 0) {
                        resolve({ changes: 0 });
                        return;
                    }
                    
                    brands.forEach((brand) => {
                        this.db.run(insertSql, [brand.id, brand.name], (err) => {
                            if (err && !hasError) {
                                hasError = true;
                                console.error('❌ Ошибка сохранения бренда:', err.message);
                                reject(err);
                            } else {
                                completed++;
                                if (completed === brands.length && !hasError) {
                                    resolve({ changes: brands.length });
                                }
                            }
                        });
                    });
                }
            });
        });
    }

    /**
     * Получение всех брендов
     */
    async getBrands() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM brands ORDER BY name';
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('❌ Ошибка получения брендов:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Получение бренда по ID
     */
    async getBrandById(brandId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM brands WHERE id = ?';
            
            this.db.get(sql, [brandId], (err, row) => {
                if (err) {
                    console.error('❌ Ошибка получения бренда:', err.message);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Сохранение товаров в базу данных
     */
    async saveProducts(products, brandId) {
        return new Promise((resolve, reject) => {
            // Сначала очищаем старые товары для этого бренда
            const deleteSql = 'DELETE FROM products WHERE id_brand = ?';
            
            this.db.run(deleteSql, [brandId], (err) => {
                if (err) {
                    console.error('❌ Ошибка очистки товаров:', err.message);
                    reject(err);
                } else {
                    // Добавляем новые товары
                    const insertSql = 'INSERT OR REPLACE INTO products (id_product, id_brand, subcategory, chars_group, total_qty, price, country_abbr) VALUES (?, ?, ?, ?, ?, ?, ?)';
                    let completed = 0;
                    let hasError = false;
                    
                    if (products.length === 0) {
                        resolve({ changes: 0 });
                        return;
                    }
                    
                    products.forEach((product) => {
                        this.db.run(insertSql, [
                            product.id_product,
                            brandId,
                            product.subcategory,
                            product.chars_group,
                            product.total_qty,
                            product.price,
                            product.country_abbr
                        ], (err) => {
                            if (err && !hasError) {
                                hasError = true;
                                console.error('❌ Ошибка сохранения товара:', err.message);
                                console.error('❌ Данные товара:', product);
                                reject(err);
                            } else {
                                completed++;
                                if (completed === products.length && !hasError) {
                                    resolve({ changes: products.length });
                                }
                            }
                        });
                    });
                }
            });
        });
    }

    /**
     * Получение товаров по бренду
     */
    async getProductsByBrand(brandId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM products WHERE id_brand = ? ORDER BY price';
            
            this.db.all(sql, [brandId], (err, rows) => {
                if (err) {
                    console.error('❌ Ошибка получения товаров:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Получение всех товаров
     */
    async getAllProducts() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT p.*, b.name as brand_name 
                FROM products p 
                JOIN brands b ON p.id_brand = b.id 
                ORDER BY b.name, p.price
            `;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('❌ Ошибка получения всех товаров:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Сохранение изменения цены
     */
    async savePriceChange(changeData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO price_changes (
                    id_product, id_brand, change_type, old_value, new_value,
                    old_price, new_price, old_quantity, new_quantity,
                    product_name, brand_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(sql, [
                changeData.id_product,
                changeData.id_brand,
                changeData.change_type,
                changeData.old_value,
                changeData.new_value,
                changeData.old_price,
                changeData.new_price,
                changeData.old_quantity,
                changeData.new_quantity,
                changeData.product_name,
                changeData.brand_name
            ], function(err) {
                if (err) {
                    console.error('❌ Ошибка сохранения изменения:', err.message);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    /**
     * Получение изменений за последние N часов
     */
    async getRecentChanges(hours = 24) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM price_changes 
                WHERE created_at >= datetime('now', '-${hours} hours')
                ORDER BY created_at DESC
            `;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('❌ Ошибка получения изменений:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Получение всех администраторов и модераторов
     */
    async getAdminsAndModerators() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE role IN ("admin", "moderator")';
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('❌ Ошибка получения админов и модераторов:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Получение только модераторов
     */
    async getModerators() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE role = "moderator"';
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('❌ Ошибка получения модераторов:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Очистка таблицы изменений цен
     */
    async clearPriceChanges() {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM price_changes';
            
            this.db.run(sql, [], function(err) {
                if (err) {
                    console.error('❌ Ошибка очистки изменений цен:', err.message);
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    /**
     * Очистка старых изменений (старше N дней)
     */
    async clearOldPriceChanges(days = 7) {
        return new Promise((resolve, reject) => {
            const sql = `DELETE FROM price_changes WHERE created_at < datetime('now', '-${days} days')`;
            
            this.db.run(sql, [], function(err) {
                if (err) {
                    console.error('❌ Ошибка очистки старых изменений:', err.message);
                    reject(err);
                } else {
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

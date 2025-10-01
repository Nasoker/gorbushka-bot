require('dotenv').config();
const TelegramBot = require('./bot/bot');
const Database = require('./database/database');
const AuthService = require('./services/authService');
const PriceMonitorService = require('./services/priceMonitorService');
const fs = require('fs');
const path = require('path');

/**
 * Главный файл для запуска Telegram бота
 */
class BotLauncher {
    constructor() {
        this.bot = null;
        this.database = null;
        this.authService = null;
        this.priceMonitor = null;
    }

    /**
     * Загрузка конфигурации администраторов
     */
    loadAdminsConfig() {
        try {
            const configPath = path.join(__dirname, '..', 'config', 'admins.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            
            return config;
        } catch (error) {
            console.error('❌ Ошибка загрузки конфигурации администраторов:', error.message);
            throw error;
        }
    }

    /**
     * Проверка переменных окружения
     */
    checkEnvironment() {
        const token = process.env.BOT_TOKEN;
        
        if (!token) {
            console.error('❌ BOT_TOKEN не найден в переменных окружения');
            process.exit(1);
        }

        return token;
    }

    /**
     * Инициализация базы данных
     */
    async initDatabase() {
        try {
            this.database = new Database('./data/bot.db');
            await this.database.init();
            
            // Очищаем просроченные токены при старте
            await this.database.cleanExpiredTokens();
        } catch (error) {
            console.error('❌ Ошибка инициализации базы данных:', error);
            throw error;
        }
    }

    /**
     * Первоначальная загрузка прайс-листов (только при первом запуске)
     */
    async initialLoadPricelists() {
        try {
            // Проверяем, есть ли уже товары в базе данных
            const existingProducts = await this.database.getAllProducts();
            
            if (existingProducts && existingProducts.length > 0) {
                return;
            }

            const brandsResult = await this.authService.fetchBrands();
            
            if (brandsResult.success && brandsResult.brands) {
                // Сохраняем бренды в базу данных
                await this.database.saveBrands(brandsResult.brands);

                for (const brand of brandsResult.brands) {
                    try {
                        const pricelistResult = await this.authService.fetchPricelist(brand.id);
                        
                        if (pricelistResult.success && pricelistResult.products) {
                            // Сохраняем товары в базу данных
                            await this.database.saveProducts(pricelistResult.products, brand.id);
                        } else {
                            console.log(`⚠️ Не удалось загрузить товары для бренда ${brand.name}:`, pricelistResult.error);
                        }
                        
                        // Небольшая пауза между запросами, чтобы не перегружать API
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (error) {
                        console.error(`❌ Ошибка загрузки товаров для бренда ${brand.name}:`, error.message);
                    }
                }
            } else {
                console.log('⚠️ Не удалось загрузить бренды:', brandsResult.error);
            }
        } catch (error) {
            console.error('❌ Ошибка первоначальной загрузки прайс-листов:', error.message);
        }
    }

    /**
     * Инициализация авторизации
     */
    async initAuth() {
        try {
            this.authService = new AuthService(this.database);
            
            // Инициализируем сервис авторизации
            await this.authService.init();
            
            // Проверяем, есть ли уже действительный токен
            if (!this.authService.isTokenValid()) {
                await this.authService.loginToFimex();
            }

            // Загружаем прайс-листы только если токен валидный (только при первом запуске)
            const isValid = await this.authService.isTokenValidWithDBCheck();
            if (isValid) {
                await this.initialLoadPricelists();
            } else {
                console.log('⚠️ Токен недействителен, пропускаем загрузку прайс-листов');
            }
        } catch (error) {
            console.error('❌ Ошибка инициализации авторизации:', error);
            // Не останавливаем бота из-за ошибки авторизации
        }
    }

    /**
     * Инициализация и запуск бота
     */
    async start() {
        try {
            // Проверяем переменные окружения
            const token = this.checkEnvironment();
            
            // Инициализируем базу данных
            await this.initDatabase();
            
            // Инициализируем авторизацию
            await this.initAuth();
            
            // Создаем экземпляр бота
            this.bot = new TelegramBot(token, this.database);
            
            // Загружаем конфигурацию администраторов
            const adminsConfig = this.loadAdminsConfig();
            
            // Инициализируем бота
            await this.bot.init();
            
            // Загружаем администраторов
            await this.bot.loadAdmins(adminsConfig);
            
            // Инициализируем мониторинг цен
            this.priceMonitor = new PriceMonitorService(this.database, this.authService, this.bot.bot);
            this.priceMonitor.start();
            
            // Запускаем бота
            await this.bot.start();
            
        } catch (error) {
            console.error('❌ Критическая ошибка при запуске бота:', error);
            process.exit(1);
        }
    }
}

// Запуск бота
const launcher = new BotLauncher();
launcher.start().catch(error => {
    console.error('❌ Неожиданная ошибка:', error);
    process.exit(1);
});

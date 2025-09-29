require('dotenv').config();
const TelegramBot = require('./bot/bot');
const Database = require('./database/database');
const AuthService = require('./services/authService');
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
            console.log('🗄️ Инициализация базы данных...');
            this.database = new Database('./data/bot.db');
            await this.database.init();
            
            // Очищаем просроченные токены при старте
            await this.database.cleanExpiredTokens();
            
            console.log('✅ База данных инициализирована');
        } catch (error) {
            console.error('❌ Ошибка инициализации базы данных:', error);
            throw error;
        }
    }

    /**
     * Инициализация авторизации
     */
    async initAuth() {
        try {
            console.log('🔐 Инициализация авторизации на fimex.ae...');
            this.authService = new AuthService(this.database);
            
            // Инициализируем сервис авторизации
            await this.authService.init();
            
            // Выполняем авторизацию
            const authResult = await this.authService.loginToFimex();
            
            if (authResult.success) {
                console.log('✅ Авторизация на fimex.ae успешна!');
            } else {
                console.log('⚠️ Ошибка авторизации, но бот продолжает работать');
            }
            
            console.log('✅ Авторизация инициализирована');
        } catch (error) {
            console.error('❌ Ошибка инициализации авторизации:', error);
            // Не останавливаем бота из-за ошибки авторизации
            console.log('⚠️ Бот продолжает работу без авторизации');
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

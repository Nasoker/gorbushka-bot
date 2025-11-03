const axios = require('axios');

/**
 * Клиент для взаимодействия с API gorbushka-answering-bot
 */
class AnsweringBotApiClient {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'http://localhost:3001';
        this.timeout = config.timeout || 5000;
        this.isConnected = false;
        
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Проверка соединения с answering-bot
     */
    async checkConnection() {
        const result = await this.ping();
        this.isConnected = result.success;
        return this.isConnected;
    }

    /**
     * Получение состояния обработки сообщений
     * @returns {Promise<Object>} { success: boolean, enabled: boolean, lastChanged: string }
     */
    async getProcessingState() {
        // Проверяем соединение, если не подключены
        if (!this.isConnected) {
            await this.checkConnection();
        }

        if (!this.isConnected) {
            console.log('⚠️ Answering-bot недоступен');
            return { success: false, error: 'Bot not connected' };
        }

        try {
            const response = await this.client.get('/api/processing/state');
            
            return {
                success: true,
                enabled: response.data.enabled,
                lastChanged: response.data.lastChanged,
                stats: response.data.stats
            };
        } catch (error) {
            console.error('❌ Ошибка получения состояния обработки:', error.message);
            this.isConnected = false; // Помечаем как отключенные
            return {
                success: false,
                enabled: false,
                error: error.message
            };
        }
    }

    /**
     * Включение/выключение обработки сообщений
     * @param {boolean} enabled - true для включения, false для выключения
     * @returns {Promise<Object>} { success: boolean, enabled: boolean, message: string }
     */
    async setProcessing(enabled) {
        // Проверяем соединение, если не подключены
        if (!this.isConnected) {
            await this.checkConnection();
        }

        if (!this.isConnected) {
            console.log('⚠️ Answering-bot недоступен, невозможно изменить состояние');
            return { success: false, error: 'Bot not connected' };
        }

        try {
            const response = await this.client.post('/api/processing/toggle', {
                enabled,
                timestamp: Date.now()
            });
            
            console.log(`${enabled ? '🟢' : '🔴'} Обработка сообщений ${enabled ? 'включена' : 'выключена'}`);
            
            return {
                success: true,
                enabled: response.data.enabled,
                message: response.data.message
            };
        } catch (error) {
            console.error('❌ Ошибка изменения состояния обработки:', error.message);
            this.isConnected = false; // Помечаем как отключенные
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Проверка доступности answering-bot
     * @returns {Promise<Object>} { success: boolean }
     */
    async ping() {
        try {
            const response = await this.client.get('/api/ping');
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = AnsweringBotApiClient;
const axios = require('axios');
const Database = require('../database/database');
require('dotenv').config();

/**
 * Сервис для авторизации на fimex.ae
 */
class AuthService {
    constructor(database = null) {
        this.baseUrl = 'https://fimex.ae';
        this.token = null;
        this.tokenExpiry = null;
        this.login = process.env.FIMEX_LOGIN;
        this.password = process.env.FIMEX_PASSWORD;
        this.database = database;
        this.serviceName = 'fimex_ae';
        
        if (!this.login || !this.password) {
            throw new Error('FIMEX_LOGIN и FIMEX_PASSWORD должны быть установлены в переменных окружения');
        }
    }

    /**
     * Инициализация сервиса
     */
    async init() {
        if (this.database) {
            // Загружаем токен из базы данных при инициализации
            await this.loadTokenFromDatabase();
        }
    }

    /**
     * Загрузка токена из базы данных
     */
    async loadTokenFromDatabase() {
        if (!this.database) return;

        try {
            const tokenData = await this.database.getToken(this.serviceName);
            if (tokenData && tokenData.expires_at) {
                // Проверяем, является ли expires_at timestamp в миллисекундах
                let expiryDate;
                if (typeof tokenData.expires_at === 'number') {
                    // Если это timestamp в миллисекундах
                    expiryDate = new Date(tokenData.expires_at);
                } else if (typeof tokenData.expires_at === 'string') {
                    // Если это строка, пытаемся распарсить
                    expiryDate = new Date(tokenData.expires_at);
                } else {
                    // Если это уже объект Date
                    expiryDate = tokenData.expires_at;
                }
                
                
                if (expiryDate > new Date()) {
                    this.token = tokenData.token;
                    this.tokenExpiry = expiryDate;
                } else {
                    // Удаляем просроченный токен
                    await this.database.deleteToken(this.serviceName);
                }
            } else {
                console.error('ℹ️ Токен в базе данных не найден');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки токена из базы данных:', error.message);
        }
    }

    /**
     * Сохранение токена в базу данных
     */
    async saveTokenToDatabase(token, expiryDate) {
        if (!this.database) return;

        try {
            await this.database.saveToken(this.serviceName, token, expiryDate);
        } catch (error) {
            console.error('❌ Ошибка сохранения токена в базу данных:', error.message);
        }
    }

    /**
     * Авторизация на сервере fimex.ae
     */
    async loginToFimex() {
        try {
            // Проверяем, есть ли уже действительный токен в базе данных
            if (this.database) {
                const existingToken = await this.database.getToken(this.serviceName);
                if (existingToken && existingToken.expires_at) {
                    let expiryDate;
                    if (typeof existingToken.expires_at === 'number') {
                        expiryDate = new Date(existingToken.expires_at);
                    } else if (typeof existingToken.expires_at === 'string') {
                        expiryDate = new Date(existingToken.expires_at);
                    } else {
                        expiryDate = existingToken.expires_at;
                    }
                    
                    if (expiryDate > new Date()) {
                        this.token = existingToken.token;
                        this.tokenExpiry = expiryDate;
                        return {
                            success: true,
                            token: this.token,
                            expiry: this.tokenExpiry
                        };
                    } else {
                        await this.database.deleteToken(this.serviceName);
                    }
                }
            }

            const loginResponse = await axios.post(`https://fimex.ae/app-api/v1/auth/login?login=${this.login}&password=${this.password}`, {}, {
                headers: {
                    'Host': 'fimex.ae',
                    'Content-Type': 'application/json',
                    'Content-Length': '0',
                    'Connection': 'keep-alive',
                    'baggage': 'sentry-environment=production,sentry-public_key=5d524d2af0ace1e4558b32f80b22629a,sentry-release=fzco.fimex.mabetex%401.40%2B1,sentry-trace_id=25e0d90ab94c4f288cd38b32abfa88c2',
                    'Accept': 'application/json',
                    'User-Agent': 'Mabetex3/1.40 (fzco.fimex.mabetex; build:1; iOS 18.7.0) Alamofire/5.9.1',
                    'X-APP-ACCESS': 'tqKQty2CkiZlw1c0YLF1wqF3oAFOlhZa',
                    'Accept-Encoding': 'br;q=1.0, gzip;q=0.9, deflate;q=0.8',
                    'Accept-Language': 'ru;q=1.0'
                },
                timeout: 15000,
                maxRedirects: 5,
                validateStatus: function (status) {
                    return status >= 200 && status < 300;
                }
            });

            if (loginResponse.data && loginResponse.data.token) {
                this.token = loginResponse.data.token;
                
                // Устанавливаем время истечения токена (обычно токены живут 24 часа)
                this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
                
                await this.database.saveToken(this.serviceName, this.token, this.tokenExpiry);
                
                return {
                    success: true,
                    token: this.token,
                    expiry: this.tokenExpiry
                };
            } else {
                console.error('❌ Не удалось получить токен');
            }
        } catch (error) {            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Проверка действительности токена (синхронная, только память)
     */
    isTokenValid() {
        return this.token && this.tokenExpiry && new Date() < this.tokenExpiry;
    }

    /**
     * Проверка действительности токена (асинхронная, с проверкой БД)
     */
    async isTokenValidWithDBCheck() {
        // Сначала проверяем память
        if (this.isTokenValid()) {
            return true;
        }

        // Если в памяти токена нет или он просрочен, проверяем БД
        if (this.database) {
            try {
                const tokenData = await this.database.getToken(this.serviceName);
                if (tokenData && tokenData.expires_at) {
                    let expiryDate;
                    if (typeof tokenData.expires_at === 'number') {
                        expiryDate = new Date(tokenData.expires_at);
                    } else if (typeof tokenData.expires_at === 'string') {
                        expiryDate = new Date(tokenData.expires_at);
                    } else {
                        expiryDate = tokenData.expires_at;
                    }
                    
                    if (expiryDate > new Date()) {
                        // Обновляем данные в памяти
                        this.token = tokenData.token;
                        this.tokenExpiry = expiryDate;
                        console.log('✅ Токен перезагружен из БД и действителен');
                        return true;
                    } else {
                        console.log('⚠️ Токен в БД просрочен');
                        await this.database.deleteToken(this.serviceName);
                        return false;
                    }
                }
            } catch (error) {
                console.error('❌ Ошибка проверки токена в БД:', error.message);
            }
        }

        return false;
    }

    /**
     * Получение токена (с авторизацией если нужно)
     */
    async getToken() {
        // Сначала проверяем, есть ли токен в памяти
        if (this.isTokenValid()) {
            return this.token;
        }

        // Если токена нет в памяти, проверяем базу данных
        if (this.database) {
            try {
                const tokenData = await this.database.getToken(this.serviceName);
                if (tokenData && tokenData.expires_at) {
                    // Проверяем, является ли expires_at timestamp в миллисекундах
                    let expiryDate;
                    if (typeof tokenData.expires_at === 'number') {
                        // Если это timestamp в миллисекундах
                        expiryDate = new Date(tokenData.expires_at);
                    } else if (typeof tokenData.expires_at === 'string') {
                        // Если это строка, пытаемся распарсить
                        expiryDate = new Date(tokenData.expires_at);
                    } else {
                        // Если это уже объект Date
                        expiryDate = tokenData.expires_at;
                    }
                    
                    if (expiryDate > new Date()) {
                        this.token = tokenData.token;
                        this.tokenExpiry = expiryDate;
                        return this.token;
                    } else {
                        await this.database.deleteToken(this.serviceName);
                    }
                }
            } catch (error) {
                console.error('❌ Ошибка проверки токена в базе данных:', error.message);
            }
        }
        const authResult = await this.loginToFimex();
        if (!authResult.success) {
            throw new Error(`Не удалось получить токен: ${authResult.error}`);
        }
        return this.token;
    }

    /**
     * Выполнение авторизованного запроса
     */
    async makeAuthenticatedRequest(method, endpoint, data = null) {
        try {
            const token = await this.getToken();
            
            const config = {
                method,
                url: `${this.baseUrl}${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error(`❌ Ошибка запроса к ${endpoint}:`, error.message);
            
            // Если ошибка авторизации, пробуем переавторизоваться
            if (error.response && error.response.status === 401) {
                console.log('🔄 Получена ошибка 401, пробуем переавторизоваться...');
                this.token = null;
                this.tokenExpiry = null;
                
                const token = await this.getToken();
                // Повторяем запрос с новым токеном
                const retryConfig = {
                    method,
                    url: `${this.baseUrl}${endpoint}`,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 10000
                };

                if (data) {
                    retryConfig.data = data;
                }

                try {
                    const retryResponse = await axios(retryConfig);
                    return {
                        success: true,
                        data: retryResponse.data
                    };
                } catch (retryError) {
                    console.error(`❌ Повторный запрос к ${endpoint} также неудачен:`, retryError.message);
                    return {
                        success: false,
                        error: retryError.message
                    };
                }
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Получение статуса токена
     */
    getTokenStatus() {
        return {
            hasToken: !!this.token,
            isValid: this.isTokenValid(),
            expiry: this.tokenExpiry,
            timeLeft: this.tokenExpiry ? Math.max(0, this.tokenExpiry - new Date()) : 0
        };
    }

    /**
     * Получение списка брендов
     */
    async fetchBrands() {
        try {
            const result = await this.makeAuthenticatedRequest('GET', '/app-api/v1/catalog/fetch-brands');
            
            if (result.success && result.data && result.data.data) {
                console.log(`✅ Получено ${result.data.data.length} брендов`);
                return {
                    success: true,
                    brands: result.data.data
                };
            } else {
                console.log('⚠️ Бренды не найдены в ответе');
                return {
                    success: false,
                    error: 'Бренды не найдены в ответе'
                };
            }
        } catch (error) {
            console.error('❌ Ошибка получения брендов:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Получение прайс-листа бренда
     */
    async fetchPricelist(brandId) {
        try {
            const result = await this.makeAuthenticatedRequest('GET', `/app-api/v1/catalog/fetch-pricelist?id_brand=${brandId}`);
            
            if (result.success && result.data && result.data.data) {
                return {
                    success: true,
                    products: result.data.data
                };
            } else if (result.success && result.data && Array.isArray(result.data)) {
                // Если данные находятся прямо в result.data
                return {
                    success: true,
                    products: result.data
                };
            } else {
                return {
                    success: false,
                    error: 'Товары не найдены в ответе'
                };
            }
        } catch (error) {
            console.error(`❌ Ошибка получения прайс-листа для бренда ${brandId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = AuthService;

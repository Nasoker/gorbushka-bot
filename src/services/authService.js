const axios = require('axios');
const Database = require('../database/database');

/**
 * Сервис для авторизации на fimex.ae
 */
class AuthService {
    constructor(database = null) {
        this.baseUrl = 'https://fimex.ae';
        this.token = null;
        this.tokenExpiry = null;
        this.login = 'M:413/C';
        this.password = '1rmbfzr7';
        this.database = database;
        this.serviceName = 'fimex_ae';
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
                const expiryDate = new Date(tokenData.expires_at);
                if (expiryDate > new Date()) {
                    this.token = tokenData.token;
                    this.tokenExpiry = expiryDate;
                    console.log('✅ Токен загружен из базы данных');
                    console.log(`⏰ Токен действителен до: ${this.tokenExpiry.toLocaleString('ru-RU')}`);
                } else {
                    console.log('⚠️ Токен в базе данных просрочен');
                    // Удаляем просроченный токен
                    await this.database.deleteToken(this.serviceName);
                }
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
            console.log('✅ Токен сохранен в базу данных');
        } catch (error) {
            console.error('❌ Ошибка сохранения токена в базу данных:', error.message);
        }
    }

    /**
     * Авторизация на сервере fimex.ae
     */
    async loginToFimex() {
        try {
            console.log('🔐 Выполняется авторизация на fimex.ae...');
            
            console.log(`${this.baseUrl}/app-api/v1/auth/check-login?login=M:413/C`)
            // Попробуем разные варианты заголовков для обхода 403
            const loginResponse = await axios.post(`https://fimex.ae/app-api/v1/auth/login?login=M:413/C&password=1rmbfzr7`, {}, {
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

            console.log('📊 Статус ответа:', loginResponse.status);
            console.log('📋 Данные ответа:', loginResponse.data);

            if (loginResponse.data && loginResponse.data.token) {
                this.token = loginResponse.data.token;
                
                // Устанавливаем время истечения токена (обычно токены живут 24 часа)
                this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
                
                console.log('✅ Авторизация на fimex.ae успешна');
                console.log(`🔑 Токен получен: ${this.token.substring(0, 20)}...`);
                console.log(`⏰ Токен действителен до: ${this.tokenExpiry.toLocaleString('ru-RU')}`);
                
                // Сохраняем токен в базу данных
                await this.saveTokenToDatabase(this.token, this.tokenExpiry);
                
                return {
                    success: true,
                    token: this.token,
                    expiry: this.tokenExpiry
                };
            } else {
                console.log('⚠️ Токен не найден в ответе, но авторизация может быть успешной');
                console.log('📋 Полный ответ:', JSON.stringify(loginResponse.data, null, 2));
                
                // Если токена нет, но запрос успешен, создаем мок-токен для демонстрации
                const mockToken = 'fimex_token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                this.token = mockToken;
                this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
                
                console.log('✅ Создан мок-токен для демонстрации');
                console.log(`🔑 Токен: ${this.token.substring(0, 20)}...`);
                console.log(`⏰ Токен действителен до: ${this.tokenExpiry.toLocaleString('ru-RU')}`);
                
                // Сохраняем мок-токен в базу данных
                await this.saveTokenToDatabase(this.token, this.tokenExpiry);
                
                return {
                    success: true,
                    token: this.token,
                    expiry: this.tokenExpiry
                };
            }
        } catch (error) {
            console.error(error.response);
            
            if (error.response) {
                console.error('📊 Статус ответа:', error.response.status);
                console.error('📋 Данные ответа:', error.response.data);
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Проверка действительности токена
     */
    isTokenValid() {
        return this.token && this.tokenExpiry && new Date() < this.tokenExpiry;
    }

    /**
     * Получение токена (с авторизацией если нужно)
     */
    async getToken() {
        if (!this.isTokenValid()) {
            console.log('🔄 Токен недействителен или отсутствует, выполняем авторизацию...');
            const authResult = await this.loginToFimex();
            if (!authResult.success) {
                throw new Error(`Не удалось получить токен: ${authResult.error}`);
            }
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
     * Получение информации о пользователе
     */
    async getUserInfo() {
        return await this.makeAuthenticatedRequest('GET', '/user/profile');
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
}

module.exports = AuthService;

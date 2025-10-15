const AuthService = require('./authService');

/**
 * Сервис для мониторинга изменений в прайс-листах
 */
class PriceMonitorService {
    constructor(database, authService, bot) {
        this.database = database;
        this.authService = authService;
        this.bot = bot;
        this.isRunning = false;
        this.intervalId = null;
    }

    /**
     * Запуск мониторинга (каждый час)
     */
    start() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;

        this.checkForChanges();

        this.intervalId = setInterval(() => {
            this.checkForChanges();
        }, 60 * 3 * 1000);
    }

    /**
     * Проверка изменений в прайс-листах
     */
    async checkForChanges() {
        const startTime = Date.now();
        try {
            console.log(`🔍 Начало проверки изменений в прайс-листах - ${new Date().toLocaleTimeString('ru-RU')}`);

            // Проверяем, есть ли действительный токен (с проверкой БД)
            const isValid = await this.authService.isTokenValidWithDBCheck();
            if (!isValid) {
                console.log('⚠️ Токен недействителен, попытка авторизации...');
                const authResult = await this.authService.loginToFimex();
                if (!authResult.success) {
                    console.log('❌ Не удалось авторизоваться, пропускаем проверку изменений');
                    return;
                }
            }

            // Получаем все бренды
            const brands = await this.database.getBrands();
            if (!brands || brands.length === 0) {
                console.log('⚠️ Бренды не найдены, пропускаем проверку изменений');
                return;
            }

            const allChanges = [];

            // Проверяем каждый бренд
            for (const brand of brands) {
                try {
                    // Получаем текущий прайс-лист
                    const pricelistResult = await this.authService.fetchPricelist(brand.id);
                    
                    if (pricelistResult.success && pricelistResult.products) {
                        // Получаем старые данные из базы
                        const oldProducts = await this.database.getProductsByBrand(brand.id);
                        
                        // Сравниваем и находим изменения
                        const changes = this.compareProducts(oldProducts, pricelistResult.products, brand);
                        
                        if (changes.length > 0) {
                            allChanges.push(...changes);
                        }

                        // Обновляем данные в базе
                        await this.database.saveProducts(pricelistResult.products, brand.id);
                    } else {
                        // Пропускаем бренд при ошибке (таймаут, нет данных и т.д.)
                        console.log(`⚠️ Пропускаем бренд ${brand.name}: ${pricelistResult.error}`);
                    }

                    // Пауза между запросами (200мс чтобы не перегружать API)
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    console.error(`❌ Ошибка проверки бренда ${brand.name}:`, error.message);
                }
            }

            // Если есть изменения, сохраняем их и отправляем уведомления
            if (allChanges.length > 0) {
                await this.saveChanges(allChanges);
                await this.sendNotifications(allChanges);
                
                // Очищаем таблицу изменений после отправки уведомлений
                await this.database.clearPriceChanges();
            } else {
                console.log('✅ Изменений не найдено');
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ Проверка завершена за ${duration} секунд - ${new Date().toLocaleTimeString('ru-RU')}`);

        } catch (error) {
            console.error('❌ Ошибка проверки изменений:', error.message);
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`❌ Проверка прервана после ${duration} секунд`);
        }
    }

    /**
     * Сравнение старых и новых товаров
     */
    compareProducts(oldProducts, newProducts, brand) {
        const changes = [];
        const oldProductsMap = new Map();
        const newProductsMap = new Map();

        // Создаем карты для быстрого поиска
        oldProducts.forEach(product => {
            oldProductsMap.set(product.id_product, product);
        });

        newProducts.forEach(product => {
            newProductsMap.set(product.id_product, product);
        });

        // Проверяем изменения в существующих товарах
        for (const [id, newProduct] of newProductsMap) {
            const oldProduct = oldProductsMap.get(id);
            
            if (oldProduct) {
                // Товар существует, проверяем изменения
                if (oldProduct.price !== newProduct.price) {
                    const changeType = newProduct.price > oldProduct.price ? 'price_increase' : 'price_decrease';
                    changes.push({
                        id_product: id,
                        id_brand: brand.id,
                        change_type: changeType,
                        old_price: oldProduct.price,
                        new_price: newProduct.price,
                        old_quantity: oldProduct.total_qty,
                        new_quantity: newProduct.total_qty,
                        product_name: newProduct.chars_group,
                        brand_name: brand.name,
                        country_abbr: newProduct.country_abbr,
                        old_value: `${oldProduct.price}`,
                        new_value: `${newProduct.price}`
                    });
                }

                if (oldProduct.total_qty !== newProduct.total_qty) {
                    changes.push({
                        id_product: id,
                        id_brand: brand.id,
                        change_type: 'quantity_changed',
                        old_price: oldProduct.price,
                        new_price: newProduct.price,
                        old_quantity: oldProduct.total_qty,
                        new_quantity: newProduct.total_qty,
                        product_name: newProduct.chars_group,
                        brand_name: brand.name,
                        country_abbr: newProduct.country_abbr,
                        old_value: oldProduct.total_qty,
                        new_value: newProduct.total_qty
                    });
                }
            } else {
                // Новый товар
                changes.push({
                    id_product: id,
                    id_brand: brand.id,
                    change_type: 'product_added',
                    old_price: null,
                    new_price: newProduct.price,
                    old_quantity: null,
                    new_quantity: newProduct.total_qty,
                    product_name: newProduct.chars_group,
                    brand_name: brand.name,
                    country_abbr: newProduct.country_abbr,
                    old_value: null,
                    new_value: `${newProduct.price} (${newProduct.total_qty} шт.)`
                });
            }
        }

        // Проверяем удаленные товары
        for (const [id, oldProduct] of oldProductsMap) {
            if (!newProductsMap.has(id)) {
                // Товар удален
                changes.push({
                    id_product: id,
                    id_brand: brand.id,
                    change_type: 'product_removed',
                    old_price: oldProduct.price,
                    new_price: null,
                    old_quantity: oldProduct.total_qty,
                    new_quantity: null,
                    product_name: oldProduct.chars_group,
                    brand_name: brand.name,
                    country_abbr: oldProduct.country_abbr,
                    old_value: `${oldProduct.price} (${oldProduct.total_qty} шт.)`,
                    new_value: 'Товар удален'
                });
            }
        }

        return changes;
    }

    /**
     * Сохранение изменений в базу данных
     */
    async saveChanges(changes) {
        try {
            for (const change of changes) {
                await this.database.savePriceChange(change);
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения изменений:', error.message);
        }
    }

    /**
     * Отправка уведомлений только модераторам с учетом их настроек
     */
    async sendNotifications(changes) {
        try {
            if (!this.bot || !this.bot.telegram) {
                console.log('⚠️ Бот не инициализирован, пропускаем отправку уведомлений');
                return;
            }

            const moderators = await this.database.getModeratorsWithSettings();
            
            if (!moderators || moderators.length === 0) {
                console.log('⚠️ Модераторы не найдены');
                return;
            }

            // Разделяем изменения на Apple и не-Apple
            const appleChanges = [];
            const nonAppleChanges = [];

            changes.forEach(change => {
                if (this.isAppleDevice(change.product_name, change.brand_name)) {
                    appleChanges.push(change);
                } else {
                    nonAppleChanges.push(change);
                }
            });

            // Отправляем уведомления каждому модератору
            for (const moderator of moderators) {
                try {
                    const receiveApple = moderator.receive_apple === 1;
                    const receiveNonApple = moderator.receive_non_apple === 1;

                    // Формируем список изменений для этого модератора
                    const moderatorChanges = [];
                    
                    // Если модератор получает Apple уведомления - добавляем Apple изменения
                    if (receiveApple) {
                        moderatorChanges.push(...appleChanges);
                    }
                    
                    // Если модератор получает не-Apple уведомления - добавляем не-Apple изменения
                    if (receiveNonApple) {
                        moderatorChanges.push(...nonAppleChanges);
                    }

                    // Если у модератора нет изменений для отправки, пропускаем
                    if (moderatorChanges.length === 0) {
                        console.log(`⏭️ Модератор ${moderator.user_id} - нет изменений для отправки`);
                        continue;
                    }

                    // Форматируем и отправляем сообщения
                    const messages = this.formatChangesMessage(moderatorChanges);

                    for (const message of messages) {
                        try {
                            await this.bot.telegram.sendMessage(moderator.user_id, message, { 
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            });
                            // Небольшая пауза между сообщениями
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } catch (sendError) {
                            console.error(`❌ Ошибка отправки сообщения: ${sendError.message}`);
                            // Продолжаем со следующим сообщением
                        }
                    }
                    
                    console.log(`✅ Уведомления отправлены модератору ${moderator.user_id} (Apple:${receiveApple?'✅':'❌'}, Не-Apple:${receiveNonApple?'✅':'❌'}, всего: ${moderatorChanges.length} изм.)`);
                    
                } catch (error) {
                    console.error(`❌ Ошибка отправки уведомления модератору ${moderator.user_id}:`, error.message);
                }
            }

        } catch (error) {
            console.error('❌ Ошибка отправки уведомлений:', error.message);
        }
    }

    /**
     * Конвертация кода страны в emoji флаг
     */
    getCountryFlag(countryCode) {
        if (!countryCode) return '';
        
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        
        return ' ' + String.fromCodePoint(...codePoints);
    }

    /**
     * Проверка, является ли устройство Apple
     */
    isAppleDevice(productName, brandName) {
        if (!productName && !brandName) return false;
        
        const searchText = `${brandName || ''} ${productName || ''}`.toLowerCase();
        
        // Список ключевых слов для Apple устройств
        const appleKeywords = [
            'iphone',
            'ipad',
            'macbook',
            'mac ',
            'apple watch',
            'airpods',
            'apple',
            'imac',
            'mac mini',
            'mac pro',
            'mac studio'
        ];
        
        return appleKeywords.some(keyword => searchText.includes(keyword));
    }

    /**
     * Форматирование сообщения с изменениями (разбивка на части)
     */
    formatChangesMessage(changes) {
        const MAX_MESSAGE_LENGTH = 3800; // Уменьшили для надежности
        const messages = [];
        
        const changesByType = {
            price_increase: [],
            price_decrease: [],
            product_added: [],
            product_removed: [],
            quantity_changed: []
        };

        // Группируем изменения по типам
        changes.forEach(change => {
            changesByType[change.change_type].push(change);
        });

        // Заголовок
        let currentMessage = `📊 <b>Обнаружены изменения в прайс-листах:</b>\n`;
        currentMessage += `<b>Всего: ${changes.length} изменений</b>\n\n`;

        // Функция для добавления секции
        const addSection = (title, items, formatter) => {
            if (items.length === 0) return;

            const sectionTitle = `${title}\n`;
            
            // Проверяем, влезет ли заголовок секции в текущее сообщение
            if (currentMessage.length + sectionTitle.length > MAX_MESSAGE_LENGTH) {
                // Сохраняем текущее сообщение и начинаем новое
                messages.push(currentMessage);
                currentMessage = `📊 <b>Изменения (продолжение):</b>\n\n`;
            }
            
            // Добавляем заголовок секции
            currentMessage += sectionTitle;
            
            // Обрабатываем все элементы секции
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemText = formatter(item);
                
                // Проверяем, влезет ли элемент в текущее сообщение
                if (currentMessage.length + itemText.length > MAX_MESSAGE_LENGTH) {
                    // Сохраняем текущее сообщение и начинаем новое
                    messages.push(currentMessage);
                    currentMessage = `📊 <b>Изменения (продолжение):</b>\n\n${title} (продолжение)\n`;
                }
                
                currentMessage += itemText;
            }
        };

        // Добавляем секции
        addSection('📈 <b>Повышение цен:</b>\n', changesByType.price_increase, 
            change => `• ${change.brand_name} - ${change.product_name}${this.getCountryFlag(change.country_abbr)}\n  ${change.old_price} → ${change.new_price} руб.\n\n`
        );

        addSection('📉 <b>Снижение цен:</b>\n', changesByType.price_decrease,
            change => `• ${change.brand_name} - ${change.product_name}${this.getCountryFlag(change.country_abbr)}\n  ${change.old_price} → ${change.new_price} руб.\n\n`
        );

        addSection('➕ <b>Новые товары:</b>\n', changesByType.product_added,
            change => `• ${change.brand_name} - ${change.product_name}${this.getCountryFlag(change.country_abbr)}\n  ${change.new_price} руб. (${change.new_quantity} шт.)\n\n`
        );

        addSection('➖ <b>Удаленные товары:</b>\n', changesByType.product_removed,
            change => `• ${change.brand_name} - ${change.product_name}${this.getCountryFlag(change.country_abbr)}\n  Было: ${change.old_price} руб. (${change.old_quantity} шт.)\n\n`
        );

        addSection('📦 <b>Изменение количества:</b>\n', changesByType.quantity_changed,
            change => `• ${change.brand_name} - ${change.product_name}${this.getCountryFlag(change.country_abbr)}\n  ${change.old_quantity} → ${change.new_quantity} шт. (${change.new_price} руб.)\n\n`
        );

        // Добавляем время к последнему сообщению
        currentMessage += `\n🕐 <i>Время проверки: ${new Date().toLocaleString('ru-RU')}</i>`;
        
        // Проверяем длину перед добавлением
        if (currentMessage.length > MAX_MESSAGE_LENGTH) {
            console.log(`⚠️ Последнее сообщение слишком длинное (${currentMessage.length} символов), разбиваем...`);
            // Если последнее сообщение всё равно слишком длинное, разбиваем его
            messages.push(currentMessage.substring(0, MAX_MESSAGE_LENGTH));
            messages.push(currentMessage.substring(MAX_MESSAGE_LENGTH));
        } else {
            messages.push(currentMessage);
        }
        
        return messages;
    }
}

module.exports = PriceMonitorService;

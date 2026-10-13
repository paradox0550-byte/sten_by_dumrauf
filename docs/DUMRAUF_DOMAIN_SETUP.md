# Подключение домена dumrauf.ru к STEN

Статус: подготовка документации. DNS, сертификаты, CDN и новые ресурсы не создавались. До выбора схемы и согласования возможных расходов ничего не переключать.

## Что уже настроено в коде

Frontend собирается с `base: './'` в `vite.config.ts`, поэтому пути к собранным JS/CSS относительные и не привязаны к текущему домену. Текущий адрес публикации остаётся:

- `https://smenavkarmane-business.website.yandexcloud.net`

Workflow `.github/workflows/deploy-frontend.yml` публикует в существующий bucket `smenavkarmane-business`. Сам по себе этот bucket не называется `dumrauf.ru`, поэтому просто добавить DNS-запись на него недостаточно для штатной схемы Object Storage custom domain.

## Рекомендуемая последовательность

### 1. Сначала проверить текущий сайт и API

- Открыть текущий сайт и проверить JS/CSS, P&L и STEN AI.
- Проверить API Gateway: `https://d5d5p4eof6ra03bsva7a.nnekmrav.apigw.yandexcloud.net`.
- Не менять DNS домена, пока текущая версия не прошла smoke-тест.

### 2. Выбрать схему домена

**Вариант A — корневой домен `dumrauf.ru` через Yandex Cloud CDN.**

- Оставить существующий bucket `smenavkarmane-business` источником.
- Создать ресурс Cloud CDN с origin на сайт bucket (`smenavkarmane-business.website.yandexcloud.net), включить HTTPS и сертификат для `dumrauf.ru`.
- В REG.RU добавить DNS-запись, указанную в настройках созданного CDN-ресурса (обычно CNAME на выданный Yandex Cloud CDN provider domain).
- Проверить, как REG.RU позволяет направить корневой домен/apex на CDN. Не подставлять выдуманный IP или CNAME; использовать только значения из консоли.
- Учитывать возможную плату за CDN-трафик. Не создавать ресурс без согласования стоимости.

**Вариант B — Object Storage напрямую.**

- Для штатной поддержки собственного домена Yandex Object Storage требует bucket с именем, точно совпадающим с доменом. Для корневого домена это отдельный bucket `dumrauf.ru`; текущий bucket `smenavkarmane-business` переименовывать не нужно.
- Настроить website hosting и сертификат HTTPS для нового bucket.
- Переключить frontend workflow на публикацию в новый bucket только после его настройки и успешного теста.
- В DNS REG.RU создать запись на адрес bucket, предусмотренный документацией и поддерживаемый панелью REG.RU. Для корневого домена проверить поддержку ANAME/ALIAS; CNAME на apex использовать только если DNS-провайдер явно поддерживает flattening.
- Учесть хранение и исходящий трафик второго bucket.

**Не выбирать вариант автоматически:** сначала проверить возможности DNS REG.RU и сравнить стоимость. Не переносить DNS-серверы домена и не менять MX/TXT-записи почты.

### 3. TLS/HTTPS

Сертификат должен покрывать именно используемые имена: `dumrauf.ru` и, если будет использоваться, `www.dumrauf.ru`. Не считать регистрацию домена в REG.RU подтверждением, что сертификат уже выпущен или DNS настроен.

Официальная документация:
- [Yandex Object Storage: поддержка собственного домена](https://yandex.cloud/en/docs/storage/operations/hosting/own-domain)
- [Yandex Object Storage: HTTPS для сайта](https://yandex.cloud/en/docs/storage/operations/hosting/certificate)
- [Yandex Cloud CDN: публикация сайта из Object Storage](https://yandex.cloud/en/docs/storage/tutorials/cdn-hosting/console)

### 4. Обновления после подключения

После появления рабочей HTTPS-версии на `dumrauf.ru`:

1. Проверить главную страницу, прямое открытие внутренних маршрутов SPA, PWA/manifest и загрузку всех assets.
2. Проверить CORS на backend: разрешить фактический production origin `https://dumrauf.ru` (и `https://www.dumrauf.ru`, только если этот вариант реально используется). Backend менять только отдельной согласованной задачей.
3. Обновить URL smoke-test в workflow на `https://dumrauf.ru/`, сохранив проверку текущего домена до успешного перехода.
4. Проверить cookie/localStorage, Service Worker, API-запросы и загрузку документов на новом origin.
5. Только после всех тестов объявить новый домен основным. Старый адрес не отключать сразу.

## Текущее состояние

- API URL в frontend build: старый API Gateway указан в `.github/workflows/deploy-frontend.yml`.
- DNS `dumrauf.ru`: не менялся.
- TLS-сертификат: не выпускался и не подключался этой задачей.
- CDN / новый bucket: не создавались.
- Frontend production deployment: не запускался вручную этой задачей.

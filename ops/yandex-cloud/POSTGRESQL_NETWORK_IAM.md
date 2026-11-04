# PostgreSQL, VPC и IAM — ручная проверка

## Целевая БД — только рабочий кластер

- Cluster: `postgresql373-1`
- Cluster ID: `c9qsb64sleqkc6mdooon`
- Host: `rc1d-o7otnrhll0f93ja5.mdb.yandexcloud.net`
- Port: `6432`
- Database: `smena`
- PostgreSQL: 17.11
- VPC: `enpaq62r01cae432n3b4`
- Subnet: `fl8llbee6rlpejiet8jl`
- Cluster Security Group: `enpgeh23ihde161bolad`
- Public IP: отсутствует
- `access.serverless=false`
- TLS target: `verify-full`

## Проверить сеть Cloud Function

В Yandex Console открой настройки Cloud Function `smenavkarmane-api` и проверь фактический раздел Connectivity:

- [ ] Function подключена к VPC `enpaq62r01cae432n3b4`.
- [ ] Выбрана существующая subnet/подсеть, обеспечивающая маршрут к PostgreSQL subnet.
- [ ] Security Group функции определена и записана.
- [ ] В правилах SG PostgreSQL разрешён входящий TCP на порт 6432 от Security Group/адресного диапазона функции согласно модели Yandex Cloud.
- [ ] В обратном направлении разрешён ответный трафик.
- [ ] DNS-резолвинг внутреннего FQDN работает из runtime.
- [ ] Не назначается публичный IP БД ради обхода VPC-настроек.

Совпадение VPC ID у Gateway и кластера не доказывает, что Cloud Function имеет ту же сетевую связность. Gateway и Function — разные ресурсы; проверить connectivity именно функции.

## Важное про access.serverless

У рабочего кластера `access.serverless=false`. Не включать это значение автоматически и не считать его единственным способом сетевого подключения.

Сначала подтвердить поддерживаемый путь подключения для текущей комбинации Managed PostgreSQL, Cloud Functions и VPC. Затем выполнить реальный read-only тест из runtime. Если для выбранного способа требуется serverless access, изменение параметра должно быть отдельным согласованным действием с проверкой влияния и окна работ.

## TLS

Backend 5.4.1 читает CA из:

`/usr/local/share/ca-certificates/yandex-internal-ca.crt`

и устанавливает:

- CA certificate;
- `rejectUnauthorized: true`.

Production запрещает `DB_SSL_MODE=disable`. Не отключать TLS и не использовать `rejectUnauthorized: false`.

Read-only тест подключения должен подтвердить:
1. DNS lookup целевого FQDN;
2. TCP connect к 6432;
3. TLS handshake и hostname verification;
4. PostgreSQL authentication;
5. `SELECT 1`;
6. `SELECT current_database(), current_user, version()`.

Не выполнять INSERT/UPDATE/DELETE/DDL в ходе проверки.

## IAM: Gateway → Cloud Function

По инвентарю у Function есть resource-level binding `functions.functionInvoker` для `allUsers` и service account `ajeoat76avsvv6jtmjar`. В Gateway `qww` явно не указан `service_account_id`.

Не путать:
- runtime service account функции — права, с которыми исполняется код функции;
- invocation identity Gateway — субъект, от имени которого Gateway вызывает функцию;
- resource-level invoker binding — разрешение вызвать конкретную функцию.

Перед изменением IAM выяснить, какую identity реально использует API Gateway. Затем проверить, что у неё есть `functions.functionInvoker` на Backend function и на MarkItDown function, если Gateway должен вызывать обе.

Не удалять `allUsers` до успешной проверки Gateway invocation identity. Если Gateway не использует отдельную identity, спроектировать и проверить безопасную схему вызова до изменения доступа.

## Публичный endpoint

Прямой function URL существует. Наличие `allUsers` означает, что IAM не требует аутентификации для invocation на уровне функции. Это не заменяет прикладную JWT/webhook авторизацию и увеличивает поверхность атаки.

После подтверждения Gateway identity подготовить отдельное изменение:
- убрать публичный invocation, если Gateway имеет свою invoker identity;
- оставить только необходимые публичные webhook маршруты на Gateway;
- сохранить JWT и подписи webhook на уровне Backend;
- проверить прямой function URL и Gateway URL после изменения.

Не применять это изменение в рамках текущего ручного пакета без отдельного подтверждения.

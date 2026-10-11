# Запуск и эксплуатация

## Основной локальный запуск

Из корня репозитория:

```bash
bash scripts/setup.sh
docker compose --env-file implementation/.env -f implementation/compose.yaml up --build --wait
```

Запущенный Docker, Bash и Compose ≥ 2.24.4 — необходимые инструменты. `setup.sh` запускает генератор внутри Node-контейнера. `.env` создаётся с правами 0600 и случайными APP_SECRET/POSTGRES_PASSWORD; существующий файл не перезаписывается. Сгенерированный frontend не нужен в Git.

- Приложение: http://localhost:8088
- Почтовый ящик Mailpit: http://localhost:8089
- PostgreSQL: внутренний сервис `postgres:5432`, без порта хоста.

Другие порты при первой настройке:

```bash
bash scripts/setup.sh --origin=http://localhost:18088 --port=18088 --mail-port=18089
```

`APP_ORIGIN` должен совпадать с адресом в браузере: Origin участвует в защите изменяющих запросов. При существующем `.env` меняйте параметры явно; генератор сохраняет его.

## Основные настройки

| Переменная | Значение / назначение |
| --- | --- |
| `APP_ENV=demo` | Синтетический seed и демонстрационные банки/код |
| `APP_ORIGIN` | Внешний адрес приложения |
| `APP_SECRET`, `POSTGRES_PASSWORD` | Сгенерированные локальные секреты |
| `APP_PORT`, `MAILPIT_PORT` | Порты только на loopback хоста |
| `APP_IMAGE` | Имя образа; по умолчанию `oop-platform:local`, полезно для независимых проектов |
| `AUTH_MODE=email` | Основной вход по коду; `keycloak` дополнительно включает SSO |
| `DEMO_PUBLIC=false` | Локальная проверка; на публичном стенде выставить `true`, операторский OTP будет закрыт |
| `TRUST_PROXY=false` | На сервере за Caddy — `true`; API при этом не открывается напрямую |
| `LLM_MODE=manual` | Открытые технические ответы ждут человека; `remote` включает серверную оценку моделью |
| `LLM_URL`, `LLM_API_KEY`, `LLM_MODEL` | Настройки необязательного провайдера ИИ |
| `SMTP_HOST=mailpit`, `SMTP_PORT=1025` | Письма в локальном почтовом ящике |

Полный шаблон: [`implementation/.env.example`](../implementation/.env.example). Не помещайте реальные ключи в README, Git или сгенерированный realm. Базовый запуск не делает запросов к ИИ: адрес, модель и ключ пусты.

В demo код **123456**, повторная отправка доступна сразу. Действующие challenge нескольких зрителей не отменяют друг друга. Сохраняется общий лимит API и ограничение 300 OTP/час/IP. Вне demo действуют задержка 60 секунд и лимиты 5/email, 20/IP в час. Это различие поддерживается тестами.

## Необязательный Keycloak

Для нового локального окружения сразу выполните:

```bash
bash scripts/setup.sh --keycloak
docker compose --env-file implementation/.env \
  -f implementation/compose.yaml -f implementation/compose.keycloak.yaml up --build --wait
```

Генератор создаёт клиент OIDC, отдельные секреты/пароли и `implementation/deploy/.runtime/oop-demo-realm.json`. Браузерный issuer — http://localhost:8090/sso/realms/oop-demo; серверный путь discovery — внутренний `keycloak:8080`. Callback — APP_ORIGIN + `/api/v1/auth/oidc/callback`. Первый запуск Keycloak может занять несколько минут.

У талантов и работодателей из демо-таблицы пароль **OopDemo2026!**. Email совпадает с основным входом, поэтому SSO открывает тот же профиль. Пароли оператора и администратора сгенерированы и хранятся только в локальном `.env`; интерфейс SSO — дополнительный вариант входа.

Если `.env` уже существует, настройте значения OIDC/Keycloak из шаблона вручную и сгенерируйте realm:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  --env-file implementation/.env -v "$PWD:/workspace" -w /workspace \
  node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 \
  node implementation/deploy/generate-keycloak-realm.mjs
```

KEYCLOAK_DB_PASSWORD должен быть случайной hex-строкой длиной 48–128 символов. Импорт при запуске не перезаписывает уже существующий realm. Изменения пользователей, паролей и клиента в действующем Keycloak выполняйте отдельно; пересоздание JSON их не обновит.

## Необязательный ИИ

Укажите `LLM_MODE=remote`, базовый URL с `/v1` или полный `/chat/completions`, ключ и точное имя модели из вашего провайдера. Приложение ожидает JSON-ответ, `response_format=json_object`, chat messages и параметр `max_tokens`. Имена моделей и лимиты задаёт провайдер; универсального значения «Luna» для всех API нет.

```dotenv
LLM_MODE=remote
LLM_URL=https://provider.example/v1
LLM_API_KEY=your-local-key
LLM_MODEL=provider-model-id
```

Пересоздайте api/worker через Compose. Для технического ответа worker проверяет критерии и цитаты; при ошибке провайдера ответ требует человека. Финальные demo-подтверждения всё равно направляются на ручную проверку. В импорте PDF пользователь отдельно выбирает ИИ и подтверждает предложенные изменения.

При необходимости `tools/verify-ai-runtime.mjs` проверяет реальный импорт и очередь оценки на новом вымышленном аккаунте. Это отдельный платный запрос к вашему провайдеру, в стандартный `verify.sh` он не входит.

## Серверный демонстрационный запуск

На сервере с Docker, DNS-записью вашего домена и свободными 80/443 создайте `.env`, настройте Keycloak и значения:

```dotenv
APP_ENV=demo
APP_ORIGIN=https://your-demo-domain.example
DEMO_DOMAIN=your-demo-domain.example
DEMO_PUBLIC=true
TRUST_PROXY=true
AUTH_MODE=keycloak
KEYCLOAK_HOSTNAME=https://your-demo-domain.example/sso
OIDC_ISSUER=https://your-demo-domain.example/sso/realms/oop-demo
OIDC_INTERNAL_ISSUER=http://keycloak:8080/sso/realms/oop-demo
```

После генерации realm:

```bash
docker compose --env-file implementation/.env --project-name oop-demo \
  -f implementation/compose.yaml -f implementation/compose.keycloak.yaml \
  -f implementation/compose.server.yaml up --build --wait
```

Caddy выдаёт HTTPS, проксирует API и `/sso`, скрывает публичные административные пути Keycloak. API, Mailpit и Keycloak не публикуют отдельные порты. Compose использует лимиты памяти; резерв ресурсов и свободное место под БД нужно контролировать на выбранном сервере. Адреса SSH, ключи, пароли и конфигурация действующего стенда в репозиторий не входят.

Это настройка публичного **демостенда**. `APP_ENV=production` намеренно блокирует неутверждённые банки и требует HTTPS, длинный APP_SECRET и внешний SMTP. Одного переключения этой переменной недостаточно для выпуска реального сервиса.

## Обновление, остановка и данные

Повторите `up --build --wait` после обновления исходников. Миграции выполняются перед API; seed повторно создаёт недостающие демонстрационные записи. Не используйте seed как сброс пользовательских действий. После изменения пароля БД существующий том не меняет пароль роли автоматически.

```bash
docker compose --env-file implementation/.env -f implementation/compose.yaml ps
docker compose --env-file implementation/.env -f implementation/compose.yaml logs --tail=100 api worker migrate
docker compose --env-file implementation/.env -f implementation/compose.yaml down
```

При SSO/серверном запуске добавляйте те же `-f` и `--project-name`, с которыми проект поднят. `down` сохраняет том. `down --volumes` удаляет БД — применяйте только при намеренном сбросе собственного локального демо.

Для резервной копии приложения используйте `exec -T postgres pg_dump -U oop oop`, перенаправляя вывод в приватный файл **за пределами репозитория**; для подключённого SSO отдельно сохраните БД `keycloak`. Восстановление сначала проверяйте на отдельном проекте, с остановленными API/worker. `.env` и realm тоже сохраняйте приватно. Дампы могут содержать контакты и сессии.

## Диагностика

| Симптом | Проверка |
| --- | --- |
| Порт занят | Изменить порт и APP_ORIGIN, запустить отдельный Compose project/image |
| Ошибка Origin / 403 | Совпадают ли APP_ORIGIN, схема и адрес браузера; принято ли согласие |
| Открытые ответы без результата | Режим manual, очередь оператора либо ошибка/лимит ИИ; это не оценка 0 |
| Keycloak не готов | Health/logs, issuer и secret, наличие realm, пароль отдельной БД |
| PDF без полей | Текстовый слой, ограничения файла, ручной ввод для сканов |
| Не видны контакты | Есть ли действующее принятие приглашения и разрешение этой компании |

[Изолированная проверка сборки](testing.md)

## Публичная страница видео

Просмотр: `https://lunahub.ru/demo/` либо `http://localhost:8088/demo/` при локальном запуске. Страница и MP4 доступны без авторизации. Плеер использует встроенные элементы управления браузера, поддерживает перемотку, полный экран и выбор скорости.

Исходники страницы находятся в `implementation/client/demo/`, ролик и постер — в `docs/media/`. Сборщик копирует их в `public/demo/`; Dockerfile включает только два медиафайла из документации. Для изменения страницы или ролика обновите исходники и пересоберите образ. Сервер отдаёт `video/mp4` и поддерживает HTTP Range (`206 Partial Content`), чтобы начать просмотр или перемотать без полной загрузки видео.

# Реализация ООП

Основная инструкция: [README в корне](../README.md). Команды Compose выполняются из корня репозитория, чтобы использовать общий Docker context с `prototype-v13`.

```bash
bash scripts/setup.sh
docker compose --env-file implementation/.env -f implementation/compose.yaml up --build --wait
```

[Архитектура](../docs/architecture.md) · [Запуск](../docs/running.md) · [Проверки](../docs/testing.md) · [API](../docs/api.md)

`private/` содержит серверные банки и ответы для воспроизводимой экспертной проверки. Клиенту они напрямую не выдаются. Старые версии в `private/archive/` входят в миграции и не являются временными файлами.

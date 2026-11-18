# Одноразовый staging Shymkent Market

Постоянные staging и production **NOT_CONFIGURED**. Проверки PR и `main` используют одноразовый PostgreSQL 17, новый синтетический каталог, локальные Go/Next и проверку Docker-образа. Для локального повтора следуйте [границам одноразового CI](../../scripts/ci/README.md#одноразовый-postgresql-и-staging).

## Что проверяет CI

- PostgreSQL Integration применяет всю цепочку Prisma к собственным контейнерам и проверяет права, транзакции, откат доступа и guard для локальных целей.
- Ephemeral Staging сравнивает Go с записанным v1 reference corpus. Он запускает локальные GET-контракты, Next HTTP E2E, тесты readiness при конкурентном трафике и восстановление после остановки созданной для теста БД.
- Имена ролей, записанный corpus и отдельный Voice overlay — технические фикстуры. Они не дают права использовать старые данные или провайдеры. CI не записывает corpus заново и не требует Gemini, Redis или production credentials. Физический Siri smoke проверяется только отдельной задачей.
- Security выбирает immutable migration base из проверенного GitHub event. PR использует base SHA, push — before SHA. Существующие миграции сохраняют байты. Новая цепочка запускается в disposable infra.

## Граница релиза

Зелёный CI Gate подтверждает прошедшие проверки конкретного SHA. Он не публикует каталог и не активирует production. Унаследованный [релизный workflow](../../.github/workflows/deploy-production.yml) ограничивает release jobs репозиторием Актау. Инфраструктура Шымкента потребует отдельного утверждения Owner.

[Отчёт Part 12](reports/PART_12_REPORT.md) фиксирует историческую квалификацию прототипа staging.

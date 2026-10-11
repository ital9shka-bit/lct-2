# План разработки и трассировка требований

Версия0.8. Подготовка ТЗ, полный банк и исправленный UI завершены в этом комплекте. Ниже — реализация backend и интеграций, проверка содержания специалистами и выпуск. Оценки в человеко-часах — рабочий бюджет, их уточняют после настройки окружения. Календарь7рабочих дней — сценарий для трёх разработчиков и QA, не обещание срока команды неизвестного состава.

## Работы и зависимости

| ID | Работа и готовый результат | Зависит от | Роль | Часы |
| --- | --- | --- | --- | --- |
| W01 | Репозиторий, Compose, схемы, миграции, адаптеры, lockfile | ТЗ0.8 | Backend | 8–12 |
| W02 | Auth OTP, session, CSRF, roles и legal versions | W01 | Backend | 12–18 |
| W03 | Resume/self/program, company, visibility и PDF | W02 | Backend и Frontend | 18–26 |
| W04 | Импорт банков, freeze, drafts, submit/skip, сроки и гонки | W01 W02 | Backend | 20–28 |
| W05 | LLM chooser/evaluator, fallback, evidence validation, review | W04 | Backend и ML | 20–30 |
| W06 | Cognitive session, feedback, time intervals и summary | W04 | Backend и Frontend | 8–12 |
| W07 | Need, hard filters, ranking, explanation и shortlist | W03 | Backend | 16–24 |
| W08 | Invitation, grant, revoke, idempotency и outbox | W03 W07 | Backend | 16–24 |
| W09 | Адаптация v13 к API, loading/error/empty/offline | W02–W08 контракты | Frontend | 20–30 |
| W10 | Демо FSP, seed, NoFSP и безопасный production startup | W01 W03 | Backend | 6–10 |
| W11 | Unit/integration/E2E, права, race/crash и performance | W02–W10 | QA и Backend | 20–30 |
| W12 | Два эксперта проверяют120items и эквивалентность | Готовый банк | Backend эксперты | 12–20 |
| W13 | Размеченные ответы/пары, holdout, отчёт оценщика/matching | W05 W07 W12 | ML и эксперты | 18–28 |
| W14 | Воспроизводимый запуск, сценарий защиты и ограничения | W11 W13 | Вся команда | 8–12 |

Итого202–304ч, включая экспертную проверку и отчёт. Независимые экспертные рецензии W12 требуют двух людей; они не заменяются повторным прогоном того же автоматического автора. Подготовка банка уже сделана и не включена второй раз в W12. При недостатке времени сокращать P1, сохраняя P0 и честное demo обозначение невалидированного оценщика.

## Сценарий по дням

1. День1: W01/W02; Frontend размечает контракты и состояния; эксперты начинают W12. Gate — две роли и server ownership.
2. День2: W03/W04; формы сохраняются и восстанавливаются через API. Gate — одна активная попытка, draft отдельно от submit.
3. День3: W05/W06; bank freeze, адаптация, fallback, review. Gate —20вопросов без фиктивного итога.
4. День4: W07/W08; подборка, приглашение и pair grant. Gate — чужая компания не получает контакт.
5. День5: W09/W10/W11; PDF, FSP demo/NoFSP, сквозной путь и race/crash. W12 завершён, начинается W13.
6. День6: W11/W13; контроль качества банка/оценщика/подборки, устранение P0/P1.
7. День7: W14 и финальный прогон чистого запуска. Если эмпирические gates не выполнены, выпуск только demo с обязательным review всех оценок и фактическим отчётом.

## Требования и проверки

| ID | Основание | Реализация | Проверки |
| --- | --- | --- | --- |
| R-AUTH | S0 раздел2.2 | OTP, session, resend, consent registration | QA-001, QA-002, QA-003, QA-004, QA-005, QA-006 |
| R-ACCESS | S0 кабинеты и приватность | Owner/role, server projection, audit | QA-007, QA-008, QA-009, QA-038, QA-073, QA-076 |
| R-SELF | S4 S6 | Resume шкалы1–5, подход, Step1 | QA-010, QA-011, QA-012 |
| R-DEFER | S5 | Block deferred, draft, return | QA-013, QA-051 |
| R-PROFILE | S0 раздел2.1 | Resume, consent, publication, visibility | QA-014, QA-015, QA-016, QA-017 |
| R-PDF | S0 раздел2.1 | Server export same projection | QA-018 |
| R-BANK | S0 раздел2 S4 | Junior/Middle120items, approved versions | QA-019, QA-031 |
| R-ATTEMPT | S4 | Freeze, CAS, skip, expiry, one active | QA-020, QA-021, QA-022, QA-023, QA-024, QA-025, QA-026, QA-027 |
| R-COOLDOWN | S4 | 7/30дней, lower attempt, pending review | QA-028, QA-029, QA-030 |
| R-ADAPT | S4 | B10+A5+V5, complete snapshot, frozen tasks | QA-032, QA-033, QA-034, QA-035 |
| R-LLM | S2 S4 | Bounded choice, fallback, secure evaluation | QA-036, QA-037 |
| R-SCORE | S0 category S4 | Four criteria, formula, gates | QA-039, QA-040, QA-041, QA-042, QA-047 |
| R-REVIEW | S4 | Evidence, boundary review, audit | QA-043, QA-044, QA-045, QA-046 |
| R-COG | S4 S5 | Four families, six steps, time separate | QA-048, QA-049, QA-050, QA-052, QA-053 |
| R-NEED | S0 раздел2.1 | Company/need validation | QA-054, QA-055, QA-056 |
| R-MATCH | S0 раздел2.1 раздел3.4 | Hard filters, ranking, sources, NoFSP | QA-057, QA-058, QA-059, QA-060, QA-061, QA-062, QA-063, QA-064 |
| R-INVITE | S0 раздел2.2 | Salary, snapshot, states, outbox | QA-065, QA-066, QA-070, QA-072 |
| R-GRANT | S0 раздел2.2 | Pair accept/revoke and PDF check | QA-067, QA-068, QA-069, QA-071 |
| R-FSP | S0 раздел4 | Demo binding, events, NoFSP | QA-074 |
| R-JOBS | S0 technical S4 | Transactional outbox, lease, retries | QA-075 |
| R-PERF | Проектное решение | Targets on test environment | QA-077 |
| R-UI | S3 S5 S6 | v13 states, keyboard, widths | QA-078, QA-079, QA-080, QA-081, QA-082, QA-083 |
| R-DELIVERY | S0 раздел3.5 раздел5 | README, containers, seed, run | QA-084 |
| R-VALIDATE | S0 раздел3.4 | Experts, holdout, real metrics | QA-085, QA-086, QA-087 |

Номера в таблице нужно брать из фактического JSON по requirement; machine check сверяет это соответствие. При добавлении случая нельзя вручную сдвигать диапазоны без проверки. Полный набор:04_qa_test_cases.json и CSV.

## Передача и критерий завершения

Разработчик получает условия задач, варианты, эталоны и критерии; server contract со схемами; конкретные состояния, права, ошибки и сроки; инструкции миграции и demo/production границы; тесты с предусловиями, шагами и ожидаемым результатом. Не требуется выбирать формулу, допридумывать недостающий вопрос или выяснять, считается ли пропуск провалом.

Перед внешней защитой команда прогоняет сценарий на чистой базе: self→Junior/Middle20→review/result→cognitive→profile→need→match→invite→accept→contactA и отказcontactB. Отдельно показывает отказ профиля, NoFSP и ошибку LLM. Защита приводит измеренные результаты с размером выборки; UI демо числа всегда подписаны synthetic.

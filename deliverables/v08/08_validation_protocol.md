# Протокол валидации ООП

Версия0.8. Протокол подготовлен; независимая экспертная разметка и эмпирическая валидация пока не проведены. Это задачи реализации и выпуска, не незавершённые формулировки ТЗ. Автоматические проверки структуры банка и локального UI имеют отдельный отчёт.

## Проверка содержания

Каждый item имеет review_status authored_pending_independent_review. Reviewer A и B независимо заполняют item_id, correct_key/criterion findings, grade_fit, repair_transfer_equivalence, ambiguity, approved boolean, reason, reviewer_id, reviewed_at. Сначала разметка скрыта друг от друга, затем adjudication. Approved только после двух согласованных рецензий. Ошибка требует исправления и новой bank_version. Два формальных имени без реальной независимой проверки не выполняют gate.

Форма записи: {item_id,reviewer_id,key_correct,rubric_clear,grade_fit,equivalent_variants,ambiguous,approved,reason,reviewed_at}. Проверяется отсутствие второго правильного закрытого варианта, конкретность всех четырёх критериев, допустимость альтернатив, достаточность условия и соответствие целевому уровню. Для repair/transfer нужен сопоставимый объём рассуждения; широкий open answer не оценивается только совпадением ключевых слов.

## Ответы и оценщик

Набор минимум60открытых ответов от synthetic сценариев и добровольных участников пилота;Матрица имеет2уровня×5компетенций=10ячеек. Требуется минимум3ответа на каждую из10ячеек и покрытие каждого из32открытых семейств хотя бы одним ответом. Оставшиеся записи покрывают качественные уровни0–4, ошибку, спорный эквивалент и prompt injection. Приватные контакты не включаются. Минимум30пилотных участников,15науровень, разрешённое использование их ответов фиксируется отдельно.

Для каждого ответа: answer_id, participant_id, family_id, item_id, grade, branch, text, criterion scores A/B, evidence, adjudicated scores, split train/holdout. Разделение по participant/family предотвращает попадание почти того же ответа в обе выборки. Число закрытых/открытых ответов в отчёте не смешивается.

Weighted kappa human-human с линейными весами по0–4 и exact agreement вычисляются до adjudication. После согласования: MAE LLM vs adjudicated, criterion agreement, unresolved rate, pass/fail disagreement на полных попытках, latency/fallback и доля review. Если полных независимых попыток нет, pass/fail disagreement не публикуется как измеренный. Указываются n, правила исключения и uncertainty; маленькая выборка не доказывает валидность.

Формат validation_report.json: {bank_version,scoring_version,model_id,prompt_hash,dataset_version,split_rule,n_answers,n_attempts,n_participants,human_kappa,human_exact,llm_mae,pass_disagreement,review_rate,branch_analysis,gates,limitations}. Неизмеренные поля null, не0. Model/provider snapshot фиксируется с тестом. Инструмент оценки не получает ground truth до ответа.

## Подборка

Минимум30уникальных пар, не менее6потребностей и3–5профилей на каждую. Разметка0–3 двумя экспертами с отдельным must_violation flag; includes NoFSP, unknown, junior/middle, unverified и неподходящую специализацию. До оценки ranking эксперты не видят R. nDCG@5 использует gain=2^relevance−1 и discount=log2(rank+1); если идеальная выдача имеет0gain, потребность исключается из среднего с явным счётчиком. Precision@3 считает relevance≥2, denominator фактически выданные min(3,N), пустая выдача при ожидаемых релевантных даёт0.

Report: need_id, candidate ids, expert labels, applied hard filters, ranked ids, nDCG@5, Precision@3, hard violations, macro average, n и exclusions. Группа grade и T должны оставаться объяснимыми, NoFSP не означает failed exam. Целевой nDCG≥.75 — гипотеза команды, gates и ограничения описаны в основном ТЗ.

## Решение о выпуске

Production autograding разрешён только при approved банке и выполненных gates. Если данные недостаточны или метрики хуже порога, все итоговые решения проходят reviewer, а demo релиз описывает ограничения. Ни один failure провайдера, пропуск или скрытая вкладка не превращается в ложную негативную оценку специалиста.

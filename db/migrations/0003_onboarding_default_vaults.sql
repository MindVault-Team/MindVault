-- Default vaults used by onboarding category mapping:
-- personal -> vault_personal
-- work -> vault_work
-- learning -> vault_learning
-- health -> vault_health
-- finance -> vault_finance

INSERT OR IGNORE INTO vaults (id, name, icon, description, privacy_tier, priority_profile, sort_order, meta)
VALUES
    ('vault_personal', 'Personal', 'user', 'Identity, preferences, interests, and personal context.', 'open', 'standard', 2, '{}'),
    ('vault_work', 'Work', 'briefcase', 'Professional goals, projects, and operating context.', 'open', 'standard', 3, '{}'),
    ('vault_learning', 'Learning', 'book', 'Skills, study notes, and ongoing learning tracks.', 'open', 'standard', 4, '{}'),
    ('vault_health', 'Health', 'heart', 'Well-being routines, health notes, and constraints.', 'local_only', 'standard', 5, '{}'),
    ('vault_finance', 'Finance', 'coins', 'Budgets, financial plans, and money-related context.', 'local_only', 'standard', 6, '{}');

-- Flip the default notification channel from SMS to WhatsApp.
--
-- An SMS to a Saudi number costs roughly ten times a WhatsApp utility message.
-- With ~5 notifications per operation, the previous defaults (SMS on, WhatsApp
-- off) spent more per operation on messaging than the platform's entire AI
-- bill. SMS remains fully available as an opt-in, and one-time passwords are
-- sent over SMS regardless of this preference.
--
-- Deliberately changes the DEFAULT only. Existing rows keep whatever the
-- customer already has, because silently switching a live customer's
-- notification channel is a consent decision, not a cost optimisation. New
-- accounts get the cheaper default.
--
-- Written idempotently (ALTER ... SET DEFAULT is naturally so) to match the
-- convention in this directory, where the /api/bootstrap safety net may have
-- already applied equivalent statements.

ALTER TABLE "User" ALTER COLUMN "smsNotificationsEnabled" SET DEFAULT false;
ALTER TABLE "User" ALTER COLUMN "whatsappNotificationsEnabled" SET DEFAULT true;

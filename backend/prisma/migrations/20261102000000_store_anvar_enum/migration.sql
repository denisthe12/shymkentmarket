-- ANVAR store code (fourth network). Run outside a transaction: a new enum value cannot be used in the same transaction.
ALTER TYPE "StoreCode" ADD VALUE IF NOT EXISTS 'ANVAR';

-- Migration: Add ui_metadata column to vaults and sub_vaults tables
-- This column will store structural layout state (coordinates) and other UI-specific properties in a JSON string.

ALTER TABLE vaults ADD COLUMN ui_metadata TEXT DEFAULT '{}';
ALTER TABLE sub_vaults ADD COLUMN ui_metadata TEXT DEFAULT '{}';

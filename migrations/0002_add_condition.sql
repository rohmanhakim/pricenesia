-- =============================================================================
-- Pricenesia D1 Database Schema - Migration 0002
-- Description: Add condition column to platform_listings
-- =============================================================================

-- Add condition column to platform_listings
ALTER TABLE platform_listings ADD COLUMN condition TEXT DEFAULT 'new';

-- =============================================================================
-- Schema Notes
-- =============================================================================
-- 
-- Condition values for 'condition' column:
-- - 'new' (default) - Brand new item
-- - 'used' - Second-hand item
--
-- =============================================================================
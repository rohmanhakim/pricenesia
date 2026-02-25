// =============================================================================
// Pricenesia Shared Types
// =============================================================================

// -----------------------------------------------------------------------------
// Product Types
// -----------------------------------------------------------------------------

export interface Product {
  id: string
  name: string
  category: string | null
  model_number: string | null
  image_url: string | null
  is_active: number
  created_at: string
}

export interface AddProductRequest {
  id: string
  name: string
  category?: string
  model_number?: string
  image_url?: string
}

export interface AddProductResponse {
  id: string
  name: string
  category: string | null
  model_number: string | null
  image_url: string | null
  is_active: number
  created_at: string
}

export interface ProductListResponse {
  products: Product[]
  total: number
}

// -----------------------------------------------------------------------------
// Update Product Types
// -----------------------------------------------------------------------------

export interface UpdateProductRequest {
  name?: string
  category?: string
  model_number?: string
  image_url?: string
  is_active?: boolean
}

export interface UpdateProductResponse {
  id: string
  name: string
  category: string | null
  model_number: string | null
  image_url: string | null
  is_active: number
  created_at: string
}

// -----------------------------------------------------------------------------
// Health Types
// -----------------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok' | 'error'
  timestamp: string
  version?: string
}

// -----------------------------------------------------------------------------
// Listing Types
// -----------------------------------------------------------------------------

export type Platform = 'tokopedia' | 'shopee' | 'blibli' | 'lazada' | 'tiktokshop'

export type SellerTier = 'official_store' | 'mall' | 'verified' | 'regular'

export type ListingCondition = 'new' | 'used'

export type StockStatus = 'available' | 'limited' | 'out_of_stock'

export interface Listing {
  id: string
  canonical_product_id: string
  platform: Platform
  platform_product_id: string | null
  seller_id: string | null
  seller_name: string
  seller_tier: SellerTier | null
  raw_url: string
  referral_url: string | null
  is_active: number
  is_pinned_seller: number
  condition: ListingCondition
  added_at: string
  last_scraped_at: string | null
}

export interface AddListingRequest {
  canonical_product_id: string
  platform: Platform
  platform_product_id?: string
  seller_id?: string
  seller_name: string
  seller_tier?: SellerTier
  raw_url: string
  condition?: ListingCondition
  is_pinned_seller?: boolean
}

export interface AddListingResponse {
  id: string
  canonical_product_id: string
  platform: Platform
  platform_product_id: string | null
  seller_id: string | null
  seller_name: string
  seller_tier: SellerTier | null
  raw_url: string
  referral_url: string | null
  is_active: number
  is_pinned_seller: number
  condition: ListingCondition
  added_at: string
  last_scraped_at: string | null
}

export interface ListingListResponse {
  listings: Listing[]
  total: number
}

export interface ListingListFilters {
  canonical_product_id?: string
  platform?: Platform
  is_active?: boolean
  condition?: ListingCondition
}

export interface UpdateListingRequest {
  seller_name?: string
  seller_tier?: SellerTier
  raw_url?: string
  referral_url?: string
  is_active?: boolean
  is_pinned_seller?: boolean
  condition?: ListingCondition
}

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

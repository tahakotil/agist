import { Context } from 'hono'

export function getPaginationParams(c: Context) {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10) || 20))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

export function paginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  }
}

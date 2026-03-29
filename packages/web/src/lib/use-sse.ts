"use client"

import { useEffect, useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const SSE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/events`
  : 'http://localhost:4400/api/events'

export function useSSE() {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const retriesRef = useRef(0)

  useEffect(() => {
    let es: EventSource
    let closed = false
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      if (closed) return
      es = new EventSource(SSE_URL)

      es.onopen = () => {
        setConnected(true)
        retriesRef.current = 0
        // Backend came back — refetch all stale queries
        queryClient.invalidateQueries().catch(() => undefined)
      }

      es.addEventListener('agent.status', () => {
        queryClient.invalidateQueries({ queryKey: ['agents'] }).catch(() => undefined)
      })

      es.addEventListener('run.completed', () => {
        queryClient.invalidateQueries({ queryKey: ['runs'] }).catch(() => undefined)
        queryClient.invalidateQueries({ queryKey: ['agents'] }).catch(() => undefined)
      })

      es.addEventListener('run.started', () => {
        queryClient.invalidateQueries({ queryKey: ['runs'] }).catch(() => undefined)
        queryClient.invalidateQueries({ queryKey: ['agents'] }).catch(() => undefined)
      })

      es.onerror = () => {
        setConnected(false)
        es.close()
        if (closed) return
        // Exponential backoff: 2s, 4s, 8s, max 30s
        const delay = Math.min(2000 * Math.pow(2, retriesRef.current), 30000)
        retriesRef.current++
        retryTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      closed = true
      clearTimeout(retryTimer)
      es?.close()
    }
  }, [queryClient])

  return connected
}

export { useSSE as default }

"use client"

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const SSE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/events`
  : 'http://localhost:4400/api/events'

export function useSSE() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let es: EventSource
    let closed = false

    function connect() {
      if (closed) return
      es = new EventSource(SSE_URL)

      // Server emits event type "agent.status" (dot notation)
      es.addEventListener('agent.status', () => {
        queryClient.invalidateQueries({ queryKey: ['agents'] }).catch(() => undefined)
      })

      // Server emits event type "run.completed" (dot notation)
      es.addEventListener('run.completed', () => {
        queryClient.invalidateQueries({ queryKey: ['runs'] }).catch(() => undefined)
        // Also refresh agents (status may have changed back to idle)
        queryClient.invalidateQueries({ queryKey: ['agents'] }).catch(() => undefined)
      })

      es.addEventListener('run.started', () => {
        queryClient.invalidateQueries({ queryKey: ['runs'] }).catch(() => undefined)
        queryClient.invalidateQueries({ queryKey: ['agents'] }).catch(() => undefined)
      })

      es.onerror = () => {
        // EventSource will auto-reconnect on error, no manual action needed
      }
    }

    connect()

    return () => {
      closed = true
      es?.close()
    }
  }, [queryClient])
}

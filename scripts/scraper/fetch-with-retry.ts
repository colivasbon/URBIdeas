export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
  delayMs = 1000
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw new Error('Max retries exceeded')
}

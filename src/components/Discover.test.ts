import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { Discover } from './Discover'
import type { CatalogEntry } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>): ReactNode => {
      const translations: Record<string, string> = {
        'discover.loadingCatalog': 'Loading the curated skill list…',
        'discover.loadError': 'Could not load the curated list',
        'discover.retry': 'Retry',
        'discover.resultsCount': `Showing ${params?.visible ?? 0} of ${params?.total ?? 0}`,
        'discover.showMore': `Show ${params?.count ?? 0} more`
      }
      return translations[key] ?? key
    }
  })
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const localizedDescription = (id: string): CatalogEntry => ({
  id,
  name: id,
  description: `Description for ${id}`,
  techs: ['react'],
  sourceRepo: 'example/catalog'
})

const renderDiscover = async (props: Partial<Parameters<typeof Discover>[0]> = {}) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  await act(async () => {
    root.render(createElement(Discover, {
      query: '',
      catalog: [],
      loading: false,
      error: null,
      onRetry: vi.fn(),
      onInstall: vi.fn(),
      ...props
    }))
  })
  return { container, root }
}

afterEach(() => { document.body.replaceChildren() })

describe('Discover', () => {
  it('renders the loading and error states without attempting a second fetch itself', async () => {
    const loading = await renderDiscover({ catalog: null, loading: true })
    expect(loading.container.querySelector('.loading')?.textContent).toContain('Loading')
    await act(async () => { loading.root.unmount() })

    const onRetry = vi.fn()
    const failed = await renderDiscover({ catalog: null, error: 'network unavailable', onRetry })
    expect(failed.container.textContent).toContain('network unavailable')
    const retryButton = [...failed.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Retry'))
    await act(async () => { retryButton?.click() })
    expect(onRetry).toHaveBeenCalledOnce()
    await act(async () => { failed.root.unmount() })
  })

  it('filters by technology and reveals the rest of a large catalog incrementally', async () => {
    const catalog = [...Array.from({ length: 30 }, (_, index) => localizedDescription(`react-${index}`)), {
      id: 'vue-only', name: 'vue-only', description: 'Vue entry', techs: ['vue'], sourceRepo: 'example/vue'
    }]
    const rendered = await renderDiscover({ catalog })
    expect(rendered.container.querySelectorAll('.catalog-card')).toHaveLength(30)
    expect(rendered.container.textContent).toContain('Showing 30 of 31')

    const showMore = [...rendered.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Show 1 more'))
    await act(async () => { showMore?.click() })
    expect(rendered.container.querySelectorAll('.catalog-card')).toHaveLength(31)

    const technology = rendered.container.querySelector('select') as HTMLSelectElement
    await act(async () => {
      technology.value = 'vue'
      technology.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(rendered.container.querySelectorAll('.catalog-card')).toHaveLength(1)
    expect(rendered.container.textContent).toContain('vue-only')
    await act(async () => { rendered.root.unmount() })
  })
})

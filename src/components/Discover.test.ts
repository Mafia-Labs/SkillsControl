import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { Discover } from './Discover'
import type { CatalogEntry, CatalogPack } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>): ReactNode => {
      const translations: Record<string, string> = {
        'discover.loadingCatalog': 'Loading the curated skill list…',
        'discover.loadError': 'Could not load the curated list',
        'discover.individualSkills': 'Individual skills',
        'discover.retry': 'Retry',
        'discover.resultsCount': `Showing ${params?.visible ?? 0} of ${params?.total ?? 0}`,
        'discover.showMore': `Show ${params?.count ?? 0} more`,
        'discover.packs.title': 'Packs',
        'discover.packs.loading': 'Loading curated packs…',
        'discover.packs.loadError': 'Could not load the curated packs',
        'discover.packs.skillCount': `${params?.count ?? 0} skills`,
        'discover.packs.viewSkills': 'View skills',
        'discover.packs.hideSkills': 'Hide skills',
        'discover.packs.installPack': 'Install pack',
        'discover.packs.selectAll': 'Select all',
        'discover.packs.selectNone': 'Select none',
        'discover.packs.installSelected': `Install ${params?.count ?? 0} skills`
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

const testPack = (id: string, entryCount = 2): CatalogPack => ({
  id,
  name: `${id}-pack`,
  description: `Description for ${id} pack`,
  category: 'marketing',
  entries: Array.from({ length: entryCount }, (_, index) => localizedDescription(`${id}-skill-${index}`))
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
      packs: [],
      packsLoading: false,
      packsError: null,
      onRetryPacks: vi.fn(),
      onInstallPack: vi.fn(),
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

  it('renders pack loading and error states', async () => {
    const loading = await renderDiscover({ packs: null, packsLoading: true })
    expect(loading.container.textContent).toContain('Loading curated packs')
    await act(async () => { loading.root.unmount() })

    const onRetryPacks = vi.fn()
    const failed = await renderDiscover({ packs: null, packsError: 'network unavailable', onRetryPacks })
    expect(failed.container.textContent).toContain('Could not load the curated packs')
    const retryButton = [...failed.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Retry'))
    await act(async () => { retryButton?.click() })
    expect(onRetryPacks).toHaveBeenCalledOnce()
    await act(async () => { failed.root.unmount() })
  })

  it('installs a whole pack, or expands it to install a subset of its skills', async () => {
    const pack = testPack('marketing', 3)
    const onInstallPack = vi.fn()
    const rendered = await renderDiscover({ packs: [pack], onInstallPack })
    expect(rendered.container.querySelectorAll('.pack-card')).toHaveLength(1)

    const installPackButton = [...rendered.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Install pack'))
    await act(async () => { installPackButton?.click() })
    expect(onInstallPack).toHaveBeenCalledWith(pack, pack.entries.map((entry) => entry.id))

    const viewSkillsButton = [...rendered.container.querySelectorAll('button')].find((button) => button.textContent?.includes('View skills'))
    await act(async () => { viewSkillsButton?.click() })
    expect(rendered.container.querySelectorAll('.pack-skill-list input[type="checkbox"]')).toHaveLength(3)

    const firstCheckbox = rendered.container.querySelector('.pack-skill-list input[type="checkbox"]') as HTMLInputElement
    await act(async () => { firstCheckbox.click() })
    const installSelectedButton = [...rendered.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Install 2 skills'))
    await act(async () => { installSelectedButton?.click() })
    expect(onInstallPack).toHaveBeenCalledWith(pack, [pack.entries[1].id, pack.entries[2].id])
    await act(async () => { rendered.root.unmount() })
  })
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** Load the browser bundle exactly the way the page's module loader does. */
function loadBundle() {
  let spec
  const window = { __ModuleLoader__: { load(value) { spec = value } } }
  // eslint-disable-next-line no-new-func -- the bundle is a plain page script.
  new Function('window', SOURCE)(window)
  return spec
}

function makePrimitives() {
  return {
    Button: 'Button',
    IconChevronLeftOutlineRegular: 'IconChevronLeftOutlineRegular',
    IconChevronRightOutlineRegular: 'IconChevronRightOutlineRegular',
    IconGlobeOutlineRegular: 'IconGlobeOutlineRegular',
    IconRefreshOutlineRegular: 'IconRefreshOutlineRegular',
    IconRightUpOutlineRegular: 'IconRightUpOutlineRegular',
    IconSettingsOutlineRegular: 'IconSettingsOutlineRegular',
    Modal: 'Modal',
    Tooltip: 'Tooltip',
  }
}

function makeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
  }
}

function makeStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
    raw() { return values },
  }
}

/** Build the client module and every registration it produced. */
function boot() {
  const spec = loadBundle()
  assert.equal(spec.id, 'dsh-chat')

  const registrations = []
  const localeRegistrations = []
  const effects = []
  const ctx = {
    effect(fn, label) {
      const cleanup = fn()
      effects.push({ cleanup, label })
      return cleanup
    },
    locale: {
      register(namespace, dictionaries) {
        localeRegistrations.push({ namespace, dictionaries })
        return () => {}
      },
      bind() {
        return (key) => key
      },
    },
    slots: {
      inject(_name, callback) {
        callback()
      },
      register(options, component) {
        const registration = { options, component }
        registrations.push(registration)
        return () => {}
      },
    },
  }

  const created = spec.factory((id) => {
    if (id === 'react') return makeReact()
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return makePrimitives()
    throw new Error(`unexpected require: ${id}`)
  })
  created.apply(ctx)
  return { spec, created, registrations, localeRegistrations, effects }
}

function mainFace(registrations) {
  const overlay = registrations.find((registration) => registration.options.name === 'shell.overlay')
  assert.ok(overlay, 'the persistent Chat overlay must be registered')
  assert.equal(typeof overlay.options.inject, 'function')
  return overlay.options.inject()
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve))
}

/** A tiny stand-in for the Electron <webview> element and its container. */
function createFakeDocument() {
  const listeners = new Map()
  const element = {
    className: '',
    dataset: {},
    style: {},
    attributes: {},
    removed: false,
    loaded: [],
    loadOptions: [],
    userAgentCalls: [],
    backCalls: 0,
    forwardCalls: 0,
    reloadCalls: 0,
    currentUrl: 'about:blank',
    title: '',
    canGoBackValue: false,
    canGoForwardValue: false,
    loadingValue: false,
    setAttribute(name, value) {
      this.attributes[name] = String(value)
    },
    addEventListener(name, handler) {
      const list = listeners.get(name) ?? []
      list.push(handler)
      listeners.set(name, list)
    },
    removeEventListener() {},
    dispatch(name, event = {}) {
      for (const handler of [...(listeners.get(name) ?? [])]) handler(event)
    },
    loadURL(url, options) {
      this.loaded.push(url)
      this.loadOptions.push(options)
      this.currentUrl = url
      return Promise.resolve()
    },
    setUserAgent(value) {
      this.userAgentCalls.push(value)
      return true
    },
    getURL() { return this.currentUrl },
    getTitle() { return this.title },
    canGoBack() { return this.canGoBackValue },
    canGoForward() { return this.canGoForwardValue },
    isLoading() { return this.loadingValue },
    goBack() { this.backCalls += 1 },
    goForward() { this.forwardCalls += 1 },
    reload() { this.reloadCalls += 1 },
    remove() { this.removed = true },
  }
  const container = {
    children: [],
    append(child) { this.children.push(child) },
  }
  return {
    document: {
      createElement(tag) {
        assert.equal(tag, 'webview')
        return element
      },
    },
    element,
    container,
  }
}

function createFakeBridge() {
  const calls = { acquire: [], release: [], openLease: null, open: null }
  const bridge = {
    async acquire(workspace) {
      calls.acquire.push(workspace)
      return { lease: 'lease-1', partition: 'partition-1' }
    },
    async release(lease) {
      calls.release.push(lease)
    },
    onOpenRequested(lease, listener) {
      calls.openLease = lease
      calls.open = listener
      return () => {
        calls.open = null
      }
    },
  }
  return { bridge, calls }
}

test('the bundle declares the dsh-chat client half', () => {
  const { spec, created } = boot()
  assert.equal(spec.id, 'dsh-chat')
  assert.deepEqual(created.inject, ['slots', 'locale'])
  assert.equal(typeof created.apply, 'function')
})

test('the plugin registers one sidebar row, one main placeholder, and one overlay', () => {
  const { registrations, localeRegistrations } = boot()
  assert.equal(registrations.length, 3)
  const sidebar = registrations.find((registration) => registration.options.name === 'sidebar.panellist')
  const main = registrations.find((registration) => registration.options.name === 'main')
  const overlay = registrations.find((registration) => registration.options.name === 'shell.overlay')
  assert.ok(sidebar, 'the sidebar row must be registered')
  assert.ok(main, 'the main placeholder must be registered')
  assert.ok(overlay, 'the persistent overlay must be registered')
  assert.equal(sidebar.options.id, 'chat')
  assert.equal(sidebar.options.order, 30)
  assert.equal(sidebar.options.label(), 'panel.label')
  assert.equal(main.options.key, 'chat')
  const layoutFace = main.options.inject()
  assert.equal(typeof layoutFace.layout?.getSnapshot, 'function')
  assert.deepEqual(layoutFace.layout.getSnapshot(), { active: false, rect: null })
  assert.equal(overlay.options.id, 'dsh-chat')
  assert.equal(overlay.options.locale, 'dsh-chat')
  const face = overlay.options.inject()
  assert.equal(typeof face.createWebviewController, 'function')
  assert.equal(typeof face.userAgent, 'string')
  assert.equal(localeRegistrations.length, 1)
  assert.equal(localeRegistrations[0].namespace, 'dsh-chat')
  assert.deepEqual(
    Object.keys(localeRegistrations[0].dictionaries).sort(),
    ['de', 'en', 'es', 'fr', 'ja', 'pt', 'ru', 'zh'],
  )
})

test('the shared layout store drives the persistent overlay', () => {
  const { registrations } = boot()
  const layout = registrations.find((registration) => registration.options.name === 'main').options.inject().layout
  let notifications = 0
  const unsubscribe = layout.subscribe(() => { notifications += 1 })
  layout.set({ active: true, rect: { left: 10, top: 20, width: 800, height: 600 } })
  assert.equal(notifications, 1)
  assert.deepEqual(layout.getSnapshot(), {
    active: true,
    rect: { left: 10, top: 20, width: 800, height: 600 },
  })
  layout.set({ active: true })
  assert.equal(notifications, 1)
  layout.set({ active: false })
  assert.equal(notifications, 2)
  assert.equal(layout.getSnapshot().active, false)
  unsubscribe()
  layout.set({ active: true })
  assert.equal(notifications, 2)
})

test('every locale dictionary carries the same non-empty keys', () => {
  const { localeRegistrations } = boot()
  const dictionaries = localeRegistrations[0].dictionaries
  const reference = Object.keys(dictionaries.en).sort()
  assert.ok(reference.length > 0)
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), reference, `locale ${language} is missing keys`)
    for (const key of reference) {
      assert.equal(typeof dictionary[key], 'string', `locale ${language} key ${key} is not a string`)
      assert.ok(dictionary[key].trim().length > 0, `locale ${language} key ${key} is empty`)
    }
  }
})

test('every locale has plugin metadata', () => {
  const { localeRegistrations } = boot()
  for (const language of Object.keys(localeRegistrations[0].dictionaries)) {
    const meta = JSON.parse(readFileSync(new URL(`../locale/${language}.json`, import.meta.url), 'utf8'))
    assert.equal(typeof meta.meta?.title, 'string', `locale/${language}.json needs meta.title`)
    assert.ok(meta.meta.title.trim().length > 0)
    assert.equal(typeof meta.meta?.description, 'string', `locale/${language}.json needs meta.description`)
    assert.ok(meta.meta.description.trim().length > 0)
  }
})

test('url normalization follows the Browser address rules', () => {
  const { registrations } = boot()
  const face = mainFace(registrations)
  assert.equal(face.normalizeUrl('chat.deepseek.com'), 'https://chat.deepseek.com/')
  assert.equal(face.normalizeUrl('https://chat.deepseek.com/a?b=1#c'), 'https://chat.deepseek.com/a?b=1#c')
  assert.equal(face.normalizeUrl('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000/')
  assert.equal(face.normalizeUrl(''), null)
  assert.equal(face.normalizeUrl('   '), null)
  assert.equal(face.normalizeUrl('file:///tmp/page.html'), null)
  assert.equal(face.normalizeUrl('javascript:alert(1)'), null)
  assert.equal(face.normalizeUrl('https://user:secret@example.com/'), null)
  assert.equal(face.normalizeUrl('https://'), null)
  assert.equal(face.normalizeUrl(`https://${'a'.repeat(16385)}.com/`), null)
})

test('configuration and last-url storage validate and fall back', () => {
  const { registrations } = boot()
  const face = mainFace(registrations)
  const config = makeStorage()
  assert.equal(face.loadConfig(config), 'https://chat.deepseek.com/')
  assert.equal(face.saveConfig('chat.deepseek.com', config), true)
  assert.equal(face.loadConfig(config), 'https://chat.deepseek.com/')
  assert.equal(face.saveConfig('file:///tmp/x', config), false)
  config.setItem('dsh-chat.config.v1', '{not json')
  assert.equal(face.loadConfig(config), 'https://chat.deepseek.com/')
  config.setItem('dsh-chat.config.v1', JSON.stringify({ url: 'javascript:alert(1)' }))
  assert.equal(face.loadConfig(config), 'https://chat.deepseek.com/')

  const last = makeStorage()
  assert.equal(face.readLastUrl(last), null)
  assert.equal(face.writeLastUrl('example.com/chat', last), true)
  assert.equal(face.readLastUrl(last), 'https://example.com/chat')
  assert.equal(face.writeLastUrl('file:///tmp/x', last), false)
})

test('the webview controller acquires, attaches, loads, and releases a guest', async () => {
  const { registrations } = boot()
  const face = mainFace(registrations)
  const fake = createFakeDocument()
  const { bridge, calls } = createFakeBridge()
  const states = []
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
  const controller = face.createWebviewController({
    document: fake.document,
    bridge,
    container: fake.container,
    url: 'https://chat.deepseek.com/',
    userAgent,
    onState: (patch) => states.push(patch),
  })
  await tick()

  assert.deepEqual(calls.acquire, ['dsh-chat'])
  assert.equal(fake.container.children.length, 1)
  assert.equal(fake.element.attributes.name, 'lease-1')
  assert.equal(fake.element.attributes.partition, 'partition-1')
  assert.equal(fake.element.attributes.src, 'about:blank#lease-1')
  assert.equal(fake.element.attributes.allowpopups, '')
  assert.equal(fake.element.dataset.sidebarBrowserFrame, 'webview')
  assert.deepEqual(fake.element.loaded, [])

  fake.element.dispatch('dom-ready')
  assert.deepEqual(fake.element.loaded, ['https://chat.deepseek.com/'])
  assert.deepEqual(fake.element.userAgentCalls, [userAgent])
  assert.equal(fake.element.loadOptions[0]?.userAgent, userAgent)

  fake.element.currentUrl = 'https://chat.deepseek.com/a'
  fake.element.title = 'DeepSeek'
  fake.element.canGoBackValue = true
  fake.element.dispatch('did-navigate')
  const observed = states.findLast((patch) => patch.url === 'https://chat.deepseek.com/a')
  assert.ok(observed)
  assert.equal(observed.title, 'DeepSeek')
  assert.equal(observed.canGoBack, true)

  controller.back()
  controller.forward()
  controller.reload()
  assert.equal(fake.element.backCalls, 1)
  assert.equal(fake.element.forwardCalls, 1)
  assert.equal(fake.element.reloadCalls, 1)

  controller.setVisible(false)
  assert.equal(fake.element.style.visibility, 'hidden')
  controller.setVisible(true)
  assert.equal(fake.element.style.visibility, 'visible')

  assert.equal(calls.openLease, 'lease-1')
  assert.equal(typeof calls.open, 'function')
  calls.open('https://example.com/page')
  assert.ok(fake.element.loaded.includes('https://example.com/page'))

  controller.dispose()
  await tick()
  assert.equal(fake.element.removed, true)
  assert.deepEqual(calls.release, ['lease-1'])
})

test('a failed acquire reports an error instead of throwing', async () => {
  const { registrations } = boot()
  const face = mainFace(registrations)
  const fake = createFakeDocument()
  const states = []
  face.createWebviewController({
    document: fake.document,
    bridge: {
      async acquire() { throw new Error('guest denied') },
      async release() {},
    },
    container: fake.container,
    url: 'https://chat.deepseek.com/',
    onState: (patch) => states.push(patch),
  })
  await tick()
  assert.equal(states.some((patch) => patch.status === 'error' && patch.error.includes('guest denied')), true)
  assert.equal(fake.container.children.length, 0)
})

test('a missing desktop bridge reports unavailable', async () => {
  const { registrations } = boot()
  const face = mainFace(registrations)
  const fake = createFakeDocument()
  const states = []
  face.createWebviewController({
    document: fake.document,
    bridge: null,
    container: fake.container,
    url: 'https://chat.deepseek.com/',
    onState: (patch) => states.push(patch),
  })
  await tick()
  assert.equal(states.some((patch) => patch.status === 'unavailable'), true)
  assert.equal(fake.container.children.length, 0)
})

test('the injected face exposes the desktop bridge only when the shell provides it', () => {
  const previous = globalThis.dshDesktop
  try {
    const { registrations } = boot()
    assert.equal(mainFace(registrations).bridgeAvailable, false)

    globalThis.dshDesktop = {
      protocolVersion: 1,
      browser: {
        async acquire() { return { lease: 'l', partition: 'p' } },
        async release() {},
        onOpenRequested() { return () => {} },
      },
    }
    const withBridge = boot()
    assert.equal(mainFace(withBridge.registrations).bridgeAvailable, true)
  } finally {
    if (previous === undefined) delete globalThis.dshDesktop
    else globalThis.dshDesktop = previous
  }
})

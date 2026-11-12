/**
 * Browser half of dsh-chat.
 *
 * Adds a first-level "Chat" entry to the left sidebar. Selecting it mounts one
 * main panel that owns an Electron <webview>: the panel is a thin browser
 * around a configurable AI web page (DeepSeek Chat by default), so simple
 * questions can be asked on the web without spending DSH model tokens.
 *
 * The page cannot be an iframe: chat.deepseek.com sends
 * `Content-Security-Policy: frame-ancestors 'none'`. The desktop shell exposes a
 * lease-scoped browser bridge on `window.dshDesktop.browser`; this bundle uses
 * exactly the same acquire/attach sequence as the shipped right-sidebar
 * Browser, and the desktop main process keeps enforcing its sandbox,
 * permission, download, and navigation policy for the guest.
 *
 * This file must keep the `window.__ModuleLoader__.load({ id, factory })`
 * contract: the id is the package name, and baseline platform modules arrive
 * through `require`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-chat',
  factory(require) {
    const React = require('react')
    const {
      Button,
      IconChevronLeftOutlineRegular,
      IconChevronRightOutlineRegular,
      IconGlobeOutlineRegular,
      IconRefreshOutlineRegular,
      IconRightUpOutlineRegular,
      IconSettingsOutlineRegular,
      Modal,
      Tooltip,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement
    const NS = 'dsh-chat'
    const DEFAULT_URL = 'https://chat.deepseek.com/'
    const CONFIG_KEY = 'dsh-chat.config.v1'
    const LAST_URL_KEY = 'dsh-chat.last-url.v1'
    const GUEST_STORAGE_KEY = 'dsh-chat.guest-storage.v1'
    const GUEST_STORAGE_LIMIT = 1500000
    const GUEST_STORAGE_SITES = 4
    const RESTORE_MARKER_PREFIX = 'dsh-chat.session.restored.'
    const WORKSPACE_KEY = 'dsh-chat'
    const MAX_URL_LENGTH = 16384

    /** Copy for every locale the web client ships (en and zh are the baseline). */
    const en = {
      'panel.label': 'Chat',
      'panel.subtitle': 'Chat',
      'toolbar.back': 'Back',
      'toolbar.forward': 'Forward',
      'toolbar.reload': 'Reload',
      'toolbar.home': 'Home',
      'toolbar.settings': 'Settings',
      'toolbar.external': 'Open in system browser',
      'settings.title': 'Chat settings',
      'settings.urlLabel': 'Web address',
      'settings.urlPlaceholder': 'https://chat.deepseek.com/',
      'settings.urlHint': 'Default: https://chat.deepseek.com/',
      'settings.loginHint': 'Login state is saved on this device and restored after restarting the app.',
      'settings.loginSnapshotSaved': 'A saved login snapshot was found; it will be restored after restarting the app.',
      'settings.loginSnapshotMissing': 'No saved login snapshot yet. After signing in, wait a few seconds and reopen this dialog.',
      'settings.clearLogin': 'Clear saved login',
      'settings.loginCleared': 'Saved login cleared. You will need to sign in again after restarting the app.',
      'settings.reset': 'Reset to default',
      'settings.cancel': 'Cancel',
      'settings.save': 'Save and open',
      'settings.errorUrl': 'Enter a valid http(s) web address.',
      'settings.saveFailed': 'Could not save the setting. Check that app storage is available.',
      'state.loading': 'Loading web page…',
      'state.errorTitle': 'The web page could not be loaded',
      'state.errorRetry': 'Retry',
      'state.unavailableTitle': 'Chat panel unavailable',
      'state.unavailableBody': 'The in-app web panel works in the DSH desktop app only. You can still open this page in your system browser.',
      'state.openExternal': 'Open in system browser',
      'page.untitled': 'Web page',
    }

    const zh = {
      'panel.label': 'Chat',
      'panel.subtitle': 'Chat',
      'toolbar.back': '后退',
      'toolbar.forward': '前进',
      'toolbar.reload': '刷新',
      'toolbar.home': '回到主页',
      'toolbar.settings': '设置',
      'toolbar.external': '在系统浏览器中打开',
      'settings.title': 'Chat 设置',
      'settings.urlLabel': '网页地址',
      'settings.urlPlaceholder': 'https://chat.deepseek.com/',
      'settings.urlHint': '默认：https://chat.deepseek.com/',
      'settings.loginHint': '登录状态会保存在本机，重启应用后自动恢复。',
      'settings.loginSnapshotSaved': '已找到保存的登录快照，重启应用后会自动恢复。',
      'settings.loginSnapshotMissing': '还没有保存的登录快照。登录后等几秒，再重新打开这个设置。',
      'settings.clearLogin': '清除已保存登录',
      'settings.loginCleared': '已清除保存的登录；下次重启应用需要重新登录。',
      'settings.reset': '恢复默认',
      'settings.cancel': '取消',
      'settings.save': '保存并打开',
      'settings.errorUrl': '请输入有效的 http(s) 网页地址。',
      'settings.saveFailed': '保存失败，请检查应用存储是否可用。',
      'state.loading': '正在加载网页…',
      'state.errorTitle': '网页加载失败',
      'state.errorRetry': '重试',
      'state.unavailableTitle': 'Chat 面板不可用',
      'state.unavailableBody': '内置网页面板仅在 DSH 桌面版可用。你仍然可以在系统浏览器中打开该网页。',
      'state.openExternal': '在系统浏览器打开',
      'page.untitled': '网页',
    }

    const ja = {
      'panel.label': 'Chat',
      'panel.subtitle': 'Chat',
      'toolbar.back': '戻る',
      'toolbar.forward': '進む',
      'toolbar.reload': '再読み込み',
      'toolbar.home': 'ホーム',
      'toolbar.settings': '設定',
      'toolbar.external': 'システムブラウザで開く',
      'settings.title': 'Chat の設定',
      'settings.urlLabel': 'ウェブアドレス',
      'settings.urlPlaceholder': 'https://chat.deepseek.com/',
      'settings.urlHint': '既定: https://chat.deepseek.com/',
      'settings.loginHint': 'ログイン状態はこの端末に保存され、アプリの再起動後に復元されます。',
      'settings.loginSnapshotSaved': '保存済みのログインスナップショットがあります。アプリの再起動後に復元されます。',
      'settings.loginSnapshotMissing': '保存されたログインスナップショットはまだありません。ログイン後、数秒待ってからこの設定を開き直してください。',
      'settings.clearLogin': '保存したログインを削除',
      'settings.loginCleared': '保存したログインを削除しました。次回アプリ起動時に再ログインが必要です。',
      'settings.reset': '既定に戻す',
      'settings.cancel': 'キャンセル',
      'settings.save': '保存して開く',
      'settings.errorUrl': '有効な http(s) ウェブアドレスを入力してください。',
      'settings.saveFailed': '設定を保存できませんでした。アプリのストレージを確認してください。',
      'state.loading': 'ウェブページを読み込み中…',
      'state.errorTitle': 'ウェブページを読み込めませんでした',
      'state.errorRetry': '再試行',
      'state.unavailableTitle': 'Chat パネルは利用できません',
      'state.unavailableBody': 'アプリ内ウェブパネルは DSH デスクトップ版でのみ利用できます。システムブラウザで開くことはできます。',
      'state.openExternal': 'システムブラウザで開く',
      'page.untitled': 'ウェブページ',
    }

    const es = {
      'panel.label': 'Chat',
      'panel.subtitle': 'Chat',
      'toolbar.back': 'Atrás',
      'toolbar.forward': 'Adelante',
      'toolbar.reload': 'Recargar',
      'toolbar.home': 'Inicio',
      'toolbar.settings': 'Ajustes',
      'toolbar.external': 'Abrir en el navegador del sistema',
      'settings.title': 'Ajustes de Chat',
      'settings.urlLabel': 'Dirección web',
      'settings.urlPlaceholder': 'https://chat.deepseek.com/',
      'settings.urlHint': 'Predeterminada: https://chat.deepseek.com/',
      'settings.loginHint': 'El estado de inicio de sesión se guarda en este dispositivo y se restaura al reiniciar la aplicación.',
      'settings.loginSnapshotSaved': 'Se encontró una instantánea de inicio de sesión guardada; se restaurará al reiniciar la aplicación.',
      'settings.loginSnapshotMissing': 'Aún no hay una instantánea de inicio de sesión guardada. Después de iniciar sesión, espera unos segundos y vuelve a abrir este diálogo.',
      'settings.clearLogin': 'Borrar inicio de sesión guardado',
      'settings.loginCleared': 'Inicio de sesión guardado borrado. Tendrás que iniciar sesión de nuevo al reiniciar la aplicación.',
      'settings.reset': 'Restablecer',
      'settings.cancel': 'Cancelar',
      'settings.save': 'Guardar y abrir',
      'settings.errorUrl': 'Introduce una dirección web http(s) válida.',
      'settings.saveFailed': 'No se pudo guardar el ajuste. Comprueba el almacenamiento de la aplicación.',
      'state.loading': 'Cargando página web…',
      'state.errorTitle': 'No se pudo cargar la página web',
      'state.errorRetry': 'Reintentar',
      'state.unavailableTitle': 'Panel Chat no disponible',
      'state.unavailableBody': 'El panel web integrado solo funciona en la aplicación de escritorio DSH. Aún puedes abrir esta página en el navegador del sistema.',
      'state.openExternal': 'Abrir en el navegador del sistema',
      'page.untitled': 'Página web',
    }

    const fr = {
      'panel.label': 'Chat',
      'panel.subtitle': 'Chat',
      'toolbar.back': 'Retour',
      'toolbar.forward': 'Avancer',
      'toolbar.reload': 'Actualiser',
      'toolbar.home': 'Accueil',
      'toolbar.settings': 'Paramètres',
      'toolbar.external': 'Ouvrir dans le navigateur système',
      'settings.title': 'Paramètres de Chat',
      'settings.urlLabel': 'Adresse web',
      'settings.urlPlaceholder': 'https://chat.deepseek.com/',
      'settings.urlHint': 'Par défaut : https://chat.deepseek.com/',
      'settings.loginHint': "L'état de connexion est enregistré sur cet appareil et restauré après le redémarrage de l'application.",
      'settings.loginSnapshotSaved': "Une sauvegarde de connexion a été trouvée ; elle sera restaurée après le redémarrage de l'application.",
      'settings.loginSnapshotMissing': "Aucune sauvegarde de connexion pour l'instant. Après vous être connecté, attendez quelques secondes et rouvrez ce dialogue.",
      'settings.clearLogin': 'Effacer la connexion enregistrée',
      'settings.loginCleared': "Connexion enregistrée effacée. Vous devrez vous reconnecter après le redémarrage de l'application.",
      'settings.reset': 'Rétablir la valeur par défaut',
      'settings.cancel': 'Annuler',
      'settings.save': 'Enregistrer et ouvrir',
      'settings.errorUrl': 'Saisissez une adresse web http(s) valide.',
      'settings.saveFailed': "Impossible d'enregistrer le réglage. Vérifiez le stockage de l'application.",
      'state.loading': 'Chargement de la page web…',
      'state.errorTitle': 'Impossible de charger la page web',
      'state.errorRetry': 'Réessayer',
      'state.unavailableTitle': 'Panneau Chat indisponible',
      'state.unavailableBody': "Le panneau web intégré fonctionne uniquement dans l'application de bureau DSH. Vous pouvez toujours ouvrir cette page dans le navigateur système.",
      'state.openExternal': 'Ouvrir dans le navigateur système',
      'page.untitled': 'Page web',
    }

    const de = {
      'panel.label': 'Chat',
      'panel.subtitle': 'Chat',
      'toolbar.back': 'Zurück',
      'toolbar.forward': 'Vorwärts',
      'toolbar.reload': 'Neu laden',
      'toolbar.home': 'Startseite',
      'toolbar.settings': 'Einstellungen',
      'toolbar.external': 'Im Systembrowser öffnen',
      'settings.title': 'Chat-Einstellungen',
      'settings.urlLabel': 'Webadresse',
      'settings.urlPlaceholder': 'https://chat.deepseek.com/',
      'settings.urlHint': 'Standard: https://chat.deepseek.com/',
      'settings.loginHint': 'Der Anmeldestatus wird auf diesem Gerät gespeichert und nach dem Neustart der App wiederhergestellt.',
      'settings.loginSnapshotSaved': 'Ein gespeicherter Anmelde-Snapshot wurde gefunden; er wird nach dem Neustart der App wiederhergestellt.',
      'settings.loginSnapshotMissing': 'Noch kein gespeicherter Anmelde-Snapshot. Warte nach der Anmeldung einige Sekunden und öffne diesen Dialog erneut.',
      'settings.clearLogin': 'Gespeicherte Anmeldung löschen',
      'settings.loginCleared': 'Gespeicherte Anmeldung gelöscht. Nach dem Neustart der App musst du dich erneut anmelden.',
      'settings.reset': 'Standard wiederherstellen',
      'settings.cancel': 'Abbrechen',
      'settings.save': 'Speichern und öffnen',
      'settings.errorUrl': 'Gib eine gültige http(s)-Webadresse ein.',
      'settings.saveFailed': 'Die Einstellung konnte nicht gespeichert werden. Prüfe den App-Speicher.',
      'state.loading': 'Webseite wird geladen…',
      'state.errorTitle': 'Webseite konnte nicht geladen werden',
      'state.errorRetry': 'Erneut versuchen',
      'state.unavailableTitle': 'Chat-Panel nicht verfügbar',
      'state.unavailableBody': 'Das integrierte Web-Panel ist nur in der DSH-Desktop-App verfügbar. Du kannst die Seite trotzdem im Systembrowser öffnen.',
      'state.openExternal': 'Im Systembrowser öffnen',
      'page.untitled': 'Webseite',
    }

    const ru = {
      'panel.label': 'Chat',
      'panel.subtitle': 'Chat',
      'toolbar.back': 'Назад',
      'toolbar.forward': 'Вперёд',
      'toolbar.reload': 'Обновить',
      'toolbar.home': 'Домой',
      'toolbar.settings': 'Настройки',
      'toolbar.external': 'Открыть в системном браузере',
      'settings.title': 'Настройки Chat',
      'settings.urlLabel': 'Веб-адрес',
      'settings.urlPlaceholder': 'https://chat.deepseek.com/',
      'settings.urlHint': 'По умолчанию: https://chat.deepseek.com/',
      'settings.loginHint': 'Состояние входа сохраняется на этом устройстве и восстанавливается после перезапуска приложения.',
      'settings.loginSnapshotSaved': 'Найден сохранённый снимок входа; он будет восстановлен после перезапуска приложения.',
      'settings.loginSnapshotMissing': 'Сохранённого снимка входа пока нет. После входа подождите несколько секунд и откройте этот диалог снова.',
      'settings.clearLogin': 'Удалить сохранённый вход',
      'settings.loginCleared': 'Сохранённый вход удалён. После перезапуска приложения потребуется снова войти.',
      'settings.reset': 'Сбросить по умолчанию',
      'settings.cancel': 'Отмена',
      'settings.save': 'Сохранить и открыть',
      'settings.errorUrl': 'Введите корректный веб-адрес http(s).',
      'settings.saveFailed': 'Не удалось сохранить настройку. Проверьте хранилище приложения.',
      'state.loading': 'Загрузка веб-страницы…',
      'state.errorTitle': 'Не удалось загрузить веб-страницу',
      'state.errorRetry': 'Повторить',
      'state.unavailableTitle': 'Панель Chat недоступна',
      'state.unavailableBody': 'Встроенная веб-панель работает только в настольном приложении DSH. Эту страницу можно открыть в системном браузере.',
      'state.openExternal': 'Открыть в системном браузере',
      'page.untitled': 'Веб-страница',
    }

    const pt = {
      'panel.label': 'Chat',
      'panel.subtitle': 'Chat',
      'toolbar.back': 'Voltar',
      'toolbar.forward': 'Avançar',
      'toolbar.reload': 'Recarregar',
      'toolbar.home': 'Início',
      'toolbar.settings': 'Configurações',
      'toolbar.external': 'Abrir no navegador do sistema',
      'settings.title': 'Configurações do Chat',
      'settings.urlLabel': 'Endereço web',
      'settings.urlPlaceholder': 'https://chat.deepseek.com/',
      'settings.urlHint': 'Padrão: https://chat.deepseek.com/',
      'settings.loginHint': 'O estado de login é salvo neste dispositivo e restaurado após reiniciar o aplicativo.',
      'settings.loginSnapshotSaved': 'Um snapshot de login salvo foi encontrado; ele será restaurado após reiniciar o aplicativo.',
      'settings.loginSnapshotMissing': 'Ainda não há um snapshot de login salvo. Após entrar, aguarde alguns segundos e abra este diálogo novamente.',
      'settings.clearLogin': 'Limpar login salvo',
      'settings.loginCleared': 'Login salvo removido. Você precisará entrar novamente após reiniciar o aplicativo.',
      'settings.reset': 'Restaurar padrão',
      'settings.cancel': 'Cancelar',
      'settings.save': 'Salvar e abrir',
      'settings.errorUrl': 'Digite um endereço web http(s) válido.',
      'settings.saveFailed': 'Não foi possível salvar a configuração. Verifique o armazenamento do aplicativo.',
      'state.loading': 'Carregando página web…',
      'state.errorTitle': 'Não foi possível carregar a página web',
      'state.errorRetry': 'Tentar novamente',
      'state.unavailableTitle': 'Painel Chat indisponível',
      'state.unavailableBody': 'O painel web integrado funciona apenas no aplicativo de desktop DSH. Você ainda pode abrir esta página no navegador do sistema.',
      'state.openExternal': 'Abrir no navegador do sistema',
      'page.untitled': 'Página web',
    }

    const dictionaries = { en, zh, ja, es, fr, de, ru, pt }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /**
     * Canonicalize one address the same way the shipped Browser's address bar
     * does: bare hosts become HTTPS, only HTTP(S) with no embedded credentials
     * is accepted, and the DSH application origin is refused.
     */
    function normalizeUrl(value) {
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      if (trimmed === '' || trimmed.length > MAX_URL_LENGTH) return null
      const candidate = /^[A-Za-z][A-Za-z\d+.-]*:(?!\d+(?:[/?#]|$))/u.test(trimmed) ? trimmed : `https://${trimmed}`
      let url
      try {
        url = new URL(candidate)
      } catch {
        return null
      }
      if (url.username !== '' || url.password !== '') return null
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
      const origin = applicationOrigin()
      if (origin !== undefined) {
        try {
          if (url.origin === origin) return null
        } catch {
          /* an opaque origin cannot equal a URL origin */
        }
      }
      return url.href
    }

    function applicationOrigin() {
      try {
        const location = globalThis.location
        if (location === undefined || location === null || typeof location.origin !== 'string') return undefined
        if (location.origin === '' || location.origin === 'null') return undefined
        return location.origin
      } catch {
        return undefined
      }
    }

    function hostnameOf(url) {
      try {
        return new URL(url).hostname
      } catch {
        return ''
      }
    }

    function originOf(value) {
      const normalized = normalizeUrl(value)
      if (normalized === null) return null
      try {
        return new URL(normalized).origin
      } catch {
        return null
      }
    }

    function getStorage(name) {
      try {
        const value = globalThis[name]
        if (value === undefined || value === null || typeof value.getItem !== 'function') return null
        return value
      } catch {
        return null
      }
    }

    function readJson(storage, key) {
      if (storage === null) return null
      try {
        const raw = storage.getItem(key)
        if (typeof raw !== 'string' || raw.length === 0) return null
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }

    function writeJson(storage, key, value) {
      if (storage === null) return false
      try {
        storage.setItem(key, JSON.stringify(value))
        return true
      } catch {
        return false
      }
    }

    function loadConfig(storage = getStorage('localStorage')) {
      const parsed = readJson(storage, CONFIG_KEY)
      return normalizeUrl(parsed?.url) ?? DEFAULT_URL
    }

    function saveConfig(url, storage = getStorage('localStorage')) {
      const normalized = normalizeUrl(url)
      if (normalized === null) return false
      return writeJson(storage, CONFIG_KEY, { url: normalized })
    }

    function readLastUrl(storage = getStorage('sessionStorage')) {
      const parsed = readJson(storage, LAST_URL_KEY)
      return normalizeUrl(parsed?.url)
    }

    function writeLastUrl(url, storage = getStorage('sessionStorage')) {
      const normalized = normalizeUrl(url)
      if (normalized === null) return false
      return writeJson(storage, LAST_URL_KEY, { url: normalized })
    }

    function isHttpOrigin(value) {
      try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
      } catch {
        return false
      }
    }

    /**
     * Guest localStorage snapshots, keyed by origin. The desktop webview
     * partition is process-only, so the guest loses its localStorage on app
     * restart; keeping a copy in the DSH app storage lets the panel restore the
     * site's own auth token (`userToken` on DeepSeek) after restart.
     */
    function readGuestStorage(origin, storage = getStorage('localStorage')) {
      if (!isHttpOrigin(origin)) return null
      const parsed = readJson(storage, GUEST_STORAGE_KEY)
      const sites = parsed?.sites
      if (sites === null || typeof sites !== 'object' || Array.isArray(sites)) return null
      const entry = sites[origin]
      if (entry === null || typeof entry !== 'object' || entry.data === null || typeof entry.data !== 'object') return null
      const data = {}
      for (const [key, value] of Object.entries(entry.data)) {
        if (typeof key === 'string' && typeof value === 'string') data[key] = value
      }
      return Object.keys(data).length > 0 ? data : null
    }

    function saveGuestStorage(origin, data, storage = getStorage('localStorage')) {
      if (!isHttpOrigin(origin) || data === null || typeof data !== 'object' || Array.isArray(data)) return false
      const cleaned = {}
      let size = 2
      for (const [key, value] of Object.entries(data)) {
        if (typeof key !== 'string' || typeof value !== 'string') continue
        if (key.length > 1024 || value.length > 500000) continue
        size += key.length + value.length + 8
        if (size > GUEST_STORAGE_LIMIT) return false
        cleaned[key] = value
      }
      if (Object.keys(cleaned).length === 0) return false
      const parsed = readJson(storage, GUEST_STORAGE_KEY)
      const previous = parsed?.sites !== null && typeof parsed?.sites === 'object' && !Array.isArray(parsed.sites)
        ? parsed.sites
        : {}
      const sites = { ...previous }
      sites[origin] = { savedAt: Date.now(), data: cleaned }
      const origins = Object.keys(sites)
      if (origins.length > GUEST_STORAGE_SITES) {
        origins.sort((left, right) => (sites[left]?.savedAt ?? 0) - (sites[right]?.savedAt ?? 0))
        for (const old of origins.slice(0, origins.length - GUEST_STORAGE_SITES)) delete sites[old]
      }
      return writeJson(storage, GUEST_STORAGE_KEY, { version: 1, sites })
    }

    function removeGuestStorage(origin, storage = getStorage('localStorage')) {
      if (!isHttpOrigin(origin)) return false
      const parsed = readJson(storage, GUEST_STORAGE_KEY)
      const sites = parsed?.sites
      if (sites === null || typeof sites !== 'object' || Array.isArray(sites) || !(origin in sites)) return false
      const next = { ...sites }
      delete next[origin]
      return writeJson(storage, GUEST_STORAGE_KEY, { version: 1, sites: next })
    }

    function clearGuestStorage(storage = getStorage('localStorage')) {
      if (storage === null) return false
      try {
        storage.removeItem(GUEST_STORAGE_KEY)
        return true
      } catch {
        return false
      }
    }

    /**
     * One restore attempt per app renderer session and origin. sessionStorage
     * survives a page reload (so a reload keeps the process partition) but is
     * cleared when the application exits, which is exactly when the snapshot
     * needs to be injected again.
     */
    function claimGuestRestore(origin, storage = getStorage('sessionStorage')) {
      if (!isHttpOrigin(origin) || storage === null) return true
      const key = RESTORE_MARKER_PREFIX + origin
      try {
        if (storage.getItem(key) === '1') return false
        storage.setItem(key, '1')
        return true
      } catch {
        return true
      }
    }

    /** Whether live guest storage already contains DeepSeek's auth token. */
    function hasLiveLogin(data) {
      if (data === null || typeof data !== 'object' || Array.isArray(data)) return false
      const raw = data.userToken
      if (typeof raw !== 'string' || raw.length === 0) return false
      try {
        const parsed = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object') {
          return typeof parsed.value === 'string' && parsed.value.length > 0
        }
      } catch {
        /* a plain token string is also valid */
      }
      return raw !== 'null' && raw !== '""' && raw !== '{}'
    }

    /** Read every guest localStorage entry as a plain object. */
    const GUEST_READ_EXPRESSION = '(() => { const data = {}; for (let index = 0; index < localStorage.length; index += 1) { const key = localStorage.key(index); if (typeof key === "string") data[key] = localStorage.getItem(key); } return data })()'

    /** Tiny observable store shared by the placeholder and the persistent panel. */
    function createSnapshotStore(initial) {
      let snapshot = initial
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        set(patch) {
          const next = { ...snapshot, ...patch }
          let changed = false
          for (const key of Object.keys(next)) {
            if (next[key] !== snapshot[key]) {
              changed = true
              break
            }
          }
          if (!changed) return
          snapshot = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    /**
     * A normal desktop Chrome identity without the Electron token. DeepSeek's
     * web app flags a guest as unsafe when navigator.userAgent contains
     * "electron"; the guest itself is already sandboxed with nodeIntegration
     * disabled, so this only removes the false-positive environment banner.
     */
    function standardUserAgent() {
      try {
        const raw = typeof navigator === 'object' && typeof navigator.userAgent === 'string'
          ? navigator.userAgent
          : ''
        if (raw.length === 0) return ''
        return raw
          .replace(/\s(?:Electron|DeepSeek Harness|DeepSeekHarness)\/[\d.]+/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
      } catch {
        return ''
      }
    }

    /**
     * Drive one desktop <webview> through the shell's lease-scoped bridge.
     *
     * The element starts at `about:blank#<lease>` because the main process
     * reads the lease back from that URL when the guest attaches. The real page
     * is loaded only after `dom-ready`, exactly like the shipped Browser.
     */
    function createWebviewController(options) {
      const { document, bridge, container, workspaceKey = WORKSPACE_KEY, onState } = options
      const userAgent = typeof options.userAgent === 'string' ? options.userAgent : ''
      const readSavedStorage = typeof options.readGuestStorage === 'function' ? options.readGuestStorage : () => null
      const writeSavedStorage = typeof options.writeGuestStorage === 'function' ? options.writeGuestStorage : () => false
      const removeSavedStorage = typeof options.removeGuestStorage === 'function' ? options.removeGuestStorage : () => false
      let disposed = false
      let element = null
      let lease = null
      let ready = false
      let pendingUrl = normalizeUrl(options.url ?? '') ?? null
      let failure = null
      let releaseOpen = null
      let configuredOrigin = originOf(options.url ?? '')
      let storageState = 'idle'
      const restoredOrigins = new Set()
      let restoreAllowed = typeof options.claimRestore === 'function' ? options.claimRestore(configuredOrigin) : true
      let syncing = false
      let captureTimer = null
      let lastSavedSignature = ''
      const abort = new AbortController()

      const publish = (patch) => {
        if (disposed) return
        try {
          onState?.(patch)
        } catch (error) {
          console.warn('[dsh-chat] state listener failed:', messageOf(error))
        }
      }

      const fail = (error) => {
        if (disposed) return
        failure = messageOf(error)
        publish({ status: 'error', error: failure, loading: false })
      }

      const releaseLease = async (id) => {
        if (typeof id !== 'string' || id.length === 0) return
        if (bridge === null || bridge === undefined || typeof bridge.release !== 'function') return
        try {
          await bridge.release(id)
        } catch (error) {
          console.warn('[dsh-chat] browser lease release failed:', messageOf(error))
        }
      }

      const listen = (target, name, handler) => {
        try {
          target.addEventListener(name, handler, { signal: abort.signal })
        } catch {
          target.addEventListener(name, handler)
        }
      }

      const observe = () => {
        if (disposed || element === null) return
        const patch = { status: failure === null ? 'ready' : 'error' }
        if (failure !== null) patch.error = failure
        try {
          const current = normalizeUrl(element.getURL())
          if (current !== null) patch.url = current
          const title = element.getTitle()
          if (typeof title === 'string' && title.length > 0) patch.title = title
          patch.canGoBack = element.canGoBack()
          patch.canGoForward = element.canGoForward()
          patch.loading = element.isLoading()
        } catch (error) {
          fail(error)
          return
        }
        publish(patch)
      }

      const syncStorage = async () => {
        const target = element
        if (disposed || target === null || !ready || configuredOrigin === null || syncing || storageState === 'failed') return
        const current = normalizeUrl(target.getURL())
        if (current === null) return
        const origin = new URL(current).origin
        if (origin !== configuredOrigin) return
        syncing = true
        try {
          if (storageState === 'idle') {
            if (restoredOrigins.has(origin) || !restoreAllowed) {
              storageState = 'ready'
            } else {
              restoredOrigins.add(origin)
              let live = null
              if (typeof target.executeJavaScript === 'function') {
                try {
                  live = await target.executeJavaScript(GUEST_READ_EXPRESSION, false)
                } catch (error) {
                  console.warn('[dsh-chat] reading the live guest storage failed:', messageOf(error))
                }
              }
              if (disposed || element !== target) return
              if (hasLiveLogin(live)) {
                // A live login is newer than any snapshot in this process.
                storageState = 'ready'
              } else {
                storageState = 'restoring'
                let snapshot = null
                try {
                  snapshot = readSavedStorage(origin)
                } catch (error) {
                  console.warn('[dsh-chat] reading the saved web login failed:', messageOf(error))
                }
                if (snapshot !== null && typeof snapshot === 'object' && typeof target.executeJavaScript === 'function') {
                  try {
                    const serialized = JSON.stringify(snapshot)
                      .replace(/\u2028/g, '\\u2028')
                      .replace(/\u2029/g, '\\u2029')
                    await target.executeJavaScript(`(() => { const data = ${serialized}; for (const key of Object.keys(data)) { const value = data[key]; if (typeof value === 'string') localStorage.setItem(key, value); } return true })()`, false)
                    if (disposed || element !== target) return
                    storageState = 'ready'
                    if (typeof target.reload === 'function') target.reload()
                    return
                  } catch (error) {
                    storageState = 'failed'
                    console.warn('[dsh-chat] restoring the saved web login failed:', messageOf(error))
                    return
                  }
                }
                storageState = 'ready'
              }
            }
          }
          if (disposed || element !== target) return
          if (storageState === 'ready' && typeof target.executeJavaScript === 'function') {
            const data = await target.executeJavaScript(GUEST_READ_EXPRESSION, false)
            if (disposed || element !== target) return
            if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
              if (Object.keys(data).length === 0) {
                lastSavedSignature = ''
                try {
                  removeSavedStorage(origin)
                } catch (error) {
                  console.warn('[dsh-chat] removing the saved web login failed:', messageOf(error))
                }
              } else {
                const signature = JSON.stringify(data)
                if (signature !== lastSavedSignature) {
                  try {
                    if (writeSavedStorage(origin, data)) lastSavedSignature = signature
                  } catch (error) {
                    console.warn('[dsh-chat] saving the web login failed:', messageOf(error))
                  }
                }
              }
            }
          }
        } catch (error) {
          console.warn('[dsh-chat] guest storage sync failed:', messageOf(error))
        } finally {
          syncing = false
        }
      }

      const flush = () => {
        if (disposed || !ready || element === null || pendingUrl === null) return
        const target = pendingUrl
        pendingUrl = null
        try {
          if (userAgent.length > 0 && typeof element.setUserAgent === 'function') {
            try {
              element.setUserAgent(userAgent)
            } catch (error) {
              console.warn('[dsh-chat] setting the guest user agent failed:', messageOf(error))
            }
          }
          const result = userAgent.length > 0
            ? element.loadURL(target, { userAgent })
            : element.loadURL(target)
          if (result !== null && typeof result === 'object' && typeof result.catch === 'function') {
            result.catch((error) => {
              if (!disposed && error?.code !== 'ERR_ABORTED') fail(error)
            })
          }
        } catch (error) {
          fail(error)
        }
      }

      const teardown = (shouldRelease) => {
        const current = element
        element = null
        ready = false
        pendingUrl = null
        if (captureTimer !== null) {
          clearInterval(captureTimer)
          captureTimer = null
        }
        if (typeof releaseOpen === 'function') {
          try {
            releaseOpen()
          } catch {
            /* ignore an already-disposed subscription */
          }
          releaseOpen = null
        }
        try {
          abort.abort()
        } catch {
          /* abort is best-effort */
        }
        if (current !== null) {
          try {
            current.remove()
          } catch {
            /* the guest may already be gone */
          }
        }
        const id = lease
        lease = null
        if (shouldRelease && id !== null) void releaseLease(id)
      }

      const attach = async () => {
        if (bridge === null || bridge === undefined || typeof bridge.acquire !== 'function') {
          publish({ status: 'unavailable' })
          return
        }
        publish({ status: 'connecting' })
        try {
          const reservation = await bridge.acquire(workspaceKey)
          if (disposed) {
            await releaseLease(reservation?.lease)
            return
          }
          const nextLease = reservation?.lease
          const partition = reservation?.partition
          if (typeof nextLease !== 'string' || nextLease.length === 0 || typeof partition !== 'string' || partition.length === 0) {
            throw new Error('invalid guest reservation')
          }
          lease = nextLease
          const el = document.createElement('webview')
          element = el
          el.className = 'dsh-chat-webview'
          el.setAttribute('name', nextLease)
          el.setAttribute('partition', partition)
          el.setAttribute('allowpopups', '')
          el.setAttribute('src', 'about:blank#' + nextLease)
          if (el.dataset !== undefined && el.dataset !== null) el.dataset.sidebarBrowserFrame = 'webview'
          listen(el, 'dom-ready', () => {
            ready = true
            if (failure === null) publish({ status: 'ready' })
            flush()
          })
          listen(el, 'did-navigate', () => {
            observe()
            void syncStorage()
          })
          listen(el, 'did-navigate-in-page', (event) => {
            if (event === undefined || event.isMainFrame !== false) observe()
          })
          listen(el, 'page-title-updated', () => observe())
          listen(el, 'did-start-loading', () => publish({ loading: true }))
          listen(el, 'did-stop-loading', () => {
            observe()
            void syncStorage()
          })
          listen(el, 'did-fail-load', (event) => {
            if (event !== undefined && event !== null && event.isMainFrame === false) return
            if (event !== undefined && event !== null && event.errorCode === -3) return
            const description = event !== undefined && event !== null && typeof event.errorDescription === 'string'
              ? event.errorDescription
              : 'the page could not be loaded'
            fail(new Error(description))
          })
          listen(el, 'render-process-gone', () => {
            fail(new Error('the web page process exited'))
            teardown(false)
          })
          listen(el, 'destroyed', () => {
            if (!disposed) fail(new Error('the web page was destroyed'))
            teardown(false)
          })
          if (typeof bridge.onOpenRequested === 'function') {
            const unsubscribe = bridge.onOpenRequested(nextLease, (target) => {
              navigate(target)
            })
            releaseOpen = typeof unsubscribe === 'function' ? unsubscribe : null
            abort.signal.addEventListener('abort', () => {
              if (typeof releaseOpen === 'function') {
                releaseOpen()
                releaseOpen = null
              }
            }, { once: true })
          }
          container.append(el)
          captureTimer = setInterval(() => { void syncStorage() }, 5000)
        } catch (error) {
          fail(error)
          const id = lease
          lease = null
          if (id !== null) await releaseLease(id)
        }
      }

      const command = (name) => {
        if (disposed || !ready || element === null) return
        try {
          const fn = element[name]
          if (typeof fn === 'function') fn.call(element)
        } catch (error) {
          fail(error)
        }
      }

      function navigate(value) {
        const next = normalizeUrl(value)
        if (next === null) {
          fail(new Error('invalid web address'))
          return
        }
        failure = null
        pendingUrl = next
        publish({ status: ready ? 'ready' : 'loading', error: '', loading: true })
        flush()
      }

      function load(value) {
        const next = normalizeUrl(value)
        if (next === null) {
          fail(new Error('invalid web address'))
          return
        }
        const origin = originOf(next)
        if (origin !== null && origin !== configuredOrigin) {
          configuredOrigin = origin
          storageState = 'idle'
          restoredOrigins.delete(origin)
          restoreAllowed = typeof options.claimRestore === 'function' ? options.claimRestore(origin) : true
        }
        navigate(next)
      }

      const controller = {
        load,
        back() {
          command('goBack')
        },
        forward() {
          command('goForward')
        },
        reload() {
          command('reload')
        },
        setVisible(visible) {
          if (element === null) return
          try {
            element.style.visibility = visible ? 'visible' : 'hidden'
          } catch {
            /* the guest may already be gone */
          }
        },
        dispose() {
          if (disposed) return
          disposed = true
          teardown(true)
        },
      }

      void attach()
      return controller
    }

    function readDesktopBridge() {
      try {
        const desktop = globalThis.dshDesktop
        if (desktop === undefined || desktop === null || desktop.protocolVersion !== 1) return null
        const browser = desktop.browser
        if (browser === undefined || browser === null || typeof browser.acquire !== 'function') return null
        return browser
      } catch {
        return null
      }
    }

    function IconButton(props) {
      const { label, disabled = false, onClick, children } = props
      return h(Tooltip, { label, side: 'bottom', delayMs: 400 },
        h('button', {
          type: 'button',
          className: 'dsh-chat-icon-button',
          'aria-label': label,
          title: label,
          disabled,
          onClick,
        }, children))
    }

    function ChatIcon({ size = 20 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': 'true',
      },
      h('path', {
        d: 'M4.5 5.5h15v10h-8.2L6.8 19v-3.5H4.5z',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinejoin: 'round',
      }),
      h('circle', {
        cx: 12,
        cy: 10.5,
        r: 2.9,
        stroke: 'currentColor',
        strokeWidth: 1.3,
      }),
      h('path', {
        d: 'M9.1 10.5h5.8M12 7.6c1.15 1.05 1.15 4.75 0 5.8M12 7.6c-1.15 1.05-1.15 4.75 0 5.8',
        stroke: 'currentColor',
        strokeWidth: 1.1,
        strokeLinecap: 'round',
      }))
    }

    function ChatPanel(props) {
      const t = typeof props.t === 'function' ? props.t : props.translate
      const active = props.active === true
      const rect = props.rect ?? null
      const [configUrl, setConfigUrl] = React.useState(() => props.loadConfig())
      const [view, setView] = React.useState(() => ({
        status: props.bridgeAvailable ? 'connecting' : 'unavailable',
        url: '',
        title: '',
        canGoBack: false,
        canGoForward: false,
        loading: props.bridgeAvailable,
        error: '',
      }))
      const [attempt, setAttempt] = React.useState(0)
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const [draftUrl, setDraftUrl] = React.useState('')
      const [draftError, setDraftError] = React.useState('')
      const [settingsNotice, setSettingsNotice] = React.useState('')
      const [settingsSnapshot, setSettingsSnapshot] = React.useState(null)
      const containerRef = React.useRef(null)
      const controllerRef = React.useRef(null)
      const configRef = React.useRef(configUrl)
      configRef.current = configUrl
      const onStateRef = React.useRef(null)
      onStateRef.current = (patch) => {
        if (typeof patch.url === 'string' && patch.url.length > 0) {
          try {
            props.writeLastUrl(patch.url)
          } catch (error) {
            console.warn('[dsh-chat] last URL write failed:', messageOf(error))
          }
        }
        setView((previous) => ({ ...previous, ...patch }))
      }

      React.useEffect(() => {
        if (!props.bridgeAvailable) {
          setView((previous) => ({ ...previous, status: 'unavailable', loading: false }))
          return undefined
        }
        const container = containerRef.current
        if (container === null) return undefined
        setView((previous) => ({
          ...previous,
          status: 'connecting',
          url: '',
          title: '',
          canGoBack: false,
          canGoForward: false,
          loading: true,
          error: '',
        }))
        const initialUrl = props.readLastUrl() ?? configRef.current
        const controller = props.createWebviewController({
          document: globalThis.document,
          bridge: props.bridge,
          container,
          workspaceKey: WORKSPACE_KEY,
          url: initialUrl,
          userAgent: props.userAgent,
          readGuestStorage: props.readGuestStorage,
          writeGuestStorage: props.writeGuestStorage,
          removeGuestStorage: props.removeGuestStorage,
          claimRestore: props.claimGuestRestore,
          onState: (patch) => { onStateRef.current(patch) },
        })
        controllerRef.current = controller
        return () => {
          if (controllerRef.current === controller) controllerRef.current = null
          controller.dispose()
        }
      }, [attempt, props.bridgeAvailable])

      const overlayVisible = view.status === 'error' || view.status === 'unavailable'
      React.useEffect(() => {
        const controller = controllerRef.current
        if (controller === null || typeof controller.setVisible !== 'function') return
        controller.setVisible(active && !settingsOpen && !overlayVisible)
      }, [active, settingsOpen, overlayVisible])

      React.useEffect(() => {
        if (active) return
        setSettingsOpen(false)
        setDraftError('')
        setSettingsNotice('')
      }, [active])

      const openSettings = () => {
        setDraftUrl(configRef.current)
        setDraftError('')
        setSettingsNotice('')
        let saved = false
        try {
          const snapshot = props.readGuestStorage(new URL(configRef.current).origin)
          saved = snapshot !== null && props.hasLiveLogin(snapshot)
        } catch {
          saved = false
        }
        setSettingsSnapshot(saved)
        setSettingsOpen(true)
      }

      const saveSettings = () => {
        const normalized = props.normalizeUrl(draftUrl)
        if (normalized === null) {
          setDraftError(t('settings.errorUrl'))
          return
        }
        if (!props.saveConfig(normalized)) {
          setDraftError(t('settings.saveFailed'))
          return
        }
        setConfigUrl(normalized)
        props.writeLastUrl(normalized)
        setSettingsNotice('')
        setSettingsOpen(false)
        controllerRef.current?.load(normalized)
      }

      const resetSettings = () => {
        setDraftUrl(props.defaultUrl)
        setDraftError('')
      }

      const clearLogin = () => {
        const cleared = props.clearGuestStorage()
        setSettingsSnapshot(false)
        setSettingsNotice(cleared ? t('settings.loginCleared') : t('settings.saveFailed'))
      }

      const openExternal = () => {
        const target = view.url.length > 0 ? view.url : configRef.current
        if (target.length === 0) return
        if (typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open(target, '_blank', 'noopener,noreferrer')
        }
      }

      const home = () => {
        const target = configRef.current
        props.writeLastUrl(target)
        controllerRef.current?.load(target)
      }

      const title = view.title.length > 0
        ? view.title
        : (hostnameOf(view.url) || t('panel.subtitle'))

      const settingsModal = h(Modal, {
        open: settingsOpen,
        onClose: () => setSettingsOpen(false),
        title: t('settings.title'),
        closeLabel: t('settings.cancel'),
        className: 'dsh-chat-settings-dialog',
        footer: h('div', { className: 'dsh-chat-settings-footer' },
          h('div', { className: 'dsh-chat-settings-left' },
            h(Button, { variant: 'ghost', onClick: resetSettings }, t('settings.reset')),
            h(Button, { variant: 'ghost', onClick: clearLogin }, t('settings.clearLogin'))),
          h('div', { className: 'dsh-chat-settings-actions' },
            h(Button, { variant: 'outline', onClick: () => setSettingsOpen(false) }, t('settings.cancel')),
            h(Button, { variant: 'primary', onClick: saveSettings }, t('settings.save')))),
      }, h('div', { className: 'dsh-chat-settings-form' },
        h('label', { className: 'dsh-chat-settings-label', htmlFor: 'dsh-chat-url' }, t('settings.urlLabel')),
        h('input', {
          id: 'dsh-chat-url',
          className: 'dsh-chat-settings-input',
          type: 'text',
          value: draftUrl,
          placeholder: t('settings.urlPlaceholder'),
          autoFocus: true,
          spellCheck: false,
          autoComplete: 'off',
          onChange: (event) => {
            setDraftUrl(event.target.value)
            if (draftError.length > 0) setDraftError('')
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              saveSettings()
            }
          },
        }),
        h('p', { className: 'dsh-chat-settings-hint' }, t('settings.urlHint')),
        h('p', { className: 'dsh-chat-settings-hint' }, t('settings.loginHint')),
        settingsSnapshot !== null && h('p', { className: 'dsh-chat-settings-hint' }, settingsSnapshot ? t('settings.loginSnapshotSaved') : t('settings.loginSnapshotMissing')),
        draftError.length > 0 && h('p', { className: 'dsh-chat-settings-error', role: 'alert' }, draftError),
        settingsNotice.length > 0 && h('p', { className: 'dsh-chat-settings-notice', role: 'status' }, settingsNotice)))

      const overlay = view.status === 'unavailable'
        ? h('div', { className: 'dsh-chat-overlay' },
          h('div', { className: 'dsh-chat-card' },
            h('div', { className: 'dsh-chat-card-title' }, t('state.unavailableTitle')),
            h('p', { className: 'dsh-chat-card-body' }, t('state.unavailableBody')),
            h('div', { className: 'dsh-chat-card-actions' },
              h(Button, { variant: 'primary', onClick: openExternal }, t('state.openExternal')))))
        : view.status === 'error'
          ? h('div', { className: 'dsh-chat-overlay' },
            h('div', { className: 'dsh-chat-card' },
              h('div', { className: 'dsh-chat-card-title' }, t('state.errorTitle')),
              h('p', { className: 'dsh-chat-card-body' }, view.error || t('state.errorTitle')),
              h('div', { className: 'dsh-chat-card-actions' },
                h(Button, { variant: 'outline', onClick: () => setAttempt((value) => value + 1) }, t('state.errorRetry')),
                h(Button, { variant: 'primary', onClick: openExternal }, t('state.openExternal')))))
          : null

      const panelStyle = rect === null
        ? {
            position: 'fixed',
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            visibility: 'hidden',
            pointerEvents: 'none',
            zIndex: 20,
          }
        : {
            position: 'fixed',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            visibility: active ? 'visible' : 'hidden',
            pointerEvents: active ? 'auto' : 'none',
            zIndex: 20,
          }

      return h('div', { className: 'dsh-chat-root', style: panelStyle },
        h('div', { className: 'dsh-chat-toolbar' },
          h('div', { className: 'dsh-chat-toolbar-group' },
            h(IconButton, {
              label: t('toolbar.back'),
              disabled: !view.canGoBack,
              onClick: () => controllerRef.current?.back(),
            }, h(IconChevronLeftOutlineRegular, { size: 18 })),
            h(IconButton, {
              label: t('toolbar.forward'),
              disabled: !view.canGoForward,
              onClick: () => controllerRef.current?.forward(),
            }, h(IconChevronRightOutlineRegular, { size: 18 })),
            h(IconButton, {
              label: t('toolbar.reload'),
              disabled: view.status === 'unavailable',
              onClick: () => controllerRef.current?.reload(),
            }, h(IconRefreshOutlineRegular, { size: 17 })),
            h(IconButton, {
              label: t('toolbar.home'),
              onClick: home,
            }, h(IconGlobeOutlineRegular, { size: 17 }))),
          h('div', { className: 'dsh-chat-title', title: view.url }, title),
          h('div', { className: 'dsh-chat-toolbar-group' },
            h(IconButton, {
              label: t('toolbar.settings'),
              onClick: openSettings,
            }, h(IconSettingsOutlineRegular, { size: 17 })),
            h(IconButton, {
              label: t('toolbar.external'),
              onClick: openExternal,
            }, h(IconRightUpOutlineRegular, { size: 16 })))),
        view.loading && h('div', {
          className: 'dsh-chat-loading',
          role: 'progressbar',
          'aria-label': t('state.loading'),
        }),
        h('div', { className: 'dsh-chat-body' },
          h('div', { className: 'dsh-chat-frame', ref: containerRef }),
          overlay),
        settingsModal)
    }

    /**
     * The main slot stays an empty, measurable placeholder. The actual Chat UI
     * lives in the persistent overlay below, so switching to another panel only
     * hides it: the webview, its login state, and the page's in-memory state are
     * not destroyed and no reload happens on the next visit.
     */
    function ChatSlot({ layout }) {
      const ref = React.useRef(null)
      React.useLayoutEffect(() => {
        const element = ref.current
        if (element === null) return undefined
        let frame = 0
        const measure = () => {
          if (frame !== 0) return
          frame = window.requestAnimationFrame(() => {
            frame = 0
            if (!element.isConnected) return
            const rect = element.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) {
              layout.set({ active: false })
              return
            }
            layout.set({
              active: true,
              rect: {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              },
            })
          })
        }
        measure()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        if (observer !== null) observer.observe(element)
        window.addEventListener('resize', measure)
        return () => {
          if (frame !== 0) window.cancelAnimationFrame(frame)
          if (observer !== null) observer.disconnect()
          window.removeEventListener('resize', measure)
          layout.set({ active: false })
        }
      }, [layout])
      return h('div', { className: 'dsh-chat-slot', ref })
    }

    /** Root-scoped persistent Chat surface, hidden while another panel is active. */
    function ChatOverlay(props) {
      const layout = props.layout
      const state = React.useSyncExternalStore(layout.subscribe, layout.getSnapshot, layout.getSnapshot)
      const [opened, setOpened] = React.useState(() => state.active)
      React.useEffect(() => {
        if (state.active && !opened) setOpened(true)
      }, [state.active, opened])
      if (!opened) return null
      return h(ChatPanel, { ...props, active: state.active, rect: state.rect })
    }

    const STYLES = [
      '.dsh-chat-root{display:flex;flex-direction:column;height:100%;min-height:0;flex:auto;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);}',
      '.dsh-chat-slot{width:100%;height:100%;min-width:0;min-height:0;}',
      '.dsh-chat-toolbar{display:flex;align-items:center;gap:8px;height:44px;flex:none;padding:0 10px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-sizing:border-box;}',
      '.dsh-chat-toolbar-group{display:flex;align-items:center;gap:2px;flex:none;}',
      '.dsh-chat-icon-button{width:28px;height:28px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;}',
      '.dsh-chat-icon-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      '.dsh-chat-icon-button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px;}',
      '.dsh-chat-icon-button:disabled{opacity:.4;cursor:default;}',
      '.dsh-chat-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--dsw-alias-label-secondary);padding:0 6px;}',
      '.dsh-chat-body{position:relative;flex:1;min-height:0;background:var(--dsw-alias-bg-base);}',
      '.dsh-chat-frame{position:absolute;inset:0;}',
      '.dsh-chat-webview{width:100%;height:100%;display:flex;border:0;background:#fff;}',
      '.dsh-chat-loading{height:2px;flex:none;background:linear-gradient(90deg,transparent,var(--dsw-alias-state-business-primary),transparent);background-size:200% 100%;animation:dsh-chat-progress 1.1s linear infinite;pointer-events:none;}',
      '@keyframes dsh-chat-progress{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '.dsh-chat-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-base);}',
      '.dsh-chat-card{width:min(440px,100%);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-1);padding:20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 8px 28px rgba(0,0,0,.08);}',
      '.dsh-chat-card-title{font-size:15px;font-weight:600;}',
      '.dsh-chat-card-body{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary);word-break:break-word;}',
      '.dsh-chat-card-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px;}',
      '.dsh-chat-settings-form{display:flex;flex-direction:column;gap:8px;}',
      '.dsh-chat-settings-label{font-size:12px;color:var(--dsw-alias-label-secondary);}',
      '.dsh-chat-settings-input{width:100%;height:34px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 10px;font:inherit;font-size:13px;outline:none;}',
      '.dsh-chat-settings-input:focus{border-color:var(--dsw-alias-state-business-primary);}',
      '.dsh-chat-settings-hint{margin:0;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-caption);}',
      '.dsh-chat-settings-error{margin:0;font-size:12px;color:var(--dsw-alias-label-error);}',
      '.dsh-chat-settings-notice{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-success-primary);}',
      '.dsh-chat-settings-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;flex-wrap:wrap;}',
      '.dsh-chat-settings-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
      '.dsh-chat-settings-actions{display:flex;gap:8px;}',
    ].join('')

    function apply(ctx) {
      const t = typeof ctx.locale?.bind === 'function'
        ? ctx.locale.bind(NS)
        : (key) => dictionaries.en[key] ?? key
      const bridge = readDesktopBridge()
      const layout = createSnapshotStore({ active: false, rect: null })
      const face = {
        defaultUrl: DEFAULT_URL,
        bridge,
        bridgeAvailable: bridge !== null,
        createWebviewController,
        loadConfig,
        readLastUrl,
        saveConfig,
        writeLastUrl,
        normalizeUrl,
        readGuestStorage,
        saveGuestStorage,
        writeGuestStorage: saveGuestStorage,
        removeGuestStorage,
        clearGuestStorage,
        claimGuestRestore,
        hasLiveLogin,
        translate: t,
        userAgent: standardUserAgent(),
      }

      if (ctx.locale !== undefined && ctx.locale !== null && typeof ctx.locale.register === 'function') {
        ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-chat: locale')
      }

      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        const existing = document.querySelector('style[data-plugin-css="dsh-chat"]')
        if (existing !== null) return () => {}
        const tag = document.createElement('style')
        tag.dataset.pluginCss = 'dsh-chat'
        tag.textContent = STYLES
        document.head.append(tag)
        return () => {
          tag.remove()
        }
      }, 'dsh-chat: styles')

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'chat',
        order: 30,
        label: () => t('panel.label'),
        locale: NS,
      }, ChatIcon))

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: 'chat',
        inject: () => ({ layout }),
      }, ChatSlot))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'dsh-chat',
        order: 10,
        locale: NS,
        inject: () => ({ layout, ...face }),
      }, ChatOverlay))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})

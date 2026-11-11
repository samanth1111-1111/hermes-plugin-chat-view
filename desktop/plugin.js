import { Codicon, ConfirmDialog, ColorSwatches, PROFILE_SWATCHES, host, ROUTES_AREA, SIDEBAR_NAV_AREA, SIDEBAR_PROFILE_GROUP_HEADER_AREA, PALETTE_AREA, useQuery, useValue } from '@hermes/plugin-sdk'
import { useState, useRef, useLayoutEffect, useEffect, useMemo, useCallback } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ACCENT_BLUE = 'var(--theme-primary)'
const HOVER_GLOW = `0 0 8px color-mix(in srgb, ${ACCENT_BLUE} 40%, transparent)`
const CARD_TITLE_COLOR = '#000000'
const CARD_CHAT_COLOR = '#222222'
const VIEW_CONTROL_COLOR = '#1f2937'
const VIEW_CONTROL_SIZE = 32
const DELETE_COLOR = '#dc2626'
const SEARCH_PLACEHOLDER_COLOR = '#6b7280'
const FOLDER_CHOICES_PER_PAGE = 4
const PREVIEW_WORD_LIMIT = 10
const PAGE_LAYOUTS = [['2x1', 2], ['2x2', 4], ['2x4', 8], ['4x4', 16]]
const PREVIEW_PROMPTS = 4
const PREVIEW_BATCH_SIZE = 20
const PREVIEW_MESSAGE_LIMIT = 100

function normalizeFolderPath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function getPopupPosition(trigger, popup, width, height, preferBelow = false) {
  const margin = 8
  const above = trigger.top - popup.height
  const below = trigger.bottom
  const preferredTop = preferBelow
    ? (below + popup.height <= height - margin ? below : above)
    : (above >= margin ? above : below)
  return {
    left: Math.max(margin, Math.min(trigger.right - popup.width, width - popup.width - margin)),
    top: Math.max(margin, Math.min(preferredTop, height - popup.height - margin))
  }
}

function useViewportPopup(open, triggerRef, popupRef, preferBelow = false) {
  const [position, setPosition] = useState(null)
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return }
    const update = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const popup = popupRef.current?.getBoundingClientRect()
      if (!trigger || !popup) return
      const next = getPopupPosition(trigger, popup, document.documentElement.clientWidth, document.documentElement.clientHeight, preferBelow)
      setPosition(previous => previous?.left === next.left && previous?.top === next.top ? previous : next)
    }
    let frame = null
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(() => { frame = null; update() }) }
    update()
    const observer = new ResizeObserver(schedule)
    if (triggerRef.current) observer.observe(triggerRef.current)
    if (popupRef.current) observer.observe(popupRef.current)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [open, triggerRef, popupRef, preferBelow])
  return position
}

function usePopupDismiss(open, refs, onDismiss, focusRef) {
  const latest = useRef({ refs, onDismiss, focusRef })
  latest.current = { refs, onDismiss, focusRef }
  useEffect(() => {
    if (!open) return
    const dismiss = event => {
      const { refs, onDismiss } = latest.current
      if (!refs.some(ref => ref.current?.contains(event.target))) onDismiss()
    }
    const escape = event => {
      if (event.key !== 'Escape') return
      latest.current.onDismiss()
      latest.current.focusRef?.current?.querySelector('button')?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [open])
}
function NavigateIcon({ next = false }) {
  return jsx('svg', {
    width: 24, height: 24, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true,
    children: jsx('path', { d: next ? 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z' : 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z' })
  })
}
function FolderIcon() {
  return jsx('svg', {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.25,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    children: jsx('path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z' })
  })
}
function OpenFolderIcon() {
  return jsx('svg', {
    width: 18, height: 18, viewBox: '0 0 576 512', fill: 'currentColor', 'aria-hidden': true,
    children: jsx('path', { d: 'M572.694 292.093 500.27 416.25A64 64 0 0 1 444.973 448H45.025c-18.523 0-30.065-20.093-20.797-36.093L96.652 287.75A64 64 0 0 1 151.95 256h399.947c18.523 0 30.065 20.093 20.797 36.093ZM144 224h304v-48c0-26.51-21.49-48-48-48H240l-64-64H48C21.49 64 0 85.49 0 112v278.046l68.348-117.167A87.987 87.987 0 0 1 144 224Z' })
  })
}
let storage
let closeGallery = null
function openSplitGallery() {
  if (closeGallery) return
  closeGallery = host.openWorkspace('chat-view-history', {
    title: 'Chat View',
    dock: { pane: 'workspace', pos: 'left' },
    minWidth: '20rem',
    render: () => jsx(ChatHistoryPage, { split: true }),
    onClose: () => { closeGallery = null }
  })
}

function closeSplitGallery() {
  const close = closeGallery
  closeGallery = null
  close?.()
}

async function openChatView() {
  const selected = storage.get('selectedChat', null)
  if (selected) {
    try { await host.openSession(selected.id, { profile: selected.profile }) }
    catch (error) { host.notifyError('Could not reopen chat. ' + error.message) }
  } else {
    host.navigate('/')
  }
  openSplitGallery()
}

const controlStyle = {
  padding: '8px 12px', border: '1px solid var(--ui-stroke-tertiary)',
  borderRadius: '8px', background: 'var(--ui-bg-editor)',
  color: 'var(--ui-text-primary)', font: 'inherit'
}

const pageArrowStyle = {
  ...controlStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '2px 4px', background: ACCENT_BLUE, borderColor: ACCENT_BLUE, color: '#ffffff'
}
const popupStyle = {
  borderRadius: '12px', background: 'var(--ui-bg-editor)',
  border: '1px solid var(--ui-stroke-tertiary)', boxShadow: '0 8px 24px #0002'
}
const dropdownStyle = {
  ...popupStyle, position: 'absolute', top: 'calc(100% + 8px)', right: 0,
  width: '260px', maxWidth: 'calc(100vw - 48px)', zIndex: 30, padding: '16px',
  display: 'flex', flexDirection: 'column', gap: '12px'
}
const createButtonStyle = {
  ...controlStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '6px', color: '#ffffff', background: ACCENT_BLUE, borderColor: ACCENT_BLUE
}
const cancelButtonStyle = { ...controlStyle, display: 'inline-flex', padding: '6px' }
const deleteButtonStyle = { ...controlStyle, color: DELETE_COLOR, borderColor: DELETE_COLOR }
const dateTimeStyle = { fontSize: '11px', color: 'var(--ui-text-tertiary)' }

function highlight(text, search) {
  const value = String(text || '')
  const index = value.toLowerCase().indexOf(search.toLowerCase())
  if (!search || index < 0) return value
  return jsxs('span', { children: [
    value.slice(0, index),
    jsx('mark', {
      style: { background: 'var(--theme-accent-soft)', color: 'var(--theme-foreground)', borderRadius: '3px' },
      children: value.slice(index, index + search.length)
    }),
    value.slice(index + search.length)
  ] })
}

function FolderCreateForm({ name, onNameChange, busy, error, onSubmit, onCancel, compact = false }) {
  return jsxs('form', {
    style: { display: 'flex', flexDirection: 'column', gap: compact ? '6px' : '12px' },
    onSubmit,
    children: [
      jsx('input', { autoFocus: true, required: true, 'aria-label': 'Folder name', placeholder: 'Folder name', value: name, disabled: busy, style: { ...controlStyle, width: '100%', boxSizing: 'border-box', ...(compact ? { padding: '4px 8px', fontSize: '12px' } : {}) }, onChange: event => onNameChange(event.target.value) }),
      jsxs('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' }, children: [
        jsx('button', { type: 'submit', 'aria-label': 'Create folder', title: 'Create folder', disabled: busy || !name.trim(), style: createButtonStyle, children: 'Create' }),
        jsx('button', { type: 'button', 'aria-label': 'Cancel new folder', title: 'Cancel', disabled: busy, style: cancelButtonStyle, onClick: onCancel, children: jsx(Codicon, { name: 'close', size: '18px' }) })
      ] }),
      error && jsx('span', { role: 'alert', children: error })
    ]
  })
}

function messageText(message) {
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) return message.content.map(part => part.text || '').join(' ')
  return message.text || ''
}

async function loadPreviewMessages(sessionId, profile) {
  let messages = []
  let promptCount = 0
  for (let offset = 0; offset < PREVIEW_MESSAGE_LIMIT; offset += PREVIEW_BATCH_SIZE) {
    const result = await window.hermesDesktop.api({
      path: '/api/sessions/' + encodeURIComponent(sessionId) + '/messages?' + new URLSearchParams({
        profile: profile || 'default', limit: String(PREVIEW_BATCH_SIZE), offset: String(offset),
        order: 'latest', include_compacted: 'true', inline_images: 'false'
      }), passive: true
    })
    const batch = result.messages || []
    messages = batch.concat(messages)
    promptCount += batch.filter(message => message.role === 'user' && messageText(message).trim()).length
    if (promptCount >= PREVIEW_PROMPTS || batch.length < PREVIEW_BATCH_SIZE) break
  }
  return { messages }
}

async function loadFolderDeletionSessions(profile) {
  const owner = profile || 'default'
  const sessions = new Map()
  const limit = 100
  for (let offset = 0; ; offset += limit) {
    const result = await window.hermesDesktop.api({
      path: '/api/sessions?' + new URLSearchParams({ profile: owner, limit: String(limit), offset: String(offset), archived: 'include', order: 'created', min_messages: '0' }),
      passive: true
    })
    if (!Array.isArray(result?.sessions) || !Number.isSafeInteger(result.total) || result.total < 0 || Object.values(result.storage || {}).includes('corrupt')) {
      throw new Error('Could not safely load all folder chats. Nothing was deleted.')
    }
    const previousSize = sessions.size
    for (const session of result.sessions) {
      if (!session.id || (session.profile && session.profile !== owner)) throw new Error('Folder chat ownership could not be verified. Nothing was deleted.')
      sessions.set(session.id, session)
    }
    if (offset + limit >= result.total) break
    if (sessions.size === previousSize) throw new Error('Folder chat pagination made no progress. Nothing was deleted.')
  }
  return [...sessions.values()]
}

function CardPrompts({ session, profile, term, wordLimit }) {
  const transcript = useQuery({
    queryKey: ['chat-view', 'prompts', profile, session.id, session.last_active, session.message_count],
    queryFn: () => loadPreviewMessages(session.id, profile),
    staleTime: 30000
  })
  const prompts = useMemo(() => (transcript.data?.messages || [])
    .filter(message => message.role === 'user')
    .map(messageText)
    .filter(text => text.trim())
    .slice(-PREVIEW_PROMPTS), [transcript.data?.messages])
  let remainingWords = wordLimit ?? Infinity
  const previewPrompts = prompts.flatMap(prompt => {
    if (remainingWords <= 0) return []
    const words = prompt.trim().split(/\s+/)
    const shown = words.slice(0, remainingWords)
    remainingWords -= shown.length
    return [shown.join(' ') + (shown.length < words.length ? '…' : '')]
  })
  const fallbackPreview = session.preview || 'No user prompts available'
  const fallbackWords = fallbackPreview.trim().split(/\s+/)
  if (transcript.isLoading) return jsx('span', { style: { fontSize: '12px' }, children: 'Loading prompts…' })
  if (transcript.error) return jsx('span', { style: { fontSize: '12px' }, children: 'Prompts could not be loaded.' })
  return jsx('span', {
    style: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, color: CARD_CHAT_COLOR },
    children: prompts.length ? previewPrompts.map((prompt, index) => jsx('span', {
      style: {
        fontSize: '12px', lineHeight: '1.4', color: CARD_CHAT_COLOR,
        borderLeft: '2px solid var(--ui-stroke-tertiary)', paddingLeft: '6px',
        display: 'block', whiteSpace: 'normal',
        overflowWrap: 'anywhere', flexShrink: 0
      },
      title: prompt,
      children: highlight(prompt, term)
    }, index)) : jsx('span', { children: wordLimit && fallbackWords.length > wordLimit ? fallbackWords.slice(0, wordLimit).join(' ') + '…' : fallbackPreview })
  })
}

function CardActions({ session, profile, onChanged, onAssignFolder, color, onColor, skipArchiveConfirm, skipDeleteConfirm }) {
  const [open, setOpen] = useState(false)
  const folderTriggerRef = useRef(null)
  const folderPopupRef = useRef(null)
  const folderPopupPosition = useViewportPopup(open, folderTriggerRef, folderPopupRef, false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const colorTriggerRef = useRef(null)
  const paletteRef = useRef(null)
  const palettePosition = useViewportPopup(paletteOpen, colorTriggerRef, paletteRef, false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [newFolder, setNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderMenuSearch, setFolderMenuSearch] = useState('')
  const [folderMenuPage, setFolderMenuPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    const dismiss = event => {
      if (folderTriggerRef.current?.contains(event.target) || folderPopupRef.current?.contains(event.target)) return
      setOpen(false); setNewFolder(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  const projects = useQuery({
    queryKey: ['chat-view', 'projects', profile],
    queryFn: () => host.request('projects.list', { profile }),
    enabled: open,
    staleTime: 30000
  })
  async function perform(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      setOpen(false)
      setConfirmDelete(false)
      setConfirmArchive(false)
      await onChanged()
    } catch (failure) {
      setError(failure.message || String(failure))
    } finally {
      setBusy(false)
    }
  }
  const availableProjects = useMemo(() => (projects.data?.projects || []).filter(project => !project.archived && String(project.name || '').toLowerCase().includes(folderMenuSearch.trim().toLowerCase())), [projects.data?.projects, folderMenuSearch])
  const folderMenuPageCount = Math.max(1, Math.ceil(availableProjects.length / FOLDER_CHOICES_PER_PAGE))
  const currentFolderMenuPage = Math.min(folderMenuPage, folderMenuPageCount - 1)
  const visibleFolderChoices = availableProjects.slice(currentFolderMenuPage * FOLDER_CHOICES_PER_PAGE, currentFolderMenuPage * FOLDER_CHOICES_PER_PAGE + FOLDER_CHOICES_PER_PAGE)
  return jsxs('div', {
    onClick: event => event.stopPropagation(),
    onKeyDown: event => event.stopPropagation(),
    style: { position: 'relative', flex: '0 1 124px', minWidth: 0, maxWidth: '100%', marginLeft: 'auto' },
    children: [
      jsxs('div', {
        style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '4px', minWidth: 0, maxWidth: '100%' },
        children: [
          jsxs('div', {
            style: { position: 'relative', display: 'inline-flex' },
            onMouseEnter: () => { if (!busy) { setPaletteOpen(true); setOpen(false); setConfirmDelete(false) } },
            onMouseLeave: () => setPaletteOpen(false),
            onFocus: () => { if (!busy) setPaletteOpen(true) },
            onBlur: event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaletteOpen(false) },
            onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); setPaletteOpen(false) } },
            children: [
              jsx('button', {
            ref: colorTriggerRef, type: 'button', className: 'chat-view-color-trigger', disabled: busy,
            title: 'Change card color', 'aria-label': 'Change card color', 'aria-expanded': paletteOpen,
            'data-open': paletteOpen,
            style: { ...controlStyle, padding: '4px', color: color || 'var(--ui-text-primary)' },
            onClick: () => { setPaletteOpen(!paletteOpen); setOpen(false); setConfirmDelete(false); setError('') },
            children: jsx(Codicon, { name: 'symbol-color', size: '16px' })
          }),
              paletteOpen && jsx('div', {
                ref: paletteRef,
                role: 'group', 'aria-label': 'Appearance colors',
                style: { position: 'fixed', left: palettePosition?.left ?? 8, top: palettePosition?.top ?? 8, visibility: palettePosition ? 'visible' : 'hidden', width: '184px', maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', boxSizing: 'border-box', padding: '10px', zIndex: 1000, borderRadius: '8px', background: 'var(--ui-bg-editor)', border: '1px solid ' + ACCENT_BLUE },
                children: jsx(ColorSwatches, {
                  swatches: PROFILE_SWATCHES, value: color, clearLabel: 'No color',
                  swatchLabel: value => 'Set color ' + value,
                  onChange: value => {
                    if (busy) return
                    try {
                      host.sessions.setColor(session._lineage_root_id || session.id, value)
                      onColor(value)
                      setPaletteOpen(false)
                    } catch (failure) { setError(failure.message || String(failure)) }
                  }
                })
              })
            ]
          }),
          jsx('button', {
            type: 'button', disabled: busy, style: { ...controlStyle, padding: '4px' }, title: 'Archive chat', 'aria-label': 'Archive chat', children: jsx(Codicon, { name: 'archive', size: '16px' }),
            onClick: () => {
              setConfirmDelete(false); setOpen(false); setPaletteOpen(false); setError('')
              if (skipArchiveConfirm) perform(() => host.request('session.archive', { session_id: session.id, profile, archived: true }))
              else setConfirmArchive(true)
            }
          }),
          jsx('button', {
            type: 'button', disabled: busy, title: 'Delete chat', 'aria-label': 'Delete chat',
            style: { ...controlStyle, padding: '4px', color: 'var(--dt-destructive)' },
            onClick: () => {
              setConfirmArchive(false); setOpen(false); setPaletteOpen(false); setError('')
              if (skipDeleteConfirm) perform(() => host.request('session.delete', { session_id: session.id, profile }))
              else setConfirmDelete(true)
            },
            children: jsx(Codicon, { name: 'trash', size: '16px' })
          }),
          jsxs('div', {
            style: { position: 'relative', display: 'inline-flex' },
            onMouseLeave: () => { if (!busy && !newFolder) setOpen(false) },
            onKeyDown: event => { if (event.key === 'Escape') { setOpen(false); setNewFolder(false) } },
            children: [
              jsx('button', {
                ref: folderTriggerRef, type: 'button', disabled: busy, title: 'Folders', 'aria-label': 'Chat folders',
                'aria-expanded': open, style: { ...controlStyle, padding: '4px' },
                onClick: () => { setOpen(!open); setPaletteOpen(false); setConfirmDelete(false); setError('') },
                children: jsx(FolderIcon, {})
              }),
              open && jsxs('div', {
                ref: folderPopupRef,
                role: 'group', 'aria-label': 'Chat folders',
                style: { position: 'fixed', left: folderPopupPosition?.left ?? 8, top: folderPopupPosition?.top ?? 8, visibility: folderPopupPosition ? 'visible' : 'hidden', zIndex: 1000, width: '190px', maxWidth: 'calc(100vw - 16px)', boxSizing: 'border-box', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px', borderRadius: '8px', background: 'var(--ui-bg-editor)', border: '1px solid ' + ACCENT_BLUE, color: 'var(--ui-text-primary)' },
                children: [
                  !newFolder && jsx('button', {
                    type: 'button', disabled: busy, style: { ...controlStyle, padding: '4px 8px', fontSize: '12px' }, children: 'New folder',
                    onClick: () => { setNewFolder(true); setError('') }
                  }),
                  newFolder && jsx('section', {
                    className: 'chat-view-create-folder', 'aria-label': 'New folder',
                    style: { position: 'relative', width: '100%', maxWidth: 'calc(100vw - 48px)', boxSizing: 'border-box', padding: '8px', boxShadow: '0 8px 24px #0002', border: '1px solid ' + ACCENT_BLUE, borderRadius: '12px', background: 'var(--ui-bg-editor)', color: VIEW_CONTROL_COLOR, fontFamily: 'var(--dt-font-sans)' },
                    children: jsx(FolderCreateForm, { name: folderName, onNameChange: setFolderName, busy, error, compact: true, onCancel: () => setNewFolder(false),
 onSubmit: event => {
                      event.preventDefault()
                      if (!folderName.trim()) return
                      perform(async () => {
                        const created = await host.request('projects.create', { profile, name: folderName.trim(), folders: [], use: false })
                        if (!created.project?.id) throw new Error('Folder could not be created')
                        onAssignFolder(created.project.id)
                        await projects.refetch()
                        setFolderName(''); setNewFolder(false)
                      })
                    }
 })
                  }),
                  !newFolder && jsx('input', {
                    type: 'search', placeholder: 'Search folders', 'aria-label': 'Search folders', value: folderMenuSearch,
                    style: { ...controlStyle, padding: '4px 8px', fontSize: '12px', width: '100%', boxSizing: 'border-box', minWidth: 0 },
                    onChange: event => { setFolderMenuSearch(event.target.value); setFolderMenuPage(0) }
                  }),
                  !newFolder && jsxs('div', {
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' },
                    children: [
                      jsx('button', { type: 'button', className: 'chat-view-page-arrow', 'aria-label': 'Previous folder page', style: pageArrowStyle, disabled: busy || currentFolderMenuPage === 0, onClick: () => setFolderMenuPage(currentFolderMenuPage - 1), children: jsx(NavigateIcon, {}) }),
                      jsxs('span', { style: { fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', color: VIEW_CONTROL_COLOR }, children: [jsx('span', { children: 'Page' }), jsx('span', { children: (currentFolderMenuPage + 1) + ' out of ' + folderMenuPageCount })] }),
                      jsx('button', { type: 'button', className: 'chat-view-page-arrow', 'aria-label': 'Next folder page', style: pageArrowStyle, disabled: busy || currentFolderMenuPage + 1 >= folderMenuPageCount, onClick: () => setFolderMenuPage(currentFolderMenuPage + 1), children: jsx(NavigateIcon, { next: true }) })
                    ]
                  }),
                  !newFolder && projects.isLoading && jsx('span', { children: 'Loading folders…' }),
                  !newFolder && projects.error && jsx('span', { role: 'alert', children: 'Could not load folders.' }),
                  !newFolder && !projects.isLoading && !projects.error && !availableProjects.length && jsx('span', { children: folderMenuSearch ? 'No matching folders.' : 'No folders yet.' }),
                  ...(newFolder ? [] : visibleFolderChoices).map(project => jsx('button', {
                    type: 'button', disabled: busy, style: { ...controlStyle, padding: '4px 8px', fontSize: '12px', textAlign: 'left' }, children: project.name,
                    onClick: () => perform(async () => {
                      onAssignFolder(project.id)
                    })
                  }, project.id)),

                  !newFolder && busy && jsx('span', { role: 'status', children: 'Saving…' }),
                  !newFolder && error && jsx('span', { role: 'alert', children: error })
                ]
              })
            ]
          })
        ]
      }),
      jsx(ConfirmDialog, {
        open: confirmArchive,
        title: 'Archive chat?',
        description: 'Archive this chat? You can restore it from Archived.',
        confirmLabel: 'Archive chat', busyLabel: 'Archiving…', cancelLabel: 'Cancel',
        onClose: () => setConfirmArchive(false),
        onConfirm: async () => {
          setBusy(true)
          try {
            await host.request('session.archive', { session_id: session.id, profile, archived: true })
            setConfirmArchive(false)
            await onChanged()
          } finally { setBusy(false) }
        }
      }),
      jsx(ConfirmDialog, {
        open: confirmDelete,
        title: 'Delete chat permanently?',
        description: 'This will permanently delete this chat and its messages. This cannot be undone.',
        confirmLabel: 'Delete permanently', busyLabel: 'Deleting…', cancelLabel: 'Cancel', destructive: true,
        onClose: () => setConfirmDelete(false),
        onConfirm: async () => {
          setBusy(true)
          try {
            await host.request('session.delete', { session_id: session.id, profile })
            setConfirmDelete(false)
            await onChanged()
          } finally { setBusy(false) }
        }
      }),
      busy && jsx('span', { role: 'status', children: 'Saving…' }),
      error && jsx('span', { role: 'alert', children: error }),

    ]
  })
}

function ChatViewEntry() {
  useEffect(() => { void openChatView() }, [])
  return jsx('button', { type: 'button', style: controlStyle, onClick: () => { void openChatView() }, children: 'Open Chat View' })
}

function ChatHistoryPage({ split = false }) {
  const profile = useValue(host.state.profile)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef(null)
  usePopupDismiss(settingsOpen, [settingsRef], () => setSettingsOpen(false), settingsRef)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [activeFilterPicker, setActiveFilterPicker] = useState(null)
  const filtersRef = useRef(null)
  const [pagePickerOpen, setPagePickerOpen] = useState(false)
  const pagePickerRef = useRef(null)
  usePopupDismiss(pagePickerOpen, [pagePickerRef], () => setPagePickerOpen(false), pagePickerRef)
  usePopupDismiss(filtersOpen, [filtersRef], () => setFiltersOpen(false), filtersRef)
  const [skipArchiveConfirm, setSkipArchiveConfirm] = useState(() => storage.get('skipArchiveConfirm', false))
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(() => storage.get('skipDeleteConfirm', false))
  const [colors, setColors] = useState(() => storage.get('cardColors', {}))
  const [search, setSearch] = useState(() => storage.get('search', ''))
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const createFolderDialogRef = useRef(null)
  usePopupDismiss(createFolderOpen, [createFolderDialogRef], () => setCreateFolderOpen(false))
  const [createFolderName, setCreateFolderName] = useState('')
  const [createFolderBusy, setCreateFolderBusy] = useState(false)
  const [createFolderError, setCreateFolderError] = useState('')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [folderDeleteMenu, setFolderDeleteMenu] = useState(null)
  const folderDeleteTriggerRef = useRef(null)
  const folderDeletePopupRef = useRef(null)
  const folderDeletePosition = useViewportPopup(folderDeleteMenu, folderDeleteTriggerRef, folderDeletePopupRef, true)
  usePopupDismiss(!!folderDeleteMenu, [folderDeleteTriggerRef, folderDeletePopupRef], () => setFolderDeleteMenu(null))
  const [folderDeleteRequest, setFolderDeleteRequest] = useState(null)
  const [folderDeleteBusy, setFolderDeleteBusy] = useState(false)
  const [folderDeleteError, setFolderDeleteError] = useState('')
  const assignmentKey = 'folderAssignments-' + (profile || 'default')
  const [folderAssignments, setFolderAssignments] = useState(() => storage.get(assignmentKey, {}))
  useEffect(() => { setFolderAssignments(storage.get(assignmentKey, {})) }, [assignmentKey])
  const folderProjects = useQuery({
    queryKey: ['chat-view', 'projects', profile],
    queryFn: () => host.request('projects.list', { profile }),
    staleTime: 30000
  })
  const belongsToFolder = useCallback((session, project) => {
    const assignedFolder = folderAssignments[session._lineage_root_id || session.id] ?? folderAssignments[session.id]
    if (assignedFolder) return assignedFolder === project.id
    const cwd = normalizeFolderPath(session.cwd)
    return [project.primary_path, ...(project.folders || []).map(folder => typeof folder === 'string' ? folder : folder.path)]
      .filter(Boolean).some(path => { const root = normalizeFolderPath(path); return cwd === root || cwd.startsWith(root + '/') })
  }, [folderAssignments])
  const [source, setSource] = useState(() => storage.get('source', 'all'))
  const [layout, setLayout] = useState(() => storage.get('layout', '2x4'))
  const [status, setStatus] = useState(() => storage.get('status', 'all'))
  const [sortOrder, setSortOrder] = useState(() => storage.get('sortOrder', 'recent'))
  const [pullRequest, setPullRequest] = useState(() => storage.get('pullRequest', 'all'))
  const selectedId = useValue(host.state.focusedSessionId)
  useEffect(() => {
    setColors(storage.get('cardColors', {}))
  }, [selectedId])
  const [selectedChat, setSelectedChat] = useState(() => storage.get('selectedChat', null))
  const [page, setPage] = useState(() => storage.get('page', 0))
  const scrollRef = useRef(null)
  const paginationBarRef = useRef(null)
  useLayoutEffect(() => {
    const bar = paginationBarRef.current
    if (!bar) return
    const pagination = bar.querySelector('.chat-view-pagination')
    const tools = bar.querySelector('.chat-view-page-tools')
    const fit = () => {
      const toolsWidth = [...tools.children].reduce((width, child) => width + child.getBoundingClientRect().width, 0) + 8 * (tools.children.length - 1)
      const paginationWidth = [...pagination.children].reduce((width, child) => width + child.getBoundingClientRect().width, 0) + 12 * (pagination.children.length - 1)
      const folderWidth = bar.querySelector('.chat-view-folder-browser')?.getBoundingClientRect().width || 0
      bar.style.gridTemplateColumns = `minmax(${Math.ceil(folderWidth)}px, 1fr) auto minmax(${Math.ceil(toolsWidth)}px, 1fr)`
      bar.dataset.stacked = String(bar.clientWidth < paginationWidth + folderWidth + toolsWidth + 24)
      bar.dataset.narrow = String(bar.clientWidth < paginationWidth + folderWidth + 12)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(bar)
    const folderButton = bar.querySelector('.chat-view-folder-browser')
    if (folderButton) observer.observe(folderButton)
    for (const child of [...pagination.children, ...tools.children]) observer.observe(child)
    fit()
    return () => observer.disconnect()
  }, [])
  const [openError, setOpenError] = useState('')
  const history = useQuery({
    queryKey: ['chat-view', 'history', profile],
    queryFn: () => host.listPersistedSessions(null, { profile: profile || 'default', limit: 500 }),
    refetchInterval: 30000
  })
  const sessions = useMemo(() => {
    const sortTimestamp = session => {
      const value = Number((sortOrder === 'newest' || sortOrder === 'oldest' ? session.started_at : session.last_active || session.started_at) || 0)
      return value < 1e12 ? value * 1000 : value
    }
    return [...(history.data?.sessions || [])].filter(session => session.message_count > 0).sort((a, b) => {
      const difference = sortTimestamp(a) - sortTimestamp(b)
      return (sortOrder === 'oldest' || sortOrder === 'least-recent' ? difference : -difference) || String(a.id).localeCompare(String(b.id))
    })
  }, [history.data?.sessions, sortOrder])
  const sessionIds = useMemo(() => sessions.map(session => session.id), [sessions])
  const sessionIdsKey = useMemo(() => sessionIds.join(','), [sessionIds])
  const activity = useQuery({
    queryKey: ['chat-view', 'activity', profile],
    queryFn: () => host.request('session.active_list', { profile }),
    refetchInterval: 5000
  })
  const pullRequests = useQuery({
    queryKey: ['chat-view', 'pull-requests', profile, sessionIdsKey],
    queryFn: () => window.hermesDesktop.api({
      path: '/api/profiles/sessions/pull-requests',
      method: 'POST',
      body: { ids: sessionIds }
    }),
    enabled: sessions.length > 0,
    staleTime: 60000
  })
  const activeById = useMemo(() => new Map((activity.data?.sessions || []).map(session => [session.id, session])), [activity.data?.sessions])
  const sessionStatus = useCallback(session => {
    const live = activeById.get(session.id)
    if (!live) return 'idle'
    if (['working', 'streaming', 'starting', 'resuming'].includes(live.status)) return 'working'
    if (live.status === 'waiting') return 'needs-input'
    return 'idle'
  }, [activeById])
  const prFor = session => pullRequests.data?.pull_requests?.[session.id]
  const pageSize = PAGE_LAYOUTS.find(([value]) => value === layout)?.[1] || 8
  const columns = pageSize === 2 ? 2 : 4
  const scrollKey = 'scroll-' + profile + '-' + layout + '-' + page
  function changeFilter(key, value, setter) {
    setter(value)
    storage.set(key, value)
    setPage(0)
    storage.set('page', 0)
    storage.set('scroll-' + profile + '-' + layout + '-0', 0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }
  function dropdown(label, value, onChange, options) {
    return jsxs('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' },
      children: [
        jsx('span', { children: label }),
        jsxs('button', {
          type: 'button', 'aria-label': label, 'aria-expanded': activeFilterPicker === label,
          style: { ...controlStyle, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' },
          onClick: () => setActiveFilterPicker(activeFilterPicker === label ? null : label),
          children: [options.find(([key]) => key === value)?.[1] || value, jsx(Codicon, { name: 'chevron-down', size: '16px' })]
        }),
        activeFilterPicker === label && jsx('div', {
          role: 'group', 'aria-label': label + ' choices',
          style: { display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '8px', border: '1px solid var(--ui-stroke-tertiary)', borderRadius: '12px', background: 'var(--ui-bg-editor)', boxShadow: '0 8px 24px #0002' },
          children: options.map(([key, text]) => jsx('button', {
            type: 'button', 'aria-pressed': value === key,
            style: { ...controlStyle, padding: '6px 8px', background: value === key ? 'var(--theme-accent-soft)' : controlStyle.background },
            onClick: event => { onChange(key); setActiveFilterPicker(null); event.currentTarget.parentElement.previousElementSibling?.focus() },
            children: text
          }, key))
        })
      ]
    })
  }
  const term = search.trim()
  const sources = useMemo(() => [...new Set(sessions.map(session => session.source || 'unknown'))].sort(), [sessions])
  const filtered = useMemo(() => sessions.filter(session =>
    (!selectedFolder || belongsToFolder(session, selectedFolder)) &&
    (source === 'all' || (session.source || 'unknown') === source) &&
    (status === 'all' || (activity.data && sessionStatus(session) === status)) &&
    (pullRequest === 'all' || (pullRequests.data && (pullRequest === 'with' ? !!prFor(session) : !prFor(session)))) &&
    (!term || [session.title, session.preview].join(' ').toLowerCase().includes(term.toLowerCase()))
  ), [sessions, selectedFolder, belongsToFolder, source, status, activity.data, sessionStatus, pullRequest, pullRequests.data, term])
  useLayoutEffect(() => {
    if (scrollRef.current && history.data) {
      scrollRef.current.scrollTop = storage.get(scrollKey, 0)
    }
  }, [scrollKey, !!history.data])
  const folders = useMemo(() => (folderProjects.data?.projects || []).filter(project => !project.archived && (!term || String(project.name || '').toLowerCase().includes(term.toLowerCase()))), [folderProjects.data?.projects, term])
  const pageCount = Math.max(1, Math.ceil((foldersOpen ? folders.length : filtered.length) / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = useMemo(() => filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize), [filtered, currentPage, pageSize])
  const visibleFolders = useMemo(() => folders.slice(currentPage * pageSize, currentPage * pageSize + pageSize), [folders, currentPage, pageSize])
  async function prepareFolderDelete(project, withChats) {
    setFolderDeleteError(''); setFolderDeleteBusy(true)
    try {
      let sessionIds = []
      if (withChats) {
        const allSessions = await loadFolderDeletionSessions(profile)
        sessionIds = allSessions.filter(session => belongsToFolder(session, project)).map(session => session.id)
      }
      setFolderDeleteMenu(null)
      setFolderDeleteRequest({ project, withChats, sessionIds, profile: profile || 'default' })
    } catch (error) { setFolderDeleteError(error.message || String(error)) }
    finally { setFolderDeleteBusy(false) }
  }

  return jsxs('main', {
    style: {
      padding: '16px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, containerType: 'inline-size', containerName: 'chat-view',
      color: 'var(--ui-text-primary)', boxSizing: 'border-box', fontFamily: 'var(--dt-font-sans)',
      letterSpacing: 'var(--dt-letter-spacing, 0)'
    },
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' },
        children: [
          jsx('h1', { style: { fontSize: '24px', fontWeight: 600 }, children: 'Chat View' }),
          jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }, children: [
          jsxs('div', { ref: settingsRef, style: { position: 'relative' }, children: [
jsx('button', { type: 'button', title: 'Chat View settings', className: 'chat-view-hover-outline chat-view-icon-button', 'aria-label': 'Chat View settings', 'aria-expanded': settingsOpen, 'aria-controls': 'chat-view-settings', style: controlStyle, onClick: () => setSettingsOpen(!settingsOpen), children: jsx(Codicon, { name: 'settings-gear', size: '16px' }) }),
      settingsOpen && jsxs('section', {
        id: 'chat-view-settings', 'aria-label': 'Chat View settings',
        style: dropdownStyle,
        children: [
          jsx('strong', { children: 'Confirmations' }),
          jsxs('label', { children: [
            jsx('input', { type: 'checkbox', checked: skipArchiveConfirm, onChange: event => { setSkipArchiveConfirm(event.target.checked); storage.set('skipArchiveConfirm', event.target.checked) } }),
            ' Skip archive confirmation'
          ] }),
          jsxs('label', { children: [
            jsx('input', { type: 'checkbox', checked: skipDeleteConfirm, onChange: event => { setSkipDeleteConfirm(event.target.checked); storage.set('skipDeleteConfirm', event.target.checked) } }),
            ' Skip delete confirmation (deletes permanently)'
          ] })
        ]
      })
          ] }),
(selectedChat || selectedId) && jsx('button', {
        type: 'button',
        title: 'Expand chat', className: 'chat-view-hover-outline', 'aria-label': 'Expand chat',
        style: { ...controlStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px', flexShrink: 0 },
        children: jsx('svg', { width: 16, height: 16, viewBox: '0 0 448 512', fill: 'currentColor', 'aria-hidden': true,
          children: jsx('path', { d: 'M0 180V56c0-13.3 10.7-24 24-24h124c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12H64v84c0 6.6-5.4 12-12 12H12c-6.6 0-12-5.4-12-12zM288 44v40c0 6.6 5.4 12 12 12h84v84c0 6.6 5.4 12 12 12h40c6.6 0 12-5.4 12-12V56c0-13.3-10.7-24-24-24H300c-6.6 0-12 5.4-12 12zM436 320h-40c-6.6 0-12 5.4-12 12v84h-84c-6.6 0-12 5.4-12 12v40c0 6.6 5.4 12 12 12h124c13.3 0 24-10.7 24-24V332c0-6.6-5.4-12-12-12zM160 468v-40c0-6.6-5.4-12-12-12H64v-84c0-6.6-5.4-12-12-12H12c-6.6 0-12 5.4-12 12v124c0 13.3 10.7 24 24 24h124c6.6 0 12-5.4 12-12z' }) }),
        onClick: async () => {
          if (selectedChat) {
            try { await host.openSession(selectedChat.id, { profile: selectedChat.profile }) }
            catch (error) { setOpenError('Could not open chat. ' + error.message); return }
          }
          closeSplitGallery()
        }
      })
          ] })

        ]
      }),
      jsxs('div', {
        style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexShrink: 0 },
        children: [
          jsx('input', {
            type: 'search', className: 'chat-view-search', placeholder: 'Search chat history', 'aria-label': 'Search chat history',
            value: search, style: { ...controlStyle, flex: '1 1 0', minWidth: 0 },
            onChange: event => changeFilter('search', event.target.value, setSearch)
          }),
          jsxs('div', {
            ref: filtersRef, style: { position: 'relative', flexShrink: 0 },
            children: [
              jsxs('button', {
                type: 'button', 'aria-label': 'Filter chats', className: 'chat-view-hover-outline', 'aria-expanded': filtersOpen, 'aria-controls': 'chat-view-filters',
                style: { ...controlStyle, display: 'inline-flex', alignItems: 'center', gap: '6px', borderColor: [source, status, pullRequest].some(value => value !== 'all') ? 'var(--theme-primary)' : 'var(--ui-stroke-tertiary)' },
                onClick: () => setFiltersOpen(!filtersOpen),
                children: [jsx(Codicon, { name: 'filter', size: '16px' }), 'Filters',
                  [source, status, pullRequest].filter(value => value !== 'all').length > 0 && jsx('span', { style: { borderRadius: '10px', padding: '0 5px', background: 'var(--theme-accent-soft)' }, children: [source, status, pullRequest].filter(value => value !== 'all').length })]
              }),
              filtersOpen && jsxs('section', {
                id: 'chat-view-filters', 'aria-label': 'Chat filters',
                style: dropdownStyle,
                children: [
                  jsxs('div', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }, children: [
                    jsx('button', { type: 'button', 'aria-label': 'Close filters', className: 'chat-view-close-filters', style: { ...controlStyle, padding: '4px', color: '#000000' }, onClick: () => setFiltersOpen(false), children: jsx(Codicon, { name: 'close', size: '16px' }) })
                  ] }),
                  dropdown('Source', source, value => changeFilter('source', value, setSource), [['all', 'All sources'], ...sources.map(value => [value, value])]),
                  dropdown('Status', status, value => changeFilter('status', value, setStatus), [['all', 'All statuses'], ['working', 'Working'], ['needs-input', 'Needs input'], ['idle', 'Idle']]),
                  dropdown('Pull request', pullRequest, value => changeFilter('pullRequest', value, setPullRequest), [['all', 'All chats'], ['with', 'With pull request'], ['without', 'Without pull request']]),
                  dropdown('Sort by', sortOrder, value => changeFilter('sortOrder', value, setSortOrder), [['newest', 'Newest'], ['oldest', 'Oldest'], ['recent', 'Most recent activity'], ['least-recent', 'Least recent activity']]),
                    jsx('button', { type: 'button', className: 'chat-view-clear-filters', style: { ...controlStyle, color: '#000000' }, disabled: [source, status, pullRequest].every(value => value === 'all'), onClick: () => { changeFilter('source', 'all', setSource); changeFilter('status', 'all', setStatus); changeFilter('pullRequest', 'all', setPullRequest) }, children: 'Clear filters' })

                ]
              })
            ]
          })
        ]
      }),
      jsxs('footer', {
        className: 'chat-view-pagination-bar', ref: paginationBarRef,
        style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: '12px', alignItems: 'start', marginBottom: '12px', flexShrink: 0 },
        children: [
          jsx('button', {
            type: 'button', title: foldersOpen ? 'Click to return to Chat View' : 'Show folders', 'aria-label': foldersOpen ? 'Click to return to Chat View' : 'Show folders', 'aria-pressed': foldersOpen,
            className: 'chat-view-folder-browser chat-view-hover-outline',
            style: { ...controlStyle, gridColumn: 1, justifySelf: 'start', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', minWidth: '48px', minHeight: '44px' },
            onClick: () => { setFoldersOpen(!foldersOpen); setSelectedFolder(null); setPage(0); storage.set('page', 0) },
            children: foldersOpen ? jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' }, children: [jsx(OpenFolderIcon, {}), 'Return'] }) : jsx(FolderIcon, {})
          }),
          jsxs('div', {
            className: 'chat-view-pagination',
            style: { gridColumn: 2, display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center' },
            children: [
          jsx('button', { type: 'button', title: 'Previous page', className: 'chat-view-page-arrow', 'aria-label': 'Previous page', style: pageArrowStyle, disabled: currentPage === 0, onClick: () => { setPage(currentPage - 1); storage.set('page', currentPage - 1); storage.set(scrollKey, 0); scrollRef.current.scrollTop = 0 }, children: jsx(NavigateIcon, {}) }),
          jsxs('span', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: VIEW_CONTROL_COLOR }, children: [jsx('span', { children: 'Page' }), jsx('span', { children: (currentPage + 1) + ' out of ' + pageCount })] }),
          jsx('button', { type: 'button', title: 'Next page', className: 'chat-view-page-arrow', 'aria-label': 'Next page', style: pageArrowStyle, disabled: currentPage + 1 >= pageCount, onClick: () => { setPage(currentPage + 1); storage.set('page', currentPage + 1); storage.set(scrollKey, 0); scrollRef.current.scrollTop = 0 }, children: jsx(NavigateIcon, { next: true }) })
            ]
          }),
          jsxs('div', {
            className: 'chat-view-page-tools',
            style: { gridColumn: 3, display: 'flex', gap: '8px', alignItems: 'flex-start', justifyContent: 'flex-end', flexWrap: 'wrap', minWidth: 0 },
            children: [
          jsxs('div', {
            ref: pagePickerRef, style: { position: 'relative' },
            children: [
              jsxs('button', {
                type: 'button', 'aria-label': 'Cards per page', className: 'chat-view-hover-outline', 'aria-expanded': pagePickerOpen, 'aria-controls': 'chat-view-page-picker',
                style: { ...controlStyle, display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' },
                onClick: () => setPagePickerOpen(!pagePickerOpen),
                children: [pageSize + ' cards per page', jsx(Codicon, { name: 'chevron-down', size: '16px' })]
              }),
              pagePickerOpen && jsxs('section', {
                id: 'chat-view-page-picker', 'aria-label': 'Cards per page',
                style: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 30, padding: '8px', border: '1px solid var(--ui-stroke-tertiary)', borderRadius: '12px', background: 'var(--ui-bg-editor)', boxShadow: '0 8px 24px #0002', display: 'flex', gap: '4px' },
                children: [
                  ...PAGE_LAYOUTS.map(([value, count]) => jsx('button', {
                    type: 'button', 'aria-label': count + ' cards per page', 'aria-pressed': layout === value,
                    style: { ...controlStyle, width: '36px', height: '36px', padding: 0, background: layout === value ? 'var(--theme-accent-soft)' : controlStyle.background },
                    onClick: () => { changeFilter('layout', value, setLayout); setPagePickerOpen(false); pagePickerRef.current?.querySelector('button')?.focus() },
                    children: count
                  }, value))
                ]
              })
            ]
          }),
          jsx('button', { type: 'button', title: 'Refresh chats', 'aria-label': 'Refresh chats', className: 'chat-view-hover-outline chat-view-icon-button', style: { ...controlStyle, padding: '6px' }, onClick: () => history.refetch(), children: jsx(Codicon, { name: 'refresh', size: '16px' }) }),

            ]
          })
        ]
      }),
      history.isLoading && jsx('p', { children: 'Loading chat history…' }),
      history.error && jsx('p', { role: 'alert', children: 'Could not load chat history. ' + history.error.message }),
      activity.error && jsx('p', { role: 'status', children: 'Live status unavailable.' }),
      pullRequests.error && jsx('p', { role: 'status', children: 'Pull-request metadata unavailable.' }),
      pullRequest !== 'all' && pullRequests.isLoading && jsx('p', { children: 'Checking pull requests…' }),
      openError && jsx('p', { role: 'alert', children: openError }),
      !foldersOpen && !history.isLoading && !history.error && filtered.length === 0 && jsx('p', { children: 'No chats match these filters.' }),
      foldersOpen && jsxs('div', { ref: createFolderDialogRef, style: { position: 'relative', alignSelf: 'flex-start', marginBottom: '8px' }, children: [
      jsx('button', { type: 'button', style: { ...controlStyle, alignSelf: 'flex-start', marginBottom: '8px' }, onClick: () => { setCreateFolderOpen(!createFolderOpen); setCreateFolderError('') }, children: 'New folder' }),
      createFolderOpen && jsx('section', {
        className: 'chat-view-create-folder', 'aria-label': 'New folder',
        style: { position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 30, width: '260px', maxWidth: 'calc(100vw - 48px)', boxSizing: 'border-box', padding: '16px', boxShadow: '0 8px 24px #0002', border: '1px solid ' + ACCENT_BLUE, borderRadius: '12px', background: 'var(--ui-bg-editor)', color: VIEW_CONTROL_COLOR, fontFamily: 'var(--dt-font-sans)' },
        children: jsx(FolderCreateForm, { name: createFolderName, onNameChange: setCreateFolderName, busy: createFolderBusy, error: createFolderError, onCancel: () => setCreateFolderOpen(false),
 onSubmit: async event => {
          event.preventDefault()
          if (!createFolderName.trim() || createFolderBusy) return
          setCreateFolderBusy(true); setCreateFolderError('')
          try {
            await host.request('projects.create', { profile, name: createFolderName.trim(), folders: [], use: false })
            await folderProjects.refetch()
            setCreateFolderName(''); setCreateFolderOpen(false); setPage(0)
          } catch (error) { setCreateFolderError(error.message || String(error)) }
          finally { setCreateFolderBusy(false) }
        }
 })
      }),
      ] }),
      foldersOpen && folderProjects.isLoading && jsx('p', { children: 'Loading folders…' }),
      foldersOpen && folderProjects.error && jsx('p', { role: 'alert', children: 'Could not load folders.' }),
      foldersOpen && !folderProjects.isLoading && !folderProjects.error && !folders.length && jsx('p', { children: 'No folders found.' }),
      selectedFolder && jsx('button', { type: 'button', style: { ...controlStyle, alignSelf: 'flex-start', marginBottom: '8px' }, onClick: () => { setSelectedFolder(null); setFoldersOpen(true); setPage(0) }, children: 'Folders / ' + selectedFolder.name }),
      jsx('div', {
        ref: scrollRef,
        onScroll: event => storage.set(scrollKey, event.currentTarget.scrollTop),
        style: { overflowY: 'auto', minHeight: 0, flex: '1 1 0', padding: '6px' },
        children: jsx('div', {
          style: {
            display: 'grid', gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))',
            gap: foldersOpen ? '24px 12px' : '12px', paddingTop: foldersOpen ? '12px' : 0, alignItems: 'stretch', gridAutoRows: '1fr', alignContent: 'start'
          },
          children: foldersOpen ? visibleFolders.map(project => jsxs('div', {
            role: 'button', tabIndex: 0, className: 'chat-view-folder-card', title: project.name || 'Untitled folder',
            onKeyDown: event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.currentTarget.click() } },
            style: { ...controlStyle, position: 'relative', '--card-folder-color': project.color || 'var(--ui-stroke-tertiary)', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', justifyContent: 'center', padding: '16px', textAlign: 'center', minWidth: 0, height: '120px', boxSizing: 'border-box', background: 'var(--ui-surface-background)', border: '2px solid var(--ui-stroke-tertiary)', borderTop: '4px solid ' + (project.color || 'var(--ui-stroke-tertiary)'), borderRadius: '12px', cursor: 'pointer' },
            onClick: () => { setSelectedFolder(project); setFoldersOpen(false); setPage(0); storage.set('page', 0) },
            children: [
              jsx('strong', { style: { color: CARD_CHAT_COLOR, fontSize: '18px', lineHeight: '1.3', overflowWrap: 'anywhere', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' }, children: project.name || 'Untitled folder' }),
              jsxs('div', { onClick: event => event.stopPropagation(), onKeyDown: event => event.stopPropagation(), style: { position: 'absolute', bottom: '8px', right: '8px' }, children: [
                jsx('button', { type: 'button', 'aria-label': 'Delete folder ' + project.name, 'aria-expanded': folderDeleteMenu === project.id, style: { ...controlStyle, padding: '4px', display: 'inline-flex', color: DELETE_COLOR, borderColor: DELETE_COLOR }, onClick: event => { folderDeleteTriggerRef.current = event.currentTarget; setFolderDeleteMenu(folderDeleteMenu === project.id ? null : project.id); setFolderDeleteError('') }, children: jsx(Codicon, { name: 'trash', size: '16px' }) }),
                folderDeleteMenu === project.id && jsxs('div', { ref: folderDeletePopupRef, role: 'group', 'aria-label': 'Delete folder options', style: { position: 'fixed', left: folderDeletePosition?.left ?? 8, top: folderDeletePosition?.top ?? 8, visibility: folderDeletePosition ? 'visible' : 'hidden', boxSizing: 'border-box', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', width: '200px', maxWidth: 'calc(100vw - 32px)', zIndex: 40, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid ' + ACCENT_BLUE, borderRadius: '8px', background: 'var(--ui-bg-editor)', boxShadow: '0 8px 24px #0002' }, children: [
                  jsx('button', { type: 'button', style: deleteButtonStyle, disabled: folderDeleteBusy, onClick: () => prepareFolderDelete(project, true), children: 'Delete folder and chats' }),
                  jsx('button', { type: 'button', style: deleteButtonStyle, disabled: folderDeleteBusy, onClick: () => prepareFolderDelete(project, false), children: 'Delete folder, keep chats' }),
                  folderDeleteError && jsx('span', { role: 'alert', children: folderDeleteError })
                ] })
              ] })
            ]
          }, project.id)) : visible.map(session => {
          const date = Number(session.last_active || session.started_at || 0)
          const timestamp = date ? new Date(date < 1e12 ? date * 1000 : date) : null
          const dateLabel = timestamp?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) || ''
          const timeLabel = timestamp?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) || ''
          const colorKey = session._lineage_root_id || session.id
          const cardColor = colors[colorKey] ?? colors[session.id] ?? null
          return jsxs('div', {
            className: 'chat-view-card', role: 'button', tabIndex: 0,
            onKeyDown: event => {
              if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                event.preventDefault()
                event.currentTarget.click()
              }
            },
            onClick: async () => {
              setOpenError('')
              try {
                storage.set('selectedChat', { id: session.id, profile })
                setSelectedChat({ id: session.id, profile })
                await host.openSession(session.id, { profile })
                openSplitGallery()
              }
              catch (error) { setOpenError('Could not open chat. ' + error.message) }
            },
            style: {

              display: 'flex', flexDirection: 'column', gap: '10px',
              textAlign: 'left', padding: '16px', minWidth: 0, height: 'auto', boxSizing: 'border-box',
              fontSize: '14px', lineHeight: '1.4', fontWeight: 400,
              borderStyle: 'solid', borderWidth: '2px', borderTopWidth: '4px',
              borderRightColor: selectedId === session.id ? 'var(--theme-primary)' : 'var(--ui-stroke-tertiary)',
              borderBottomColor: selectedId === session.id ? 'var(--theme-primary)' : 'var(--ui-stroke-tertiary)',
              borderLeftColor: selectedId === session.id ? 'var(--theme-primary)' : 'var(--ui-stroke-tertiary)',
              borderTopColor: cardColor || 'var(--ui-stroke-tertiary)',
              borderRadius: '12px', background: 'var(--ui-surface-background)',
              boxShadow: selectedId === session.id ? `0 0 0 1px color-mix(in srgb, ${ACCENT_BLUE} 30%, transparent), 0 0 10px color-mix(in srgb, ${ACCENT_BLUE} 22%, transparent)` : 'none',
              color: 'var(--ui-text-primary)', cursor: 'pointer'
            },
            children: [
              jsx('strong', {
                style: { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere', flexShrink: 0, color: CARD_TITLE_COLOR },
                title: session.title || session.preview || 'Untitled chat',
                children: highlight(session.title || session.preview || 'Untitled chat', term)
              }),
              jsx(CardPrompts, { session, profile, term, wordLimit: pageSize >= 8 ? PREVIEW_WORD_LIMIT : undefined }),
              jsxs('div', { style: { marginTop: 'auto', display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px', minWidth: 0 }, children: [
              jsxs('div', { style: { flex: '1 1 140px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', minWidth: 0 }, children: [
              jsx('time', { dateTime: timestamp?.toISOString(), style: dateTimeStyle, children: dateLabel }),
              jsx('span', { style: dateTimeStyle, children: timeLabel })
              ] }),
              jsx(CardActions, {
                session, profile, color: cardColor, skipArchiveConfirm, skipDeleteConfirm,
                onAssignFolder: projectId => {
                  const next = { ...storage.get(assignmentKey, {}), [session._lineage_root_id || session.id]: projectId }
                  storage.set(assignmentKey, next)
                  setFolderAssignments(next)
                },
                onChanged: async () => {
                  if (storage.get('selectedChat', null)?.id === session.id) {
                    storage.set('selectedChat', null)
                    setSelectedChat(null)
                  }
                  await history.refetch()
                },
                onColor: value => {
                  const next = { ...storage.get('cardColors', {}) }
                  delete next[session.id]
                  next[colorKey] = value || null
                  storage.set('cardColors', next)
                  setColors(next)
                }
              })
              ] })
            ]
          }, session.id)
          })
        })
      }),


      jsx(ConfirmDialog, {
        open: !!folderDeleteRequest, title: folderDeleteRequest?.withChats ? 'Delete folder and chats?' : 'Delete folder, keep chats?',
        description: folderDeleteRequest ? (folderDeleteRequest.withChats ? 'Permanently delete “' + folderDeleteRequest.project.name + '” and ' + folderDeleteRequest.sessionIds.length + ' chats? This cannot be undone.' : 'Delete “' + folderDeleteRequest.project.name + '”? All its chats will be kept.') : '',
        confirmLabel: 'OK', busyLabel: 'Deleting…', cancelLabel: 'Cancel',
        onClose: () => { if (!folderDeleteBusy) setFolderDeleteRequest(null) },
        onConfirm: async () => {
          if (!folderDeleteRequest || folderDeleteBusy) return
          setFolderDeleteBusy(true)
          try {
            const { project, sessionIds, profile: owner } = folderDeleteRequest
            if ((profile || 'default') !== owner) throw new Error('The active profile changed. Reopen this folder and confirm again.')
            for (const id of sessionIds) await host.request('session.delete', { profile: owner, session_id: id })
            await host.request('projects.delete', { profile: owner, id: project.id })
            const next = { ...storage.get(assignmentKey, {}) }
            for (const id of Object.keys(next)) if (next[id] === project.id) delete next[id]
            storage.set(assignmentKey, next); setFolderAssignments(next)
            setFolderDeleteRequest(null); setSelectedFolder(null)
            await Promise.all([folderProjects.refetch(), history.refetch()])
          } finally { setFolderDeleteBusy(false) }
        }
      })
    ]
  })
}

export default {
  id: 'chat-view',
  name: 'Chat View',
  register(ctx) {
    storage = ctx.storage
    ctx.onDispose(closeSplitGallery)
    ctx.register({
      id: 'chat-view-status-button', area: 'statusBar.right',
      render: () => jsx('button', {
        type: 'button', title: 'Open Chat View', 'aria-label': 'Open Chat View',
        onClick: () => { void openChatView() },
        style: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' },
        children: jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' }, children: [
          jsx(Codicon, { name: 'chat-view-four-squares', size: '16px' }),
          'Chat View'
        ] })
      })
    })
    const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5A1.5 1.5 0 0 1 4.5 3h3A1.5 1.5 0 0 1 9 4.5v3A1.5 1.5 0 0 1 7.5 9h-3A1.5 1.5 0 0 1 3 7.5v-3Zm12 0A1.5 1.5 0 0 1 16.5 3h3A1.5 1.5 0 0 1 21 4.5v3A1.5 1.5 0 0 1 19.5 9h-3A1.5 1.5 0 0 1 15 7.5v-3Zm-12 12a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 9 16.5v3A1.5 1.5 0 0 1 7.5 21h-3A1.5 1.5 0 0 1 3 19.5v-3Zm12 0a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-3Z"/></svg>'
    const iconUrl = 'url("data:image/svg+xml,' + encodeURIComponent(iconSvg) + '")'
    const iconStyle = document.createElement('style')
    iconStyle.textContent = '.codicon-chat-view-four-squares::before { content: "" !important; display: inline-block; width: 1em; height: 1em; background: currentColor; mask: ' + iconUrl + ' center / contain no-repeat; -webkit-mask: ' + iconUrl + ' center / contain no-repeat; }'
    document.head.appendChild(iconStyle)
    ctx.onDispose(() => iconStyle.remove())
    const searchStyle = document.createElement('style')
    searchStyle.textContent = `
      .chat-view-folder-card::before {
        content: ''; position: absolute; top: -14px; left: 12px;
        width: 28%; max-width: 80px; height: 12px;
        background: var(--ui-surface-background);
        border: 2px solid var(--card-folder-color); border-bottom: 0;
        border-radius: 8px 8px 0 0; pointer-events: none;
      }
      .chat-view-folder-card:hover { box-shadow: ${HOVER_GLOW} !important; border-color: ${ACCENT_BLUE} !important; }
      .chat-view-search::placeholder { color: ${SEARCH_PLACEHOLDER_COLOR}; opacity: 1; }
      .chat-view-hover-outline, .chat-view-search {
        box-sizing: border-box;
        height: ${VIEW_CONTROL_SIZE}px !important;
        min-height: ${VIEW_CONTROL_SIZE}px !important;
        min-width: ${VIEW_CONTROL_SIZE}px !important;
        padding: ${VIEW_CONTROL_SIZE / 6}px ${VIEW_CONTROL_SIZE / 4}px !important;
      }
      .chat-view-icon-button { display: inline-flex; align-items: center; justify-content: center; width: ${VIEW_CONTROL_SIZE}px; padding: 0 !important; }
      .chat-view-icon-button .codicon { display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
      .chat-view-hover-outline svg,
      .chat-view-hover-outline .codicon {
        width: ${VIEW_CONTROL_SIZE / 2}px !important;
        height: ${VIEW_CONTROL_SIZE / 2}px !important;
        font-size: ${VIEW_CONTROL_SIZE / 2}px !important;
        flex-shrink: 0;
      }
      .chat-view-folder-browser[aria-pressed="true"] { border-color: ${ACCENT_BLUE} !important; }
      .chat-view-pagination-bar[data-stacked="true"] { grid-template-columns: auto minmax(0, 1fr) !important; }
      .chat-view-pagination-bar[data-stacked="true"] .chat-view-folder-browser { grid-column: 1 !important; grid-row: 1; }
      .chat-view-pagination-bar[data-stacked="true"] .chat-view-pagination { grid-column: 2 !important; grid-row: 1; }
      .chat-view-pagination-bar[data-stacked="true"] .chat-view-page-tools { grid-column: 1 / -1 !important; grid-row: 2; }
      .chat-view-pagination-bar[data-narrow="true"] { grid-template-columns: minmax(0, 1fr) !important; }
      .chat-view-pagination-bar[data-narrow="true"] .chat-view-pagination { grid-column: 1 !important; grid-row: 2; }
      .chat-view-pagination-bar[data-narrow="true"] .chat-view-page-tools { grid-row: 3; }
      .chat-view-hover-outline { color: ${VIEW_CONTROL_COLOR} !important; }
      .chat-view-hover-outline:hover,
      .chat-view-page-arrow:hover:not(:disabled),
      .chat-view-search:hover,
      .chat-view-search:focus {
        border-color: ${ACCENT_BLUE} !important;
        box-shadow: ${HOVER_GLOW} !important;
      }
      .chat-view-close-filters:hover,
      .chat-view-clear-filters:hover { color: ${ACCENT_BLUE} !important; }
      .chat-view-search { transition: border-color 150ms ease, box-shadow 150ms ease; }
      .chat-view-search:focus { outline: none !important; }
      @media (prefers-reduced-motion: reduce) { .chat-view-search { transition: none; } }
    `
    document.head.appendChild(searchStyle)
    ctx.onDispose(() => searchStyle.remove())
    ctx.register({
      id: 'history-page', area: ROUTES_AREA,
      data: { path: '/chat-view' },
      render: () => jsx(ChatViewEntry, {})
    })
    ctx.register({
      id: 'sidebar-entry', area: SIDEBAR_NAV_AREA, order: 55,
      data: { codicon: 'chat-view-four-squares', label: 'Chat View', path: '/chat-view' }
    })
    ctx.register({
      id: 'sessions-entry', area: SIDEBAR_PROFILE_GROUP_HEADER_AREA,
      data: {
        render: () => jsx('button', {
          type: 'button', title: 'Open Chat View', 'aria-label': 'Open Chat View',
          style: { ...controlStyle, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', margin: '4px 0', color: 'var(--theme-primary)' },
          onClick: () => { void openChatView() },
          children: jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' }, children: [jsx(Codicon, { name: 'chat-view-four-squares', size: '16px' }), 'Chat View'] })
        })
      }
    })
    ctx.register({
      id: 'open-chat-view', area: PALETTE_AREA,
      data: { id: 'chat-view.open', label: 'Chat View: Open chat gallery', keywords: ['sessions', 'chat', 'history', 'gallery', 'cards'], run: openChatView }
    })
  }
}






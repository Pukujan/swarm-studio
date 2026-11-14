// The Overview's breadcrumb, as web/project.js draws it: Projects › name ▾. Projects goes home; the name's menu
// renames the project, duplicates it, and lists its versions (the one open has a ✓), each opening on the machine
// (`open.version`). A version too new to be listed has no project yet, so its name has no menu.
import { useRef, useState } from 'react'
import { PlainButton } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { MenuAt, MenuRow, MenuSeparator } from '../../primitives/Menu'
import type { Project } from './model'

const CRUMB = 'inline-flex min-h-10 items-center gap-1.5 rounded-[8px] px-1.5 font-body text-sm data-[hovered]:bg-surface-2 data-[hovered]:text-text'

export function ProjectCrumb({ name, project, run, onProjects, onRename, onDuplicate, onVersion }: {
  name: string, project: Project | null, run: string | null,
  onProjects: () => void, onRename: (title: string) => void, onDuplicate: () => void, onVersion: (id: string) => void
}) {
  const btn = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const versions = project?.versions || []
  return (
    <span className="flex min-w-0 items-center gap-1">
      <PlainButton className={`${CRUMB} font-medium text-muted`} onPress={onProjects}>Projects</PlainButton>
      <span aria-hidden className="text-muted"><Icon name="chr" size={14} /></span>
      {renaming ? (
        <input autoFocus defaultValue={name} maxLength={80} aria-label="Project name"
          onFocus={e => e.currentTarget.select()}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.value = name; e.currentTarget.blur() } }}
          onBlur={e => { const v = e.currentTarget.value.trim(); setRenaming(false); if (v && v !== name) onRename(v) }}
          className="w-[220px] rounded-[6px] border border-text bg-deep px-1.5 py-[3px] font-body text-sm text-text outline-none" />
      ) : (
        <PlainButton ref={btn} aria-haspopup={project ? 'menu' : undefined} className={`${CRUMB} font-semibold text-text`} onPress={() => project && setOpen(true)}>
          <b aria-current="page" className="max-w-[34vw] truncate font-semibold">{name}</b>{project && <Icon name="chd" size={14} />}
        </PlainButton>
      )}
      <MenuAt name={name} triggerRef={btn} isOpen={open} onClose={() => setOpen(false)} placement="bottom start" onAction={k => {
        setOpen(false)
        if (k === 'rename') setRenaming(true)
        else if (k === 'dup') onDuplicate()
        else if (String(k).startsWith('v:')) onVersion(String(k).slice(2))
      }}>
        <MenuRow id="rename" icon="type" label="Rename" />
        <MenuRow id="dup" icon="layers" label="Duplicate" />
        {versions.length > 1 && <MenuSeparator />}
        {versions.length > 1 && versions.map((v, i) => <MenuRow key={v.id} id={`v:${v.id}`} icon="clock" label={`Version ${versions.length - i}`} on={v.id === run} />)}
      </MenuAt>
    </span>
  )
}

/**
 * Global keyboard shortcuts for the editor. Active only while a database is
 * connected and the user is not typing in an input/textarea/contenteditable.
 *
 *   mod+z            undo            mod+shift+z / mod+y   redo
 *   Delete/Backspace delete selected node
 *   mod+shift+d      show diff (canvas vs database)
 *   mod+g            group selected nodes
 *   mod+shift+g        ungroup
 *   mod+d            duplicate selected node
 *   mod+s            save to database (preventDefault)
 *   e                toggle Expert mode
 *   n / t / c / f    add Rule / Target / Condition / Fallback
 *   [ / ]            collapse left / right sidebar
 *   Escape           deselect
 */
import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useAiAssistant } from '@/store/useAiAssistant';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.connection !== 'connected') return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setSearchOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        useAiAssistant.getState().setOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        s.saveToDb();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && e.shiftKey) {
        e.preventDefault();
        s.openDbDiff();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'g' && e.shiftKey) {
        e.preventDefault();
        s.ungroupSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        s.groupSelected();
        return;
      }

      if (isTyping(e.target)) return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          s.deleteSelected();
          break;
        case 'Escape':
          s.selectNode(null);
          break;
        case 'e':
        case 'E':
          s.toggleExpert();
          break;
        case 'n':
        case 'N':
          s.addNode('trigger');
          break;
        case 't':
        case 'T':
          s.addNode('target');
          break;
        case 'c':
        case 'C':
          s.addNode('condition');
          break;
        case 'f':
        case 'F':
          s.addNode('fallback');
          break;
        case '[':
          if (!s.leftCollapsed) s.toggleLeft();
          break;
        case ']':
          if (!s.rightCollapsed) s.toggleRight();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

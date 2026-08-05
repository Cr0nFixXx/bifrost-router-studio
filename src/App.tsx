/**
 * Application root. Gates on the database connection (not auth): until a
 * Bifrost SQLite file is opened, the Connect screen is shown. Once connected,
 * the three-pane editor mounts. Global keyboard shortcuts are active in the
 * editor.
 *
 * The editor shell is: collapsible left Sidebar, the React Flow canvas, and the
 * collapsible right RightPanel — all dark, frosted, and animated.
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { useUserSettings } from '@/store/useUserSettings';
import { useAiAssistant } from '@/store/useAiAssistant';
import { applyAccent, applyThemeMode, loadAccent, loadThemeMode } from '@/lib/theme';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { ConnectScreen } from '@/components/auth/ConnectScreen';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { RightPanel } from '@/components/layout/RightPanel';
import { FlowCanvas } from '@/components/canvas/FlowCanvas';
import { RuleChainWizard } from '@/components/wizard/RuleChainWizard';
import { DiffModal } from '@/components/panels/DiffModal';
import { TemplateGallery } from '@/components/panels/TemplateGallery';
import { DashboardPanel } from '@/components/panels/DashboardPanel';
import { SettingsPanel } from '@/components/panels/SettingsPanel';
import { SearchPanel } from '@/components/panels/SearchPanel';
import { HelpPanel } from '@/components/panels/HelpPanel';
import { SqlBrowserPanel } from '@/components/panels/SqlBrowserPanel';
import { AiAssistantPanel } from '@/components/panels/AiAssistantPanel';
import { Modal } from '@/components/ui/primitives';

export default function App() {
  const connection = useStore((s) => s.connection);
  const reconnectCached = useStore((s) => s.reconnectCached);
  const dashboardOpen = useStore((s) => s.dashboardOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const sqlBrowserOpen = useStore((s) => s.sqlBrowserOpen);
  const setDashboardOpen = useStore((s) => s.setDashboardOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setSqlBrowserOpen = useStore((s) => s.setSqlBrowserOpen);
  const helpOpen = useStore((s) => s.helpOpen);
  const searchOpen = useStore((s) => s.searchOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const loadUserSettings = useUserSettings((s) => s.load);
  const aiOpen = useAiAssistant((s) => s.open);
  const setAiOpen = useAiAssistant((s) => s.setOpen);
  const loadAiSettings = useAiAssistant((s) => s.load);

  // Apply the user's saved accent before first paint of the editor chrome.
  useEffect(() => { applyAccent(loadAccent()); applyThemeMode(loadThemeMode()); loadUserSettings(); loadAiSettings(); }, [loadUserSettings, loadAiSettings]);

  useKeyboardShortcuts();

  // On first load, transparently resume a cached session if one exists.
  useEffect(() => {
    reconnectCached().catch(() => {
      /* no cached session — stay on Connect screen */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After an automatic reconnect attempt, if nothing got connected, ensure we're
  // on the Connect screen (reconnectCached sets 'disconnected' on failure).
  const connected = connection === 'connected';

  return (
    <div className="h-full w-full flex flex-col bg-canvas text-ink overflow-hidden">
      <AnimatePresence mode="wait">
        {connected ? (
          <motion.div key="editor" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <TopBar />
            <div className="flex-1 flex min-h-0">
              <Sidebar />
              <main className="relative flex-1 min-w-0">
                <FlowCanvas />
              </main>
              <RightPanel />
            </div>
          </motion.div>
        ) : (
          <motion.div key="connect" className="flex-1 min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ConnectScreen />
          </motion.div>
        )}
      </AnimatePresence>

      <RuleChainWizard />
      <DiffModal />
      <TemplateGallery />
      <Modal open={dashboardOpen} onClose={() => setDashboardOpen(false)} title="Dashboard" subtitle="Workspace overview and validation health" width="max-w-[95vw]">
        <DashboardPanel />
      </Modal>
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Einstellungen" subtitle="Studio preferences, theme and layout" width="max-w-[95vw]">
        <SettingsPanel />
      </Modal>
      <Modal open={sqlBrowserOpen} onClose={() => setSqlBrowserOpen(false)} title="SQL Browser" subtitle="routing_rules / routing_targets browser with direct DB edits" width="max-w-[95vw]" bodyClassName="p-5 max-h-[82vh] overflow-hidden">
        <SqlBrowserPanel />
      </Modal>
      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Erweiterte Suche" subtitle="Rules und Nodes finden, auswählen und hervorheben" width="max-w-[95vw]">
        <SearchPanel />
      </Modal>
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Hilfe" subtitle="Bedienung, Shortcuts und Architektur" width="max-w-[95vw]">
        <HelpPanel />
      </Modal>
      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="AI Rule Assistant" subtitle="Review-only routing copilot · no automatic canvas changes" width="max-w-[95vw]" bodyClassName="p-0 max-h-[82vh] overflow-hidden">
        <AiAssistantPanel />
      </Modal>
    </div>
  );
}

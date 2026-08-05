import { HelpCircle, Keyboard, MousePointer2, Workflow, Database, Search, Server, Paintbrush, Lock, GitCompare } from 'lucide-react';
import { APP_BUILD, APP_VERSION } from '@/lib/version';
import { Chip } from '@/components/ui/primitives';

export function HelpPanel() {
  return (
    <div className="space-y-5 text-sm text-ink-muted">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-neon/10 text-neon"><HelpCircle size={20} /></div>
        <div>
          <div className="text-lg font-semibold text-ink">Bifrost Router Studio Hilfe</div>
          <div className="text-xs text-ink-faint">Version {APP_VERSION} · Build {APP_BUILD}</div>
        </div>
      </div>

      <Section icon={<Workflow size={15} />} title="1. Graph-Modell">
        <p>Eine Bifrost-Regel besteht aus Metadaten, CEL-Bedingung, Targets und Fallbacks. Im Studio ist das aufgeteilt:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><b>Rule Node</b>: Name, Beschreibung, Scope, Priority, Enabled/Disabled.</li>
          <li><b>Condition Nodes</b>: einzelne CEL-Ausdrücke wie <code>model.contains("opus")</code>.</li>
          <li><b>AND/OR Logic Nodes</b>: kombinieren Conditions oder andere Logic Nodes.</li>
          <li><b>Target Node</b>: enthält mehrere gewichtete Provider/Model-Routen.</li>
          <li><b>Fallback Node</b>: enthält die geordnete Fallback-Kette.</li>
        </ul>
      </Section>

      <Section icon={<MousePointer2 size={15} />} title="2. Canvas-Bedienung">
        <ul className="list-disc pl-5 space-y-1">
          <li>Rechtsklick oder <b>⋯ Menu</b> öffnet das Kontextmenü.</li>
          <li>Normales Ziehen bewegt/pannt je nach Modus.</li>
          <li>Auswahlrechteck funktioniert nur mit <b>Ctrl/Cmd/Shift</b> gedrückt.</li>
          <li><b>Ctrl/Cmd/Shift + Klick</b> toggelt einzelne Nodes in der Mehrfachauswahl.</li>
          <li><b>Lock workspace</b> verhindert versehentliche Änderungen an Nodes und Edges.</li>
        </ul>
      </Section>

      <Section icon={<Paintbrush size={15} />} title="3. Visuelle Werkzeuge">
        <p>Sticky Notes und Visual Boxes liegen auf dem Canvas-Hintergrund, nicht in der Bifrost-DB. Sie werden im User-Settings-Store gespeichert.</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><b>Sticky</b>: verschiebbare/resizable Notiz.</li>
          <li><b>Box</b>: visueller Rahmen für Arbeitsbereiche.</li>
          <li><b>Marker</b>: freie halbtransparente Markierung.</li>
          <li><b>Pen</b>: freies Zeichnen mit dünner Linie.</li>
          <li>Farbe und Strichstärke findest du auf der Canvas-Toolbar oder in Settings.</li>
        </ul>
      </Section>

      <Section icon={<Search size={15} />} title="4. Ctrl+K Suche">
        <p><b>Ctrl/Cmd+K</b> öffnet die Suche. Sie durchsucht Rules, CEL, Provider, Models, Node-IDs und Node-Daten. Treffer können auf dem Canvas hervorgehoben werden.</p>
      </Section>

      <Section icon={<Server size={15} />} title="5. Lokale Server-Bridge für Datei-Pfade">
        <p>Browser können Dateipfade nicht direkt lesen. Für serverseitige Pfade gibt es die optionale Local Bridge:</p>
        <pre className="mt-2 rounded-lg bg-canvas border border-border p-2 text-[11px] overflow-x-auto">BFRS_LOCAL_ROOT=/path/to/bifrost/configs npm run bridge</pre>
        <p className="mt-2">Danach kannst du im Connect Screen z. B. <code>config.sqlite</code>, <code>config.json</code> oder mit <code>BFRS_ALLOW_ABSOLUTE=1</code> absolute Pfade öffnen.</p>
      </Section>

      <Section icon={<GitCompare size={15} />} title="6. Diff / Export / Sicherheit">
        <ul className="list-disc pl-5 space-y-1">
          <li>Diffs zeigen Änderungen im GitHub-/Code-Editor-Stil.</li>
          <li>Export unterstützt Workspace JSON, Bifrost config.json, Markdown, PNG/JPG und ausgewählte Nodes.</li>
          <li>Ohne Local Bridge bleibt alles rein client-seitig im Browser.</li>
        </ul>
      </Section>

      <Section icon={<Keyboard size={15} />} title="7. Shortcuts">
        <div className="flex flex-wrap gap-1.5"><Chip>Ctrl+K Search</Chip><Chip>Ctrl+S Save</Chip><Chip>Ctrl+Z Undo</Chip><Chip>Ctrl+G Group</Chip><Chip>Del Delete</Chip><Chip>N Rule</Chip><Chip>T Target</Chip></div>
      </Section>
    </div>
  );
}
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface-2/40 p-4"><div className="flex items-center gap-2 text-ink font-semibold mb-2">{icon}{title}</div><div className="text-sm leading-relaxed">{children}</div></div>;
}

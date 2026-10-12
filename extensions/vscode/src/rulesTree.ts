/**
 * TreeDataProvider for the rule tree. Labels come from `ruleLabels.ts`, which has
 * no `vscode` import and is therefore the part under test.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import type { RoutingRule } from '@/types/bifrost';
import { loadRules, type LoadedRules } from './database';
import {
  fallbackLabel,
  ruleDescription,
  ruleLabel,
  ruleTooltip,
  targetLabel,
} from './ruleLabels';

type TreeNode =
  | { kind: 'rule'; rule: RoutingRule }
  | { kind: 'cel'; rule: RoutingRule }
  | { kind: 'target'; label: string }
  | { kind: 'fallback'; label: string }
  | { kind: 'message'; label: string };

export class RulesTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private file: string | null = null;
  private loaded: LoadedRules | null = null;
  private failure: string | null = null;

  /** Point the tree at a file and read it. */
  async setFile(file: string | null): Promise<void> {
    this.file = file;
    await this.reload();
  }

  get currentFile(): string | null {
    return this.file;
  }

  async reload(): Promise<void> {
    if (!this.file) {
      this.loaded = null;
      this.failure = null;
    } else {
      try {
        this.loaded = await loadRules(this.file);
        this.failure = null;
      } catch (err) {
        // A read error must be readable in the tree, not only in a toast that is
        // gone by the time the user looks.
        this.loaded = null;
        this.failure = err instanceof Error ? err.message : String(err);
      }
    }
    this.changed.fire();
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.kind) {
      case 'rule': {
        const item = new vscode.TreeItem(
          ruleLabel(node.rule),
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.description = ruleDescription(node.rule);
        item.tooltip = ruleTooltip(node.rule);
        item.iconPath = new vscode.ThemeIcon(
          node.rule.enabled ? 'symbol-event' : 'circle-slash',
        );
        // Drives the "copy CEL" context menu entry.
        item.contextValue = 'bifrostRule';
        return item;
      }
      case 'cel': {
        const item = new vscode.TreeItem(node.rule.cel_expression);
        item.iconPath = new vscode.ThemeIcon('filter');
        item.tooltip = node.rule.cel_expression;
        item.contextValue = 'bifrostRule';
        return item;
      }
      case 'target': {
        const item = new vscode.TreeItem(node.label);
        item.iconPath = new vscode.ThemeIcon('arrow-right');
        return item;
      }
      case 'fallback': {
        const item = new vscode.TreeItem(node.label);
        item.iconPath = new vscode.ThemeIcon('debug-step-back');
        return item;
      }
      case 'message':
        return new vscode.TreeItem(node.label);
    }
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (node) return node.kind === 'rule' ? this.ruleChildren(node.rule) : [];

    if (this.failure) {
      return [{ kind: 'message', label: `Lesefehler: ${this.failure}` }];
    }
    if (!this.file) {
      return [{ kind: 'message', label: 'Keine Datenbank geöffnet' }];
    }
    if (!this.loaded) return [];

    const name = path.basename(this.file);
    // "unknown" and "no rules" look identical in a tree and are not the same
    // thing — say which one it is.
    if (this.loaded.kind === 'unknown') {
      return [{ kind: 'message', label: `${name}: keine Bifrost-Datenbank` }];
    }
    if (this.loaded.kind === 'empty') {
      return [{ kind: 'message', label: `${name}: leere Datei` }];
    }
    if (!this.loaded.rules.length) {
      return [{ kind: 'message', label: `${name}: keine Regeln` }];
    }
    return this.loaded.rules.map((rule) => ({ kind: 'rule' as const, rule }));
  }

  private ruleChildren(rule: RoutingRule): TreeNode[] {
    return [
      { kind: 'cel', rule },
      ...rule.targets.map((t) => ({ kind: 'target' as const, label: targetLabel(t) })),
      ...rule.fallbacks.map((f) => ({ kind: 'fallback' as const, label: fallbackLabel(f) })),
    ];
  }

  /** The CEL expression behind a node, for the copy command. */
  celOf(node: TreeNode | undefined): string | null {
    if (!node) return null;
    return node.kind === 'rule' || node.kind === 'cel' ? node.rule.cel_expression : null;
  }

  dispose(): void {
    this.changed.dispose();
  }
}

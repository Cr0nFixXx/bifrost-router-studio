/** Visual container node used by "Group selected" — frames a cluster of nodes. */
import { memo } from 'react';
import { NodeProps } from 'reactflow';
import type { GroupNodeData } from '@/types/workflow';

function GroupNodeImpl({ data, selected }: NodeProps<GroupNodeData>) {
  return (
    <div
      className={
        'relative w-full h-full rounded-2xl border-2 transition-colors ' +
        (selected ? 'border-neon bg-neon/10' : 'border-neon/30 bg-neon/[0.04]')
      }
    >
      <span className="absolute -top-3 left-3 rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-neon border border-neon/30">
        {data.label}
      </span>
    </div>
  );
}
export const GroupNode = memo(GroupNodeImpl);
